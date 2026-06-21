# 10 — Schema as code: the .cube workflow

Dbcube manages your schema from versioned `.cube` files instead of hand-written
DDL. The files for this example live in `dbcube/cubes/`.

## The full lifecycle

```bash
# 1. Scaffold a project (creates dbcube.config.js + dbcube/ + example cube)
npx dbcube init

# 2. Validate every .cube without touching the database (CI-friendly: exit 1 on errors)
npx dbcube validate

# 3. Apply the schema — NON-destructive: creates missing tables, ALTERs existing ones
npx dbcube run table:refresh

# 4. Or rebuild from scratch — DESTRUCTIVE: asks you to type the database name
npx dbcube run table:fresh          # --force to skip confirmation (CI)

# 5. Seed data
npx dbcube run seeder:add

# 6. Install runtime triggers
npx dbcube run trigger:fresh

# 7. Generate TypeScript interfaces from the schema
npx dbcube generate                 # → dbcube/types.ts

# 8. Watch mode while developing: saving a .cube applies it automatically
npx dbcube dev
```

## Migrations (.alter.cube)

Schema changes on live databases use `.alter.cube` files with tracked history:

```bash
npx dbcube run table:alter --dry-run   # print the SQL without executing
npx dbcube run table:alter             # apply PENDING migrations only
npx dbcube migrate:status              # applied / pending / modified
npx dbcube migrate:rollback            # revert the last batch (auto-generated reverses)
```

Example `users_add_phone.alter.cube`:

```
@database("demo");
@table("users");

@addColumn({
    phone: {
        type: "varchar";
        length: "30";
        options: ["nullable"];
    };
});

@renameColumn({ last: "status"; new: "state"; });
```

History lives in `dbcube/migrations.json` (commit it — it travels with the repo).

## Importing an EXISTING database

Coming from a legacy project? Introspect it and generate the cubes:

```bash
npx dbcube run pull            # all configured databases
npx dbcube run pull demo       # just one
```

Works for MySQL, PostgreSQL, SQLite and MongoDB (Mongo infers types by
sampling 50 documents per collection).

## Other useful commands

```bash
npx dbcube doctor      # diagnose config, binaries and connectivity
npx dbcube -v          # versions of everything
npx dbcube help        # full reference
```
