// OpenClaw - Autonomous Agent Framework
// The agent people interact with. Claudable is a tool. So is Docker, git, and
// anything the community builds plugins for.
//
// Usage:
//   import { OpenClaw } from './openclaw';
//   const agent = await OpenClaw.create({ workDir: '/path/to/work' });
//   await agent.run('claudable', { type: 'generate', params: { ... } });

import { Orchestrator } from './agent/orchestrator';
import { registry } from './tools/registry';
import { registerClaudableTool } from './tools/claudable';
import { registerDockerTool } from './tools/docker';
import { registerFilesystemTool } from './tools/filesystem';
import { registerGitTool } from './tools/git';
import type {
  OpenClawConfig,
  OpenClawTool,
  ToolAction,
  ToolResult,
  Task,
  ProjectContext,
  AgentState,
} from './types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: OpenClawConfig = {
  workDir: process.cwd(),
  logLevel: 'info',
  plugins: [],
};

// ---------------------------------------------------------------------------
// OpenClaw Agent
// ---------------------------------------------------------------------------

export class OpenClaw {
  private orchestrator: Orchestrator;
  private config: OpenClawConfig;

  private constructor(config: OpenClawConfig) {
    this.config = config;
    this.orchestrator = new Orchestrator();
  }

  /**
   * Create and initialize an OpenClaw agent.
   * Registers built-in tools and loads any plugins from config.
   */
  static async create(userConfig: Partial<OpenClawConfig> = {}): Promise<OpenClaw> {
    const config: OpenClawConfig = { ...DEFAULT_CONFIG, ...userConfig };
    const agent = new OpenClaw(config);

    // Register built-in tools
    agent.registerBuiltins();

    // Load community plugins
    await agent.loadPlugins();

    // Check what's actually available
    await agent.orchestrator.refreshToolAvailability();

    return agent;
  }

  // -------------------------------------------------------------------------
  // Tool Registration
  // -------------------------------------------------------------------------

  private registerBuiltins(): void {
    // Claudable -- only if configured
    if (this.config.claudable) {
      registerClaudableTool({
        baseUrl: this.config.claudable.baseUrl,
        projectsDir: this.config.claudable.projectsDir,
      });
    }

    // Docker -- always register, availability checked at runtime
    registerDockerTool();

    // Filesystem -- scoped to work directory
    registerFilesystemTool(this.config.workDir);

    // Git -- always register
    registerGitTool();
  }

  /** Register a custom tool (community plugin). */
  registerTool(tool: OpenClawTool): void {
    registry.register(tool);
  }

  /** Load plugin modules from config.plugins paths. */
  private async loadPlugins(): Promise<void> {
    for (const pluginPath of this.config.plugins) {
      try {
        const mod = await import(pluginPath);
        if (typeof mod.register === 'function') {
          mod.register(registry);
          console.log(`[OpenClaw] Loaded plugin: ${pluginPath}`);
        } else {
          console.warn(`[OpenClaw] Plugin ${pluginPath} has no register() export, skipping`);
        }
      } catch (err) {
        console.error(`[OpenClaw] Failed to load plugin ${pluginPath}:`, err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Run an action directly against a specific tool.
   *
   * Example:
   *   await agent.run('claudable', {
   *     type: 'generate',
   *     params: { projectId: 'abc', instruction: 'Build a todo app' }
   *   });
   */
  async run(toolId: string, action: ToolAction): Promise<ToolResult> {
    return this.orchestrator.runDirect(toolId, action);
  }

  /**
   * Create a task and let the orchestrator pick the best tool.
   *
   * Example:
   *   const task = agent.planTask('Deploy the app to production');
   *   await agent.executeTask(task, { type: 'deploy', params: { ... } });
   */
  planTask(description: string, toolHint?: string): Task {
    return this.orchestrator.createTask(description, toolHint);
  }

  async executeTask(task: Task, action: ToolAction): Promise<ToolResult> {
    return this.orchestrator.executeTask(task, action);
  }

  // -------------------------------------------------------------------------
  // State & Introspection
  // -------------------------------------------------------------------------

  /** Set project context for routing decisions. */
  setProject(ctx: ProjectContext): void {
    this.orchestrator.setProject(ctx);
  }

  /** Get current agent state. */
  getState(): Readonly<AgentState> {
    return this.orchestrator.getState();
  }

  /** Check tool availability. */
  async checkTools(): Promise<Map<string, boolean>> {
    return this.orchestrator.refreshToolAvailability();
  }

  /** List registered tool IDs. */
  listTools(): string[] {
    return registry.list();
  }

  /** Get a tool by ID. */
  getTool(id: string): OpenClawTool | undefined {
    return registry.get(id);
  }
}

// Re-export types for consumers
export type {
  OpenClawConfig,
  OpenClawTool,
  ToolAction,
  ToolResult,
  ToolCapability,
  Task,
  TaskStatus,
  ProjectContext,
  AgentState,
} from './types';

export { registry } from './tools/registry';
export { Orchestrator } from './agent/orchestrator';
