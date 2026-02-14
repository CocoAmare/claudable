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

## Important Notes

- The project generates and manages child Next.js projects in `data/projects/`. This directory is gitignored.
- Electron entry point is `index.js` at the root, which loads `electron/main.js`.
- Icon libraries (react-icons/fa, si, vsc) use stubs in `stubs/` to reduce bundle size -- actual icons are re-exported there.
- The `pages/` directory exists for legacy API route fallbacks but the primary routing uses the App Router in `app/`.
