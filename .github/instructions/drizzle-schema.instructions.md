---
description: "Use when creating or modifying Drizzle schema files, adding new database tables, columns, indexes, or foreign keys in packages/shared/src/schema/. Covers Huginn naming conventions, column patterns, versioning rules, and export requirements."
applyTo: "packages/shared/src/schema/**"
---
# Drizzle Schema Conventions

## File & Export Pattern

- One table per file in `packages/shared/src/schema/`
- Filename: `kebab-case.ts` (e.g., `channel-links.ts`)
- Export name: `camelCase` matching the table concept (e.g., `export const channelLinks`)
- Add every new table to the barrel export in `schema/index.ts`
- Then re-export from `packages/shared/src/index.ts` (already does `export * from "./schema"`)

## Naming

- **Table names**: `snake_case` — `pgTable("channel_links", ...)`
- **Column names**: `snake_case` in DB, `camelCase` in TypeScript — `accountId: uuid("account_id")`
- **Index names**: prefixed `uq_` for unique indexes — `uniqueIndex("uq_provider_user")`

## Column Patterns

Every table must have:

```ts
id: uuid("id").primaryKey().defaultRandom(),
createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
```

Foreign keys to accounts always cascade:

```ts
accountId: uuid("account_id")
  .notNull()
  .references(() => accounts.id, { onDelete: "cascade" }),
```

All timestamps use `withTimezone: true`:

```ts
timestamp("expires_at", { withTimezone: true })
```

## Imports

Import column types individually from `drizzle-orm/pg-core`:

```ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
```

Import referenced tables from sibling files:

```ts
import { accounts } from "./accounts";
```

## Append-Only Tables

`personality_files` uses append-only versioning — never UPDATE rows. New versions INSERT with `version + 1`. This pattern may apply to future tables that need history. If a table needs version history, follow the same pattern:

```ts
version: integer("version").notNull().default(1),
reason: text("reason"),  // why this version was created
```

## After Adding a Table

1. Add named export to `packages/shared/src/schema/index.ts`
2. Run `pnpm db:push` to apply to local Postgres
3. If adding a new interface contract, create it in `packages/shared/src/types/`

## Better Auth Tables (Exception)

The tables in `auth.ts` (`user`, `session`, `authAccount`, `verification`) do NOT follow the standard column patterns above. Their schema is dictated by Better Auth \u2014 they use `text("id").primaryKey()` instead of UUID, and include `updatedAt` columns. Do not modify these columns; follow the Better Auth docs for any changes.
