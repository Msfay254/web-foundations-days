# TicketHub: Design Document

TicketHub sells concert and event tickets. Normal days are quiet and read-heavy; when a popular concert goes on sale, a huge crowd fights for the same seats. Core challenge: never sell a seat twice, stay online during the spike, and be fair.

## 1. Requirements

**Functional:** browse and search events; see each seat's status (available, held, sold); hold up to 4 seats for 10 minutes; pay and receive tickets; view my tickets; expired holds return seats to sale.

**Non-functional:**
- **Correctness (first priority):** a seat is never sold twice; nobody pays without a ticket.
- **Speed:** pages under 300 ms; during a sale, seat map under 1 s and hold under 500 ms.
- **Fairness:** first come, first served; max 4 seats per user; bots limited.
- **Availability and scale:** survive about 400x normal peak; slow down gracefully, never crash.

## 2. Estimates

**Normal day:** 50,000 visitors x 10 pages = 500,000 views/day, about 6/s average, about 60/s peak. 5,000 tickets = about 2,500 orders/day (0.03/s). Reads:writes about 200:1. Storage about 0.5 GB/year (tiny).

**Big sale** (assume 15 requests per user, half arriving in the first minute): 200,000 x 15 = 3,000,000 requests in 600 s, about 5,000/s average and **about 25,000/s peak** (100,000 x 15 / 60). Hold writes: about 1,000/s average, 5,000/s peak. 200,000 people for 20,000 seats = **10 buyers per seat**.

**Comparison:** peak requests 60/s vs 25,000/s (about 400x); writes 0.3/s vs 5,000/s (over 10,000x). Data size does not matter; the problem is concurrency on 20,000 hot rows.

## 3. API

POSTs that spend seats or money need an `Idempotency-Key` header so retries cannot charge twice.

- `POST /auth/login` log in
- `GET /events?city=&q=` browse and search (200)
- `GET /events/{id}` event details (200)
- `GET /events/{id}/seats` seats and status (200, cached 1 to 2 s)
- `POST /events/{id}/holds` body `{"seatIds":[9001,9005]}`: 201 `{"holdId","expiresAt"}`, 409 if a seat is taken (nothing held), 422 over 4 seats, 429 waiting room
- `DELETE /holds/{holdId}` release a hold
- `POST /orders` body `{"holdId","paymentToken"}`: 201 paid, 402 declined, 410 hold expired
- `GET /me/tickets` my tickets (200)

## 4. Data model (PostgreSQL)

- **users** (id PK, email UNIQUE, password_hash)
- **events** (id PK, name, venue, starts_at)
- **event_seats** (id PK, event_id FK, section, row_label, seat_number, status AVAILABLE/HELD/SOLD, held_by FK users, hold_id, hold_expires_at; UNIQUE (event_id, section, row_label, seat_number))
- **orders** (id PK, user_id FK, event_id FK, status, total_cents, idempotency_key; UNIQUE (user_id, idempotency_key))
- **tickets** (id PK, order_id FK, event_seat_id FK **UNIQUE**, qr_code)

Relationships: event has many seats; user has many orders; order has many tickets; each ticket has exactly one seat (UNIQUE makes it 1:1).

## 5. Preventing double-booking

The database decides, atomically. "Read free, then write" in app code is a race: two servers can both read "free". So check and write are one statement:

```sql
BEGIN;
UPDATE event_seats
SET status='HELD', held_by=:user, hold_id=:hold,
    hold_expires_at = now() + interval '10 minutes'
WHERE id = ANY(:seatIds) AND event_id = :event
  AND (status='AVAILABLE'
       OR (status='HELD' AND hold_expires_at < now()));
-- rows changed = seats asked?  yes: COMMIT (201)   no: ROLLBACK (409)
```

- Two users, one seat: the database locks the row for the first update; the second re-checks `WHERE`, finds it held, changes **0 rows** and gets 409. One winner, always.
- Paying: one transaction re-checks the hold (`FOR UPDATE`), inserts order and tickets, marks seats SOLD. All or nothing.
- Safety net: `UNIQUE (event_seat_id)` on tickets makes a second ticket for one seat impossible, even with a bug.
- Expiry uses the database clock; a late payment on an expired hold is refunded.

## 6. Architecture

```
Users -> CDN -> Load balancer -> Waiting room -> App servers (stateless)
              App servers -> Redis cache | Primary DB -> Read replicas
              App servers -> Payment provider | Queue -> Workers
```

- **CDN:** serves images and event pages from the edge, removing most reads.
- **Load balancer + rate limiter:** spreads load, blocks bots.
- **Waiting room:** admits buyers in arrival order (about 100/s), so the database sees about 300 writes/s, not 5,000. It is also the fairness mechanism.
- **App servers:** stateless, so more are added before a sale.
- **Redis cache:** seat map cached 1 to 2 s to absorb the refresh storm.
- **Primary DB:** the only place seats are held or sold; correctness lives here.
- **Read replicas:** search and "my tickets" stay off the primary.
- **Queue + workers:** emails, QR codes and hold expiry run in the background.
- **Payment provider:** external; we never see card numbers.

## 7. Trade-offs

1. **Correctness over speed:** all holds and orders go to the primary, so some buyers wait or see "try again", but no seat is sold twice.
2. **Freshness vs speed:** the cached seat map may be 2 s old, so a click can hit a 409; acceptable because the hold always checks the real database.
3. **Fairness vs simplicity:** the waiting room adds complexity, but without it bots and the fastest refreshers win and the spike could crash the site.