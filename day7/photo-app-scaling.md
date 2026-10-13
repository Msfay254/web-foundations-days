# SnapShare: Scaling Plan

## 1. Assumptions

- Registered users: 10,000,000
- Daily active users (DAU): 10% of registered users
- Each active user uploads 1 photo per day
- Each active user views 50 feed pages per day
- Average original photo: 2 MB; thumbnail: 50 KB (0.05 MB)
- Traffic is spread evenly over 24 hours: 1 day = 86,400 seconds
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

**Read-heavy.** There are 50,000,000 feed views per day against 1,000,000 uploads per day, a read:write ratio of about **50:1**. In practice the gap is even larger, because one feed page shows many photos.

What this means for the design:
- Cache feed data and photo metadata so most reads never reach the database.
- Serve photos and thumbnails from a CDN, close to the user.
- Add database read replicas and send reads to them; the primary handles writes.
- Keep the write path simple and push slow work (thumbnails) to a background queue.
- Scale app servers horizontally behind a load balancer.

## 4. Why photos do not go in the database

Photos are large binary files (2 MB each, about 730 TB per year for originals). Storing them in the database would:
- make the database huge, slow to back up, slow to replicate and expensive;
- fill the database cache with big blobs and push out the small, hot rows (users, follows, captions) that queries need;
- tie up database connections while large files stream through;
- make it impossible to serve photos straight from a CDN.

**Instead:** store the files in **object storage** (for example S3), which is cheap, durable and practically unlimited. The database stores only **metadata**: photo ID, owner, caption, timestamp, and the object storage key/URL.

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
2. The request goes through the load balancer to an app server, which checks that the user is logged in and that the file type and size are allowed.
3. The app server inserts a row in the database (primary) with status "processing" and returns a pre-signed upload URL pointing to object storage.
4. The client uploads the 2 MB original directly to object storage using that URL (a multipart upload for large files), so the file never passes through the app servers.
5. When the upload completes, object storage (or the client) notifies the app server, which checks that the file really exists in storage.
6. The app server puts a "create thumbnail" job on the queue (photo ID + storage key) and waits for the queue to acknowledge it, so the job is not lost.
7. The app server replies "upload successful" to the user without waiting for the thumbnail. The photo shows a placeholder or the original until the thumbnail is ready.
8. A worker takes the job from the queue, downloads the original from object storage, and creates a 50 KB thumbnail.
9. The worker saves the thumbnail to object storage under its own key.
10. The worker updates the database row to status "ready" with the thumbnail key, then invalidates the related cache entries, and finally acknowledges the job so the queue removes it.
11. Followers' feeds now include the photo, and the images are delivered through the CDN.

**Failure handling (so no data is lost and no files are orphaned):**
- If the worker crashes before acknowledging, the queue makes the job available again and another worker retries it.
- Thumbnail creation is idempotent: running it twice writes the same thumbnail key, so a retry never creates duplicates.
- Jobs that keep failing go to a dead-letter queue so they can be inspected without blocking others.
- If a client gets a pre-signed URL but never finishes the upload, a cleanup job deletes rows stuck in "processing" for more than 24 hours, along with any partial files in object storage.

## 8. Trade-offs

1. **Cache speed vs. freshness.** Caching feeds makes reads very fast and cuts database load, but users may see stale data for a short time (for example, a new photo appears a few seconds late). Shorter cache lifetimes give fresher data but put more load on the database.
2. **Read replica lag (eventual consistency).** Replicas let us scale reads, but replication is slightly delayed, so a user might not see their own new photo right after uploading if the read goes to a replica. We accept eventual consistency for other users' feeds and read a user's own recent uploads from the primary.
3. **Pre-generating thumbnails vs. generating on demand.** Creating thumbnails at upload time costs extra storage (about 18 TB per year) and needs a queue and workers, but feed loads are fast and predictable. Generating on demand saves storage but makes the first view slow and spikes CPU at read time, which is bad for a read-heavy system.
4. **Async thumbnails vs. instant results.** The queue and worker make uploads fast and resilient to spikes, but the thumbnail is not available the instant the upload finishes, and we must run and monitor extra infrastructure.
5. **CDN cost vs. speed.** A CDN makes image loading fast and protects our servers, but it adds ongoing cost, and cached files can be stale until they expire or are purged.
6. **Direct-to-storage uploads vs. simplicity.** Letting clients upload straight to object storage keeps heavy files off our app servers, but it makes the flow more complex (pre-signed URLs, completion checks, cleanup of unfinished uploads).