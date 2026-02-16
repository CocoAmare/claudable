# CLAUDE.md

This file provides guidance for AI assistants working on the Claudable codebase.

## Project Overview

Claudable is an AI-powered web app builder (v2.0.0) that lets users describe applications in natural language and generates production-ready Next.js code. It supports multiple AI agents (Claude Code, Cursor CLI, OpenAI Codex, Qwen, Z.AI GLM), provides live preview with hot-reload, and integrates with GitHub, Vercel, and Supabase for deployment and data.

## Tech Stack

- **Framework:** Next.js 15 (App Router) with React 19
- **Language:** TypeScript 5.7 (strict mode)
- **Database:** SQLite via Prisma 6.1
- **Styling:** Tailwind CSS 3.4
- **Desktop:** Electron 39
- **AI Integration:** @anthropic-ai/claude-agent-sdk
- **Real-time:** WebSocket (ws) + Server-Sent Events
- **Validation:** Zod
- **Node.js:** >=20.0.0, npm >=10.0.0

## Quick Reference Commands

```bash
# Development
npm run dev              # Start web dev server (auto-detects port, default 3000)
npm run dev:desktop      # Start desktop dev with Electron

# Build & Production
npm run build            # Next.js production build
npm run start            # Start production server

# Code Quality
npm run lint             # ESLint (next/core-web-vitals)
npm run type-check       # TypeScript strict check (tsc --noEmit)

# Database
npm run prisma:generate  # Regenerate Prisma client after schema changes
npm run prisma:push      # Sync schema to SQLite database
npm run prisma:migrate   # Create a new migration
npm run prisma:studio    # Open Prisma GUI browser
npm run prisma:reset     # Reset database (destructive)

# Setup
npm run setup            # Full setup: install + prisma generate + db push
npm run check-cli        # Verify AI CLI tools are installed

# Desktop packaging
npm run package:mac      # Build macOS DMG/ZIP
npm run package:win      # Build Windows NSIS installer
npm run package:linux    # Build Linux AppImage
```

## Project Structure

```
app/                        # Next.js App Router
  [project_id]/chat/        # Main chat/project interface (dynamic route)
  api/                      # Backend API routes
    chat/[project_id]/      # Chat endpoints (act, stream, messages)
    projects/               # Project CRUD
    assets/                 # File upload/management
    env/                    # Environment variable management
    github/                 # GitHub integration
components/                 # React components
  chat/                     # ChatLog, ChatInput, ThinkingSection, etc.
  layout/                   # Header, layout shells
  modals/                   # CreateProject, GitHub, Supabase, Vercel modals
  settings/                 # AI, Environment, Project, Service settings
contexts/                   # React contexts (Auth, GlobalSettings)
hooks/                      # Custom hooks (useCLI, useUserRequests, useWebSocket)
lib/                        # Core business logic
  config/                   # App constants
  constants/                # Model definitions per CLI (claude, cursor, codex, qwen, glm)
  db/client.ts              # Prisma client singleton
  server/                   # WebSocket manager
  services/                 # Service layer (see below)
  utils/                    # Utility functions (ports, paths, scaffold, cliOptions)
  serializers/              # Data serialization (chat, project)
  crypto.ts                 # AES-256 encryption for env vars
types/                      # TypeScript type definitions
  shared/                   # Client + server shared types
  client/                   # Client-only types
  server/                   # Server-only types
  backend/                  # API request/response types
prisma/schema.prisma        # Database schema (SQLite)
electron/                   # Desktop app (main.js, preload.js)
openclaw/                   # OpenClaw autonomous agent framework (see below)
  agent/                    # Orchestrator, permissions, audit logging
  tools/                    # Tool plugins (claudable, docker, filesystem, git)
scripts/                    # Build/setup scripts
public/                     # Static assets, uploads
stubs/                      # Icon library stubs (react-icons)
```

## Architecture

```
Client Layer (React 19)
  Chat UI, Settings, Modals
  WebSocket + SSE for real-time updates
        |
API Layer (Next.js App Router)
  REST endpoints for all operations
  SSE broadcast, WebSocket upgrade
        |
Service Layer (lib/services/)
  CLI integrations (Claude, Cursor, Codex, Qwen, GLM)
  Project, message, session management
  Git, GitHub, Vercel, Supabase operations
  Real-time event broadcasting (StreamManager)
        |
Data Layer (Prisma + SQLite)
  Project, Message, Session, EnvVar, Commit
  ServiceToken, ToolUsage, UserRequest
```

### Key Service Files

| File | Purpose |
|------|---------|
| `lib/services/cli/claude.ts` | Claude Agent SDK integration (core, ~1200 lines) |
| `lib/services/cli/cursor.ts` | Cursor CLI integration |
| `lib/services/cli/codex.ts` | OpenAI Codex integration |
| `lib/services/cli/qwen.ts` | Qwen Code integration |
| `lib/services/cli/glm.ts` | Z.AI GLM integration |
| `lib/services/stream.ts` | SSE StreamManager singleton |
| `lib/services/preview.ts` | Per-project Next.js dev server management |
| `lib/services/project.ts` | Project CRUD operations |
| `lib/services/message.ts` | Message persistence |
| `lib/services/chat-sessions.ts` | AI session tracking |
| `lib/services/git.ts` | Git operations (init, commit, push) |
| `lib/services/github.ts` | GitHub API integration |
| `lib/services/vercel.ts` | Vercel deployment |
| `lib/services/supabase.ts` | Supabase integration |
| `lib/services/env.ts` | Encrypted environment variable management |

### Entry Points

- **Main chat UI:** `app/[project_id]/chat/page.tsx`
- **AI execution handler:** `app/api/chat/[project_id]/act/route.ts`
- **Root layout:** `app/layout.tsx`
- **Electron main:** `electron/main.js`

## Database

SQLite via Prisma. Schema at `prisma/schema.prisma`.

**Core models:** Project, Message, Session, ProjectServiceConnection, EnvVar, Commit, ToolUsage, UserRequest, ServiceToken.

After any schema change:
```bash
npm run prisma:generate   # Regenerate client types
npm run prisma:push       # Sync schema to DB
```

Database file lives at `data/cc.db` (auto-created on first run).

## Code Conventions

### TypeScript

- Strict mode enabled. All code must pass `tsc --noEmit`.
- Path aliases configured: `@/*` maps to project root, plus specific `@/types/*` aliases.
- Shared types go in `types/shared/`, client-only in `types/client/`, server-only in `types/server/`.

### Naming

- **Files:** camelCase for utilities/services, PascalCase for React components.
- **Functions:** camelCase, verb-first for actions (`createProject`, `updateMessage`).
- **Constants:** UPPER_SNAKE_CASE for app-wide constants.
- **Components:** PascalCase (`ChatLog`, `ProjectSettings`).
- **Types/Interfaces:** PascalCase.

### Patterns

- **Service layer pattern:** Business logic in `lib/services/`, each file exports functions for a specific domain. Services use the Prisma client singleton from `lib/db/client.ts`.
- **CLI integration pattern:** Unified interface across AI agents. Each CLI has a dedicated file in `lib/services/cli/`. Common operations: `initializeNextJsProject()`, `applyChanges()`.
- **Real-time:** StreamManager singleton broadcasts via SSE; WebSocket hook (`useWebSocket`) reconnects with exponential backoff.
- **Error handling:** Custom error classes (e.g., `GitHubError`, `GitError`). Try-catch with detailed logging using prefixed contexts (`[ClaudeService]`, `[StreamManager]`).
- **Security:** Path validation to prevent directory traversal. AES-256 encryption for env vars. Input validation with Zod at API boundaries.

### Styling

- Tailwind CSS utility classes. Global styles in `styles/globals.css`.
- Framer Motion for animations (wrapped in `lib/motion.ts`).

### Linting

- ESLint extends `next/core-web-vitals`.
- Run `npm run lint` before committing.

## Port Allocation

- **Web dev server:** 3000-3099 (auto-detected)
- **Project preview servers:** 3100-3999

## Environment

- `.env` and `.env.local` are auto-created by `scripts/setup-env.js` on `npm install`.
- `DATABASE_URL` points to `file:../data/cc.db` by default.
- Never commit `.env` files or API tokens.

## Testing

No test framework is currently configured. Quality checks rely on:
- `npm run type-check` -- TypeScript strict type checking
- `npm run lint` -- ESLint

## Common Workflows

### Adding a new API route

1. Create route file under `app/api/<domain>/route.ts`.
2. Define request/response types in `types/backend/`.
3. Implement logic in `lib/services/` (keep route handlers thin).
4. Use Zod for input validation.

### Adding a new AI CLI integration

1. Create service file in `lib/services/cli/<name>.ts`.
2. Add model constants in `lib/constants/<name>Models.ts`.
3. Register in `lib/utils/cliOptions.ts`.
4. Add CLI type to shared types in `types/shared/cli.ts`.

### Modifying the database schema

1. Edit `prisma/schema.prisma`.
2. Run `npm run prisma:generate` then `npm run prisma:push`.
3. Update affected service files and types.

## Security Audit (2026-02-14)

### Known Issues

**Critical:**
- **No authentication on API routes.** All endpoints are unprotected. Add auth middleware before any public deployment.
- **No authorization checks.** No validation that a requester owns the `project_id` they are accessing.
- **Plain-text token endpoint.** `/api/tokens/internal/<provider>/token` returns unencrypted service tokens without auth (`app/api/tokens/[...segments]/route.ts:46-52`).
- **Encryption key fallback.** `lib/crypto.ts:4` generates a random key if `ENCRYPTION_KEY` is unset -- encrypted data is lost on restart. Require the env var instead.

**High:**
- **Path traversal in asset endpoint.** `app/api/assets/[project_id]/[filename]/route.ts:52` does not validate `[filename]`; `../` sequences allow reading arbitrary files. Use `path.basename()` or `resolveSafePath()` from `lib/services/file-browser.ts`.
- **Missing security headers.** `next.config.js` has no CSP, HSTS, X-Frame-Options, or X-Content-Type-Options.
- **No CSRF protection.** State-changing endpoints lack CSRF tokens.
- **Unsanitized GitHub data in git commands.** `lib/services/github.ts:200,240` embeds `user.login` and tokens in remote URLs without validation. `lib/services/github.ts:194-195` passes `user.name`/`user.email` to `git config` unsanitized.
- **Error message leakage.** API routes return `error.message` to clients, exposing internal details.

**Medium:**
- `exec()` used instead of `spawn()` for CLI version checks (`app/api/settings/cli-status/route.ts:47,68,90`).
- `shell: true` on Windows for preview server spawn (`lib/services/preview.ts:549-554`).
- AES-256-CBC without authentication; consider AES-256-GCM (`lib/crypto.ts`).
- Sensitive data may appear in console logs (60+ `console.error`/`console.warn` calls across services).

### Secure Patterns Already In Place
- No hardcoded secrets; all credentials loaded from env vars or encrypted database.
- `.env` files properly gitignored.
- `lib/services/file-browser.ts` has robust `resolveSafePath()` with symlink filtering -- use this pattern for all file access.
- `highlight.js` + `escapeHtml()` fallback mitigates XSS in code rendering.
- Production source maps disabled.

### Security Guidelines for Contributors
- **Always validate file paths** using `resolveSafePath()` from `lib/services/file-browser.ts` before any fs operation with user-controlled input.
- **Use `spawn()` with array args**, never `exec()` with string interpolation.
- **Never embed credentials in URLs** or command strings; use environment variables or credential helpers.
- **Sanitize error responses** -- return generic messages to clients, log details server-side only.
- **Add Zod validation** at every API boundary for request bodies and query params.
- **Never set `shell: true`** in `spawn()` unless absolutely required.

## OpenClaw Subsystem

OpenClaw is an autonomous agent framework embedded in this repo at `openclaw/`. It treats Claudable as one tool among many (Docker, Git, Filesystem), and can orchestrate them together to complete complex tasks.

**The dependency is one-directional:** OpenClaw imports nothing from Claudable's codebase. It interacts with Claudable exclusively via HTTP API calls and direct filesystem access to `data/projects/`. Claudable has zero references to OpenClaw.

### OpenClaw Architecture

```
CLI (openclaw/cli.ts)
  Parses commands, handles interactive permission prompts
        |
OpenClaw Agent (openclaw/index.ts)
  Creates orchestrator, registers tools, loads plugins
        |
Orchestrator (openclaw/agent/orchestrator.ts)
  Task management, tool selection (intent -> capability -> tool routing),
  permission-checked execution, audit logging
        |
    +---+---+---+
    |   |   |   |
  Tools (openclaw/tools/)
    claudable.ts  -- Dual-path: API for AI generation, direct I/O for file edits
    docker.ts     -- Container lifecycle via spawn (no shell=true)
    filesystem.ts -- Read/write/list/delete with path traversal protection
    git.ts        -- Git operations via spawn with array args
```

### OpenClaw File Inventory

```
openclaw/
  types.ts            # Core type definitions (OpenClawTool, Task, AgentState, Config)
  index.ts            # Main export: OpenClaw class, tool registration, plugin loading
  cli.ts              # CLI entry point: commands (tools, status, run, generate, write, logs)
  config.ts           # Default config, env var overrides, Claudable integration toggle
  agent/
    orchestrator.ts   # Decision engine: task mgmt, tool selection, permission-checked execution
    permissions.ts    # Three-level permission system (allow/prompt/deny) with session memory
    audit.ts          # JSON-lines audit logger with secret redaction, batched writes
  tools/
    registry.ts       # Singleton tool registry, capability-based discovery
    claudable.ts      # Claudable integration: API calls + direct file I/O with path safety
    docker.ts         # Docker CLI wrapper using spawn (no shell injection)
    filesystem.ts     # Direct file ops scoped to work directory with traversal protection
    git.ts            # Git CLI wrapper using spawn with array args
```

### How OpenClaw Connects to Claudable

| Path | Mechanism | Use Case |
|------|-----------|----------|
| API path | HTTP to `localhost:3000/api/chat/{id}/act` | AI-powered code generation |
| API path | HTTP to `localhost:3000/api/projects` | Project CRUD, listing |
| Direct I/O | Filesystem to `data/projects/{id}/` | Surgical file reads/writes (bypasses AI) |

**Configuration:** `openclaw/config.ts` auto-detects Claudable when running inside this repo. Set `OPENCLAW_STANDALONE=1` to disable Claudable integration.

### OpenClaw CLI Commands

```bash
openclaw tools                           # List registered tools and availability
openclaw status                          # Show agent state and recent activity
openclaw run <tool> <action> '<json>'    # Run a tool action directly
openclaw generate <projectId> "prompt"   # Generate code via Claudable AI
openclaw write <projectId> <file>        # Write stdin to a project file
openclaw logs [count]                    # Show recent audit log entries

# Flags:
#   --yes, -y    Auto-approve permission prompts (for CI/CD)
#   --quiet, -q  Suppress non-essential output
```

### OpenClaw Tool vs Skill Decision Guide

When adding new integrations, use this classification:

**Make it a Tool when:**
- It talks to something external (an API, service, or runtime)
- It could be swapped for an alternative
- It has its own lifecycle (needs to be running, has config)
- The community might want to replace it

**Make it a Skill (native CLI command) when:**
- It's about OpenClaw itself (status, config, help)
- It orchestrates multiple tools together
- Every user needs it regardless of which tools they have
- It doesn't depend on any external service

### OpenClaw Shared Resources

- **Data directory:** Both Claudable and OpenClaw default to `data/projects/`. This is intentional -- OpenClaw's direct I/O path reads/writes the same files Claudable manages.
- **Port:** OpenClaw defaults to `localhost:3000` for Claudable's API (configurable via `CLAUDABLE_URL` or `CLAUDABLE_PORT`).
- **Audit logs:** Written to `data/logs/openclaw-YYYY-MM-DD.jsonl`.

## Compatibility Notes: Claudable + OpenClaw

### TypeScript
- OpenClaw files are included in `tsconfig.json` via the `**/*.ts` glob pattern. They are NOT excluded.
- OpenClaw's Node.js-specific code (`process`, `Buffer`, `__dirname`, `spawn`, `fs/promises`) requires `@types/node` from devDependencies.
- **Known issue:** `openclaw/config.ts` uses `__dirname`, which is not available in ESM (`"module": "esnext"` in tsconfig). This works at runtime when transpiled by Next.js for server-side execution, but is a type-check concern. A future fix could use `import.meta.url` + `fileURLToPath` or a separate tsconfig for the OpenClaw CLI.

### Build & Dependency
- OpenClaw has no additional dependencies beyond what's in `package.json`. It uses Node.js built-ins (`fs`, `path`, `child_process`, `readline`) and the global `fetch` API (Node 18+).
- The OpenClaw CLI is not yet wired into `package.json` scripts. To run it, you'd need to compile it separately or use `ts-node`/`tsx`.

### Race Conditions
- Claudable and OpenClaw can both write to `data/projects/{id}/` simultaneously. There is no file locking. Avoid running OpenClaw `direct-write` operations while Claudable's AI agent is actively modifying the same project.

## Security Audit (2026-02-16)

### Claudable -- Known Issues (carried forward from 2026-02-14)

**Critical:**
- **No authentication on API routes.** All endpoints are unprotected. Add auth middleware before any public deployment.
- **No authorization checks.** No validation that a requester owns the `project_id` they are accessing.
- **Plain-text token endpoint.** `/api/tokens/internal/<provider>/token` returns unencrypted service tokens without auth (`app/api/tokens/[...segments]/route.ts:46-52`).
- **Encryption key fallback.** `lib/crypto.ts:4` generates a random key if `ENCRYPTION_KEY` is unset -- encrypted data is lost on restart. Require the env var instead.

**High:**
- **Path traversal in asset endpoint.** `app/api/assets/[project_id]/[filename]/route.ts:52` does not validate `[filename]`; `../` sequences allow reading arbitrary files. Use `path.basename()` or `resolveSafePath()` from `lib/services/file-browser.ts`.
- **Missing security headers.** `next.config.js` has no CSP, HSTS, X-Frame-Options, or X-Content-Type-Options.
- **No CSRF protection.** State-changing endpoints lack CSRF tokens.
- **Unsanitized GitHub data in git commands.** `lib/services/github.ts:200,240` embeds `user.login` and tokens in remote URLs without validation. `lib/services/github.ts:194-195` passes `user.name`/`user.email` to `git config` unsanitized.
- **Error message leakage.** API routes return `error.message` to clients, exposing internal details.

**Medium:**
- `exec()` used instead of `spawn()` for CLI version checks (`app/api/settings/cli-status/route.ts:47,68,90`).
- `shell: true` on Windows for preview server spawn (`lib/services/preview.ts:549-554`).
- AES-256-CBC without authentication; consider AES-256-GCM (`lib/crypto.ts`).
- Sensitive data may appear in console logs (60+ `console.error`/`console.warn` calls across services).

### OpenClaw -- New Issues (2026-02-16)

**High:**
- **Dynamic import from env var.** `openclaw/index.ts:110` uses `await import(pluginPath)` where paths come from `OPENCLAW_PLUGINS` env var. An attacker who controls that env var can execute arbitrary code. Document that this env var must be trusted, or validate paths against an allowlist.
- **Session wildcard approval bug.** `openclaw/agent/permissions.ts:132-134` -- `approveToolForSession(tool)` stores `tool:*` in the session approvals set, but `check()` at line 102 only looks for exact `tool:action` matches. The wildcard is stored but never matched. Wildcard session approvals silently fail.
- **Silent permission bypass.** `openclaw/agent/orchestrator.ts:231` -- when `permCheck.level === 'prompt'` but no `promptFn` is provided, the action silently proceeds. In non-interactive contexts without `autoApprove`, dangerous actions execute without confirmation.
- **No timeout on Claudable health check.** `openclaw/tools/claudable.ts:87-92` -- `isAvailable()` calls `fetch()` without a timeout or `AbortController`. If Claudable is unreachable, this hangs indefinitely, blocking all tool availability checks.

**Medium:**
- **Incomplete secret redaction in audit logs.** `openclaw/agent/audit.ts:40-53` -- `redactParams()` recurses into objects but does not handle arrays of objects. E.g., `{ configs: [{ token: "secret" }] }` would log the token in plaintext.
- **Unvalidated log level.** `openclaw/config.ts:22` casts `OPENCLAW_LOG_LEVEL` env var directly to the config type without validation. Invalid values pass through silently.
- **`__dirname` in ESM context.** `openclaw/config.ts:10` uses `__dirname` which is not available in ES modules. Works when transpiled by Next.js but will fail if the CLI is run directly with ESM-native tooling.
- **No projectId validation in tool layer.** `openclaw/tools/claudable.ts` uses `projectId` in URL paths (`/api/chat/${projectId}/act`) without validating the format. The CLI validates it, but programmatic use of the tool could inject URL path segments.
- **Dead code.** `openclaw/tools/filesystem.ts` defines `SearchParams` interface (line 42-45) but has no `search` action handler.
- **Signal handler doesn't await shutdown.** `openclaw/cli.ts:281-282` -- `process.on('SIGINT', () => { shutdown(); })` calls async `shutdown()` without awaiting it. Audit logs may not flush before exit.

**Low:**
- **Symlink traversal in filesystem tool.** `openclaw/tools/filesystem.ts` -- `handleList()` lists directory entries but does not resolve symlinks. Symlinks pointing outside the work directory would be listed (names visible), though content access is still gated by `safePath()`.
- **Recursive delete without confirmation depth.** `openclaw/tools/filesystem.ts:163` -- `fs.rm(fullPath, { recursive: true })` is gated by the permission system's `prompt` level, but there's no additional safeguard for deeply nested directories.

### Claudable -- Secure Patterns Already In Place
- No hardcoded secrets; all credentials loaded from env vars or encrypted database.
- `.env` files properly gitignored.
- `lib/services/file-browser.ts` has robust `resolveSafePath()` with symlink filtering -- use this pattern for all file access.
- `highlight.js` + `escapeHtml()` fallback mitigates XSS in code rendering.
- Production source maps disabled.

### OpenClaw -- Secure Patterns In Place
- **No shell injection.** All subprocess execution (Docker, Git) uses `spawn()` with array arguments. No `shell: true`, no string interpolation.
- **Path traversal protection.** Both `claudable.ts` and `filesystem.ts` implement `safePath()` that validates resolved paths stay within their root directory.
- **Permission system.** Three-level (allow/prompt/deny) with sensible defaults: read-only ops are auto-allowed, writes and destructive ops require confirmation.
- **Audit logging.** Every tool action is logged with timestamp, tool, action, permission level, success/failure, and duration. Sensitive params are redacted.
- **Input validation at CLI boundary.** `validateProjectId()` restricts to alphanumeric + dashes/underscores. `validateFilePath()` rejects control characters.
- **No hardcoded secrets.** All configuration via environment variables.

### Security Guidelines for Contributors
- **Always validate file paths** using `resolveSafePath()` from `lib/services/file-browser.ts` (Claudable) or the `safePath()` pattern in OpenClaw tools before any fs operation with user-controlled input.
- **Use `spawn()` with array args**, never `exec()` with string interpolation.
- **Never embed credentials in URLs** or command strings; use environment variables or credential helpers.
- **Sanitize error responses** -- return generic messages to clients, log details server-side only.
- **Add Zod validation** at every API boundary for request bodies and query params.
- **Never set `shell: true`** in `spawn()` unless absolutely required.
- **Validate all env var inputs** before casting to typed config values.
- **Add timeouts to all `fetch()` calls** using `AbortController` with a reasonable deadline.

## Stability Status (2026-02-16)

### Build Health
- **`npm run type-check`:** Fails due to missing `node_modules/` (dependencies not installed). All errors are dependency-resolution failures (`@types/node`, `@prisma/client`, `next`, `react`, etc.), not code bugs. After `npm install && npm run prisma:generate`, the remaining issue to address is `openclaw/config.ts:10` (`__dirname` unavailable in ESM context).
- **`npm run lint`:** Fails because `next` CLI is not installed (no `node_modules/`). Not a code issue.
- **OpenClaw code quality:** All 12 files (2,322 lines) follow the project's conventions: TypeScript strict, spawn-over-exec, path validation, error handling with context prefixes.

### Known Stability Risks
- **No file locking on `data/projects/`.** Concurrent Claudable + OpenClaw writes can corrupt files.
- **No retry logic in OpenClaw tool execution.** If Claudable's API or Docker is temporarily unavailable, actions fail immediately with no retry.
- **Audit log flush on crash.** Buffered audit entries may be lost if the process crashes between flushes (5-second interval).

## Important Notes

- The project generates and manages child Next.js projects in `data/projects/`. This directory is gitignored.
- Electron entry point is `index.js` at the root, which loads `electron/main.js`.
- Icon libraries (react-icons/fa, si, vsc) use stubs in `stubs/` to reduce bundle size -- actual icons are re-exported there.
- The `pages/` directory exists for legacy API route fallbacks but the primary routing uses the App Router in `app/`.
- OpenClaw audit logs are written to `data/logs/` as JSON-lines files. This directory is auto-created on first use.
