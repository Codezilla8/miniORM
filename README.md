# MiniORM

A small, real PostgreSQL ORM for TypeScript/Node.js. Parameterized query builder, CRUD, relations, transactions, migrations, connection pooling, and a CLI — built from scratch, no query-builder dependency underneath.

This is a portfolio project: the goal was a coherent, working ORM that demonstrates the layers a real one is made of, not a Prisma/TypeORM competitor. See [Limitations](#limitations) for explicit scope boundaries.

## Features

- Connection pooling over `pg`
- Model API: `findMany`, `findUnique`, `findUniqueOrThrow`, `create`, `update`, `delete`
- Query builder supporting `=`, `!=`, `>`, `<`, `>=`, `<=`, `IN`, `LIKE`, `IS NULL`, `WHERE`, `ORDER BY`, `LIMIT`, `OFFSET` — always parameterized
- `hasMany` / `belongsTo` relations with `include`, loaded via batched queries (no N+1)
- Transactions (`db.transaction(async tx => ...)`) with automatic commit/rollback
- SQL-file migrations with a tracking table, run via CLI
- Published as a real npm package: ESM + CJS + type declarations

## Architecture

```
Application
     |
ORM Public API        (src/index.ts, ORM class)
     |
Model Layer            (src/model)      db.getModel("user").findMany(...)
     |
Query Builder            (src/query)    developer input -> IR
     |
SQL Compiler              (src/query/compiler.ts)   IR -> SQL text + params[]
     |
Query Executor              (src/client)  runs SQL via pg, maps rows
     |
pg Driver / Pool
     |
PostgreSQL
```

- **Connection pooling** — `src/client` wraps `pg.Pool`.
- **Transactions** — `src/transaction` pins one pooled connection for the callback's lifetime.
- **Relations** — `src/relations/loader.ts` batches related rows with a single `IN (...)` query per relation.
- **Migrations** — `src/migration` is independent of the model layer; it talks to the client directly.
- **Mapping** — `src/model/mapper.ts` is the single seam between raw driver rows and application objects.

## Installation

```bash
npm install miniorm pg
```

(`pg` is a peer-adjacent runtime dependency already declared by `miniorm`; installing it explicitly is optional but shown for clarity.)

## PostgreSQL Setup

You need a running PostgreSQL instance (v14+) and a connection string:

```bash
psql --version   # confirm it's installed
createdb miniorm_dev
```

```bash
# .env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/miniorm_dev
```

## Quick Start

```ts
import { ORM } from "miniorm";

const db = new ORM({ connectionString: process.env.DATABASE_URL });

db.model("user", { table: "users" });

const users = await db.getModel("user").findMany({
  where: { age: { gt: 18 } },
  orderBy: { name: "asc" },
  limit: 10,
});
```

Generated SQL:

```sql
SELECT * FROM "users" WHERE "age" > $1 ORDER BY "name" ASC LIMIT $2;
-- params: [18, 10]
```

## Models

```ts
db.model("user", { table: "users" });
db.model("post", {
  table: "posts",
  relations: {
    author: { kind: "belongsTo", target: "user", foreignKey: "userId" },
  },
});
```

Registering a model both records its metadata and attaches it as a live property on the `ORM` instance (`db.user`, typed access via `db.getModel<Row>("user")`).

## CRUD

```ts
await db.getModel("user").findMany();

await db.getModel("user").findUnique({ where: { id: 1 } });

await db.getModel("user").create({ data: { name: "Jay", age: 21 } });

await db.getModel("user").update({ where: { id: 1 }, data: { age: 22 } });

await db.getModel("user").delete({ where: { id: 1 } });
```

## Querying

Operators: `eq` (default for plain values), `ne`, `gt`, `lt`, `gte`, `lte`, `in`, `like`, `isNull`.

```ts
await db.getModel("user").findMany({
  where: {
    age: { gte: 18, lte: 65 },
    name: { like: "%Jay%" },
    id: { in: [1, 2, 3] },
  },
  orderBy: { name: "asc" },
  limit: 20,
  offset: 40,
});
```

All conditions are implicitly AND-ed. Every value — including inside `IN (...)` — is sent as a bound parameter, never interpolated into SQL text.

## Relations

```ts
db.model("user", {
  table: "users",
  relations: { posts: { kind: "hasMany", target: "post", foreignKey: "userId" } },
});

const users = await db.getModel("user").findMany({ include: { posts: true } });
```

**N+1 handling:** loading `include: { posts: true }` for 50 users does not run 50 extra queries. The loader collects every parent's key, runs exactly **one** `WHERE "userId" IN (...)` query, and groups the results back onto their parent in memory — total queries = 1 (parents) + 1 per included relation, regardless of row count.

## Transactions

```ts
await db.transaction(async (tx) => {
  const user = await tx.user.create({ data: { name: "Jay", age: 21 } });
  await tx.post.create({ data: { title: "Hello", userId: user.id } });
});
```

Every query inside the callback runs on the same pinned connection. On success, `COMMIT` runs; on any thrown error, `ROLLBACK` runs and the error propagates. The connection is always released back to the pool in a `finally` block.

## Migrations

```bash
npx miniorm init
npx miniorm migrate:create add_users
npx miniorm migrate
npx miniorm status
```

A migration is a plain `.sql` file:

```sql
-- migrations/20260214120000_add_users.sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER
);
```

Applied migrations are recorded in a `_miniorm_migrations` table so re-running `migrate` is idempotent. **Limitations:** no automatic rollback/"down" migrations (revert with a new forward migration instead); migrations apply strictly in filename/timestamp order with no dependency-graph conflict resolution.

## CLI

| Command | What it does |
|---|---|
| `miniorm init` | Creates the `migrations/` directory |
| `miniorm migrate:create <name>` | Scaffolds a new timestamped `.sql` migration file |
| `miniorm migrate` | Runs all pending migrations |
| `miniorm status` | Lists applied vs. pending migrations |

The CLI reads `DATABASE_URL` from the environment and looks for `./migrations` relative to the current working directory.

## Testing

```bash
npm test               # unit tests — no database required
npm run test:integration   # requires a running Postgres + DATABASE_URL
npm run test:all
```

- **Unit tests** (`tests/unit`) cover SQL generation, the where-clause normalizer, and identifier validation — including a dedicated suite asserting malicious input never alters generated SQL structure.
- **Integration tests** (`tests/integration`) run CRUD, relations, transactions (commit + rollback), and migrations against a real PostgreSQL database.

## Example Application

`examples/blog-api` is a minimal HTTP API (Node's built-in `http` module only) that uses **only** MiniORM for data access — installed from the packed npm tarball, not from source, to prove the package works as a real dependency:

```bash
npm run build
npm pack
cd examples/blog-api
npm install
DATABASE_URL=postgres://... npx miniorm migrate --config .
node server.js
```

Endpoints: `POST /users`, `GET /users`, `GET /users/:id?include=posts`, `POST /posts`, `POST /transfer-demo` (transaction example).

## Limitations

- PostgreSQL only — no MySQL/SQLite/other engines
- No query planner/optimizer
- No distributed transactions
- No caching layer
- No compile-time type inference from your schema (row types are supplied manually via `getModel<Row>()`)
- No GraphQL layer
- Migrations: one-way only (no generated "down" scripts), no branch/merge conflict resolution
- Relation loading supports `hasMany`/`belongsTo` only — no `manyToMany` join-table support yet
- `db.user` dynamic property access works at runtime but isn't statically typed; use `db.getModel<Row>("user")` for type safety

## Future Improvements

- `manyToMany` relations via join tables
- Optional down-migrations
- Basic schema-diffing to generate migrations from model changes
- Typed model registration (`db.model<UserRow>("user", ...)`) without the `getModel` indirection

## License

MIT
