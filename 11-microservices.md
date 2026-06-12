# 11 — DBCube in microservices (multiple replicas, one database)

Patterns for running services that use DBCube behind a load balancer with
N replicas.

## How the daemon behaves with replicas

Each service instance runs its **own** local query-engine daemon (TCP on
127.0.0.1) with its own warm connection pool. Instances never share daemons —
there is nothing to coordinate and no single point of failure.

What you control per instance, from `dbcube.config.js`:

```js
myapp: {
    type: "postgres",
    config: { /* ... */ },
    pool: {
        // TOTAL connections to your DB ≈ replicas × maxConnections.
        // With 10 replicas and a Postgres max_connections of 100,
        // keep this at ~8 or lower:
        maxConnections: 8,
        minConnections: 2,
        acquireTimeoutMs: 3000
    }
}
```

> Rule of thumb: `replicas × maxConnections` must stay below your database's
> connection limit, leaving headroom for migrations and admin sessions.

## Triggers fire exactly once — by design

DBCube triggers (`.trigger.cube`) are **not** database triggers. They are JS
functions that run inside the service instance that performs the write:

```
   replica A ──insert──▶ DB
       │
       └─ beforeAdd/afterAdd run HERE, once
   replica B  (does nothing — it didn't perform the write)
   replica C  (does nothing)
```

Consequences:

- **No duplicate side effects.** An email/webhook/audit-log trigger fires once
  per operation no matter how many replicas you run. No distributed locks, no
  leader election.
- **Make trigger logic idempotent anyway** if your app retries failed requests
  (e.g. use an idempotency key when sending emails). The trigger fires once per
  *executed write*, and a retry is a second write.
- **Don't enforce global invariants in triggers** (e.g. "max 5 orders per
  user"). Two replicas writing concurrently each see a consistent snapshot only
  inside a transaction — use transactions + UNIQUE constraints for invariants.

## Transactions across replicas

Transactions are scoped to the instance that opened them (the daemon holds the
DB transaction). This is the normal model — same as Prisma/TypeORM. For
cross-service workflows use sagas/outbox patterns, not a shared transaction.

The daemon also protects you operationally:

- A transaction left open by a crashed request is **rolled back automatically
  after 5 minutes** of inactivity.
- At most 100 concurrent transactions per daemon (backpressure instead of
  resource exhaustion).

## Health checks & graceful shutdown

```js
// /health endpoint
app.get('/health', async (_req, res) => {
    try {
        await db.raw('SELECT 1');
        res.send('ok');
    } catch {
        res.status(503).send('db unreachable');
    }
});

// Graceful shutdown: close the local daemon connection
process.on('SIGTERM', async () => {
    await db.disconnect();
    process.exit(0);
});
```

## Containerizing

The query-engine binary downloads on first run. In containers, bake it into
the image so cold starts are instant:

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Pre-download the engines at build time:
RUN npx dbcube update
CMD ["node", "server.js"]
```
