---
name: supabase-edge-function
description: Supabase Edge Function implementation skill for the Dianoia Tech monorepo. Use when building or updating HTTP edge functions in `packages/supabase/supabase/functions`, including Hono routing, Zod validation, shared CORS/error handling, service/data separation, and paginated search endpoints. When this skill is used, load and follow every rule file listed in this skill.
---

# Supabase Edge Function Skill

Follow the local Supabase Edge Function standard in this folder for every task under `packages/supabase/supabase/functions`.

## Required Rule Loading

Read the following before making edge function changes:

- `rules/edge-function-api.md`

Treat this rule file as the source of truth for folder structure, imports, app setup, validation, response shape, naming, and anti-patterns.

## Apply This Skill When

Use this skill for edge functions that:

- expose HTTP endpoints
- validate `param`, `query`, or `json` input with Hono + Zod
- read or write data through Supabase
- separate routing, service logic, and data access
- implement list or search routes with filtering, sorting, and pagination

## Core Standards

- every function must include `index.ts`, `services/`, `data/`, `utils/`, and `constants/`; keep `utils/` and `constants/` with `.gitkeep` when empty
- `index.ts` is the HTTP entrypoint only: export `createApp()`, build `new Hono().basePath(...)` inside it, register CORS, `app.onError(toErrorResponse)`, and `OPTIONS`, validate at the route boundary, create the Supabase client from `context.req.raw`, and return explicit HTTP status codes
- call `Deno.serve(app.fetch)` only when `import.meta.main` is true
- add a service only when there is real business logic, multi-step orchestration, or response shaping; do not keep pass-through service files
- keep Supabase query logic in `data/` only; data functions handle filters, sorting, pagination, and throw errors upward
- group domain filter params under a `filters` object in data function args
- extend shared `listQuerySchema` for list/search routes instead of redefining `limit`, `page`, and `order_by`
- use shared helpers from `_shared/` for Supabase clients, CORS, error responses, pagination transforms, and typed errors
- use `context` as the Hono context variable name, `jsr:@hono/hono`, `jsr:@hono/zod-validator`, and the pinned Zod URL import from the rule

## Response and Query Conventions

- return composite or aggregate responses directly with `context.json(data, 200)`
- return simple resource reads as `context.json({ data }, 200)`
- return POST creates as `context.json({ data }, 201)`
- prefer stable shapes with `null` and `[]` instead of changing the JSON shape when data is absent
- do not use `.single()` or `.maybeSingle()` unless the query can return at most one row; for parent-child reads, fetch the latest parent first, then fetch child rows separately

## Anti-Patterns To Avoid

- putting database queries or business logic in `index.ts`
- passing `context.req` where helpers expect `context.req.raw`
- using `jsr:zod`
- creating pass-through service files with no business logic
- paginating in memory instead of with `.range()`
- spreading filter params as top-level data function args instead of using `filters`
- omitting `app.onError`, `OPTIONS`, explicit status codes, or the `import.meta.main` guard
- using `c` instead of `context`
