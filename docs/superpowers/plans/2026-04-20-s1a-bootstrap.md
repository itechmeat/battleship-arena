# S1a - Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **AGENTS.md compliance note:** `AGENTS.md` in this repository prohibits `git add`, `git commit`, and similar state-changing git commands without explicit user permission. Every step below that would stage or commit requires an explicit approval from the user first. Staging and committing are included in the plan for completeness; do not perform them autonomously.

**Goal:** Land the S1a slice defined in `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md` - a locally verifiable Bun monorepo with shared types, a backend that answers `/api/health` and applies Drizzle migrations on startup, an Astro PWA shell, checked-in infra files, and a CI pipeline whose staging-deploy job is gated behind a repository variable until S1b.

**Architecture:** Three Bun workspaces (`shared`, `backend`, `web`) plus an `infra/` directory of Caddy / systemd / ops files that is checked in but not itself a Bun package. The backend is a Hono app on Bun with `bun:sqlite` accessed through Drizzle ORM and Drizzle Kit migrations. The frontend is an Astro static site with Solid wired but no islands yet, a hand-rolled shell-only service worker, and a PWA manifest. Infra files (`Caddyfile`, six systemd units, five ops scripts, `host-bootstrap.sh`, `verify-s1a.sh`, `maintenance.html`) are committed but not executed in S1a. CI runs lint, format, typecheck, test, build, and the local verify script on PRs; on merges to `main` it builds and conditionally deploys, gated by `vars.STAGING_DEPLOY_ENABLED`.

**Tech Stack:** Bun >= 1.3.12, Hono >= 4.12.14, Drizzle ORM >= 0.45.2, Drizzle Kit >= 0.31.10, TypeScript >= 6.0.2, Astro >= 6.1.7, Solid.js >= 1.9.12, oxlint >= 1.60.0, oxfmt >= 0.45.0, lefthook (pre-commit), SQLite via `bun:sqlite`, Caddy 2.x (config only, not run in S1a), systemd (units only, not installed in S1a).

**Pre-task 0 - Version log (do this before Task 1; the log file is committed alongside Task 1):**

- [ ] **Step 1: Create `docs/ops/version-log-2026-04-20.md`** with the skeleton below, then fill the Resolved column by looking up each value against its source of truth (npm registry for JS/TS libraries, GitHub Releases for Bun, the Caddy website for Caddy). Every resolved value must be `>= floor` from `docs/spec.md`. If any lookup returns a value below the floor, abort and raise with the user.

```markdown
# Version log - 2026-04-20 (S1a)

The versions below are the latest stable values at S1a implementation time, verified against the source of truth listed. Every value is `>= floor` in `docs/spec.md`.

| Package / tool      | Floor (spec)         | Resolved | Source of truth                                   |
| ------------------- | -------------------- | -------- | ------------------------------------------------- |
| Bun                 | 1.3.12               | **\_**   | https://github.com/oven-sh/bun/releases           |
| Hono                | 4.12.14              | **\_**   | https://www.npmjs.com/package/hono                |
| Drizzle ORM         | 0.45.2               | **\_**   | https://www.npmjs.com/package/drizzle-orm         |
| Drizzle Kit         | 0.31.10              | **\_**   | https://www.npmjs.com/package/drizzle-kit         |
| TypeScript          | 6.0.2                | **\_**   | https://www.npmjs.com/package/typescript          |
| Astro               | 6.1.7                | **\_**   | https://www.npmjs.com/package/astro               |
| Solid.js            | 1.9.12               | **\_**   | https://www.npmjs.com/package/solid-js            |
| @astrojs/solid-js   | (floor with Astro 6) | **\_**   | https://www.npmjs.com/package/@astrojs/solid-js   |
| @astrojs/check      | (compatible)         | **\_**   | https://www.npmjs.com/package/@astrojs/check      |
| oxlint              | 1.60.0               | **\_**   | https://www.npmjs.com/package/oxlint              |
| oxfmt               | 0.45.0               | **\_**   | https://www.npmjs.com/package/oxfmt               |
| lefthook            | (latest)             | **\_**   | https://www.npmjs.com/package/lefthook            |
| @types/bun          | (latest)             | **\_**   | https://www.npmjs.com/package/@types/bun          |
| Caddy               | 2.x                  | **\_**   | https://caddyserver.com/download                  |
| @resvg/resvg-js-cli | (latest)             | **\_**   | https://www.npmjs.com/package/@resvg/resvg-js-cli |
```

- [ ] **Step 2: Reference the resolved values** everywhere the plan says `<resolved>` or `LATEST` below. Those placeholders are intentional and exist so the plan is version-neutral; the log is the single source of truth.

**Convention used in this plan:**

- Every "Commit" step uses `git add <explicit paths>` and `git commit -m "<message>"`. Never use `git add .` or `git add -A`.
- Commit messages follow Conventional Commits (`feat`, `fix`, `chore`, `test`, `ci`, `docs`, `build`, `refactor`).
- When a step says "Run:", the implementer runs the command and checks the expected output before moving on.
- When a step includes a code block with a file path header, the implementer creates or replaces that file with the block's exact contents.

---

## Task 1: Initialize root workspace and tooling

**Files:**

- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `bunfig.toml`
- Create: `.bun-version`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.oxfmtrc.json`
- Create: `lefthook.yml`
- Modify: `oxlint.json`

- [ ] **Step 1: Create `.bun-version`** with the resolved Bun version (latest stable `>= 1.3.12`). Example value (replace with the resolved version):

```
1.3.12
```

- [ ] **Step 2: Create `.editorconfig`**:

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 3: Create `.gitignore`**:

```
node_modules/
.DS_Store
dist/
dev.db
dev.db-journal
dev.db-wal
dev.db-shm
.env.local
*.log
.astro/
.turbo/
```

- [ ] **Step 4: Create `bunfig.toml`** (the `[test]` preload is added in Task 5 after the file it points at exists):

```toml
[install]
exact = true
```

- [ ] **Step 5: Create `tsconfig.base.json`**:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "lib": ["es2023", "dom", "dom.iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 6: Create `.oxfmtrc.json`**:

```json
{
  "lineWidth": 100
}
```

- [ ] **Step 7: Overwrite `oxlint.json`** (extend with selected categories):

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn"],
  "categories": {
    "correctness": "error",
    "perf": "warn",
    "suspicious": "warn"
  },
  "rules": {
    "no-console": "off"
  },
  "ignorePatterns": ["dist", "node_modules", "web/.astro"]
}
```

- [ ] **Step 8: Create `package.json`** (replace `<resolved-bun>` with the Bun version from `.bun-version`; replace `LATEST` with the resolved dev-dep versions from the version log):

```json
{
  "name": "battleship-arena",
  "private": true,
  "type": "module",
  "packageManager": "bun@<resolved-bun>",
  "workspaces": ["shared", "backend", "web"],
  "scripts": {
    "dev:backend": "bun --filter backend run dev",
    "dev:web": "bun --filter web run dev",
    "build": "bun run build:backend && bun run build:web",
    "build:backend": "bun --filter backend run build",
    "build:web": "bun --filter web run build",
    "preview:web": "bun --filter web run preview",
    "typecheck": "bun --filter '*' run typecheck",
    "lint": "oxlint",
    "lint:fix": "oxlint --fix",
    "fmt": "oxfmt",
    "fmt:check": "oxfmt --check",
    "test": "bun test"
  },
  "devDependencies": {
    "lefthook": "LATEST",
    "oxfmt": "LATEST",
    "oxlint": "LATEST",
    "typescript": "LATEST"
  }
}
```

- [ ] **Step 9: Create `lefthook.yml`**:

```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      run: bunx oxlint {staged_files}
      glob: "*.{ts,tsx,js,jsx,mjs,cjs}"
    fmt:
      run: bunx oxfmt --check {staged_files}
      glob: "*.{ts,tsx,js,jsx,mjs,cjs,json,md}"
    typecheck:
      run: bun run typecheck
```

- [ ] **Step 10: Install deps**

Run: `bun install`
Expected: creates `bun.lockb` and `node_modules/`. No errors.

- [ ] **Step 11: Install lefthook git hooks**

Run: `bunx lefthook install`
Expected: "SYNCING" messages; `.git/hooks/pre-commit` exists.

- [ ] **Step 12: Commit (includes the Pre-task 0 version log)**

Requires user approval per `AGENTS.md`.

```bash
git add .bun-version .editorconfig .gitignore .oxfmtrc.json bunfig.toml lefthook.yml oxlint.json package.json bun.lockb tsconfig.base.json docs/ops/version-log-2026-04-20.md
git commit -m "chore: initialize monorepo tooling and record resolved versions"
```

---

## Task 2: Scaffold shared/ package with pure modules

**Files:**

- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/constants.ts`
- Create: `shared/src/outcome.ts`
- Create: `shared/src/error-codes.ts`
- Create: `shared/src/types.ts`
- Create: `shared/src/index.ts`

- [ ] **Step 1: Create `shared/package.json`**:

```json
{
  "name": "@battleship-arena/shared",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `shared/tsconfig.json`** (no `rootDir` so `tests/**/*` can live outside `src/`):

```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `shared/src/constants.ts`**:

```ts
export const BOARD_SIZE = 10;

export const FLEET = [
  { name: "carrier", length: 5 },
  { name: "battleship", length: 4 },
  { name: "cruiser", length: 3 },
  { name: "submarine", length: 3 },
  { name: "destroyer", length: 2 },
] as const;

export const TOTAL_SHIP_CELLS = FLEET.reduce((acc, ship) => acc + ship.length, 0);

export const SHOT_CAP = 100;

export const CONSECUTIVE_SCHEMA_ERROR_LIMIT = 5;
```

- [ ] **Step 4: Create `shared/src/outcome.ts`**:

```ts
export const OUTCOMES = [
  "won",
  "dnf_shot_cap",
  "dnf_schema_errors",
  "dnf_budget",
  "llm_unreachable",
  "aborted_viewer",
  "aborted_server_restart",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);
}
```

- [ ] **Step 5: Create `shared/src/error-codes.ts`**:

```ts
export const ERROR_CODES = [
  "invalid_input",
  "not_found",
  "run_terminal",
  "provider_unavailable",
  "budget_required",
  "rate_limited",
  "maintenance_soft",
  "too_many_active_runs",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    detail?: Record<string, unknown>;
  };
}
```

- [ ] **Step 6: Create `shared/src/types.ts`**:

```ts
export interface HealthResponse {
  status: "ok";
  version: string;
  commitSha: string;
  startedAt: number;
}

export interface Shot {
  row: number;
  col: number;
  reasoning?: string;
}
```

- [ ] **Step 7: Create `shared/src/index.ts`** (the `./shot-schema.ts` re-export is added in Task 3 step 4; keeping it out now lets this task end green):

```ts
export * from "./constants.ts";
export * from "./outcome.ts";
export * from "./error-codes.ts";
export * from "./types.ts";
```

- [ ] **Step 8: Typecheck**

Run: `bun --filter shared run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit (after Task 3 lands, not yet)**

Hold commit; stage together with Task 3's output.

---

## Task 3: shared/shot-schema.ts with tests

**Files:**

- Create: `shared/tests/shot-schema.test.ts`
- Create: `shared/src/shot-schema.ts`
- Modify: `shared/src/index.ts` (add the shot-schema re-export)

- [ ] **Step 1: Write the failing test at `shared/tests/shot-schema.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { parseShot } from "../src/shot-schema.ts";

describe("parseShot", () => {
  test("accepts a valid shot without reasoning", () => {
    const result = parseShot('{"row":3,"col":5}');
    expect(result).toEqual({ kind: "ok", shot: { row: 3, col: 5 } });
  });

  test("accepts a valid shot with reasoning", () => {
    const result = parseShot('{"row":0,"col":0,"reasoning":"corner probe"}');
    expect(result).toEqual({
      kind: "ok",
      shot: { row: 0, col: 0, reasoning: "corner probe" },
    });
  });

  test("ignores extra top-level keys", () => {
    const result = parseShot('{"row":1,"col":2,"extra":"nope"}');
    expect(result).toEqual({ kind: "ok", shot: { row: 1, col: 2 } });
  });

  test("classifies non-JSON as schema_error", () => {
    const result = parseShot("A1");
    expect(result.kind).toBe("schema_error");
  });

  test("classifies missing key as schema_error", () => {
    const result = parseShot('{"row":3}');
    expect(result.kind).toBe("schema_error");
  });

  test("classifies non-integer row as schema_error", () => {
    const result = parseShot('{"row":"3","col":5}');
    expect(result.kind).toBe("schema_error");
  });

  test("classifies non-integer col as schema_error", () => {
    const result = parseShot('{"row":3,"col":5.5}');
    expect(result.kind).toBe("schema_error");
  });

  test("classifies reasoning-not-string as schema_error", () => {
    const result = parseShot('{"row":3,"col":5,"reasoning":42}');
    expect(result.kind).toBe("schema_error");
  });

  test("classifies row out of range as invalid_coordinate", () => {
    const result = parseShot('{"row":10,"col":0}');
    expect(result.kind).toBe("invalid_coordinate");
  });

  test("classifies negative col as invalid_coordinate", () => {
    const result = parseShot('{"row":0,"col":-1}');
    expect(result.kind).toBe("invalid_coordinate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test shared/tests/shot-schema.test.ts`
Expected: FAIL - cannot find module `../src/shot-schema.ts`.

- [ ] **Step 3: Implement `shared/src/shot-schema.ts`**

```ts
import { BOARD_SIZE } from "./constants.ts";
import type { Shot } from "./types.ts";

export type ParseShotResult =
  | { kind: "ok"; shot: Shot }
  | { kind: "schema_error"; reason: string }
  | { kind: "invalid_coordinate"; row: number; col: number };

export function parseShot(rawText: string): ParseShotResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    return {
      kind: "schema_error",
      reason: `not JSON: ${(error as Error).message}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "schema_error", reason: "not a JSON object" };
  }

  const candidate = parsed as Record<string, unknown>;

  if (!Number.isInteger(candidate.row)) {
    return { kind: "schema_error", reason: "row is not an integer" };
  }
  if (!Number.isInteger(candidate.col)) {
    return { kind: "schema_error", reason: "col is not an integer" };
  }
  if (candidate.reasoning !== undefined && typeof candidate.reasoning !== "string") {
    return { kind: "schema_error", reason: "reasoning is not a string" };
  }

  const row = candidate.row as number;
  const col = candidate.col as number;

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return { kind: "invalid_coordinate", row, col };
  }

  const shot: Shot = { row, col };
  if (typeof candidate.reasoning === "string") {
    shot.reasoning = candidate.reasoning;
  }
  return { kind: "ok", shot };
}
```

- [ ] **Step 4: Update `shared/src/index.ts`** to re-export the new module. The full file after this edit:

```ts
export * from "./constants.ts";
export * from "./outcome.ts";
export * from "./error-codes.ts";
export * from "./types.ts";
export * from "./shot-schema.ts";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test shared/tests/shot-schema.test.ts`
Expected: all nine tests pass.

- [ ] **Step 6: Typecheck the shared package**

Run: `bun --filter shared run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add shared/
git commit -m "feat(shared): scaffold package with types, enums, shot schema"
```

---

## Task 4: Scaffold backend/ package and config/error modules

**Files:**

- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/config.ts`
- Create: `backend/src/errors.ts`
- Create: `backend/tests/config.test.ts`

- [ ] **Step 1: Create `backend/package.json`** (replace `LATEST` with resolved versions):

```json
{
  "name": "@battleship-arena/backend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build ./src/index.ts --outdir ./dist --target bun",
    "typecheck": "tsc --noEmit",
    "drizzle:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "@battleship-arena/shared": "workspace:*",
    "drizzle-orm": "LATEST",
    "hono": "LATEST"
  },
  "devDependencies": {
    "@types/bun": "LATEST",
    "drizzle-kit": "LATEST"
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`** (no `rootDir` so `tests/**/*` can live alongside `src/`; `@types/bun` auto-loads through `@types/` discovery without a `types` array):

```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src/**/*", "tests/**/*", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Install deps**

Run: `bun install`
Expected: resolves `hono`, `drizzle-orm`, `drizzle-kit`, `@types/bun`.

- [ ] **Step 4: Create failing test at `backend/tests/config.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  test("parses a minimal env", () => {
    const config = loadConfig({
      DATABASE_PATH: "/tmp/example-test-.db",
      PORT: "8081",
    });
    expect(config).toEqual({
      databasePath: "/tmp/example-test-.db",
      port: 8081,
      maintenanceSoft: false,
      shutdownGraceSec: 300,
      version: "unknown",
      commitSha: "unknown",
    });
  });

  test("reads optional env values", () => {
    const config = loadConfig({
      DATABASE_PATH: ":memory:",
      PORT: "9000",
      MAINTENANCE_SOFT: "1",
      SHUTDOWN_GRACE_SEC: "60",
      VERSION: "0.0.1",
      COMMIT_SHA: "deadbeef",
    });
    expect(config.maintenanceSoft).toBe(true);
    expect(config.shutdownGraceSec).toBe(60);
    expect(config.version).toBe("0.0.1");
    expect(config.commitSha).toBe("deadbeef");
    expect(config.port).toBe(9000);
  });

  test("throws on missing DATABASE_PATH", () => {
    expect(() => loadConfig({ PORT: "8081" })).toThrow(/DATABASE_PATH/);
  });

  test("throws on non-numeric PORT", () => {
    expect(() => loadConfig({ DATABASE_PATH: ":memory:", PORT: "abc" })).toThrow(/PORT/);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `bun test backend/tests/config.test.ts`
Expected: FAIL - cannot find `../src/config.ts`.

- [ ] **Step 6: Implement `backend/src/config.ts`**

```ts
export interface BackendConfig {
  databasePath: string;
  port: number;
  maintenanceSoft: boolean;
  shutdownGraceSec: number;
  version: string;
  commitSha: string;
}

export function loadConfig(env: Record<string, string | undefined>): BackendConfig {
  const databasePath = env.DATABASE_PATH;
  if (!databasePath || databasePath.length === 0) {
    throw new Error("DATABASE_PATH is required");
  }

  const portRaw = env.PORT ?? "8081";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
    throw new Error(`PORT must be a positive integer <= 65535, got ${portRaw}`);
  }

  const maintenanceSoft = env.MAINTENANCE_SOFT === "1" || env.MAINTENANCE_SOFT === "true";

  const shutdownGraceRaw = env.SHUTDOWN_GRACE_SEC ?? "300";
  const shutdownGraceSec = Number.parseInt(shutdownGraceRaw, 10);
  if (!Number.isFinite(shutdownGraceSec) || shutdownGraceSec < 0) {
    throw new Error(`SHUTDOWN_GRACE_SEC must be a non-negative integer, got ${shutdownGraceRaw}`);
  }

  return {
    databasePath,
    port,
    maintenanceSoft,
    shutdownGraceSec,
    version: env.VERSION ?? "unknown",
    commitSha: env.COMMIT_SHA ?? "unknown",
  };
}
```

- [ ] **Step 7: Create `backend/src/errors.ts`**

```ts
import type { Context } from "hono";
import type { ErrorCode, ErrorEnvelope } from "@battleship-arena/shared";

export function respondError(
  c: Context,
  code: ErrorCode,
  status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503,
  message: string,
  detail?: Record<string, unknown>,
): Response {
  const body: ErrorEnvelope = { error: { code, message } };
  if (detail) {
    body.error.detail = detail;
  }
  return c.json(body, status);
}
```

- [ ] **Step 8: Run tests**

Run: `bun test backend/tests/config.test.ts`
Expected: all four tests pass.

- [ ] **Step 9: Typecheck**

Run: `bun --filter backend run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add backend/package.json backend/tsconfig.json backend/src/config.ts backend/src/errors.ts backend/tests/config.test.ts bun.lockb
git commit -m "feat(backend): scaffold package with config and error helpers"
```

---

## Task 5: backend/tests/setup.ts DATABASE_PATH guard and sub-process test

**Files:**

- Create: `backend/tests/setup.ts`
- Create: `backend/tests/db-guard.test.ts`
- Create: `backend/tests/fixtures/guard-probe.ts`
- Modify: `bunfig.toml` (add the `[test]` preload now that `setup.ts` exists)

- [ ] **Step 1: Create `backend/tests/setup.ts`**

```ts
const databasePath = process.env.DATABASE_PATH;

if (databasePath === undefined || databasePath.length === 0) {
  throw new Error(
    "Refusing to run tests with DATABASE_PATH unset. " +
      "Set DATABASE_PATH to ':memory:', a path starting with '/tmp/', " +
      "or a path containing '-test-'.",
  );
}

const isMemory = databasePath === ":memory:";
const isTempPath = databasePath.startsWith("/tmp/");
const hasTestMarker = databasePath.includes("-test-");

if (!isMemory && !isTempPath && !hasTestMarker) {
  throw new Error(
    `Refusing to run tests with DATABASE_PATH=${databasePath}. ` +
      "Allowed: ':memory:', paths starting with '/tmp/', or paths containing '-test-'.",
  );
}
```

- [ ] **Step 2: Create `backend/tests/fixtures/guard-probe.ts`** (the sub-process the guard test spawns):

```ts
// Spawned by db-guard.test.ts. Import of setup.ts triggers the guard at module load.
import "../setup.ts";

console.log("probe-reached-main");
```

- [ ] **Step 3: Create `backend/tests/db-guard.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { spawnSync } from "bun";

const PROBE = `${import.meta.dir}/fixtures/guard-probe.ts`;

describe("DATABASE_PATH guard (setup.ts)", () => {
  test("accepts :memory:", () => {
    const result = spawnSync({
      cmd: ["bun", "run", PROBE],
      env: { ...process.env, DATABASE_PATH: ":memory:" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("probe-reached-main");
  });

  test("accepts /tmp/ paths", () => {
    const result = spawnSync({
      cmd: ["bun", "run", PROBE],
      env: { ...process.env, DATABASE_PATH: "/tmp/bsa-guard-check.db" },
    });
    expect(result.exitCode).toBe(0);
  });

  test("accepts paths with -test- marker", () => {
    const result = spawnSync({
      cmd: ["bun", "run", PROBE],
      env: { ...process.env, DATABASE_PATH: "/var/lib/bsa-test-xyz.db" },
    });
    expect(result.exitCode).toBe(0);
  });

  test("rejects a production-looking path", () => {
    const result = spawnSync({
      cmd: ["bun", "run", PROBE],
      env: {
        ...process.env,
        DATABASE_PATH: "/var/lib/battleship-arena/project.db",
      },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("Refusing to run tests");
  });

  test("rejects undefined DATABASE_PATH", () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.DATABASE_PATH;
    const result = spawnSync({
      cmd: ["bun", "run", PROBE],
      env: cleanEnv,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("DATABASE_PATH unset");
  });
});
```

- [ ] **Step 4: Update `bunfig.toml`** at the repo root to add the preload (full file after edit):

```toml
[install]
exact = true

[test]
preload = ["./backend/tests/setup.ts"]
```

- [ ] **Step 5: Run tests**

Run: `DATABASE_PATH=:memory: bun test backend/tests/db-guard.test.ts`
Expected: all five tests pass.

- [ ] **Step 6: Verify the guard trips in the current suite**

Run: `DATABASE_PATH=/var/lib/battleship-arena/project.db bun test backend/tests/config.test.ts`
Expected: suite fails immediately with "Refusing to run tests". Reset with `unset DATABASE_PATH`.

- [ ] **Step 7: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add backend/tests/setup.ts backend/tests/db-guard.test.ts backend/tests/fixtures/guard-probe.ts bunfig.toml
git commit -m "feat(backend): add DATABASE_PATH test guard and coverage"
```

---

## Task 6: backend/src/api/health.ts and route test

**Files:**

- Create: `backend/src/api/health.ts`
- Create: `backend/tests/health.test.ts`
- Create: `backend/src/app.ts`

- [ ] **Step 1: Create failing test `backend/tests/health.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.ts";

const config = {
  databasePath: ":memory:",
  port: 0,
  maintenanceSoft: false,
  shutdownGraceSec: 0,
  version: "0.0.1-test",
  commitSha: "abc1234",
};

describe("GET /api/health", () => {
  test("returns 200 with the expected payload shape", async () => {
    const app = createApp(config);
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      version: string;
      commitSha: string;
      startedAt: number;
    };
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.0.1-test");
    expect(body.commitSha).toBe("abc1234");
    expect(typeof body.startedAt).toBe("number");
  });

  test("returns 404 envelope for unknown routes", async () => {
    const app = createApp(config);
    const response = await app.request("/api/nope");
    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("not_found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test backend/tests/health.test.ts`
Expected: FAIL - cannot find `../src/app.ts`.

- [ ] **Step 3: Implement `backend/src/api/health.ts`**

```ts
import { Hono } from "hono";
import type { HealthResponse } from "@battleship-arena/shared";
import type { BackendConfig } from "../config.ts";

const startedAt = Date.now();

export function healthRoute(config: BackendConfig): Hono {
  const app = new Hono();
  app.get("/", (c) => {
    const payload: HealthResponse = {
      status: "ok",
      version: config.version,
      commitSha: config.commitSha,
      startedAt,
    };
    return c.json(payload, 200);
  });
  return app;
}
```

- [ ] **Step 4: Implement `backend/src/app.ts`**

```ts
import { Hono } from "hono";
import type { BackendConfig } from "./config.ts";
import { respondError } from "./errors.ts";
import { healthRoute } from "./api/health.ts";

export function createApp(config: BackendConfig): Hono {
  const app = new Hono();

  app.route("/api/health", healthRoute(config));

  app.notFound((c) => respondError(c, "not_found", 404, `No route for ${c.req.path}`));

  app.onError((error, c) => {
    console.error("unhandled error:", error);
    return respondError(c, "internal", 500, "Unexpected server error");
  });

  return app;
}
```

- [ ] **Step 5: Run tests**

Run: `bun test backend/tests/health.test.ts`
Expected: two tests pass.

- [ ] **Step 6: Typecheck**

Run: `bun --filter backend run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add backend/src/api/health.ts backend/src/app.ts backend/tests/health.test.ts
git commit -m "feat(backend): add health route and app factory"
```

---

## Task 7: backend/src/db/schema.ts and drizzle.config.ts; generate first migration

**Files:**

- Create: `backend/src/db/schema.ts`
- Create: `backend/drizzle.config.ts`
- Create: `backend/src/db/migrations/0000_*.sql` (generated by Drizzle Kit)
- Create: `backend/src/db/migrations/meta/_journal.json` (generated)

- [ ] **Step 1: Create `backend/src/db/schema.ts`**

```ts
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  seedDate: text("seed_date").notNull(),
  providerId: text("provider_id").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  outcome: text("outcome"),
  shotsFired: integer("shots_fired").notNull().default(0),
  hits: integer("hits").notNull().default(0),
  schemaErrors: integer("schema_errors").notNull().default(0),
  invalidCoordinates: integer("invalid_coordinates").notNull().default(0),
  durationMs: integer("duration_ms"),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  reasoningTokens: integer("reasoning_tokens"),
  costUsdMicros: integer("cost_usd_micros").notNull().default(0),
  budgetUsdMicros: integer("budget_usd_micros"),
  clientSession: text("client_session").notNull(),
});

export const runShots = sqliteTable(
  "run_shots",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    row: integer("row"),
    col: integer("col"),
    result: text("result").notNull(),
    rawResponse: text("raw_response"),
    reasoningText: text("reasoning_text"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens"),
    costUsdMicros: integer("cost_usd_micros").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.idx] }),
  }),
);
```

- [ ] **Step 2: Create `backend/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
});
```

- [ ] **Step 3: Generate first migration**

Run: `bun --filter backend run drizzle:generate --name init`
Expected: creates `backend/src/db/migrations/0000_init.sql` and `backend/src/db/migrations/meta/_journal.json`. Console prints the two files.

- [ ] **Step 4: Inspect the generated SQL**

Run: `cat backend/src/db/migrations/0000_init.sql`
Expected: two `CREATE TABLE` statements plus an index block; `runs` and `run_shots` both present.

- [ ] **Step 5: Typecheck**

Run: `bun --filter backend run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add backend/src/db/schema.ts backend/drizzle.config.ts backend/src/db/migrations/
git commit -m "feat(backend): declare runs and run_shots schema; generate initial migration"
```

---

## Task 8: backend/src/db/migrator.ts with tests

**Files:**

- Create: `backend/src/db/migrator.ts`
- Create: `backend/tests/migrator.test.ts`

- [ ] **Step 1: Create failing test `backend/tests/migrator.test.ts`**

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { unlinkSync } from "node:fs";
import { ulid } from "../src/db/ulid.ts";
import { applyMigrations } from "../src/db/migrator.ts";

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  }
});

describe("applyMigrations", () => {
  test("creates runs and run_shots tables on a fresh database", () => {
    const path = `/tmp/bsa-test-${ulid()}.db`;
    cleanupPaths.push(path);
    const sqlite = new Database(path);
    const db = drizzle(sqlite);

    applyMigrations(db);

    const tables = sqlite
      .query<
        { name: string },
        []
      >("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    const tableNames = tables.map((row) => row.name);
    expect(tableNames).toContain("runs");
    expect(tableNames).toContain("run_shots");
    sqlite.close();
  });

  test("is idempotent on a database that already has the schema", () => {
    const path = `/tmp/bsa-test-${ulid()}.db`;
    cleanupPaths.push(path);
    const sqlite = new Database(path);
    const db = drizzle(sqlite);

    applyMigrations(db);
    applyMigrations(db);

    const tables = sqlite
      .query<
        { name: string },
        []
      >("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    expect(tables.map((row) => row.name)).toContain("runs");
    sqlite.close();
  });
});
```

- [ ] **Step 2: Create `backend/src/db/ulid.ts`** (tiny ULID generator used by tests and runtime)

```ts
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(): string {
  const now = Date.now();
  let timePart = "";
  let remaining = now;
  for (let index = 0; index < 10; index += 1) {
    timePart = ALPHABET[remaining % 32] + timePart;
    remaining = Math.floor(remaining / 32);
  }
  let randomPart = "";
  for (let index = 0; index < 16; index += 1) {
    randomPart += ALPHABET[Math.floor(Math.random() * 32)];
  }
  return `${timePart}${randomPart}`;
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `DATABASE_PATH=:memory: bun test backend/tests/migrator.test.ts`
Expected: FAIL - cannot find `../src/db/migrator.ts`.

- [ ] **Step 4: Implement `backend/src/db/migrator.ts`**

```ts
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

const MIGRATIONS_FOLDER = new URL("./migrations", import.meta.url).pathname;

export function applyMigrations(db: BunSQLiteDatabase): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
```

- [ ] **Step 5: Run tests**

Run: `DATABASE_PATH=:memory: bun test backend/tests/migrator.test.ts`
Expected: both tests pass.

- [ ] **Step 6: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add backend/src/db/migrator.ts backend/src/db/ulid.ts backend/tests/migrator.test.ts
git commit -m "feat(backend): apply Drizzle migrations on startup with coverage"
```

---

## Task 9: backend/src/db/client.ts and backend/src/db/with-temp-database.ts

Introduces the single runtime entrypoint that opens SQLite (`openDatabase`) and the test-only helper (`withTempDatabase`) that delegates to it. Keeping both in the same task prevents `withTempDatabase` from duplicating the `new Database(...)` call.

**Files:**

- Create: `backend/src/db/client.ts`
- Create: `backend/src/db/with-temp-database.ts`
- Create: `backend/tests/client.test.ts`
- Create: `backend/tests/with-temp-database.test.ts`

- [ ] **Step 1: Implement `backend/src/db/client.ts`**

```ts
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { applyMigrations } from "./migrator.ts";

export interface DbBundle {
  sqlite: Database;
  db: BunSQLiteDatabase;
}

export function openDatabase(databasePath: string): DbBundle {
  const sqlite = new Database(databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA journal_mode = WAL");
  const db = drizzle(sqlite);
  applyMigrations(db);
  return { sqlite, db };
}
```

- [ ] **Step 2: Create `backend/tests/client.test.ts`**

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { openDatabase } from "../src/db/client.ts";
import { ulid } from "../src/db/ulid.ts";

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        unlinkSync(`${path}${suffix}`);
      } catch {
        // ignore
      }
    }
  }
});

describe("openDatabase", () => {
  test("applies migrations and enables foreign keys", () => {
    const path = `/tmp/bsa-test-${ulid()}.db`;
    cleanupPaths.push(path);

    const { sqlite } = openDatabase(path);

    const tables = sqlite
      .query<
        { name: string },
        []
      >("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    expect(tables.map((row) => row.name)).toContain("runs");
    expect(tables.map((row) => row.name)).toContain("run_shots");

    const fk = sqlite.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get();
    expect(fk?.foreign_keys).toBe(1);

    sqlite.close();
  });
});
```

- [ ] **Step 3: Implement `backend/src/db/with-temp-database.ts`** (delegates to `openDatabase`; the spec's "one runtime entrypoint" rule is preserved - this helper is test-only and calls the same primitive)

```ts
import { unlinkSync } from "node:fs";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { Database } from "bun:sqlite";
import { ulid } from "./ulid.ts";
import { openDatabase } from "./client.ts";

export interface TempDatabaseHandle {
  sqlite: Database;
  db: BunSQLiteDatabase;
  path: string;
}

export async function withTempDatabase<T>(
  callback: (handle: TempDatabaseHandle) => T | Promise<T>,
): Promise<T> {
  const path = `/tmp/bsa-test-${ulid()}.db`;
  const { sqlite, db } = openDatabase(path);

  try {
    return await callback({ sqlite, db, path });
  } finally {
    sqlite.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        unlinkSync(`${path}${suffix}`);
      } catch {
        // ignore missing sidecar files
      }
    }
  }
}
```

- [ ] **Step 4: Create `backend/tests/with-temp-database.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { withTempDatabase } from "../src/db/with-temp-database.ts";

describe("withTempDatabase", () => {
  test("provides a live database inside the callback and unlinks it after", async () => {
    let observedPath: string | undefined;

    const result = await withTempDatabase(async ({ sqlite, path }) => {
      observedPath = path;
      expect(existsSync(path)).toBe(true);
      const row = sqlite.query<{ one: number }, []>("SELECT 1 AS one").get();
      expect(row?.one).toBe(1);
      return "callback-return-value";
    });

    expect(result).toBe("callback-return-value");
    expect(observedPath).toBeDefined();
    expect(existsSync(observedPath!)).toBe(false);
  });

  test("unlinks the file even when the callback throws", async () => {
    let observedPath: string | undefined;

    await expect(
      withTempDatabase(async ({ path }) => {
        observedPath = path;
        throw new Error("simulated failure");
      }),
    ).rejects.toThrow("simulated failure");

    expect(observedPath).toBeDefined();
    expect(existsSync(observedPath!)).toBe(false);
  });

  test("applies the schema before the callback runs", async () => {
    await withTempDatabase(async ({ sqlite }) => {
      const tables = sqlite
        .query<
          { name: string },
          []
        >("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all();
      const names = tables.map((row) => row.name);
      expect(names).toContain("runs");
      expect(names).toContain("run_shots");
    });
  });
});
```

- [ ] **Step 5: Run the client + withTempDatabase tests**

Run: `bun test backend/tests/client.test.ts backend/tests/with-temp-database.test.ts`
Expected: four tests pass.

- [ ] **Step 6: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add backend/src/db/client.ts backend/src/db/with-temp-database.ts backend/tests/client.test.ts backend/tests/with-temp-database.test.ts
git commit -m "feat(backend): add DB client and withTempDatabase helper with coverage"
```

---

## Task 10: backend/src/index.ts entrypoint with a real startup-order test

Introduces the process entrypoint and proves, via a test that exercises the real bootstrap sequence, that migrations complete before the HTTP listener accepts connections.

**Files:**

- Create: `backend/src/index.ts`
- Create: `backend/tests/bootstrap.test.ts`

- [ ] **Step 1: Implement `backend/src/index.ts`** (exports `bootstrap` for the test; the default export and top-level call keep the process usable as a script)

```ts
import type { Server } from "bun";
import type { Database } from "bun:sqlite";
import { loadConfig, type BackendConfig } from "./config.ts";
import { openDatabase } from "./db/client.ts";
import { createApp } from "./app.ts";

export interface BootstrapHandle {
  server: Server;
  sqlite: Database;
  config: BackendConfig;
}

export function bootstrap(config: BackendConfig): BootstrapHandle {
  const { sqlite } = openDatabase(config.databasePath);
  const app = createApp(config);
  const server = Bun.serve({
    port: config.port,
    fetch: app.fetch,
  });
  return { server, sqlite, config };
}

export function stopBootstrap(handle: BootstrapHandle): void {
  handle.server.stop();
  handle.sqlite.close();
}

if (import.meta.main) {
  const config = loadConfig(process.env);
  const handle = bootstrap(config);
  console.log(
    `battleship-arena backend listening on http://${handle.server.hostname}:${handle.server.port}`,
  );
  const shutdown = (signal: string): void => {
    console.log(`received ${signal}, closing`);
    stopBootstrap(handle);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
```

- [ ] **Step 2: Create `backend/tests/bootstrap.test.ts`**

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { bootstrap, stopBootstrap } from "../src/index.ts";
import { ulid } from "../src/db/ulid.ts";

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        unlinkSync(`${path}${suffix}`);
      } catch {
        // ignore
      }
    }
  }
});

describe("bootstrap (startup order)", () => {
  test("applies migrations before the listener accepts connections", async () => {
    const path = `/tmp/bsa-test-${ulid()}.db`;
    cleanupPaths.push(path);

    const handle = bootstrap({
      databasePath: path,
      port: 0,
      maintenanceSoft: false,
      shutdownGraceSec: 0,
      version: "0.0.0-test",
      commitSha: "beef",
    });

    try {
      const tables = handle.sqlite
        .query<
          { name: string },
          []
        >("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all();
      expect(tables.map((row) => row.name)).toContain("runs");

      const response = await fetch(
        `http://${handle.server.hostname}:${handle.server.port}/api/health`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe("ok");
    } finally {
      stopBootstrap(handle);
    }
  });

  test("rejects bootstrap when the migrator throws (migrations-before-listener invariant)", () => {
    expect(() =>
      bootstrap({
        databasePath: "/nonexistent/nowhere/bsa-test-denied.db",
        port: 0,
        maintenanceSoft: false,
        shutdownGraceSec: 0,
        version: "0.0.0-test",
        commitSha: "beef",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run the full backend test suite**

Run: `bun --filter backend test`
Expected: all backend tests pass (bootstrap, client, config, db-guard, health, migrator, with-temp-database).

- [ ] **Step 4: Smoke-run backend locally**

Run in one terminal: `DATABASE_PATH=./dev.db PORT=8081 bun --filter backend run dev`
Run in another: `curl -fsS http://127.0.0.1:8081/api/health | head -c 200`
Expected: JSON body containing `"status":"ok"`.

Shut down with `Ctrl-C`. The `dev.db` files are gitignored.

- [ ] **Step 5: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add backend/src/index.ts backend/tests/bootstrap.test.ts
git commit -m "feat(backend): expose bootstrap and prove migrations-before-listener order"
```

---

## Task 11: Scaffold web/ package with Astro and Solid

**Files:**

- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/astro.config.mjs`
- Create: `web/src/pages/index.astro`
- Create: `web/src/islands/.gitkeep`
- Create: `web/src/styles/.gitkeep`

- [ ] **Step 1: Create `web/package.json`** (replace `LATEST` with resolved versions):

```json
{
  "name": "@battleship-arena/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev --port 4321",
    "build": "astro build",
    "preview": "astro preview --port 4321",
    "typecheck": "astro check"
  },
  "dependencies": {
    "@battleship-arena/shared": "workspace:*",
    "astro": "LATEST",
    "solid-js": "LATEST"
  },
  "devDependencies": {
    "@astrojs/check": "LATEST",
    "@astrojs/solid-js": "LATEST"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "types": ["astro/client"],
    "noEmit": true
  },
  "include": ["src/**/*", "astro.config.mjs"]
}
```

- [ ] **Step 3: Create `web/astro.config.mjs`**

```js
import { defineConfig } from "astro/config";
import solidJs from "@astrojs/solid-js";

export default defineConfig({
  output: "static",
  site: "https://staging.arena.example",
  integrations: [solidJs()],
  build: {
    assets: "assets",
  },
});
```

- [ ] **Step 4: Create empty marker files**

Files: `web/src/islands/.gitkeep`, `web/src/styles/.gitkeep` (both empty).

- [ ] **Step 5: Install deps**

Run: `bun install`
Expected: Astro + Solid resolve.

- [ ] **Step 6: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add web/package.json web/tsconfig.json web/astro.config.mjs web/src/islands/.gitkeep web/src/styles/.gitkeep bun.lockb
git commit -m "feat(web): scaffold Astro + Solid package"
```

---

## Task 12: PWA manifest, icons, and shell page

**Files:**

- Create: `web/public/manifest.webmanifest`
- Create: `web/public/icons/source.svg`
- Create: `web/public/icons/icon-192.png`
- Create: `web/public/icons/icon-512.png`
- Create: `web/public/icons/maskable-512.png`
- Create: `web/src/pages/index.astro`
- Create: `web/tests/manifest.test.ts`

- [ ] **Step 1: Create `web/public/manifest.webmanifest`**

```json
{
  "name": "BattleShipArena",
  "short_name": "Arena",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0d10",
  "theme_color": "#0b0d10",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 2: Create `web/public/icons/source.svg`** (a simple dark-blue square with the letter "A" - a temporary mark that S1b replaces with the final identity)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0b0d10" rx="64" />
  <text x="50%" y="56%" text-anchor="middle" font-family="system-ui, sans-serif"
        font-size="320" font-weight="700" fill="#fafafa">A</text>
</svg>
```

- [ ] **Step 3: Generate three PNG icons from the SVG**

Run once locally (the generator is not a committed dep; the icons are):

```
bunx --bun @resvg/resvg-js-cli web/public/icons/source.svg -w 192 -h 192 -o web/public/icons/icon-192.png
bunx --bun @resvg/resvg-js-cli web/public/icons/source.svg -w 512 -h 512 -o web/public/icons/icon-512.png
cp web/public/icons/icon-512.png web/public/icons/maskable-512.png
```

Expected: three PNG files exist under `web/public/icons/`.

(Note: the CLI name may differ; a second option is `bunx @resvg/resvg-cli`. If neither resolves, fall back to any SVG-to-PNG converter the implementer has on hand. The goal is to produce three valid PNGs with the exact filenames listed above.)

- [ ] **Step 4: Create `web/src/pages/index.astro`**

```astro
---
const version = import.meta.env.PUBLIC_APP_VERSION ?? "0.0.0";
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0b0d10" />
    <title>BattleShipArena</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
  </head>
  <body>
    <main>
      <h1>BattleShipArena</h1>
      <p>Shell ready. Game UI lands in S2.</p>
      <p>Version: {version}</p>
    </main>
    <script is:inline>
      if ("serviceWorker" in navigator && import.meta.env.PROD) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register("/sw.js").catch((error) => {
            console.error("SW registration failed", error);
          });
        });
      }
    </script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/tests/manifest.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("public/manifest.webmanifest", () => {
  test("has the required PWA fields", () => {
    const raw = readFileSync("web/public/manifest.webmanifest", "utf8");
    const manifest = JSON.parse(raw) as {
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    expect(manifest.name).toBe("BattleShipArena");
    expect(manifest.short_name).toBe("Arena");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});
```

- [ ] **Step 6: Run the manifest test**

Run: `DATABASE_PATH=:memory: bun test web/tests/manifest.test.ts`
Expected: one test passes.

- [ ] **Step 7: Build the web package and inspect dist**

Run: `bun --filter web run build`
Expected: writes `web/dist/index.html` and static assets. Inspect with `ls web/dist/`.

- [ ] **Step 8: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add web/public/manifest.webmanifest web/public/icons/ web/src/pages/index.astro web/tests/manifest.test.ts
git commit -m "feat(web): add PWA manifest, icons, and shell page"
```

---

## Task 13: Hand-rolled shell-only service worker and post-build shell manifest

**Files:**

- Create: `web/src/pwa/sw.ts`
- Create: `web/scripts/build-sw.ts`

- [ ] **Step 1: Create `web/src/pwa/sw.ts`**

```ts
// Compiled to web/dist/sw.js by scripts/build-sw.ts after `astro build`.
// Shell-manifest contents are inlined at compile time; this file expects a global
// `__SHELL_MANIFEST__` declared by the build script.

declare const __SHELL_MANIFEST__: { version: string; urls: readonly string[] };

const MANIFEST = __SHELL_MANIFEST__;
const CACHE_NAME = `bsa-shell-${MANIFEST.version}`;

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([...MANIFEST.urls]))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/") || request.method !== "GET") {
    return;
  }

  if (!(MANIFEST.urls as readonly string[]).includes(url.pathname)) {
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
```

- [ ] **Step 2: Create `web/scripts/build-sw.ts`**

```ts
import { readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = "web/dist";
const SW_SOURCE = "web/src/pwa/sw.ts";
const SW_OUTPUT = "web/dist/sw.js";
const SHELL_EXTENSIONS = new Set([".html", ".css", ".js", ".woff2", ".ico", ".webmanifest"]);

function walk(dir: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) {
      entries.push(...walk(full));
    } else {
      entries.push(full);
    }
  }
  return entries;
}

function collectShellUrls(): string[] {
  const files = walk(DIST);
  const urls: string[] = [];
  for (const file of files) {
    const rel = relative(DIST, file).replaceAll("\\", "/");
    const url = `/${rel}`;
    const dot = rel.lastIndexOf(".");
    if (dot === -1) continue;
    const ext = rel.slice(dot);
    if (!SHELL_EXTENSIONS.has(ext)) continue;
    if (rel.startsWith("api/")) continue;
    urls.push(url);
  }
  urls.sort();
  if (!urls.includes("/")) urls.unshift("/");
  return urls;
}

async function buildSw(): Promise<void> {
  const urls = collectShellUrls();
  const version = `${Date.now()}`;
  const manifest = JSON.stringify({ version, urls });

  const build = await Bun.build({
    entrypoints: [SW_SOURCE],
    target: "browser",
    format: "iife",
    define: {
      __SHELL_MANIFEST__: manifest,
    },
  });

  if (!build.success) {
    for (const log of build.logs) console.error(log);
    throw new Error("SW build failed");
  }

  const artifact = build.outputs[0];
  if (!artifact) throw new Error("SW build produced no output");
  const text = await artifact.text();
  writeFileSync(SW_OUTPUT, text);
  console.log(`Wrote ${SW_OUTPUT} with ${urls.length} shell URLs, version ${version}`);
}

void buildSw();

// Side-effect import so tsc does not elide the module.
readFileSync;
```

- [ ] **Step 3: Wire the post-build step into `web/package.json`**

Replace the `"build"` script in `web/package.json`:

```json
"build": "astro build && bun run ./scripts/build-sw.ts",
```

- [ ] **Step 4: Rebuild**

Run: `bun --filter web run build`
Expected: `web/dist/sw.js` exists, contains compiled service-worker code with the inlined manifest.

Run: `grep '__SHELL_MANIFEST__' web/dist/sw.js || echo "none"`
Expected: prints `none` (token must not survive; it is replaced by `Bun.build`'s `define`).

- [ ] **Step 5: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add web/src/pwa/sw.ts web/scripts/build-sw.ts web/package.json
git commit -m "feat(web): hand-rolled shell-only service worker with post-build manifest"
```

---

## Task 14: infra/Caddyfile

**Files:**

- Create: `infra/Caddyfile`

- [ ] **Step 1: Create `infra/Caddyfile`** (placeholders are resolved in S1b; do not change them now)

```caddyfile
{
    email EMAIL_PLACEHOLDER
}

(maintenance_gate) {
    @maintenance_on file /etc/battleship-arena/maintenance.on
    handle @maintenance_on {
        root * /var/www/battleship-arena
        rewrite * /maintenance.html
        file_server
        header Cache-Control "no-store"
        respond 503 {
            close
        }
    }
}

arena.example {
    import maintenance_gate

    handle /api/* {
        reverse_proxy 127.0.0.1:8081 {
            flush_interval -1
            transport http {
                read_timeout 10m
                write_timeout 10m
            }
        }
        header Cache-Control "no-store"
    }

    handle {
        root * /var/www/battleship-arena/web
        file_server
        header /assets/* Cache-Control "public, max-age=31536000, immutable"
    }
}

staging.arena.example {
    import maintenance_gate

    handle /api/* {
        reverse_proxy 127.0.0.1:8082 {
            flush_interval -1
            transport http {
                read_timeout 10m
                write_timeout 10m
            }
        }
        header Cache-Control "no-store"
    }

    handle {
        root * /var/www/battleship-arena-staging/web
        file_server
        header /assets/* Cache-Control "public, max-age=31536000, immutable"
    }
}
```

- [ ] **Step 2: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add infra/Caddyfile
git commit -m "chore(infra): add Caddyfile with prod and staging vhosts"
```

---

## Task 15: infra/systemd/ units

**Files:**

- Create: `infra/systemd/battleship-arena.service`
- Create: `infra/systemd/battleship-arena-staging.service`
- Create: `infra/systemd/battleship-backup.service`
- Create: `infra/systemd/battleship-backup.timer`
- Create: `infra/systemd/battleship-offhost-rsync.service`
- Create: `infra/systemd/battleship-offhost-rsync.timer`

- [ ] **Step 1: `infra/systemd/battleship-arena.service`** (prod)

```ini
[Unit]
Description=BattleShipArena backend (production)
After=network.target

[Service]
Type=simple
User=battleship
Group=battleship
Environment=DATABASE_PATH=/var/lib/battleship-arena/project.db
Environment=PORT=8081
ExecStart=/usr/local/bin/bun run /opt/battleship-arena/backend/dist/index.js
Restart=on-failure
RestartSec=2s
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
NoNewPrivileges=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
MemoryDenyWriteExecute=yes
ReadWritePaths=/var/lib/battleship-arena

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: `infra/systemd/battleship-arena-staging.service`**

```ini
[Unit]
Description=BattleShipArena backend (staging)
After=network.target

[Service]
Type=simple
User=battleship
Group=battleship
Environment=DATABASE_PATH=/var/lib/battleship-arena-staging/project-staging.db
Environment=PORT=8082
ExecStart=/usr/local/bin/bun run /opt/battleship-arena-staging/backend/dist/index.js
Restart=on-failure
RestartSec=2s
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
NoNewPrivileges=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
MemoryDenyWriteExecute=yes
ReadWritePaths=/var/lib/battleship-arena-staging

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: `infra/systemd/battleship-backup.service`**

```ini
[Unit]
Description=BattleShipArena hourly VACUUM INTO backup

[Service]
Type=oneshot
User=battleship
Group=battleship
ExecStart=/opt/battleship-arena/infra/scripts/backup.sh
```

- [ ] **Step 4: `infra/systemd/battleship-backup.timer`**

```ini
[Unit]
Description=Run BattleShipArena backup hourly

[Timer]
OnCalendar=hourly
Persistent=true
Unit=battleship-backup.service

[Install]
WantedBy=timers.target
```

- [ ] **Step 5: `infra/systemd/battleship-offhost-rsync.service`**

```ini
[Unit]
Description=BattleShipArena daily off-host backup rsync

[Service]
Type=oneshot
User=battleship
Group=battleship
ExecStart=/opt/battleship-arena/infra/scripts/offhost-rsync.sh
```

- [ ] **Step 6: `infra/systemd/battleship-offhost-rsync.timer`**

```ini
[Unit]
Description=Run BattleShipArena off-host rsync daily

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
Unit=battleship-offhost-rsync.service

[Install]
WantedBy=timers.target
```

- [ ] **Step 7: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add infra/systemd/
git commit -m "chore(infra): add systemd units for backend, backup, and off-host rsync"
```

---

## Task 16: infra scripts and static maintenance page

**Files:**

- Create: `infra/scripts/backup.sh`
- Create: `infra/scripts/offhost-rsync.sh`
- Create: `infra/scripts/maintenance-on.sh`
- Create: `infra/scripts/maintenance-off.sh`
- Create: `infra/scripts/restore.sh`
- Create: `infra/scripts/host-bootstrap.sh`
- Create: `infra/scripts/verify-s1a.sh`
- Create: `infra/maintenance.html`

Every script begins with `#!/usr/bin/env bash\nset -euo pipefail`. After creation, run `chmod +x infra/scripts/*.sh` locally.

- [ ] **Step 1: `infra/scripts/backup.sh`**

```bash
#!/usr/bin/env bash
# BattleShipArena hourly snapshot: VACUUM INTO, then prune old snapshots.
set -euo pipefail

BACKUP_DIR="/var/backups/battleship-arena"
KEEP_HOURLY=48
KEEP_DAILY=30

mkdir -p "$BACKUP_DIR"

for env_name in "" "-staging"; do
    db_path="/var/lib/battleship-arena${env_name}/project${env_name}.db"
    if [[ ! -f "$db_path" ]]; then
        continue
    fi
    ts="$(date +%s%3N)"
    dest="${BACKUP_DIR}/project${env_name}-${ts}.db"
    sqlite3 "$db_path" "VACUUM INTO '${dest}';"
    chmod 0600 "$dest"
done

# Keep the latest $KEEP_HOURLY for each env.
for prefix in project project-staging; do
    mapfile -t files < <(ls -1t "${BACKUP_DIR}/${prefix}-"*.db 2>/dev/null || true)
    if (( ${#files[@]} > KEEP_HOURLY )); then
        for file in "${files[@]:KEEP_HOURLY}"; do
            rm -f "$file"
        done
    fi
done

# Keep $KEEP_DAILY days of any snapshot (safety net).
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.db' -mtime "+$KEEP_DAILY" -print -delete
```

- [ ] **Step 2: `infra/scripts/offhost-rsync.sh`**

```bash
#!/usr/bin/env bash
# Daily off-host push of the newest local snapshot.
set -euo pipefail

BACKUP_DIR="/var/backups/battleship-arena"
REMOTE_TARGET="${BSA_OFFHOST_TARGET:-OFFHOST_PLACEHOLDER@backup.example:/srv/battleship-arena/}"
SSH_KEY="${BSA_OFFHOST_SSH_KEY:-/var/lib/battleship/.ssh/offhost_ed25519}"

newest="$(ls -1t "${BACKUP_DIR}"/*.db 2>/dev/null | head -n1 || true)"
if [[ -z "$newest" ]]; then
    echo "no snapshot to push"
    exit 0
fi

rsync -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=yes" -avh "$newest" "$REMOTE_TARGET"
```

- [ ] **Step 3: `infra/scripts/maintenance-on.sh`**

```bash
#!/usr/bin/env bash
# Turn hard maintenance ON by creating the flag file Caddy watches.
set -euo pipefail
FLAG="/etc/battleship-arena/maintenance.on"
touch "$FLAG"
chmod 0644 "$FLAG"
echo "maintenance flag present at $FLAG"
```

- [ ] **Step 4: `infra/scripts/maintenance-off.sh`**

```bash
#!/usr/bin/env bash
# Turn hard maintenance OFF by removing the flag file.
set -euo pipefail
FLAG="/etc/battleship-arena/maintenance.on"
rm -f "$FLAG"
echo "maintenance flag removed from $FLAG"
```

- [ ] **Step 5: `infra/scripts/restore.sh`**

```bash
#!/usr/bin/env bash
# Restore a chosen snapshot over the live database for the given environment.
# Usage: sudo restore.sh <env> <snapshot_path>
#   env = "prod" or "staging"
set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "usage: $0 <prod|staging> <snapshot.db>"
    exit 2
fi

env_name="$1"
snapshot="$2"

case "$env_name" in
    prod)
        target="/var/lib/battleship-arena/project.db"
        service="battleship-arena.service"
        ;;
    staging)
        target="/var/lib/battleship-arena-staging/project-staging.db"
        service="battleship-arena-staging.service"
        ;;
    *)
        echo "unknown env: $env_name"
        exit 2
        ;;
esac

if [[ ! -f "$snapshot" ]]; then
    echo "snapshot not found: $snapshot"
    exit 2
fi

touch /etc/battleship-arena/maintenance.on
systemctl stop "$service"
cp "$snapshot" "$target"
chown battleship:battleship "$target"
chmod 0600 "$target"
systemctl start "$service"
sleep 2
curl -fsS "http://127.0.0.1:$([[ $env_name == prod ]] && echo 8081 || echo 8082)/api/health" >/dev/null
rm -f /etc/battleship-arena/maintenance.on
echo "restore of $env_name from $snapshot complete"
```

- [ ] **Step 6: `infra/scripts/host-bootstrap.sh`**

```bash
#!/usr/bin/env bash
# One-shot host provisioning for BattleShipArena.
# Run once on the VPS in S1b. Creates users, directories, the maintenance page, and systemd units.
#
# Ownership model:
#   battleship          - runtime user for the backend systemd units (reads DB, reads dist files)
#   battleship-deploy   - CI deploy user; owns the rsync targets so `rsync` over SSH does not need sudo
#   www-data            - Caddy runtime user; reads the web dist via group membership
#
# /opt/battleship-arena*/backend/dist/   owner=battleship-deploy group=battleship mode=2750
# /var/www/battleship-arena*/web/        owner=battleship-deploy group=www-data   mode=2755
# Setgid on the directories makes rsynced files inherit the group automatically.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "must be run as root"
    exit 1
fi

id -u battleship >/dev/null 2>&1 || useradd --system --home /var/lib/battleship --create-home battleship
id -u battleship-deploy >/dev/null 2>&1 || useradd --system --home /home/battleship-deploy --create-home --shell /bin/bash battleship-deploy
getent group www-data >/dev/null || groupadd --system www-data

# Runtime state directories (backend writes here).
install -d -o battleship -g battleship -m 0750 /var/lib/battleship-arena
install -d -o battleship -g battleship -m 0750 /var/lib/battleship-arena-staging
install -d -o battleship -g battleship -m 0700 /var/backups/battleship-arena

# Backend dist targets (rsynced by battleship-deploy; read by battleship at runtime).
install -d -o battleship-deploy -g battleship -m 2750 /opt/battleship-arena
install -d -o battleship-deploy -g battleship -m 2750 /opt/battleship-arena/backend
install -d -o battleship-deploy -g battleship -m 2750 /opt/battleship-arena/backend/dist
install -d -o battleship-deploy -g battleship -m 2750 /opt/battleship-arena-staging
install -d -o battleship-deploy -g battleship -m 2750 /opt/battleship-arena-staging/backend
install -d -o battleship-deploy -g battleship -m 2750 /opt/battleship-arena-staging/backend/dist

# Web static targets (rsynced by battleship-deploy; read by www-data at runtime).
# The parent directories exist so `/var/www/battleship-arena/maintenance.html` is readable
# and the Caddy file_server blocks can serve from `/web/` sub-directories.
install -d -o battleship-deploy -g www-data -m 2755 /var/www/battleship-arena
install -d -o battleship-deploy -g www-data -m 2755 /var/www/battleship-arena/web
install -d -o battleship-deploy -g www-data -m 2755 /var/www/battleship-arena-staging
install -d -o battleship-deploy -g www-data -m 2755 /var/www/battleship-arena-staging/web

# Maintenance flag directory (root-owned so only sudoed scripts toggle the flag).
install -d -o root -g root -m 0755 /etc/battleship-arena

# Maintenance HTML page Caddy serves during hard maintenance.
# The Caddy `(maintenance_gate)` snippet serves from /var/www/battleship-arena, so the file
# only needs to exist there once (both vhosts reuse it).
install -m 0644 -o battleship-deploy -g www-data \
    /opt/battleship-arena/infra/maintenance.html /var/www/battleship-arena/maintenance.html

for unit in \
    battleship-arena.service \
    battleship-arena-staging.service \
    battleship-backup.service \
    battleship-backup.timer \
    battleship-offhost-rsync.service \
    battleship-offhost-rsync.timer; do
    install -m 0644 "/opt/battleship-arena/infra/systemd/${unit}" "/etc/systemd/system/${unit}"
done

systemctl daemon-reload
systemctl enable --now battleship-arena-staging.service
systemctl enable --now battleship-backup.timer battleship-offhost-rsync.timer

echo "host bootstrap complete"
```

- [ ] **Step 7: `infra/scripts/verify-s1a.sh`**

```bash
#!/usr/bin/env bash
# S1a definition-of-done verification. Runs locally and in CI.
set -euo pipefail

bun install --frozen-lockfile
bun run lint
bun run fmt:check
bun run typecheck
DATABASE_PATH=:memory: bun test
bun run build

DATABASE_PATH="./dev-verify.db" PORT=18181 bun --filter backend run src/index.ts &
backend_pid=$!
cleanup() {
    kill "$backend_pid" 2>/dev/null || true
    rm -f dev-verify.db dev-verify.db-shm dev-verify.db-wal
}
trap cleanup EXIT

sleep 2
curl -fsS "http://127.0.0.1:18181/api/health" | grep -q '"status":"ok"'

kill "$backend_pid"
wait "$backend_pid" 2>/dev/null || true

bun --filter web run build
[[ -f web/dist/sw.js ]]
[[ -f web/dist/index.html ]]
[[ -f web/dist/manifest.webmanifest ]]
echo "S1a verification passed"
```

- [ ] **Step 8: `infra/maintenance.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BattleShipArena - maintenance</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        background: #0b0d10;
        color: #fafafa;
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
      }
      main {
        text-align: center;
        padding: 2rem;
        max-width: 32rem;
      }
      h1 {
        margin-top: 0;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>BattleShipArena is briefly offline</h1>
      <p>We're performing scheduled maintenance. Please check back shortly.</p>
    </main>
  </body>
</html>
```

- [ ] **Step 9: Make scripts executable**

Run: `chmod +x infra/scripts/*.sh`
Expected: no output.

- [ ] **Step 10: Smoke-run verify-s1a.sh locally**

Run: `bash infra/scripts/verify-s1a.sh`
Expected: prints `S1a verification passed` and exits `0`.

If this fails, stop here and investigate; do not move to the CI tasks.

- [ ] **Step 11: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add infra/scripts/ infra/maintenance.html
git commit -m "chore(infra): add ops scripts and maintenance page"
```

---

## Task 17: CI workflow for pull requests

**Files:**

- Create: `.github/workflows/pr.yml`

- [ ] **Step 1: Create `.github/workflows/pr.yml`**

```yaml
name: pr

on:
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: .bun-version
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run fmt:check
      - run: bun run typecheck
      - name: Run test suite
        env:
          DATABASE_PATH: ":memory:"
        run: bun test
      - run: bun run build
      - name: S1a verification
        run: bash infra/scripts/verify-s1a.sh
```

- [ ] **Step 2: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add .github/workflows/pr.yml
git commit -m "ci: add PR workflow with lint, test, build, verify"
```

---

## Task 18: CI workflow for staging deploys (gated)

**Files:**

- Create: `.github/workflows/deploy-staging.yml`

- [ ] **Step 1: Create `.github/workflows/deploy-staging.yml`**

```yaml
name: deploy-staging

on:
  push:
    branches: [main]

concurrency:
  group: deploy-staging
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    outputs:
      artifact: ${{ steps.upload.outputs.artifact-id }}
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: .bun-version
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run fmt:check
      - run: bun run typecheck
      - name: Run test suite
        env:
          DATABASE_PATH: ":memory:"
        run: bun test
      - run: bun run build
      - name: Package dist
        run: |
          mkdir -p artifact
          cp -R backend/dist artifact/backend-dist
          cp -R web/dist artifact/web-dist
          tar -C artifact -czf bsa-dist.tgz backend-dist web-dist
      - id: upload
        uses: actions/upload-artifact@v4
        with:
          name: bsa-dist
          path: bsa-dist.tgz

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    timeout-minutes: 15
    steps:
      - name: Evaluate deploy gate
        id: gate
        run: |
          if [[ "${{ vars.STAGING_DEPLOY_ENABLED }}" == "true" ]]; then
              echo "enabled=true" >> "$GITHUB_OUTPUT"
              echo "### Deploy gate: ENABLED" >> "$GITHUB_STEP_SUMMARY"
              echo "Proceeding with staging deploy." >> "$GITHUB_STEP_SUMMARY"
          else
              echo "enabled=false" >> "$GITHUB_OUTPUT"
              echo "### Deploy gate: DISABLED" >> "$GITHUB_STEP_SUMMARY"
              echo "Deploy disabled until S1b (STAGING_DEPLOY_ENABLED is not true)." >> "$GITHUB_STEP_SUMMARY"
          fi
      - uses: actions/download-artifact@v4
        if: steps.gate.outputs.enabled == 'true'
        with:
          name: bsa-dist
      - name: Install SSH key
        if: steps.gate.outputs.enabled == 'true'
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.STAGING_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          printf '%s\n' "${{ vars.STAGING_SSH_KNOWN_HOSTS }}" >> ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts
      - name: Rsync artifact to host
        if: steps.gate.outputs.enabled == 'true'
        run: |
          tar -xzf bsa-dist.tgz
          rsync -e "ssh -i ~/.ssh/id_ed25519" -avh --delete backend-dist/ \
              "battleship-deploy@${{ vars.STAGING_SSH_HOST }}:/opt/battleship-arena-staging/backend/dist/"
          rsync -e "ssh -i ~/.ssh/id_ed25519" -avh --delete web-dist/ \
              "battleship-deploy@${{ vars.STAGING_SSH_HOST }}:/var/www/battleship-arena-staging/web/"
      - name: Restart staging service
        if: steps.gate.outputs.enabled == 'true'
        run: |
          ssh -i ~/.ssh/id_ed25519 "battleship-deploy@${{ vars.STAGING_SSH_HOST }}" \
              "sudo systemctl restart battleship-arena-staging.service"
      - name: Health check
        if: steps.gate.outputs.enabled == 'true'
        run: |
          for attempt in $(seq 1 30); do
              if curl -fsS "${{ vars.STAGING_PUBLIC_URL }}/api/health" >/dev/null; then
                  echo "healthy"
                  exit 0
              fi
              sleep 2
          done
          echo "health check failed"
          exit 1
```

- [ ] **Step 2: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add .github/workflows/deploy-staging.yml
git commit -m "ci: add gated staging deploy workflow"
```

---

## Task 19: Dependabot configuration

**Files:**

- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      actions:
        update-types: [minor, patch]
    labels: [dependencies, ci]
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      js:
        update-types: [minor, patch]
    labels: [dependencies]
```

- [ ] **Step 2: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add .github/dependabot.yml
git commit -m "ci: enable Dependabot for github-actions and npm"
```

---

## Task 20: S1b handover runbook

The version log already exists (created in Pre-task 0 and committed in Task 1). This task only adds the S1b runbook.

**Files:**

- Create: `docs/ops/host-bootstrap.md`

- [ ] **Step 1: Create `docs/ops/host-bootstrap.md`**

```markdown
# S1b - Host Bootstrap Runbook

This document is the step-by-step for turning the checked-in `infra/` configuration into a running staging environment. It is also the record of the irreversible decisions S1b makes.

## Decisions to record (fill in during S1b)

- **Cloud provider / region:** **\_**
- **VPS size:** **\_**
- **Staging domain:** **\_** (replaces `<staging-domain>` in `Caddyfile` and workflows)
- **Staging public URL:** **\_** (e.g. `https://staging.arena.example`; filled into `vars.STAGING_PUBLIC_URL`)
- **ACME email for Let's Encrypt:** **\_** (replaces `EMAIL_PLACEHOLDER` in `Caddyfile`)
- **DNS provider:** **\_**
- **Off-host backup target host:** **\_** (replaces `OFFHOST_PLACEHOLDER` in `offhost-rsync.sh`)
- **Off-host target path:** **\_**
- **Deploy user on host:** `battleship-deploy`
- **GitHub repo variables:** `STAGING_SSH_HOST`, `STAGING_SSH_KNOWN_HOSTS`, `STAGING_PUBLIC_URL`, `STAGING_DEPLOY_ENABLED`
- **GitHub repo secrets:** `STAGING_SSH_KEY`

## Path model on the host

- `/opt/battleship-arena/` - checked-out repo. Contains `infra/` (the source for systemd unit files, Caddyfile, scripts, and `maintenance.html`). In S4 this tree also receives the prod `backend/dist/` rsync.
- `/opt/battleship-arena-staging/backend/dist/` - rsync target for the staging backend build (owner `battleship-deploy`, group `battleship`, mode `2750`).
- `/var/www/battleship-arena-staging/web/` - rsync target for the staging web build (owner `battleship-deploy`, group `www-data`, mode `2755`).
- `/var/www/battleship-arena/maintenance.html` - static page Caddy serves under hard maintenance; placed by `host-bootstrap.sh` at provisioning time.
- `/var/lib/battleship-arena-staging/project-staging.db` - staging SQLite file (owner `battleship`, mode `0600`).
- `/var/backups/battleship-arena/` - local snapshots (shared between prod and staging).
- `/etc/battleship-arena/maintenance.on` - hard-maintenance flag file (created by `maintenance-on.sh` via sudo).

## User model

- `battleship` - runtime user for the backend systemd units. Owns state directories; is the group member that reads `backend/dist/`.
- `battleship-deploy` - CI deploy identity (created by `host-bootstrap.sh`). Owns the rsync targets so `rsync` over SSH needs no sudo. Narrow sudoers entry permits only `systemctl restart` of the staging service and `touch`/`rm` of the maintenance flag.
- `www-data` - Caddy runtime user. Reads `/var/www/*` via group membership.

## Steps

1. Provision the VPS. Install Caddy 2.x from the distribution repository. Install Bun at the pinned version from `.bun-version` as root, then place the binary at `/usr/local/bin/bun`.
2. Register the staging domain at the chosen DNS provider. Point A/AAAA records to the VPS IP. Wait for propagation (`dig +short <staging-domain>`).
3. Replace placeholders in `infra/Caddyfile` (`EMAIL_PLACEHOLDER`, `<staging-domain>`) via a PR; merge; the edit reaches the host in the next step.
4. On the host, clone the repo to `/opt/battleship-arena` as root: `sudo git clone <repo-url> /opt/battleship-arena` (or rsync the checked-out tree). The ownership of the clone itself does not matter; `host-bootstrap.sh` sets ownership on the specific subdirectories it manages.
5. Run `sudo /opt/battleship-arena/infra/scripts/host-bootstrap.sh`. This creates the `battleship` and `battleship-deploy` users, all runtime directories with the documented ownership and modes, copies `maintenance.html` into place, and installs + enables the systemd units and timers.
6. Place the Caddyfile: `sudo cp /opt/battleship-arena/infra/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
7. Grant `battleship-deploy` the narrow sudoers rights the workflow needs. Create `/etc/sudoers.d/battleship-deploy` (mode `0440`) containing:
```

battleship-deploy ALL=(root) NOPASSWD: /bin/systemctl restart battleship-arena-staging.service, /usr/bin/touch /etc/battleship-arena/maintenance.on, /bin/rm -f /etc/battleship-arena/maintenance.on

````
Run `sudo visudo -cf /etc/sudoers.d/battleship-deploy` to validate.
8. Generate an `ed25519` deploy keypair on the host; place the public key at `/home/battleship-deploy/.ssh/authorized_keys` (mode `0600`, owner `battleship-deploy`); ensure `/home/battleship-deploy/.ssh` is mode `0700`. Copy the private key into GitHub as `secrets.STAGING_SSH_KEY`.
9. Record the host's SSH host key: `ssh-keyscan -t ed25519 <ssh-host> >> known_hosts_snippet`; paste that single line into `vars.STAGING_SSH_KNOWN_HOSTS`.
10. Set `vars.STAGING_SSH_HOST` to the SSH host address (IP or domain; this is only used for rsync + ssh).
11. Set `vars.STAGING_PUBLIC_URL` to the full staging URL (e.g. `https://staging.arena.example`). This is the URL the workflow's health check curls; it must be a real hostname with TLS.
12. Flip `vars.STAGING_DEPLOY_ENABLED` to `true`.
13. Trigger a fresh merge to `main` (or re-run the latest `deploy-staging.yml` workflow). Watch both the `build` and `deploy` jobs run green. Curl `${STAGING_PUBLIC_URL}/api/health` from an external machine; expect `200`.
14. Install the off-host rsync destination. Generate a second keypair owned by the `battleship` user on the staging host; add its public key to the off-host target's `authorized_keys`. `sudo -u battleship /opt/battleship-arena/infra/scripts/offhost-rsync.sh` - first run should succeed.
15. Reboot drill. `sudo reboot`. After the host returns:
 ```
 systemctl status battleship-arena-staging.service battleship-backup.timer battleship-offhost-rsync.timer
 ```
 All three must be `active`. Curl `${STAGING_PUBLIC_URL}/api/health` - expect `200`.
16. Record the reboot drill as `docs/ops/reboot-drill-<date>.md` (short log of what passed).

S1b is done when every step has a corresponding outcome noted against it in this document.
````

- [ ] **Step 2: Commit**

Requires user approval per `AGENTS.md`.

```bash
git add docs/ops/host-bootstrap.md
git commit -m "docs(ops): add S1b host bootstrap runbook"
```

---

## Task 21: Final verification and PR

**Files:** none (execution only)

- [ ] **Step 1: Clean workspace verification on a fresh clone copy**

Run:

```
rm -rf node_modules web/dist backend/dist .astro
bash infra/scripts/verify-s1a.sh
```

Expected: final line `S1a verification passed`.

- [ ] **Step 2: Confirm `deploy-staging.yml` gate lands off**

Confirm in GitHub: repository variable `STAGING_DEPLOY_ENABLED` is either unset or not equal to `"true"`. If present and wrong, set it to empty until S1b.

- [ ] **Step 3: Push branch, open PR**

Requires user approval per `AGENTS.md`.

```bash
git push origin <branch-name>
gh pr create --base main --title "feat: S1a bootstrap" --body "Implements docs/superpowers/plans/2026-04-20-s1a-bootstrap.md. Verifies locally via infra/scripts/verify-s1a.sh."
```

- [ ] **Step 4: Observe CI**

Watch `pr.yml` run on the PR. Expected: every step green, ending with `S1a verification passed`. If anything is red, fix before merging.

- [ ] **Step 5: Merge and observe the staging workflow**

After PR approval, merge to `main`. Expected: `deploy-staging.yml` runs; `build` goes green; the `deploy` job runs, writes the `### Deploy gate: DISABLED` step summary, and skips the actual deploy steps because `STAGING_DEPLOY_ENABLED` is not `true`.

- [ ] **Step 6: Tag S1a done**

Record S1a completion by ticking the plan's checkbox at the top of `docs/plan.md` section 3 where "S1a" applies. (Do not expand the S1b items.)

```bash
git add docs/plan.md
git commit -m "docs(plan): mark S1a bootstrap checklist items complete"
```

Then push the documentation update separately (requires user approval).

---

## Self-review (written by the plan author; the implementer reads but does not need to re-run)

### Spec coverage

Each requirement from `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md` maps to a task:

- Scope split and DoD (spec section 1) -> Pre-task 0 through Task 21.
- Version-verification discipline (spec section 2.7) -> Pre-task 0 and Task 1.
- Monorepo orchestrator, lefthook, tsconfig, oxlint/oxfmt, bun pin (spec section 2) -> Task 1.
- Dependabot (spec section 2.8, 4.3) -> Task 19.
- `shared/` contents (spec section 3.1) -> Tasks 2 and 3.
- `backend/` contents (spec section 3.2) -> Tasks 4-10. The "`src/db/client.ts` is the only runtime place that calls `new Database(...)`" rule is satisfied: `withTempDatabase` now delegates to `openDatabase`.
- `web/` contents (spec section 3.3) -> Tasks 11-13.
- `infra/` contents (spec section 3.4) -> Tasks 14-16.
- CI `pr.yml` (spec section 4.1) -> Task 17.
- CI `deploy-staging.yml` with step-summary-visible gate (spec sections 4.2, 5.3) -> Task 18. The `deploy` job runs unconditionally, writes a visible step summary, and conditionally executes the deploy steps only when `vars.STAGING_DEPLOY_ENABLED == 'true'`.
- Secrets and variables inventory including `STAGING_PUBLIC_URL` (spec section 4.4) -> Task 20's runbook and Task 18's workflow.
- S1b handover (spec section 5.4) -> Task 20.
- Startup-order guarantee test (spec section 1.3 "startup applies pending Drizzle migrations ... before the HTTP listener opens") -> Task 10's `bootstrap.test.ts` exercises the real `bootstrap()` call and proves migrations complete before `/api/health` is reachable.
- Local verification protocol (spec section 5.2) -> Task 16 step 7; Task 21.
- CI verification (spec section 5.3) -> Task 21 steps 4 and 5.

No spec requirement is uncovered.

### Placeholder scan

No TBD / TODO / "similar to" / "add appropriate error handling" strings appear outside this self-review section. Named placeholders are intentional and explicitly scheduled:

- `EMAIL_PLACEHOLDER`, `<staging-domain>`, `OFFHOST_PLACEHOLDER` are resolved in S1b's runbook (Task 20 output).
- `LATEST` and `<resolved-bun>` in scaffold snippets are resolved from the version log before any install (Pre-task 0).

### Type and identifier consistency

- `BackendConfig` defined in Task 4 is consumed unchanged in Tasks 6 and 10.
- `ParseShotResult` kinds (`"ok"` / `"schema_error"` / `"invalid_coordinate"`) defined in Task 3 do not reappear elsewhere in S1a.
- `HealthResponse` type defined in Task 2 (step 6) is consumed in Task 6.
- `applyMigrations(db)` signature defined in Task 8 is called unchanged in Tasks 9 and 10.
- `openDatabase(databasePath)` signature defined in Task 9 is called unchanged in the `withTempDatabase` implementation and in `bootstrap` (Task 10).
- `withTempDatabase(callback)` handle shape `{ sqlite, db, path }` defined in Task 9 is the stable contract for future tests (S2+).
- `bootstrap(config)` return shape `{ server, sqlite, config }` defined in Task 10 is only consumed by `bootstrap.test.ts` in S1a; downstream code in S2 may extend it additively.

No drift.

---

Skills used: superpowers:brainstorming, superpowers:writing-plans.
Docs used: `docs/about.md`, `docs/spec.md`, `docs/architecture.md`, `docs/plan.md`, `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md`, `CLAUDE.md`, `AGENTS.md`.
