// OpenClaw - Autonomous Agent Framework
// The agent people interact with. Claudable is a tool. So is Docker, git, and
// anything the community builds plugins for.
//
// Usage:
//   import { OpenClaw } from './openclaw';
//   const agent = await OpenClaw.create({ workDir: '/path/to/work' });
//   await agent.run('claudable', { type: 'generate', params: { ... } });

import * as path from 'path';
import { Orchestrator } from './agent/orchestrator';
import type { PromptFn } from './agent/orchestrator';
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

  private constructor(config: OpenClawConfig, promptFn?: PromptFn, autoApprove?: boolean) {
    this.config = config;
    this.orchestrator = new Orchestrator({
      auditLogDir: config.auditLogDir ?? './data/logs',
      promptFn,
      autoApprove,
    });
  }

  /**
   * Create and initialize an OpenClaw agent.
   * Registers built-in tools and loads any plugins from config.
   */
  static async create(options: {
    config?: Partial<OpenClawConfig>;
    promptFn?: PromptFn;
    autoApprove?: boolean;
  } = {}): Promise<OpenClaw> {
    const config: OpenClawConfig = { ...DEFAULT_CONFIG, ...options.config };
    const agent = new OpenClaw(config, options.promptFn, options.autoApprove);

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

    // Docker -- pass config for remote hosts and resource limits
    registerDockerTool(this.config.docker ? {
      socketPath: this.config.docker.socketPath,
      remoteHosts: this.config.docker.remoteHosts,
      defaultResourceLimits: this.config.docker.defaultResourceLimits,
    } : undefined);

    // Filesystem -- scoped to work directory
    registerFilesystemTool(this.config.workDir);

    // Git -- always register
    registerGitTool();
  }

  /** Register a custom tool (community plugin). */
  registerTool(tool: OpenClawTool): void {
    registry.register(tool);
  }

  /**
   * Load plugin modules from config.plugins paths.
   * Paths must be absolute and resolve to a location within the work directory
   * or the user's home-level plugins directory (~/.openclaw/plugins/).
   */
  private async loadPlugins(): Promise<void> {
    const allowedRoots = [
      path.resolve(this.config.workDir),
      path.resolve(process.env.HOME ?? process.env.USERPROFILE ?? '/', '.openclaw', 'plugins'),
    ];

    for (const pluginPath of this.config.plugins) {
      const resolved = path.resolve(pluginPath);
      const inAllowedRoot = allowedRoots.some(
        (root) => resolved.startsWith(root + path.sep) || resolved === root
      );
      if (!inAllowedRoot) {
        console.error(`[OpenClaw] Plugin path rejected (outside allowed roots): ${pluginPath}`);
        continue;
      }

      try {
        const mod = await import(resolved);
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

  /** Clean shutdown: flush audit logs. */
  async shutdown(): Promise<void> {
    await this.orchestrator.shutdown();
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
  RemoteDockerHost,
  DockerResourceLimits,
  DockerHealthCheck,
  ContainerHealthStatus,
  ContainerStats,
} from './types';

export { registry } from './tools/registry';
export { Orchestrator } from './agent/orchestrator';
export type { PromptFn } from './agent/orchestrator';
export { PermissionManager } from './agent/permissions';
export { AuditLogger } from './agent/audit';
