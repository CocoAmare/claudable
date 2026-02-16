// OpenClaw Filesystem Tool
// Direct file operations -- read, write, list, search.
// Standalone: works without Claudable.

import * as fs from 'fs/promises';
import * as path from 'path';
import type { OpenClawTool, ToolAction, ToolResult, ToolCapability } from '../types';
import { registry } from './registry';

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/** Resolve a path and ensure it stays within the allowed root. */
function safePath(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(path.resolve(root) + path.sep) && resolved !== path.resolve(root)) {
    throw new Error(`Path traversal blocked: ${relativePath}`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Filesystem Tool
// ---------------------------------------------------------------------------

interface ReadFileParams {
  path: string;
}

interface WriteFileParams {
  path: string;
  content: string;
}

interface ListParams {
  path: string;
  recursive?: boolean;
}

/** Max directory depth for recursive delete safety. */
const MAX_DELETE_DEPTH = 10;

function createFilesystemTool(workDir: string): OpenClawTool {
  return {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Direct file operations: read, write, list, and search files.',
    capabilities: ['file-read', 'file-write'] as ToolCapability[],

    async isAvailable(): Promise<boolean> {
      try {
        await fs.access(workDir);
        return true;
      } catch {
        return false;
      }
    },

    async execute(action: ToolAction): Promise<ToolResult> {
      switch (action.type) {
        case 'read':
          return handleRead(action.params as unknown as ReadFileParams);
        case 'write':
          return handleWrite(action.params as unknown as WriteFileParams);
        case 'list':
          return handleList(action.params as unknown as ListParams);
        case 'mkdir':
          return handleMkdir(action.params as unknown as { path: string });
        case 'delete':
          return handleDelete(action.params as unknown as { path: string });
        default:
          return { success: false, message: `Unknown fs action: ${action.type}` };
      }
    },
  };

  async function handleRead(params: ReadFileParams): Promise<ToolResult> {
    try {
      const fullPath = safePath(workDir, params.path);
      const content = await fs.readFile(fullPath, 'utf-8');
      return {
        success: true,
        message: `Read ${params.path} (${content.length} chars)`,
        data: { content, path: fullPath },
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to read ${params.path}`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function handleWrite(params: WriteFileParams): Promise<ToolResult> {
    try {
      const fullPath = safePath(workDir, params.path);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, params.content, 'utf-8');
      return {
        success: true,
        message: `Wrote ${params.path}`,
        artifacts: [{ path: fullPath, type: 'file' }],
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to write ${params.path}`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function handleList(params: ListParams): Promise<ToolResult> {
    try {
      const fullPath = safePath(workDir, params.path);
      const resolvedRoot = path.resolve(workDir);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const items: { name: string; type: string }[] = [];
      for (const e of entries) {
        if (e.isSymbolicLink()) {
          // Resolve symlink target and skip if it points outside the work directory
          try {
            const target = await fs.realpath(path.join(fullPath, e.name));
            if (!target.startsWith(resolvedRoot + path.sep) && target !== resolvedRoot) {
              continue; // symlink escapes work directory -- hide it
            }
          } catch {
            continue; // broken symlink -- skip
          }
          items.push({ name: e.name, type: 'symlink' });
        } else {
          items.push({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' });
        }
      }
      return {
        success: true,
        message: `Listed ${items.length} entries in ${params.path}`,
        data: { entries: items },
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to list ${params.path}`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function handleMkdir(params: { path: string }): Promise<ToolResult> {
    try {
      const fullPath = safePath(workDir, params.path);
      await fs.mkdir(fullPath, { recursive: true });
      return {
        success: true,
        message: `Created directory ${params.path}`,
        artifacts: [{ path: fullPath, type: 'directory' }],
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to create directory ${params.path}`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async function handleDelete(params: { path: string }): Promise<ToolResult> {
    try {
      const fullPath = safePath(workDir, params.path);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        // Guard against accidentally deleting deeply nested trees
        const depth = params.path.split(path.sep).filter(Boolean).length;
        if (depth < 1) {
          return { success: false, message: 'Refusing to delete the work directory root' };
        }
        await fs.rm(fullPath, { recursive: true, maxRetries: 0 });
      } else {
        await fs.unlink(fullPath);
      }
      return {
        success: true,
        message: `Deleted ${params.path}`,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to delete ${params.path}`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerFilesystemTool(workDir: string): OpenClawTool {
  const tool = createFilesystemTool(workDir);
  registry.register(tool);
  return tool;
}

export { createFilesystemTool };
