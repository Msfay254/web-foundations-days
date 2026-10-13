# SnapShare: Scaling Plan

## 1. Assumptions

- 10,000,000 registered users; 10% active per day
- Each active user uploads 1 photo/day and views 50 feed pages/day
- Original photo 2 MB; thumbnail 50 KB (0.05 MB)
- 1 day = 86,400 s; peak = 5 x average; 1 year = 365 days; 1 TB = 1,000,000 MB

**Daily active users (DAU):** 10,000,000 x 10% = **1,000,000**

## 2. Estimates

- **Uploads/s:** 1,000,000 / 86,400 = **~11.6 average**, x5 = **~58 peak**
- **Feed views/s:** 1,000,000 x 50 = 50,000,000/day; / 86,400 = **~579 average**, x5 = **~2,900 peak**
- **Storage/year:** (2 MB + 0.05 MB) x 1,000,000 = 2.05 TB/day; x 365 = **~748 TB**
  (originals 730 TB + thumbnails 18.25 TB)

## 3. Read-heavy or write-heavy?

**Read-heavy**: 50,000,000 views vs 1,000,000 uploads per day (about 50:1). So we: cache feeds and metadata, serve images from a CDN, send reads to replicas, scale app servers horizontally, and move slow work (thumbnails) to a background queue.

## 4. Why photos do not go in the database

Photos are large binary files (~730 TB/year). In the database they would make backups and replication slow and costly, fill the cache with big blobs and push out hot rows, tie up connections, and block CDN delivery. **Instead:** store files in **object storage** (e.g. S3). The database keeps only metadata: photo ID, owner, caption, time and the storage key.

## 5. Architecture diagram

```text
Users
 |-- images ------> CDN --(miss)--> Object Storage <--------+
 |                                    ^                     |
 |                      pre-signed    |    read original,   |
 |                      upload        |    write thumbnail  |
 '-- API ------> Load Balancer        |                     |
                       |              |                     |
                       v              |                     |
              App Servers (1..N) -----'      Queue ------> Worker
               |      |      |                ^               |
               |      |      '--- jobs -------'               |
               |      v                                       |
               |    Cache (Redis)                             |
               v                                              |
          Primary DB (writes) <--- status "ready" ------------'
               | replication
               v
          Read Replica (reads)
```

Feed reads go to the cache first, then the read replica. Writes go to the primary.

## 6. Components (one sentence each)

- **CDN:** serves images from servers near the user, fixing slow loading and keeping read traffic off our servers.
- **Load balancer:** spreads requests across app servers, fixing overload and single points of failure.
- **App servers:** run the logic (auth, feeds, uploads) and stay stateless so we can add more.
- **Cache:** keeps hot feeds and metadata in memory, fixing repeated slow database reads.
- **Database (primary):** durably stores users, follows and photo metadata and handles all writes.
- **Read replica:** a copy of the primary that serves reads, fixing read overload.
- **Object storage:** holds the photo files cheaply and durably at petabyte scale, keeping blobs out of the database.
- **Queue:** holds thumbnail jobs so uploads return fast and spikes do not lose work.
- **Worker:** creates thumbnails in the background so image processing never blocks an upload.

## 7. Upload flow

1. The user taps Upload; the request goes through the load balancer to an app server, which checks login, file type and size.
2. The app server inserts a database row with status "processing" and returns a pre-signed upload URL.
3. The client uploads the 2 MB original directly to object storage, so it never passes through app servers.
4. The app server confirms the file exists in storage.
5. It puts a "create thumbnail" job (photo ID + storage key) on the queue and waits for the queue to acknowledge it.
6. It replies "upload successful" without waiting for the thumbnail.
7. A worker takes the job, downloads the original and creates a 50 KB thumbnail.
8. The worker saves the thumbnail to object storage.
9. The worker sets the row to "ready" with the thumbnail key, clears related cache entries, and acknowledges the job.
10. Followers' feeds now show the photo, delivered through the CDN.

**Failures:** a job not acknowledged is retried by another worker; thumbnail creation is idempotent (same key, no duplicates); repeated failures go to a dead-letter queue; rows stuck in "processing" over 24 hours are cleaned up along with partial files.

## 8. Trade-offs

1. **Cache speed vs freshness:** caching makes reads fast but users may see stale feeds for a few seconds; shorter cache lifetimes mean fresher data but more database load.
2. **Read replica lag (eventual consistency):** replicas scale reads but lag slightly, so a user may not see their own new photo from a replica; we read a user's own recent uploads from the primary.
3. **Pre-generating thumbnails vs on demand:** pre-generating costs ~18 TB/year and needs a queue and workers, but feeds load fast; on demand saves storage but slows first views and spikes CPU on a read-heavy system.
4. **Async thumbnails vs instant results:** uploads are fast and resilient, but the thumbnail is not ready the instant the upload ends, and there is more infrastructure to run.
5. **CDN cost vs speed:** images load fast and our servers are protected, but it costs money and cached files can be stale until they expire or are purged.
6. **Direct-to-storage uploads vs simplicity:** keeps heavy files off app servers, but adds pre-signed URLs, completion checks and cleanup of unfinished uploads.
