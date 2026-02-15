// OpenClaw Orchestrator
// The decision engine. Takes a user intent, breaks it into tasks,
// picks the right tools, executes, and tracks state.

import { registry } from '../tools/registry';
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
// Task ID generation
// ---------------------------------------------------------------------------

let taskCounter = 0;
function nextTaskId(): string {
  return `task_${Date.now()}_${++taskCounter}`;
}

// ---------------------------------------------------------------------------
// Routing rules: intent → capability → tool
// ---------------------------------------------------------------------------

/** Map high-level intents to the capabilities needed. */
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

export class Orchestrator {
  private state: AgentState;

  constructor() {
    this.state = {
      tasks: [],
      availableTools: [],
      history: [],
    };
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

  /** Create a new task and add it to the queue. */
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

  /** Update a task's status. */
  updateTask(taskId: string, status: TaskStatus, result?: ToolResult): void {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      task.updatedAt = Date.now();
      if (result) task.result = result;
    }
  }

  /** Get all tasks with a given status. */
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.state.tasks.filter((t) => t.status === status);
  }

  // -------------------------------------------------------------------------
  // Tool Selection
  // -------------------------------------------------------------------------

  /**
   * Pick the best tool for an intent.
   *
   * Priority:
   * 1. Explicit tool hint on the task
   * 2. Capability-based routing via INTENT_ROUTES
   * 3. First available tool with any matching capability
   */
  selectTool(intent: string, toolHint?: string): OpenClawTool | null {
    // Explicit hint
    if (toolHint) {
      const tool = registry.get(toolHint);
      if (tool && this.state.availableTools.includes(toolHint)) {
        return tool;
      }
    }

    // Capability-based routing
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
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Execute a single task: select tool, run action, record result.
   */
  async executeTask(task: Task, action: ToolAction): Promise<ToolResult> {
    this.updateTask(task.id, 'in_progress');

    // Determine intent from action type for routing
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

    try {
      const result = await tool.execute(action);
      this.updateTask(task.id, result.success ? 'completed' : 'failed', result);
      this.recordHistory(action.type, tool.id, result);
      return result;
    } catch (err) {
      const result: ToolResult = {
        success: false,
        message: `Tool ${tool.id} threw an error`,
        error: err instanceof Error ? err.message : String(err),
      };
      this.updateTask(task.id, 'failed', result);
      this.recordHistory(action.type, tool.id, result);
      return result;
    }
  }

  /**
   * Run an action directly against a specific tool (bypass routing).
   * For when you know exactly which tool you want.
   */
  async runDirect(toolId: string, action: ToolAction): Promise<ToolResult> {
    const tool = registry.get(toolId);
    if (!tool) {
      return { success: false, message: `Tool not found: ${toolId}` };
    }

    try {
      const result = await tool.execute(action);
      this.recordHistory(action.type, toolId, result);
      return result;
    } catch (err) {
      const result: ToolResult = {
        success: false,
        message: `Tool ${toolId} threw an error`,
        error: err instanceof Error ? err.message : String(err),
      };
      this.recordHistory(action.type, toolId, result);
      return result;
    }
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

    // Keep history bounded
    if (this.state.history.length > 200) {
      this.state.history = this.state.history.slice(-100);
    }
  }

  /** Get recent history entries. */
  getHistory(limit = 20): HistoryEntry[] {
    return this.state.history.slice(-limit);
  }
}
