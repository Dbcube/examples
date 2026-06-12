# DBCube Examples

Runnable, self-contained examples for every feature. They use a local SQLite
file, so no external services are needed (except 09, which needs MongoDB).

## Setup

```bash
npm install
node setup.js        # creates demo.db with sample users and orders
```

## Full test suite (real databases)

`docker-compose.yml` provisions real engines — MySQL (:30045), PostgreSQL
(:30046) and MongoDB (:30047, single-node replica set so transactions work):

```bash
npm run db:up                  # docker compose up -d --wait
node full-test.js sqlite       # 65 checks: full API, edge cases, bulk, concurrency, timing
node full-test.js mysql
node full-test.js postgres
node full-test.js mongodb
node cli-test.js               # 19 checks: validate/fresh/seeders/triggers/computed/migrations/pull
node run-all.js                # everything + global summary (272 checks)
```

## Examples

| File | What it shows |
|---|---|
| [`01-quickstart.js`](01-quickstart.js) | Connect, read, insert, update, delete — the 5-minute tour |
| [`02-reads.js`](02-reads.js) | `select`, `where`/`orWhere`/`whereGroup`, `whereIn`/`whereBetween`/`whereNull`, `first`/`find`, `distinct`, `limit`/`offset`, joins |
| [`03-writes.js`](03-writes.js) | `insert`, `update`/`delete` (WHERE mandatory), `upsert`, atomic `increment`/`decrement`, `truncate` |
| [`04-aggregations.js`](04-aggregations.js) | `count`/`sum`/`avg`/`max`/`min`, `exists`, `groupBy`+`having`+`selectRaw`, `paginate`, `chunk` |
| [`05-transactions.js`](05-transactions.js) | Atomic transfers: automatic commit/rollback |
| [`06-relations.js`](06-relations.js) | Eager loading with `.with()` — hasMany & belongsTo, no N+1 |
| [`07-raw.js`](07-raw.js) | Raw SQL with bound params, DDL, window functions, Mongo command documents |
| [`08-typescript.ts`](08-typescript.ts) | `table<User>()` end-to-end typing with `dbcube generate` |
| [`09-mongodb.js`](09-mongodb.js) | Same API on MongoDB: LIKE→regex, `$inc`, upsert, transactions (replica set) |
| [`10-schema-workflow.md`](10-schema-workflow.md) | Schema as code: `.cube` files, migrations, rollback, `pull` |
| [`11-microservices.md`](11-microservices.md) | Pool sizing for replicas, exactly-once triggers, health checks, Docker |

Run them all:

```bash
npm run all
```

## Schema files

`dbcube/cubes/` contains the canonical `.cube` definitions for the demo schema
(including a computed column, a foreign key and runtime triggers). `setup.js`
uses raw DDL so the examples run with zero CLI steps, but in a real project
you'd apply the cubes with:

```bash
npx dbcube run table:refresh
```

See [`10-schema-workflow.md`](10-schema-workflow.md) for the full lifecycle.
