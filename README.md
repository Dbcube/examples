<div align="center">

# Dbcube — Examples

**Runnable, copy-paste examples for every Dbcube feature.**

[Dbcube](https://dbcube.dev) is the type-safe, Rust-powered ORM for PostgreSQL,
MySQL, SQLite and MongoDB — one fluent API across every engine, plus managed
hosts like Supabase and Turso. This repo is a self-contained playground: clone
it, install, and run any example with `node`.

</div>

---

## ⚡ Quick start (zero services)

The 01–08 examples run against a local **SQLite** file — no Docker, no database
server, nothing to configure.

```bash
git clone https://github.com/Dbcube/examples
cd examples
npm install
node setup.js            # creates demo.db with sample users & orders
node 01-quickstart.js    # run any example
```

Run the whole zero-service tour at once:

```bash
npm run all              # setup + 01 → 07
```

> **Requirements:** Node 18+. The native engine binary downloads automatically
> on `npm install` / first run (no C++ toolchain needed).

## 📚 The examples

| File | What it teaches |
|---|---|
| [`01-quickstart.js`](01-quickstart.js) | Connect, read, insert, update, delete — the 5-minute tour |
| [`02-reads.js`](02-reads.js) | `select`, `where`/`orWhere`/`whereGroup`, `whereIn`/`whereBetween`/`whereNull`, `first`/`find`, `distinct`, `limit`/`offset`, joins |
| [`03-writes.js`](03-writes.js) | `insert`, `update`/`delete` (WHERE required), `upsert`, atomic `increment`/`decrement`, `truncate` |
| [`04-aggregations.js`](04-aggregations.js) | `count`/`sum`/`avg`/`max`/`min`, `exists`, `groupBy`+`having`+`selectRaw`, `paginate`, `chunk` |
| [`05-transactions.js`](05-transactions.js) | Atomic transfers — automatic commit & rollback |
| [`06-relations.js`](06-relations.js) | Eager loading with `.with()` — hasMany & belongsTo, no N+1 |
| [`07-raw.js`](07-raw.js) | Raw SQL with bound params, DDL, window functions; Mongo command documents |
| [`08-typescript.ts`](08-typescript.ts) | `table<User>()` end-to-end typing with `npx dbcube generate` |
| [`09-mongodb.js`](09-mongodb.js) | The same API on MongoDB: LIKE→regex, `$inc`, upsert, transactions |
| [`10-schema-workflow.md`](10-schema-workflow.md) | Schema as code: `.cube` files, migrations, rollback, `pull` |
| [`11-microservices.md`](11-microservices.md) | Pool sizing for replicas, exactly-once triggers, health checks, Docker |

Run the **TypeScript** example with `tsx` (or `ts-node`):

```bash
npx tsx 08-typescript.ts
```

The **MongoDB** example (09) needs a Mongo instance — see the full setup below.

## 🗄️ The demo schema

`setup.js` builds three tables so the examples have something to work with:

```
users(id, uuid, name, email, age, status, balance)
orders(id, uuid, user_id → users.id, product, total)
settings(id, uuid, key, value)
```

It uses raw DDL so the tour runs with **zero CLI steps**. The same schema is also
expressed as `.cube` files in [`dbcube/cubes/`](dbcube/cubes/) — the way you'd do
it in a real project — including a computed column, a foreign key and runtime
triggers. To apply those instead:

```bash
npx dbcube run table:refresh   # create/update tables from .cube files
npx dbcube run seeder:add      # seed from .seeder.cube
npx dbcube generate            # regenerate dbcube/types.ts
```

See [`10-schema-workflow.md`](10-schema-workflow.md) for the full lifecycle.

## 🐳 Full multi-engine test suite (real databases)

`docker-compose.yml` provisions real engines so you can run the **exact same
code** against each one:

| Engine | Port |
|---|---|
| MySQL 8 | 30045 |
| PostgreSQL 16 | 30046 |
| MongoDB 7 (single-node replica set, so transactions work) | 30047 |

```bash
npm run db:up                  # docker compose up -d --wait
node full-test.js sqlite       # 65 checks: full API, edge cases, bulk, concurrency, timing
node full-test.js mysql
node full-test.js postgres
node full-test.js mongodb
node cli-test.js               # CLI: validate / fresh / seeders / triggers / computed / migrations / pull
node run-all.js                # everything across every engine + a global summary
npm run db:down                # stop and remove the containers/volumes
```

The connections for these live under the `ft_*` keys in
[`dbcube.config.js`](dbcube.config.js).

## ⚙️ Configuration

Every example reads [`dbcube.config.js`](dbcube.config.js). The key under
`databases` is the connection name you pass to `dbcube.database('<name>')`:

```js
module.exports = (config) => config.set({
  databases: {
    demo: { type: "sqlite", config: { DATABASE: "demo" } },
    // …real engines (ft_mysql, ft_postgres, ft_mongo) for the full suite
  },
});
```

The **same query code runs on any engine** — only the config entry changes.
For cloud hosts (Supabase, Turso, PlanetScale, Atlas) use a `URL` (and
`AUTH_TOKEN` for Turso) — see the [docs](https://dbcube.dev/getting-started/configuration).

## 🧰 npm scripts

| Script | Does |
|---|---|
| `npm run setup` | Create a fresh `demo.db` with sample data |
| `npm run all` | setup + run examples 01 → 07 |
| `npm run db:up` / `db:down` | Start / stop the Docker databases |
| `npm run full` | `full-test.js` (defaults to SQLite) |
| `npm run full:all` | `run-all.js` — every engine + summary |

## 🩺 Troubleshooting

- **`demo.db` errors / stale data** → re-run `node setup.js` (it recreates the file).
- **Port already in use (30045–30047)** → another service is bound; stop it or edit
  the ports in `docker-compose.yml` and `dbcube.config.js`.
- **MongoDB transactions fail** → they need a replica set; the bundled compose
  starts a single-node one automatically (`db:up`).
- **First run is slow** → the native engine binary is downloading; subsequent
  runs are instant. In CI/containers, pre-fetch it with `npx dbcube update`.

## 🔗 Links

- Docs: **https://dbcube.dev**
- Install: `npm install dbcube`
- More examples & use cases: [dbcube.dev/examples](https://dbcube.dev/examples/overview)

---

<div align="center">
MIT licensed · Made by the <strong>Dbcube</strong> team
</div>
