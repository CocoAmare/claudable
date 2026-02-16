// OpenClaw Claudable Tool
// Dual-path integration: API for generative AI work, direct I/O for surgical edits.
// Claudable is a tool OpenClaw uses -- not the other way around.

import * as fs from 'fs/promises';
import * as path from 'path';
import type { OpenClawTool, ToolAction, ToolResult, ToolCapability } from '../types';
import { registry } from './registry';

// ---------------------------------------------------------------------------
// Types specific to the Claudable tool
// ---------------------------------------------------------------------------

interface ClaudableConfig {
  /** Where Claudable's API is running, e.g. "http://localhost:3000" */
  baseUrl: string;
  /** Direct path to Claudable's data/projects directory */
  projectsDir: string;
}

interface GenerateParams {
  projectId: string;
  instruction: string;
  model?: string;
  cliPreference?: string;
  isInitialPrompt?: boolean;
}

interface DirectWriteParams {
  projectId: string;
  filePath: string;
  content: string;
}

interface DirectReadParams {
  projectId: string;
  filePath: string;
}

interface ProjectCreateParams {
  name: string;
  description?: string;
}

interface ProjectListParams {
  // no params needed
}

interface PreviewParams {
  projectId: string;
  action: 'start' | 'stop' | 'status';
}

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const API_TIMEOUT_MS = 30_000;

/** Wrap fetch with an AbortController timeout so requests can't hang indefinitely. */
function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/** Validate projectId format to prevent URL path injection. */
function validateProjectId(id: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid project ID: must be alphanumeric with dashes/underscores`);
  }
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/** Prevent directory traversal -- never let a relative path escape the project. */
function safePath(projectsDir: string, projectId: string, filePath: string): string {
  const projectRoot = path.resolve(projectsDir, projectId);
  const resolved = path.resolve(projectRoot, filePath);
  if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
    throw new Error(`Path traversal blocked: ${filePath}`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Claudable Tool Implementation
// ---------------------------------------------------------------------------

function createClaudableTool(config: ClaudableConfig): OpenClawTool {
  const { baseUrl, projectsDir } = config;

  return {
    id: 'claudable',
    name: 'Claudable',
    description: 'AI-powered web app builder. Use for generating Next.js apps from natural language, or write directly to project files.',
    capabilities: [
      'web-app-generation',
      'file-read',
      'file-write',
      'deployment',
    ] as ToolCapability[],

    async isAvailable(): Promise<boolean> {
      try {
        const res = await fetchWithTimeout(`${baseUrl}/api/projects`, {}, HEALTH_CHECK_TIMEOUT_MS);
        return res.ok;
      } catch {
        return false;
      }
    },

    async execute(action: ToolAction): Promise<ToolResult> {
      switch (action.type) {
        case 'generate':
          return handleGenerate(action.params as unknown as GenerateParams);
        case 'direct-write':
          return handleDirectWrite(action.params as unknown as DirectWriteParams);
        case 'direct-read':
          return handleDirectRead(action.params as unknown as DirectReadParams);
        case 'project-create':
          return handleProjectCreate(action.params as unknown as ProjectCreateParams);
        case 'project-list':
          return handleProjectList();
        case 'preview':
          return handlePreview(action.params as unknown as PreviewParams);
        default:
          return { success: false, message: `Unknown action type: ${action.type}` };
      }
    },
  };

  // -------------------------------------------------------------------------
  // Action Handlers
  // -------------------------------------------------------------------------

  /** PATH A: Use Claudable's AI agent to generate/modify code */
  async function handleGenerate(params: GenerateParams): Promise<ToolResult> {
    const { projectId, instruction, model, cliPreference, isInitialPrompt } = params;

    try {
      validateProjectId(projectId);
      const res = await fetchWithTimeout(`${baseUrl}/api/chat/${projectId}/act`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          selectedModel: model,
          cliPreference: cliPreference ?? 'claude',
          isInitialPrompt: isInitialPrompt ?? false,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, message: `Claudable API error: ${res.status}`, error: body };
      }

      const data = await res.json();
      return {
        success: true,
        message: `Generation started for project ${projectId}`,
        data: data as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to reach Claudable API',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** PATH B: Write directly to a project file (bypasses AI agent) */
  async function handleDirectWrite(params: DirectWriteParams): Promise<ToolResult> {
    const { projectId, filePath, content } = params;

    try {
      validateProjectId(projectId);
      const fullPath = safePath(projectsDir, projectId, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');

      return {
        success: true,
        message: `Wrote ${filePath} in project ${projectId}`,
        artifacts: [{ path: fullPath, type: 'file', description: `Direct write: ${filePath}` }],
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to write ${filePath}`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** PATH B: Read a file directly from a project directory */
  async function handleDirectRead(params: DirectReadParams): Promise<ToolResult> {
    const { projectId, filePath } = params;

    try {
      validateProjectId(projectId);
      const fullPath = safePath(projectsDir, projectId, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');

      return {
        success: true,
        message: `Read ${filePath} from project ${projectId}`,
        data: { content, path: fullPath },
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to read ${filePath}`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Create a new project via Claudable's API */
  async function handleProjectCreate(params: ProjectCreateParams): Promise<ToolResult> {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, message: `Failed to create project: ${res.status}`, error: body };
      }

      const data = await res.json();
      return {
        success: true,
        message: `Created project: ${params.name}`,
        data: data as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to reach Claudable API',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** List all projects */
  async function handleProjectList(): Promise<ToolResult> {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/api/projects`);
      if (!res.ok) {
        return { success: false, message: `Failed to list projects: ${res.status}` };
      }

      const data = await res.json();
      return {
        success: true,
        message: 'Retrieved project list',
        data: { projects: data },
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to reach Claudable API',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Manage preview servers */
  async function handlePreview(params: PreviewParams): Promise<ToolResult> {
    const { projectId, action } = params;

    try {
      validateProjectId(projectId);
      const res = await fetchWithTimeout(`${baseUrl}/api/projects/${projectId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, message: `Preview ${action} failed: ${res.status}`, error: body };
      }

      const data = await res.json();
      return {
        success: true,
        message: `Preview ${action} for project ${projectId}`,
        data: data as Record<string, unknown>,
      };
    } catch (err) {
      return {
        success: false,
        message: `Preview ${action} failed`,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory + auto-registration
// ---------------------------------------------------------------------------

export function registerClaudableTool(config: ClaudableConfig): OpenClawTool {
  const tool = createClaudableTool(config);
  registry.register(tool);
  return tool;
}

export { createClaudableTool };
