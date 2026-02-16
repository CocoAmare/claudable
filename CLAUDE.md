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

## Security Audit (2026-02-14, updated 2026-02-16)

### Claudable -- Issues Found 2026-02-14 (resolved 2026-02-16)

**Critical (all fixed):**
- ~~**No authentication on API routes.**~~ Fixed: `middleware.ts` provides opt-in auth via `AUTH_SECRET` env var. `lib/auth.ts` provides `requireAuth()` helper with HMAC-signed session tokens. CSRF protection via Origin header validation is always on.
- ~~**No authorization checks.**~~ Partially addressed: Auth framework is in place. Full per-project ownership checks require a user model (deferred -- tracked as open item).
- ~~**Plain-text token endpoint.**~~ Fixed: `middleware.ts` restricts `/api/tokens/internal/*/token` to localhost-only requests.
- ~~**Encryption key fallback.**~~ Fixed: `lib/crypto.ts` throws in production if `ENCRYPTION_KEY` is unset. In development, uses a deterministic fallback (data survives restarts but warns loudly).

**High (all fixed):**
- ~~**Path traversal in asset endpoint.**~~ Fixed: `app/api/assets/[project_id]/[filename]/route.ts` uses `path.basename()` to strip directory components and validates the resolved path stays within the assets directory.
- ~~**Missing security headers.**~~ Fixed: `next.config.js` `headers()` and `middleware.ts` both set X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, and Permissions-Policy.
- ~~**No CSRF protection.**~~ Fixed: `middleware.ts` validates Origin header on all POST/PUT/DELETE API requests. Mismatched origins are rejected with 403.
- ~~**Unsanitized GitHub data in git commands.**~~ Fixed: `lib/services/github.ts` sanitizes `user.name`/`user.email` via `sanitizeGitConfigValue()` (strips control chars, limits length). Credentials in URLs are encoded via `encodeURIComponent()` through `buildAuthenticatedUrl()`.
- ~~**Error message leakage.**~~ Fixed: All 37+ API routes now return generic error messages to clients. `handleApiError()` in `lib/utils/api-response.ts` logs full details server-side only.

**Medium (all fixed):**
- ~~**`exec()` for CLI version checks.**~~ Fixed: `app/api/settings/cli-status/route.ts` now uses `spawnSync()` with array arguments and a 10-second timeout.
- ~~**`shell: true` on Windows.**~~ Documented: `lib/services/preview.ts` retains `shell: true` on Windows (required for `.cmd` executables). Comments explain safety rationale: constant commands, array args, no user input.
- ~~**AES-256-CBC without authentication.**~~ Fixed: `lib/crypto.ts` now uses AES-256-GCM for new encryptions. Legacy CBC data is still decryptable (backward-compatible migration).
- ~~**Silent force push fallback.**~~ Fixed: `lib/services/git.ts` `pushToRemote()` no longer silently falls back to `--force` on push failure.

### Open Items (deferred)
- **Per-project authorization.** Auth framework is ready but per-project ownership requires a user model. Track as a feature when multi-user support is added.
- **Console log audit.** 60+ `console.error`/`console.warn` calls across services. Most are safe, but a structured logger would allow filtering by environment.

### Secure Patterns Already In Place
- No hardcoded secrets; all credentials loaded from env vars or encrypted database.
- `.env` files properly gitignored.
- `lib/services/file-browser.ts` has robust `resolveSafePath()` with symlink filtering -- use this pattern for all file access.
- `highlight.js` + `escapeHtml()` fallback mitigates XSS in code rendering.
- Production source maps disabled.
- `middleware.ts` adds security headers to all responses and validates CSRF on state-changing requests.
- `lib/auth.ts` provides HMAC-signed session tokens with 24-hour expiry and constant-time comparison.
- `lib/crypto.ts` uses AES-256-GCM (authenticated encryption) with backward-compatible CBC decryption.

### Security Guidelines for Contributors
- **Always validate file paths** using `resolveSafePath()` from `lib/services/file-browser.ts` before any fs operation with user-controlled input.
- **Use `spawn()` with array args**, never `exec()` with string interpolation.
- **Never embed credentials in URLs** or command strings; use `encodeURIComponent()` or credential helpers.
- **Sanitize error responses** -- return generic messages to clients, log details server-side only. Use `handleApiError()` from `lib/utils/api-response.ts`.
- **Add Zod validation** at every API boundary for request bodies and query params.
- **Never set `shell: true`** in `spawn()` unless absolutely required (Windows `.cmd` files only).
- **Validate all env var inputs** before casting to typed config values.
- **Set `AUTH_SECRET`** in production to enable authentication on all API routes.

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
    docker.ts     -- Multi-host container orchestration with resource limits and health monitoring
    filesystem.ts -- Read/write/list/delete with path traversal protection
    git.ts        -- Git operations via spawn with array args
```

### OpenClaw File Inventory

```
openclaw/
  types.ts            # Core types: tools, tasks, config, Docker orchestration (RemoteDockerHost, ResourceLimits, etc.)
  index.ts            # Main export: OpenClaw class, tool registration, plugin loading
  cli.ts              # CLI entry point: commands (tools, status, doctor, run, generate, write, logs)
  config.ts           # Default config, env var overrides, remote Docker host parsing, resource limit parsing
  agent/
    orchestrator.ts   # Decision engine: task mgmt, tool selection, permission-checked execution
    permissions.ts    # Three-level permission system (allow/prompt/deny) with session memory
    audit.ts          # JSON-lines audit logger with secret redaction, batched writes
  tools/
    registry.ts       # Singleton tool registry, capability-based discovery
    claudable.ts      # Claudable integration: API calls + direct file I/O with path safety
    docker.ts         # Multi-host Docker orchestration: remote hosts, resource limits, health, stats
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

### OpenClaw Docker Orchestration

OpenClaw supports multi-host Docker orchestration for setups like Proxmox where Docker runs in dedicated VMs. The Docker tool can target remote Docker hosts over TCP with optional TLS mutual auth, and enforces resource limits on all containers.

OpenClaw operates two distinct Docker layers:

**1. Sandbox (internal):** OpenClaw's private Docker ecosystem for disposable workloads -- plugin sandboxing, temp builds, test environments. Containers are ephemeral, resource-limited, and auto-cleaned. Runs either as Docker-in-Docker (DinD) or via label-based isolation on the local daemon.

**2. External (infrastructure):** Remote Docker hosts that run real services -- Claudable, project previews, persistent workloads. These live on Proxmox VMs or other dedicated Docker hosts, accessed over TCP.

**Architecture (dual-layer Docker):**

```
Host / Proxmox Hypervisor
  |
  +-- VM: OpenClaw Brain
  |     [OpenClaw Agent Container]
  |       - Internal sandbox daemon (DinD) OR local Docker with label isolation
  |       - Orchestrates external hosts via Docker API (TCP)
  |       - Permission checks on every action
  |       - Audit logs all container operations
  |       |
  |       +-- [Sandbox Containers]  -- plugin isolation, temp builds (ephemeral)
  |             Labeled: openclaw.sandbox=true
  |             Network: openclaw-sandbox (isolated)
  |             Limits: 256MB / 0.5 CPU default
  |
  +-- VM: Docker Workers (dedicated to OpenClaw)
  |     [Claudable Container]   -- AI code generation
  |     [Project Preview]       -- Live preview servers
  |     [Plugin Containers]     -- Community tool plugins
  |
  +-- VM: Other workloads (isolated from OpenClaw)
```

**Three layers of control:**

1. **OpenClaw permissions** -- what actions are allowed (software layer, `permissions.ts`)
2. **Docker resource limits** -- how much any container can consume (`--memory`, `--cpus`)
3. **Proxmox VM isolation** -- blast radius containment (hardware layer)

**Environment variables:**

| Variable | Format | Example |
|----------|--------|---------|
| `OPENCLAW_DOCKER_HOSTS` | `name=url,name2=url2` or `name=url;tlsCert=path;tlsKey=path;tlsCa=path` | `worker=tcp://192.168.1.50:2376` |
| `OPENCLAW_DOCKER_LIMITS` | `memoryMb=N,cpus=N,restartPolicy=policy` | `memoryMb=512,cpus=1.0,restartPolicy=unless-stopped` |
| `OPENCLAW_SANDBOX` | `mode=local\|dind,socket=path,network=name,maxContainers=N` | `mode=local,network=openclaw-sandbox,maxContainers=10` |
| `OPENCLAW_SANDBOX_LIMITS` | Same format as `OPENCLAW_DOCKER_LIMITS` | `memoryMb=256,cpus=0.5,restartPolicy=no` |
| `DOCKER_HOST` | Standard Docker env var | `tcp://192.168.1.50:2376` |

**Docker tool actions:**

| Action | Permission | Description |
|--------|-----------|-------------|
| `ps` | allow | List running containers (supports `host` param) |
| `health` | allow | Check container health status |
| `stats` | allow | Resource usage snapshot (CPU, memory, I/O) |
| `hosts` | allow | List all configured Docker hosts (local + remote + sandbox) |
| `sandbox-ps` | allow | List sandbox containers |
| `run` | prompt | Start a container (with resource limits + host targeting) |
| `build` | prompt | Build a Docker image |
| `container-action` | prompt | Stop, remove, inspect, or tail logs |
| `sandbox-run` | prompt | Start a sandbox container (auto-labeled, auto-limited, isolated network) |
| `sandbox-cleanup` | prompt | Remove sandbox containers (stopped by default, `force=true` for running) |
| `doctor` | allow | Docker-specific diagnostics (daemon, hosts, sandbox, limits) |

### OpenClaw CLI Commands

```bash
openclaw tools                           # List registered tools and availability
openclaw status                          # Show agent state and recent activity
openclaw doctor                          # Run environment diagnostics (tools, hosts, limits)
openclaw doctor --fix                    # Diagnose and auto-fix what it can (create dirs, networks)
openclaw run <tool> <action> '<json>'    # Run a tool action directly
openclaw generate <projectId> "prompt"   # Generate code via Claudable AI
openclaw write <projectId> <file>        # Write stdin to a project file
openclaw logs [count]                    # Show recent audit log entries

# Docker subcommands (shorthand -- no need for `run docker`):
openclaw docker doctor                                     # Docker-specific diagnostics
openclaw docker ps                                         # List containers (local)
openclaw docker ps '{"host": "proxmox-worker"}'            # List containers on remote host
openclaw docker health '{"container": "my-app"}'           # Container health check
openclaw docker stats                                      # Resource usage for all containers
openclaw docker hosts                                      # List configured Docker hosts

# Docker-specific actions (via `run` -- equivalent to above):
openclaw run docker ps '{}'                                # List containers (local)
openclaw run docker run '{"image":"node:20","host":"proxmox-worker","limits":{"memoryMb":512,"cpus":1}}'

# Sandbox actions (OpenClaw's private Docker ecosystem):
openclaw run docker sandbox-run '{"image":"node:20"}'      # Run in sandbox (auto-limited, auto-cleanup)
openclaw run docker sandbox-ps '{}'                        # List sandbox containers
openclaw run docker sandbox-cleanup '{}'                   # Remove stopped sandbox containers
openclaw run docker sandbox-cleanup '{"force": true}'      # Remove ALL sandbox containers

# Flags:
#   --yes, -y    Auto-approve permission prompts (for CI/CD)
#   --quiet, -q  Suppress non-essential output
#   --fix        Auto-fix issues found by doctor
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
- **Docker socket:** Local Docker uses `/var/run/docker.sock`. Remote hosts use TCP (`OPENCLAW_DOCKER_HOSTS`). TLS mutual auth is supported for secure remote connections.
- **Audit logs:** Written to `data/logs/openclaw-YYYY-MM-DD.jsonl`.

## Compatibility Notes: Claudable + OpenClaw

### TypeScript
- OpenClaw files are included in `tsconfig.json` via the `**/*.ts` glob pattern. They are NOT excluded.
- OpenClaw's Node.js-specific code (`process`, `Buffer`, `__dirname`, `spawn`, `fs/promises`) requires `@types/node` from devDependencies.
- `openclaw/config.ts` uses a CJS/ESM dual-compatible pattern for `__dirname` resolution (`typeof __dirname !== 'undefined'` fallback to `import.meta.url`), so it works in both Next.js transpiled and ESM-native contexts.

### Build & Dependency
- OpenClaw has no additional dependencies beyond what's in `package.json`. It uses Node.js built-ins (`fs`, `path`, `child_process`, `readline`) and the global `fetch` API (Node 18+).
- The OpenClaw CLI is not yet wired into `package.json` scripts. To run it, you'd need to compile it separately or use `ts-node`/`tsx`.

### Race Conditions
- Claudable and OpenClaw can both write to `data/projects/{id}/` simultaneously. There is no file locking. Avoid running OpenClaw `direct-write` operations while Claudable's AI agent is actively modifying the same project.

## Security Audit (2026-02-16)

### Claudable -- Issues (carried forward from 2026-02-14, all resolved 2026-02-16)

See "Security Audit (2026-02-14, updated 2026-02-16)" above for detailed fix descriptions.

### OpenClaw -- Issues Found 2026-02-16 (all resolved)

**High (all fixed):**
- ~~**Dynamic import from env var.**~~ Fixed: `openclaw/index.ts` now validates plugin paths against an allowlist of allowed roots (work directory and `~/.openclaw/plugins/`). Paths outside these directories are rejected.
- ~~**Session wildcard approval bug.**~~ Fixed: `openclaw/agent/permissions.ts` `check()` now matches both exact `tool:action` keys and `tool:*` wildcard entries in session approvals.
- ~~**Silent permission bypass.**~~ Fixed: `openclaw/agent/orchestrator.ts` now denies prompt-level actions when no `promptFn` is available, instead of silently allowing them.
- ~~**No timeout on Claudable health check.**~~ Fixed: `openclaw/tools/claudable.ts` now uses `fetchWithTimeout()` with `AbortController` on all `fetch()` calls (5s for health checks, 30s for API calls).

**Medium (all fixed):**
- ~~**Incomplete secret redaction in audit logs.**~~ Fixed: `openclaw/agent/audit.ts` `redactParams()` now recurses into arrays of objects.
- ~~**Unvalidated log level.**~~ Fixed: `openclaw/config.ts` validates `OPENCLAW_LOG_LEVEL` against `['debug', 'info', 'warn', 'error']`, falls back to `'info'`.
- ~~**`__dirname` in ESM context.**~~ Fixed: `openclaw/config.ts` now uses a CJS/ESM dual-compatible pattern (`typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))`).
- ~~**No projectId validation in tool layer.**~~ Fixed: `openclaw/tools/claudable.ts` now validates `projectId` format (`/^[a-zA-Z0-9_-]+$/`) before using it in URL paths. All action handlers that accept a projectId now call `validateProjectId()`.
- ~~**Dead code.**~~ Fixed: Removed unused `SearchParams` interface from `openclaw/tools/filesystem.ts`.
- ~~**Signal handler doesn't await shutdown.**~~ Fixed: `openclaw/cli.ts` signal handlers now use `void shutdown()` with a double-shutdown guard to ensure audit logs flush before exit.

**Low (all fixed):**
- ~~**Symlink traversal in filesystem tool.**~~ Fixed: `openclaw/tools/filesystem.ts` `handleList()` now resolves symlinks via `realpath()` and hides entries that point outside the work directory.
- ~~**Recursive delete without confirmation depth.**~~ Fixed: `openclaw/tools/filesystem.ts` `handleDelete()` now refuses to delete the work directory root and uses `maxRetries: 0` to fail fast on locked files.

### Claudable -- Secure Patterns In Place
- No hardcoded secrets; all credentials loaded from env vars or encrypted database.
- `.env` files properly gitignored.
- `lib/services/file-browser.ts` has robust `resolveSafePath()` with symlink filtering -- use this pattern for all file access.
- `highlight.js` + `escapeHtml()` fallback mitigates XSS in code rendering.
- Production source maps disabled.
- `middleware.ts` adds security headers to all responses, validates CSRF on state-changing requests, restricts sensitive endpoints to localhost.
- `lib/auth.ts` provides HMAC-signed session tokens with 24-hour expiry and constant-time comparison.
- `lib/crypto.ts` uses AES-256-GCM (authenticated encryption) with backward-compatible CBC decryption for migration.
- All API error responses return generic messages; internal details logged server-side only.

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
- **`npm run type-check`:** Fails due to missing `node_modules/` (dependencies not installed). All errors are dependency-resolution failures (`@types/node`, `@prisma/client`, `next`, `react`, etc.), not code bugs. After `npm install && npm run prisma:generate`, type-check should pass cleanly.
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
