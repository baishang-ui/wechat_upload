# MySQL Backend Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure Node.js HTTP service that reads MySQL credentials from environment variables, verifies the configured database, and exposes safe process and database health endpoints.

**Architecture:** Keep the WeChat Mini Program isolated from database credentials. A small TypeScript service uses Node's built-in HTTP server and a reusable `mysql2/promise` connection pool; pure configuration and request-handler boundaries allow deterministic tests without connecting to the live database. A separate command performs the explicit live authentication, database-selection, and query test.

**Tech Stack:** Node.js 18+, TypeScript, `tsx`, Node test runner, `mysql2/promise`, `dotenv`, built-in `node:http`.

## Global Constraints

- MySQL credentials must exist only in the ignored root `.env` file or process environment.
- Do not put the database password, full connection string, or raw driver errors in source, tests, documentation, logs intended for clients, or Git history.
- The service listens on `0.0.0.0:3000` by default, configurable through `SERVER_HOST` and `SERVER_PORT`.
- `GET /api/health` checks only the Node.js process; `GET /api/health/mysql` executes `SELECT 1 AS ok, DATABASE() AS database_name, NOW() AS server_time`.
- Database health is successful only when `ok = 1` and `DATABASE()` equals `MYSQL_DATABASE`.
- Database failures return HTTP 503 with `{ "ok": false, "error": "MYSQL_UNAVAILABLE" }` and no sensitive details.
- Do not create or modify database tables and do not migrate local inspection history in this plan.
- Preserve the user's existing uncommitted changes in `miniprogram/components/navigation-bar/navigation-bar.ts` and `miniprogram/pages/index/index.scss`.

## File Structure

- Create `server/config.ts`: parse and validate environment variables.
- Create `server/database.ts`: own the MySQL pool and normalize the fixed health query result.
- Create `server/app.ts`: route HTTP requests and serialize safe JSON responses.
- Create `server/index.ts`: load `.env`, start the server, and shut down cleanly.
- Create `server/test-connection.ts`: run one explicit live connection test without starting HTTP.
- Create `server/tsconfig.json`: type-check the Node-only source separately from Mini Program types.
- Create `tests/server-config.test.ts`: configuration success and failure cases.
- Create `tests/server-database.test.ts`: health result validation through an injected query executor.
- Create `tests/server-app.test.ts`: real ephemeral HTTP-server tests with an injected database checker.
- Create `.env.example`: safe environment-variable template.
- Modify `.gitignore`: ignore `.env` and local environment variants while preserving `.env.example`.
- Modify `package.json` and `package-lock.json`: add runtime dependencies, Node typings, and service scripts.
- Modify `tsconfig.json`: keep Mini Program type-checking isolated from `server/`.
- Modify `README.md`: document setup, commands, endpoint contracts, and security boundary.

---

### Task 1: Environment Configuration Contract

**Files:**
- Create: `tests/server-config.test.ts`
- Create: `server/config.ts`
- Create: `server/tsconfig.json`
- Modify: `tsconfig.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: a `NodeJS.ProcessEnv`-compatible object.
- Produces: `loadServerConfig(env): ServerConfig` where `ServerConfig` contains `mysql.host`, `mysql.port`, `mysql.user`, `mysql.password`, `mysql.database`, `server.host`, and `server.port`.

- [ ] **Step 1: Install the minimum server dependencies**

Run:

```bash
npm install mysql2 dotenv
npm install --save-dev @types/node
```

Add scripts:

```json
{
  "server:dev": "tsx server/index.ts",
  "mysql:test": "tsx server/test-connection.ts",
  "typecheck": "tsc --noEmit && tsc -p server/tsconfig.json --noEmit"
}
```

Exclude `server` from the root Mini Program `tsconfig.json`, and configure `server/tsconfig.json` with Node types, strict checking, CommonJS modules, and ES2020 target.

- [ ] **Step 2: Write failing configuration tests**

Test that:

- complete values are returned with numeric ports;
- `SERVER_HOST` defaults to `0.0.0.0`;
- `SERVER_PORT` defaults to `3000`;
- every missing MySQL variable names only the missing key in the thrown error;
- ports reject empty, non-integer, zero, and values above `65535`;
- thrown errors never contain any supplied password.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
npx tsx --test tests/server-config.test.ts
```

Expected: FAIL because `server/config.ts` does not exist.

- [ ] **Step 4: Implement minimal validated configuration**

Create `ServerConfig`, a private required-string reader, a private TCP-port parser, and `loadServerConfig`. Trim host, user, and database values; preserve the password exactly so valid leading or trailing password characters are not changed.

- [ ] **Step 5: Run focused tests and type checks**

Run:

```bash
npx tsx --test tests/server-config.test.ts
npm run typecheck
```

Expected: configuration tests pass and both TypeScript projects exit with code 0.

- [ ] **Step 6: Commit the configuration unit**

```bash
git add package.json package-lock.json tsconfig.json server/tsconfig.json server/config.ts tests/server-config.test.ts
git commit -m "feat: add validated server configuration"
```

### Task 2: MySQL Pool and Health Query

**Files:**
- Create: `tests/server-database.test.ts`
- Create: `server/database.ts`

**Interfaces:**
- Consumes: `ServerConfig['mysql']` and a query executor with `query(sql) -> Promise<[rows, fields]>`.
- Produces: `checkDatabaseHealth(executor, expectedDatabase): Promise<DatabaseHealth>` and `createDatabase(config): DatabaseService` with `checkHealth()` and `close()`.

- [ ] **Step 1: Write failing database tests**

Use an injected fake executor to verify:

- the exact fixed read-only SQL is issued;
- a valid row returns `{ database, serverTime }` with `serverTime` as ISO 8601;
- empty rows, `ok !== 1`, wrong database, and invalid time values reject with a generic health error;
- no SQL is assembled from user input.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npx tsx --test tests/server-database.test.ts
```

Expected: FAIL because `server/database.ts` does not exist.

- [ ] **Step 3: Implement the query boundary and pool**

Define the fixed SQL constant, validate the first returned row, normalize `Date|string` to an ISO string, and create a `mysql2/promise` pool with `waitForConnections: true`, `connectionLimit: 5`, `connectTimeout: 5000`, and the configured database. `close()` delegates to `pool.end()`.

- [ ] **Step 4: Run focused tests and type checks**

Run:

```bash
npx tsx --test tests/server-database.test.ts
npm run typecheck
```

Expected: all database unit tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit the database unit**

```bash
git add server/database.ts tests/server-database.test.ts
git commit -m "feat: add mysql health service"
```

### Task 3: Safe HTTP Health Endpoints

**Files:**
- Create: `tests/server-app.test.ts`
- Create: `server/app.ts`

**Interfaces:**
- Consumes: an injected `DatabaseHealthService` with `checkHealth()` and an injected error logger.
- Produces: `createRequestHandler(dependencies): http.RequestListener`.

- [ ] **Step 1: Write failing HTTP tests**

Start a real HTTP server on port `0` around the request handler and use `fetch` to verify:

- `GET /api/health` returns HTTP 200 and `{ "ok": true }` without calling MySQL;
- successful `GET /api/health/mysql` returns HTTP 200 with database and ISO server time;
- a rejected database check returns exactly HTTP 503 and the stable safe error body;
- the logger receives the server-side error while the response does not include its message, stack, host, user, or password;
- unsupported methods and paths return a JSON 404 response.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npx tsx --test tests/server-app.test.ts
```

Expected: FAIL because `server/app.ts` does not exist.

- [ ] **Step 3: Implement the minimal request handler**

Route by `request.method` and the URL pathname, set `Content-Type: application/json; charset=utf-8`, serialize each response once, and catch database errors only around the MySQL health route.

- [ ] **Step 4: Run focused tests and type checks**

Run:

```bash
npx tsx --test tests/server-app.test.ts
npm run typecheck
```

Expected: all HTTP tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit the HTTP unit**

```bash
git add server/app.ts tests/server-app.test.ts
git commit -m "feat: expose database health endpoints"
```

### Task 4: Server Lifecycle and Live Test Command

**Files:**
- Create: `server/index.ts`
- Create: `server/test-connection.ts`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `loadServerConfig`, `createDatabase`, and `createRequestHandler`.
- Produces: a runnable development HTTP service and `npm run mysql:test` for one-shot verification.

- [ ] **Step 1: Protect local secrets**

Add `.env`, `.env.local`, and `.env.*.local` to `.gitignore`, with an explicit exception for `.env.example`. Create `.env.example` with non-secret placeholders and default server host/port.

- [ ] **Step 2: Implement the one-shot connection command**

Load `dotenv/config`, build the database service, execute `checkHealth()`, print only the confirmed database and ISO server time, close the pool in `finally`, and set a non-zero exit code on failure without printing credentials.

- [ ] **Step 3: Implement server startup and shutdown**

Load configuration before listening, create the database and request handler, listen using configured host/port, and handle `SIGINT`/`SIGTERM` exactly once by closing the HTTP server and MySQL pool.

- [ ] **Step 4: Run static and automated verification**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: all tests pass, both TypeScript checks succeed, and no whitespace errors are reported.

- [ ] **Step 5: Commit the runnable service**

```bash
git add .gitignore .env.example server/index.ts server/test-connection.ts
git commit -m "feat: add runnable mysql backend service"
```

### Task 5: Documentation and Real Database Verification

**Files:**
- Modify: `README.md`
- Local-only create: `.env` (ignored and never staged)

**Interfaces:**
- Consumes: the supplied MySQL parameters and completed server commands.
- Produces: reproducible setup documentation plus evidence of live authentication, database selection, SQL execution, and HTTP health success.

- [ ] **Step 1: Document the backend workflow**

Add README sections for architecture, `.env` setup, `npm run mysql:test`, `npm run server:dev`, both health endpoints, LAN access, and the rule that Mini Program code never stores MySQL credentials.

- [ ] **Step 2: Create the ignored local environment file**

Write the supplied values to `.env`, add `SERVER_HOST=0.0.0.0` and `SERVER_PORT=3000`, then verify:

```bash
git check-ignore -v .env
git status --short
```

Expected: `.env` is ignored and never appears as an untracked or staged file.

- [ ] **Step 3: Run direct live MySQL verification**

Run:

```bash
npm run mysql:test
```

Expected: exit code 0 with a safe success message confirming the configured database and a server timestamp. Failure output must be recorded by error category without exposing the password.

- [ ] **Step 4: Run the HTTP service and verify both endpoints**

Start `npm run server:dev`, then run:

```bash
curl --fail --silent http://127.0.0.1:3000/api/health
curl --fail --silent http://127.0.0.1:3000/api/health/mysql
```

Expected: both requests return HTTP 200 JSON; the MySQL response confirms the configured database.

- [ ] **Step 5: Run final regression verification**

Run:

```bash
npm test
npm run typecheck
git diff --check
git status --short
```

Expected: all automated tests and checks pass; only intentional feature files and the user's pre-existing Mini Program modifications are present.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md
git commit -m "docs: document mysql backend setup"
```
