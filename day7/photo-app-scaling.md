# SnapShare: Scaling Plan

## 1. Assumptions

- Registered users: 10,000,000
- Daily active users (DAU): 10% of registered users
- Each active user uploads 1 photo per day
- Each active user views 50 feed pages per day
- Average original photo: 2 MB; thumbnail: 50 KB (0.05 MB)
- Traffic is spread over 24 hours: 1 day = 86,400 seconds
- Peak traffic = 5 x average
- 1 year = 365 days
- Sizes use decimal units (1 TB = 1,000,000 MB)

**Daily active users:** 10,000,000 x 10% = **1,000,000 DAU**

## 2. Estimates

### Uploads per second
- Uploads per day = 1,000,000 x 1 = 1,000,000
- Average = 1,000,000 / 86,400 = **~11.6 uploads/s**
- Peak = 11.6 x 5 = **~58 uploads/s**

### Feed views per second
- Feed views per day = 1,000,000 x 50 = 50,000,000
- Average = 50,000,000 / 86,400 = **~579 views/s**
- Peak = 579 x 5 = **~2,900 views/s**

### Storage per year
- Per photo = 2 MB + 0.05 MB = 2.05 MB
- Per day = 1,000,000 x 2.05 MB = 2,050,000 MB = 2.05 TB
- Per year = 2.05 TB x 365 = **~748 TB (about 0.75 PB)**
  - Originals: 2 TB x 365 = 730 TB
  - Thumbnails: 0.05 TB x 365 = 18.25 TB

## 3. Read-heavy or write-heavy?

**Read-heavy.** There are 50,000,000 feed views per day against
1,000,000 uploads per day, a read:write ratio of about **50:1**.
In practice the gap is even larger, because one feed page shows many photos.

What this means for the design:
- Cache feed data and photo metadata so most reads never reach the database.
- Serve photos and thumbnails from a CDN, close to the user.
- Add database read replicas and send reads to them; the primary handles writes.
- Keep the write path simple and push slow work (thumbnails) to a background queue.
- Scale app servers horizontally behind a load balancer.

## 4. Why photos do not go in the database

Photos are large binary files (2 MB each, ~730 TB/year). Storing them in the
database would:
- make the database huge, slow to back up, slow to replicate and expensive;
- fill the database cache with big blobs and push out the small, hot rows
  (users, follows, captions) that queries need;
- tie up database connections while large files stream through;
- make it impossible to serve photos straight from a CDN.

**Instead:** store the files in **object storage** (e.g. S3), which is cheap,
durable and practically unlimited. The database stores only **metadata**:
photo ID, owner, caption, timestamp, and the object storage key/URL.

## 5. Architecture diagram

```text
                          +--------+
                          | Users  |
                          +---+----+
                              |
             +----------------+-----------------+
             | (photos/thumbnails)              | (API: feed, upload)
             v                                  v
        +---------+                     +----------------+
        |   CDN   |                     | Load Balancer  |
        +----+----+                     +-------+--------+
             | cache miss                       |
             v                          +-------+--------+
  +-----------------------+             |                |
  |    Object Storage     |        +----v-----+    +-----v----+
  | (originals+thumbnails)|        | App      |    | App      |
  +-----------^-----------+        | Server 1 |    | Server N |
              |                    +--+--+--+-+    +-+--+--+--+
              |                       |  |  |        |  |  |
              |        +--------------+  |  +--------+  |  +---------------+
              |        |                 |              |                  |
              |        v                 v              v                  v
              |   +---------+     +------------+   +-------------------------+
              |   |  Cache  |     |   Queue    |   |  Database (Primary)     |
              |   | (Redis) |     | (thumbnail |   |   writes                |
              |   +---------+     |   jobs)    |   +------------+------------+
              |                   +-----+------+                | replication
              |                         |                       v
              |                         v               +----------------+
              |                   +-----------+         | Read Replica   |
              +-------------------+  Worker   |         |   reads        |
               read original,     | (creates  |         +----------------+
               write thumbnail    | thumbnail)|
                                  +-----------+
```

## 6. Components (one sentence each)

- **CDN:** Delivers photos and thumbnails from servers near the user, solving slow image loading and keeping the huge read traffic off our own servers.
- **Load balancer:** Spreads incoming requests across many app servers, solving single-server overload and removing a single point of failure.
- **App servers:** Run the application logic (auth, feed building, upload handling) and stay stateless so we can add more of them as traffic grows.
- **Cache:** Keeps hot data such as feeds and photo metadata in memory, solving repeated slow database reads.
- **Database (primary):** Stores users, follows and photo metadata durably and handles all writes.
- **Read replica:** Holds a copy of the primary and serves read queries, solving read overload on the primary.
- **Object storage:** Stores the photo files cheaply and durably at petabyte scale, solving the problem of keeping large binary files out of the database.
- **Queue:** Holds thumbnail jobs so uploads return quickly and traffic spikes are absorbed without losing work.
- **Worker:** Takes jobs from the queue and creates thumbnails in the background, solving slow image processing blocking the user's upload request.

## 7. Upload flow (step by step)

1. The user picks a photo in the app and taps Upload.
2. The request goes through the load balancer to an app server, which checks the user is logged in.
3. The app server inserts a row in the database (primary) with status `processing` and returns a pre-signed upload URL for object storage.
4. The client uploads the 2 MB original directly to object storage, so the file never passes through the app servers.
5. When the upload completes, the client (or storage event) tells the app server, which puts a "create thumbnail" job (photo ID + storage key) on the queue.
6. The app server responds "upload successful" to the user without waiting for the thumbnail.
7. A worker takes the job from the queue, downloads the original, and creates a 50 KB thumbnail.
8. The worker saves the thumbnail to object storage.
9. The worker updates the database row to `ready` with the thumbnail key, and the relevant cache entries are invalidated.
10. Followers' feeds now include the photo; images are served through the CDN.
11. If the worker fails, the job returns to the queue and is retried.

## 8. Trade-offs

1. **Cache speed vs. freshness.** Caching feeds makes reads very fast and cuts database load, but users may see stale data for a short time (e.g. a new photo appears a few seconds late). Shorter cache lifetimes mean fresher data but more database load.
2. **Read replica lag.** Replicas scale reads, but replication is slightly delayed, so a user might not see their own new photo immediately if read from a replica. We accept eventual consistency, or read the user's own recent uploads from the primary.
3. **Async thumbnails vs. instant results.** The queue and worker make uploads fast and resilient, but the thumbnail is not available the instant the upload finishes, and we must run and monitor extra infrastructure.
4. **CDN cost vs. speed.** A CDN makes image loading fast and protects our servers, but it adds ongoing cost and cached files can be stale until they expire or are purged.
5. **Storing thumbnails too.** Keeping a 50 KB thumbnail uses ~18 TB/year extra storage, but saves far more bandwidth and loading time than serving 2 MB originals in the feed.