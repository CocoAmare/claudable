# CLAUDE.md

This file provides guidance for AI assistants working on the Claudable codebase.

## Project Overview

Claudable is an AI-powered web application builder (v2.0.0) that lets users create Next.js apps using natural language. It integrates multiple AI coding agents (Claude Code, Cursor, Codex, Qwen, GLM) and provides project management, deployment, and version control through a unified interface. It runs as both a web app and an Electron desktop app.

## Tech Stack

- **Framework**: Next.js 15 (App Router) with React 19
- **Language**: TypeScript (strict mode, target ES2020)
- **Database**: SQLite via Prisma ORM (stored at `./data/cc.db`)
- **Styling**: Tailwind CSS 3 with dark mode (`class` strategy)
- **Real-time**: WebSocket (ws) for streaming AI responses
- **Desktop**: Electron 39 with electron-builder
- **AI SDK**: @anthropic-ai/claude-agent-sdk

## Common Commands

```bash
npm run dev              # Start web dev server (auto port detection)
npm run build            # Next.js production build
npm run lint             # ESLint (next/core-web-vitals)
npm run type-check       # TypeScript type checking (tsc --noEmit)
npm run setup            # Full setup: install + prisma generate + db push
npm run prisma:generate  # Regenerate Prisma client after schema changes
npm run prisma:push      # Push schema changes to database
npm run prisma:studio    # Open Prisma Studio GUI
npm run dev:desktop      # Electron desktop dev mode
npm run build:desktop    # Build desktop app with electron-builder
```

**Requirements**: Node.js >=20.0.0, npm >=10.0.0

## Architecture

### Directory Structure

```
app/                     # Next.js App Router
  api/                   # REST API routes
    chat/                # Chat messaging endpoints
    projects/            # Project CRUD
    env/                 # Environment variable management
    github/              # GitHub integration
    vercel/              # Vercel deployment
    supabase/            # Database integration
    assets/              # Asset management
    repo/                # Repository browser
    tokens/              # Service token management
    settings/            # Global settings
  page.tsx               # Main page (project list, chat, settings)
  layout.tsx             # Root layout
  globals.css            # Global styles

components/              # React UI components
  chat/                  # Chat interface components
  modals/                # Modal dialogs
  settings/              # Settings UI
  layout/                # Layout components

lib/                     # Core business logic
  services/              # Service layer (primary business logic)
    cli/                 # CLI integrations per agent
      claude.ts          # Claude Code via Agent SDK
      cursor.ts          # Cursor CLI
      codex.ts           # OpenAI Codex CLI
      glm.ts             # Zhipu GLM CLI
      qwen.ts            # Alibaba Qwen CLI
    project.ts           # Project management
    chat-sessions.ts     # Chat session handling
    message.ts           # Message CRUD
    git.ts               # Git operations
    github.ts            # GitHub API integration
    vercel.ts            # Vercel deployment
    supabase.ts          # Supabase integration
    preview.ts           # Dev server lifecycle management
    env.ts               # Env var management (AES-256 encrypted)
    file-browser.ts      # File system browsing
    tokens.ts            # Service token management
    user-requests.ts     # User request tracking
  db/
    client.ts            # Prisma client singleton
  constants/             # Model definitions per CLI
  utils/                 # Utility functions
  server/
    websocket-manager.ts # WebSocket connection management
  motion.ts              # Framer Motion animation utilities

types/                   # TypeScript type definitions
  shared/                # Types used by both client and server
  backend/               # Server-only types
  client/                # Client-only types
  cli.ts                 # CLI type definitions
  realtime.ts            # WebSocket/real-time types

hooks/                   # Custom React hooks
  useCLI.ts              # CLI status management
  useWebSocket.ts        # WebSocket connection hook
  useUserRequests.ts     # User request tracking

contexts/                # React Context providers
  AuthContext.tsx
  GlobalSettingsContext.tsx

prisma/
  schema.prisma          # Database schema (SQLite)

scripts/                 # Utility scripts
  run-web.js             # Dev server launcher (port detection, prisma sync)
  run-desktop.js         # Electron launcher
  setup-env.js           # Environment bootstrapper
  check-claude-cli.js    # CLI availability checker

electron/                # Electron desktop app
  main.js                # Main process
  preload.js             # Preload script

stubs/                   # Module stubs for react-icons subpackages
```

### Key Architectural Patterns

1. **Layered architecture**: API routes → Services → Prisma DB. Business logic lives in `lib/services/`, not in API routes.
2. **CLI abstraction**: Each AI agent has its own service in `lib/services/cli/`. They share common interfaces defined in `types/cli.ts` and `types/shared/cli.ts`.
3. **Project-centric model**: Everything (messages, sessions, env vars, service connections) belongs to a Project via foreign keys.
4. **Real-time streaming**: WebSocket manager in `lib/server/websocket-manager.ts` streams AI responses and tool outputs to the frontend.
5. **Prisma singleton**: `lib/db/client.ts` provides a single Prisma client instance to avoid connection exhaustion in dev mode.

### Database Schema

Core models in `prisma/schema.prisma`:

- **Project** - App projects with CLI preferences, model selection, service connections
- **Message** - Chat messages with role, content, metadata, performance tracking
- **Session** - AI session tracking (chat, code generation, error fixing)
- **ProjectServiceConnection** - GitHub/Vercel/Supabase integration data (JSON)
- **EnvVar** - Environment variables (AES-256 encrypted values)
- **Commit** - Git commit history per project
- **ToolUsage** - Tool execution tracking (name, input, output, duration)
- **UserRequest** - User request lifecycle tracking
- **ServiceToken** - API tokens for external services (local dev only)

After modifying `prisma/schema.prisma`, run `npm run prisma:generate && npm run prisma:push`.

## Path Aliases

Defined in `tsconfig.json`:

- `@/*` → project root
- `@/types/shared/*` → `types/shared/*`
- `@/types/client/*` → `types/client/*`
- `@/types/server/*` → `types/server/*`
- `@/types/backend/*` → `types/backend/*`
- `react-icons/fa`, `react-icons/si`, `react-icons/vsc` → stub modules in `stubs/`

## Code Conventions

- **TypeScript strict mode** is enabled. All code must pass `tsc --noEmit`.
- **ESLint** uses `next/core-web-vitals` config. Run `npm run lint` before committing.
- **Prettier** is installed (defaults). No custom `.prettierrc` config.
- **Tailwind CSS** for styling. Custom colors use `brand-*` and `bolt-*` prefixes.
- **Dark mode** is implemented via the `class` strategy on the root element.
- **API routes** use the Next.js 15 App Router convention (`app/api/.../route.ts`).
- **React Server Components** are the default; client components use `"use client"` directive.
- **IDs** use CUID format (`@default(cuid())` in Prisma).
- **Database column mapping** uses snake_case (`@map("snake_case")`) while model fields are camelCase.
- **Environment variables** for projects are encrypted with AES-256 before storage.
- No automated test suite exists. No CI/CD pipelines are configured.

## Port Conventions

- **Web server**: port 3000 (default), auto-detected to avoid conflicts
- **Preview servers** (user projects): ports 3100-3999, managed by `lib/services/preview.ts`

## Important Files

- `app/page.tsx` - Main application page (large file ~1280 lines; project list, chat, settings)
- `lib/services/preview.ts` - Dev server lifecycle management (largest service ~27KB)
- `lib/services/cli/claude.ts` - Claude Agent SDK integration
- `lib/server/websocket-manager.ts` - WebSocket real-time communication
- `lib/services/env.ts` - Environment variable encryption/decryption
- `scripts/run-web.js` - Dev server entry point with auto-setup
- `prisma/schema.prisma` - Single source of truth for database schema

## Things to Avoid

- Do not import server-only modules (`fs`, `path`, `os`, `child_process`, Prisma) in client components. The webpack config in `next.config.js` sets these to `false` for client bundles.
- Do not store plain-text secrets in the database. Use the encryption utilities in `lib/services/env.ts`.
- Do not hardcode ports. Use the port utilities in `lib/utils/ports.ts`.
- The `data/` directory (database, project files) and `node_modules/` are gitignored. Never commit them.
- The `assets/` directory contains large demo GIF files (~134MB). Avoid adding more large binary files.
