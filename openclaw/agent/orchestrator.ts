// OpenClaw Orchestrator
// The decision engine. Takes a user intent, breaks it into tasks,
// picks the right tools, executes, and tracks state.
// Now with permissions (ask before dangerous actions) and audit logging.

import { registry } from '../tools/registry';
import { PermissionManager } from './permissions';
import { AuditLogger } from './audit';
import type {
  AgentState,
  Task,
  TaskStatus,
  ToolAction,
  ToolCapability,
  ToolResult,
  HistoryEntry,
  ProjectContext,
  OpenClawTool,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * When a permission check returns 'prompt', the orchestrator calls this
 * function to ask the user. The CLI provides the implementation.
 */
export type PromptFn = (tool: string, action: string, reason: string) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Task ID generation
// ---------------------------------------------------------------------------

let taskCounter = 0;
function nextTaskId(): string {
  return `task_${Date.now()}_${++taskCounter}`;
}

// ---------------------------------------------------------------------------
// Routing rules: intent → capability → tool
// ---------------------------------------------------------------------------

const INTENT_ROUTES: Record<string, ToolCapability[]> = {
  'build-web-app':    ['web-app-generation'],
  'edit-file':        ['file-write'],
  'read-file':        ['file-read'],
  'deploy':           ['deployment'],
  'run-container':    ['container-management'],
  'git-operation':    ['git-operations'],
  'security-scan':    ['security-audit'],
  'run-command':      ['shell-execution'],
  'manage-database':  ['database-management'],
  'setup-monitoring': ['monitoring'],
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface OrchestratorOptions {
  /** Directory for audit log files */
  auditLogDir?: string;
  /** Function to prompt user for permission (provided by CLI) */
  promptFn?: PromptFn;
  /** Auto-approve all actions (for CI/automated use -- careful!) */
  autoApprove?: boolean;
}

export class Orchestrator {
  private state: AgentState;
  readonly permissions: PermissionManager;
  readonly audit: AuditLogger;
  private promptFn: PromptFn | null;

  constructor(options: OrchestratorOptions = {}) {
    this.state = {
      tasks: [],
      availableTools: [],
      history: [],
    };

    this.permissions = new PermissionManager();
    if (options.autoApprove) {
      this.permissions.setAutoApprove(true);
    }

    this.audit = new AuditLogger(options.auditLogDir ?? './data/logs');
    this.promptFn = options.promptFn ?? null;
  }

  /** Refresh which tools are actually available right now. */
  async refreshToolAvailability(): Promise<Map<string, boolean>> {
    const availability = await registry.checkAvailability();
    this.state.availableTools = [];
    for (const [id, available] of availability) {
      if (available) {
        this.state.availableTools.push(id);
      }
    }
    return availability;
  }

  /** Set the current project context. */
  setProject(ctx: ProjectContext): void {
    this.state.project = ctx;
  }

  /** Get current state (read-only snapshot). */
  getState(): Readonly<AgentState> {
    return { ...this.state };
  }

  // -------------------------------------------------------------------------
  // Task Management
  // -------------------------------------------------------------------------

  createTask(description: string, toolHint?: string): Task {
    const task: Task = {
      id: nextTaskId(),
      description,
      status: 'pending',
      toolHint,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.state.tasks.push(task);
    return task;
  }

  updateTask(taskId: string, status: TaskStatus, result?: ToolResult): void {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      task.updatedAt = Date.now();
      if (result) task.result = result;
    }
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.state.tasks.filter((t) => t.status === status);
  }

  // -------------------------------------------------------------------------
  // Tool Selection
  // -------------------------------------------------------------------------

  selectTool(intent: string, toolHint?: string): OpenClawTool | null {
    if (toolHint) {
      const tool = registry.get(toolHint);
      if (tool && this.state.availableTools.includes(toolHint)) {
        return tool;
      }
    }

    const requiredCapabilities = INTENT_ROUTES[intent];
    if (requiredCapabilities) {
      for (const cap of requiredCapabilities) {
        const candidates = registry.findByCapability(cap)
          .filter((t) => this.state.availableTools.includes(t.id));
        if (candidates.length > 0) {
          return candidates[0];
        }
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Permission-Checked Execution
  // -------------------------------------------------------------------------

  /**
   * Check permissions, prompt if needed, execute, and audit log.
   * This is the main entry point for all tool actions.
   */
  private async checkedExecute(
    toolId: string,
    tool: OpenClawTool,
    action: ToolAction
  ): Promise<ToolResult> {
    const startTime = Date.now();

    // 1. Check permissions
    const permCheck = this.permissions.check({
      tool: toolId,
      action: action.type,
      params: action.params,
    });

    if (permCheck.level === 'deny') {
      const result: ToolResult = {
        success: false,
        message: `Action denied: ${permCheck.reason ?? 'not permitted'}`,
      };
      await this.audit.log({
        tool: toolId,
        action: action.type,
        permissionLevel: 'deny',
        success: false,
        message: result.message,
        params: action.params,
      });
      return result;
    }

    if (permCheck.level === 'prompt' && !permCheck.allowed) {
      // Ask the user
      if (this.promptFn) {
        const reason = permCheck.reason ?? `${toolId}:${action.type} requires approval`;
        const approved = await this.promptFn(toolId, action.type, reason);
        if (!approved) {
          const result: ToolResult = {
            success: false,
            message: 'Action cancelled by user',
          };
          await this.audit.log({
            tool: toolId,
            action: action.type,
            permissionLevel: 'deny',
            success: false,
            message: result.message,
            params: action.params,
          });
          return result;
        }
        // Remember approval for this session
        this.permissions.approveForSession(toolId, action.type);
      }
      // If no promptFn, fall through and allow (better than silently blocking)
    }

    // 2. Execute
    const effectivePermLevel = permCheck.level === 'allow' ? 'allow' : 'prompt';

    try {
      const result = await tool.execute(action);
      const durationMs = Date.now() - startTime;

      // 3. Audit log
      await this.audit.log({
        tool: toolId,
        action: action.type,
        permissionLevel: effectivePermLevel,
        success: result.success,
        message: result.message,
        params: action.params,
        durationMs,
        error: result.error,
      });

      this.recordHistory(action.type, toolId, result);
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const result: ToolResult = {
        success: false,
        message: `Tool ${toolId} threw an error`,
        error: err instanceof Error ? err.message : String(err),
      };

      await this.audit.log({
        tool: toolId,
        action: action.type,
        permissionLevel: effectivePermLevel,
        success: false,
        message: result.message,
        params: action.params,
        durationMs,
        error: result.error,
      });

      this.recordHistory(action.type, toolId, result);
      return result;
    }
  }

  /**
   * Execute a single task: select tool, check permissions, run, audit.
   */
  async executeTask(task: Task, action: ToolAction): Promise<ToolResult> {
    this.updateTask(task.id, 'in_progress');

    const tool = this.selectTool(action.type, task.toolHint);
    if (!tool) {
      const result: ToolResult = {
        success: false,
        message: `No available tool found for intent: ${action.type}`,
      };
      this.updateTask(task.id, 'failed', result);
      this.recordHistory(action.type, undefined, result);
      return result;
    }

    const result = await this.checkedExecute(tool.id, tool, action);
    this.updateTask(task.id, result.success ? 'completed' : 'failed', result);
    return result;
  }

  /**
   * Run directly against a specific tool (with permission checks).
   */
  async runDirect(toolId: string, action: ToolAction): Promise<ToolResult> {
    const tool = registry.get(toolId);
    if (!tool) {
      return { success: false, message: `Tool not found: ${toolId}` };
    }

    return this.checkedExecute(toolId, tool, action);
  }

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  private recordHistory(action: string, toolUsed: string | undefined, result: ToolResult): void {
    const entry: HistoryEntry = {
      timestamp: Date.now(),
      action,
      toolUsed,
      result: result.success ? 'success' : 'failure',
      summary: result.message,
    };
    this.state.history.push(entry);

    if (this.state.history.length > 200) {
      this.state.history = this.state.history.slice(-100);
    }
  }

  getHistory(limit = 20): HistoryEntry[] {
    return this.state.history.slice(-limit);
  }

  /** Flush audit logs on shutdown. */
  async shutdown(): Promise<void> {
    await this.audit.shutdown();
  }
}
