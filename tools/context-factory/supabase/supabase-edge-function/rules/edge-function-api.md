# Edge Function API Standard

This document defines the standard structure for Supabase Edge Functions in `packages/supabase/supabase/functions`.

## Purpose

Use this standard for edge functions that:

- expose HTTP endpoints
- validate request params with Hono + Zod
- read data from Supabase
- keep routing, service logic, and data access separated

## Required Structure

Each edge function must follow this layout:

```text
supabase/functions/<function-name>/
  index.ts          ← HTTP entrypoint
  services/         ← business/orchestration logic
    <use-case>.ts
  data/             ← Supabase query logic
    <use-case>.ts
  utils/            ← shared utilities for this function
  constants/        ← shared constants for this function
```

All five entries — `index.ts`, `services/`, `data/`, `utils/`, `constants/` — must be present in every function, even if `utils/` and `constants/` start empty (use `.gitkeep`).

## Complete Examples

Each example shows a fully working set of files for one HTTP pattern. Rules for each layer follow in the next section.

---

### GET — Fetch by ID (multi-table / parent-child)

Use this pattern when the response is a composite of multiple queries (e.g. a parent row plus its children).

**`index.ts`**

```ts
import { Hono } from 'jsr:@hono/hono';
import { cors } from 'jsr:@hono/hono/cors';
import { zValidator } from 'jsr:@hono/zod-validator';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createAnonSupabaseClient } from '../_shared/supabase/client.ts';
import { getDefaultCorsConfig } from '../_shared/http/cors.ts';
import { toErrorResponse } from '../_shared/http/error-response.ts';
import { getThingService } from './services/get-thing.ts';

const functionName = '<function-name>';

export function createApp() {
  const app = new Hono().basePath(`/${functionName}`);

  app.use(cors(getDefaultCorsConfig()));
  app.onError(toErrorResponse);
  app.options('*', (context) => context.json({ message: 'OK' }, 200));

  app.get('/:resourceId', zValidator('param', z.object({
    resourceId: z.string().uuid(),
  })), async (context) => {
    const { resourceId } = context.req.valid('param');
    const supabaseClient = createAnonSupabaseClient(context.req.raw);
    const data = await getThingService({ supabaseClient, resourceId });
    return context.json(data, 200);
  });

  return app;
}

const app = createApp();

if (import.meta.main) {
  Deno.serve(app.fetch);
}
```

**`services/get-thing.ts`**

```ts
import { type SupabaseClient } from '../../_shared/supabase/client.ts';
import { getThingData } from '../data/get-thing.ts';

export type GetThingServiceDependencies = {
  getThingData: typeof getThingData;
};

export type GetThingServiceArgs = {
  supabaseClient: SupabaseClient;
  resourceId: string;
  dependencies?: GetThingServiceDependencies;
};

export const getThingService = async ({
  supabaseClient,
  resourceId,
  dependencies = { getThingData },
}: GetThingServiceArgs) => {
  return await dependencies.getThingData({ supabaseClient, resourceId });
};
```

**`data/get-thing.ts`**

```ts
import { type SupabaseClient } from '../../shared/supabase/client.ts';

export type GetThingDataArgs = {
  supabaseClient: SupabaseClient;
  resourceId: string;
};

export const getThingData = async ({ supabaseClient, resourceId }: GetThingDataArgs) => {
  // Fetch parent row first
  const { data: parent, error: parentError } = await supabaseClient
    .from('some_table')
    .select('id, created_at')
    .eq('resource_id', resourceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (parentError) throw parentError;

  if (!parent) {
    return { resourceId, parentId: null, createdAt: null, items: [] };
  }

  // Fetch child rows by parent ID
  const { data: items, error: itemsError } = await supabaseClient
    .from('some_child_table')
    .select('*')
    .eq('parent_id', parent.id)
    .order('created_at', { ascending: false });

  if (itemsError) throw itemsError;

  return {
    resourceId,
    parentId: parent.id,
    createdAt: parent.created_at,
    items: items ?? [],
  };
};
```

---

### POST — Create a resource

**`index.ts`**

```ts
import { Hono } from 'jsr:@hono/hono';
import { cors } from 'jsr:@hono/hono/cors';
import { zValidator } from 'jsr:@hono/zod-validator';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createAnonSupabaseClient } from '../_shared/supabase/client.ts';
import { getDefaultCorsConfig } from '../_shared/http/cors.ts';
import { toErrorResponse } from '../_shared/http/error-response.ts';
import { createThingService } from './services/create-thing.ts';

const functionName = '<function-name>';

export function createApp() {
  const app = new Hono().basePath(`/${functionName}`);

  app.use(cors(getDefaultCorsConfig()));
  app.onError(toErrorResponse);
  app.options('*', (context) => context.json({ message: 'OK' }, 200));

  app.post('/', zValidator('json', z.object({
    name: z.string(),
  })), async (context) => {
    const body = context.req.valid('json');
    const supabaseClient = createAnonSupabaseClient(context.req.raw);
    const data = await createThingService({ supabaseClient, ...body });
    return context.json({ data }, 201);
  });

  return app;
}

const app = createApp();

if (import.meta.main) {
  Deno.serve(app.fetch);
}
```

**`services/create-thing.ts`**

```ts
import { type SupabaseClient } from '../../_shared/supabase/client.ts';
import { createThingData } from '../data/create-thing.ts';

export type CreateThingDependencies = {
  createThingData: typeof createThingData;
};

export type CreateThingServiceArgs = {
  supabaseClient: SupabaseClient;
  name: string;
  dependencies?: CreateThingDependencies;
};

export const createThingService = async ({
  supabaseClient,
  name,
  dependencies = { createThingData },
}: CreateThingServiceArgs) => {
  return await dependencies.createThingData({ supabaseClient, name });
};
```

**`data/create-thing.ts`**

```ts
import { type SupabaseClient } from '../../_shared/supabase/client.ts';

export type CreateThingDataArgs = {
  supabaseClient: SupabaseClient;
  name: string;
};

export const createThingData = async ({ supabaseClient, name }: CreateThingDataArgs) => {
  const { data, error } = await supabaseClient
    .from('some_table')
    .insert({ name })
    .select()
    .single();

  if (error) throw error;

  return data;
};
```

---

### SEARCH — Paginated query with filters and sorting

Extend the shared `listQuerySchema` to add domain-specific query params. When there is no business logic, call the data function directly from `index.ts` — a service file is not required.

**`index.ts`**

```ts
import { Hono } from 'jsr:@hono/hono';
import { cors } from 'jsr:@hono/hono/cors';
import { zValidator } from 'jsr:@hono/zod-validator';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createAnonSupabaseClient } from '../_shared/supabase/client.ts';
import { getDefaultCorsConfig } from '../_shared/http/cors.ts';
import { toErrorResponse } from '../_shared/http/error-response.ts';
import { listQuerySchema } from '../_shared/http/zod-schema.ts';
import { searchThingsService } from './services/search-things.ts';

const functionName = '<function-name>';

const searchQuerySchema = listQuerySchema.extend({
  sort_by: z.enum(['created_at', 'updated_at', 'name']).optional(),
  parent_id: z.string().uuid().optional(),
});

export function createApp() {
  const app = new Hono().basePath(`/${functionName}`);

  app.use(cors(getDefaultCorsConfig()));
  app.onError(toErrorResponse);
  app.options('*', (context) => context.json({ message: 'OK' }, 200));

  app.get('/search', zValidator('query', searchQuerySchema), async (context) => {
    const query = context.req.valid('query');
    const supabaseClient = createAnonSupabaseClient(context.req.raw);
    const data = await searchThingsService({
      supabaseClient,
      limit: query.limit,
      page: query.page,
      sortBy: query.sort_by,
      orderBy: query.order_by,
      filters: { parentId: query.parent_id },
    });
    return context.json(data, 200);
  });

  return app;
}

const app = createApp();

if (import.meta.main) {
  Deno.serve(app.fetch);
}
```

**`services/search-things.ts`**

```ts
import { type SupabaseClient } from '../../_shared/supabase/client.ts';
import { searchThingsData, type SearchThingsFilters } from '../data/search-things.ts';
import { transformToPaginatedResponse } from '../../_shared/utils/transform-to-paginated-response.ts';

export type SearchThingsDependencies = {
  searchThingsData: typeof searchThingsData;
};

export type SearchThingsServiceArgs = {
  supabaseClient: SupabaseClient;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'updated_at' | 'name';
  orderBy?: 'asc' | 'desc';
  filters?: SearchThingsFilters;
  dependencies?: SearchThingsDependencies;
};

export const searchThingsService = async ({
  supabaseClient,
  page = 1,
  limit = 25,
  sortBy,
  orderBy,
  filters,
  dependencies = { searchThingsData },
}: SearchThingsServiceArgs) => {
  const { records, totalRecords } = await dependencies.searchThingsData({
    supabaseClient,
    page,
    limit,
    sortBy,
    orderBy,
    filters,
  });
  return transformToPaginatedResponse({ records, totalRecords, page, limit });
};
```

**`data/search-things.ts`**

```ts
import { type SupabaseClient } from '../../_shared/supabase/client.ts';

export type SearchThingsFilters = {
  parentId?: string;
};

export type SearchThingsDataArgs = {
  supabaseClient: SupabaseClient;
  limit?: number;
  page?: number;
  sortBy?: 'created_at' | 'updated_at' | 'name';
  orderBy?: 'asc' | 'desc';
  filters?: SearchThingsFilters;
};

export const searchThingsData = async ({
  supabaseClient,
  limit = 25,
  page = 1,
  sortBy = 'created_at',
  orderBy = 'desc',
  filters,
}: SearchThingsDataArgs) => {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseClient
    .from('some_table')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: orderBy === 'asc' })
    .range(from, to);

  if (filters?.parentId) {
    query = query.eq('parent_id', filters.parentId);
  }

  const { data, count, error } = await query;

  if (error) throw error;

  return { records: data ?? [], totalRecords: count ?? 0 };
};
```

---

## File Responsibilities

### `index.ts`

The HTTP entrypoint only.

It should:

- export a `createApp()` factory function that builds and returns the Hono app
- create the Hono app with `basePath` inside `createApp()`
- register CORS middleware, `onError` handler, and `OPTIONS` handler
- validate request params with `zValidator`
- create the Supabase client from `context.req.raw`
- call a service or data function, return the response
- call `Deno.serve(app.fetch)` only when `import.meta.main` is true

It should not:

- contain database query logic
- contain business logic
- contain multi-step response shaping

> Note: `basePath` is only the internal Hono routing prefix. Deployed callers should still invoke the edge function at `/functions/v1/<function-name>` and then append the route path once. Do not duplicate the function name in external URLs or `supabase.functions.invoke(...)` calls.

### `services/<use-case>.ts`

Orchestrates the use case. **Only add a service when there is actual business logic or response composition** — e.g. calling multiple data functions, applying decisions, or shaping a paginated response. Do not create a service file that is a pure pass-through to a single data function.

- calls one or more data functions
- applies business decisions
- composes the response shape
- accepts injectable dependencies for testability
- keep services pure aside from calling dependencies

### `data/<use-case>.ts`

Responsible for Supabase queries only.

- executes queries with ordering and filtering
- accepts domain-specific filter params grouped in a `filters` object
- accepts `sortBy` and `orderBy` params with sensible defaults
- returns structured data
- throws database errors upward — `onError` in `index.ts` catches and formats them
- must not know about Hono context or build HTTP responses

Do not use `.single()` or `.maybeSingle()` unless the query is guaranteed to return at most one row. For parent-child relationships, fetch the latest parent row first using `.maybeSingle()`, then fetch all child rows by parent ID without `.single()`. Using `.single()` after `.insert().select()` is correct — an insert always returns exactly one row.

### `utils/`

Function-scoped helpers (e.g. formatters, transformers). Keep empty with `.gitkeep` if unused.

### `constants/`

Function-scoped constants (e.g. enums, config values). Keep empty with `.gitkeep` if unused.

---

## Rules

### Imports

- use `jsr:@hono/hono` for Hono
- use `jsr:@hono/zod-validator` for request validation
- use a pinned URL import for Zod: `https://deno.land/x/zod@v3.22.4/mod.ts`
- do not use `jsr:zod`

### App Setup

Register middleware in this order inside `createApp()`:

```ts
app.use(cors(getDefaultCorsConfig()));
app.onError(toErrorResponse);
app.options('*', (context) => context.json({ message: 'OK' }, 200));
```

- `cors` must be first so preflight responses include the right headers
- `onError` must be registered before routes so it catches errors from all handlers
- `OPTIONS` handler must be registered before routes

Always wrap the app in a `createApp()` factory and guard `Deno.serve` with `import.meta.main`:

```ts
export function createApp() {
  const app = new Hono().basePath(`/${functionName}`);
  // ... middleware and routes
  return app;
}

const app = createApp();

if (import.meta.main) {
  Deno.serve(app.fetch);
}
```

### CORS

- always use the shared `getDefaultCorsConfig()` from `_shared/http/cors.ts`
- always register an `OPTIONS` handler for browser clients

### Error Handling

- always register `app.onError(toErrorResponse)`
- `toErrorResponse` normalizes any thrown value and maps typed error classes to HTTP status codes
- throw typed errors (`NotFoundError`, `BadRequestError`, etc.) from services and data functions — do not catch them in route handlers

### Request Validation

- validate `param`, `query`, or `json` at the route boundary with `zValidator`
- only pass validated values into services or data functions
- for list/search routes, extend `listQuerySchema` from `_shared/http/zod-schema.ts` rather than defining pagination params inline
- use `.uuid()` on string params that must be UUIDs: `z.string().uuid()`

### Supabase Client

- use `context.req.raw`, not `context.req` — helpers expect the native `Request`, not Hono's wrapper
- `createAnonSupabaseClient` tolerates a missing `Authorization` header by design

### Context Variable

- use `context` as the Hono handler argument name, not `c`

### Service Layer

- add a service when there is real business logic, multi-step composition, or response shaping (e.g. paginated metadata)
- skip the service and call the data function directly from `index.ts` when the route is a simple read with no business logic
- never create a service that is a pure one-line pass-through to a single data function

### Response Shape

- for composite or structured responses (e.g. parent-child aggregates), return the object directly: `context.json(data, 200)`
- for simple single-resource responses, wrap the payload: `context.json({ data }, 200)`
- POST routes must return `context.json({ data }, 201)`
- always include an explicit HTTP status code in `context.json()`
- prefer `null` and `[]` over shape changes when nothing exists yet

### Naming

- function folder names must match the deployed function name
- data files: `<action>-<resource>.ts`
- service files: mirror the use case name
- use explicit parameter names: `supabaseClient`, `resourceId`, `dependencies`
- group domain filter params under a `filters` object in data function args

---

## Anti-Patterns

- passing `context.req` into helpers that expect `Request` — use `context.req.raw`
- using `jsr:zod` as a package spec
- putting queries or business logic directly in `index.ts`
- using `.single()` on one-to-many tables or plain select queries
- relying on a parent ID alone when the real entity is child-scoped
- returning different JSON shapes for empty vs non-empty results
- omitting `utils/` or `constants/` directories from the function folder
- fetching all rows then slicing in memory — always paginate at the query level with `.range()`
- creating a service file that is a pure pass-through to a single data function
- defining `limit`, `page`, and `order_by` inline — extend `listQuerySchema` instead
- spreading all filter params as top-level args on data functions — group them under `filters`
- omitting the HTTP status code from `context.json()` calls
- calling `Deno.serve` unconditionally — guard with `import.meta.main`
- omitting `app.onError` — unhandled throws will return unformatted 500 responses
- using `c` as the Hono context variable — use `context`
- not validating UUID params with `.uuid()`

---

## Shared Utilities

Cross-function helpers live in `_shared/`:

```text
supabase/functions/_shared/
  supabase/
    client.ts                          ← createAnonSupabaseClient, createServiceRoleSupabaseClient
  http/
    cors.ts                            ← getDefaultCorsConfig
    error-response.ts                  ← toErrorResponse (used in app.onError)
    zod-schema.ts                      ← listQuerySchema (base schema for list/search routes)
  utils/
    transform-to-paginated-response.ts ← transformToPaginatedResponse
    errors.ts                          ← BadRequestError, NotFoundError, UnauthorizedError, etc. + makeError
```

Import using a relative path: `../_shared/supabase/client.ts`.

### Error classes (`errors.ts`)

Use the typed error classes from `_shared/utils/errors.ts` to signal domain errors from services or data functions. These map to standard HTTP status codes via `makeError` (which `toErrorResponse` calls internally):

| Class | Status |
|---|---|
| `BadRequestError` | 400 |
| `UnauthorizedError` | 401 |
| `ForbiddenError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `TooManyRequestsError` | 429 |
| `InternalServerError` | 500 |

Throw from service or data layer — `app.onError` will catch and convert automatically.

### `listQuerySchema` (`zod-schema.ts`)

Provides the base schema for paginated list endpoints:

```ts
// _shared/http/zod-schema.ts
z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  page: z.coerce.number().min(1).optional(),
  order_by: z.enum(['asc', 'desc']).optional(),
})
```

Always extend this rather than redefining `limit`, `page`, and `order_by` per-function:

```ts
import { listQuerySchema } from '../_shared/http/zod-schema.ts';

const searchQuerySchema = listQuerySchema.extend({
  sort_by: z.enum(['created_at', 'name']).optional(),
  parent_id: z.string().uuid().optional(),
});
```
