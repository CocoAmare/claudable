// OpenClaw Type Definitions
// The autonomous agent framework -- tools are plugins, Claudable is just one of them.

// ---------------------------------------------------------------------------
// Tool System
// ---------------------------------------------------------------------------

/** Every tool OpenClaw can use implements this interface. */
export interface OpenClawTool {
  /** Unique identifier, e.g. "claudable", "docker", "git" */
  id: string;
  /** Human-readable name shown in logs and UI */
  name: string;
  /** Short description of what this tool does */
  description: string;
  /** Categories for routing decisions */
  capabilities: ToolCapability[];
  /** Check if this tool is available (e.g. is Docker running? Is Claudable reachable?) */
  isAvailable(): Promise<boolean>;
  /** Execute an action through this tool */
  execute(action: ToolAction): Promise<ToolResult>;
}

/** What a tool can do -- used by the orchestrator to pick the right tool */
export type ToolCapability =
  | 'web-app-generation'
  | 'file-read'
  | 'file-write'
  | 'container-management'
  | 'git-operations'
  | 'deployment'
  | 'security-audit'
  | 'shell-execution'
  | 'api-integration'
  | 'database-management'
  | 'monitoring';

/** A request to a tool */
export interface ToolAction {
  /** What to do, tool-specific */
  type: string;
  /** Parameters for the action */
  params: Record<string, unknown>;
  /** Optional timeout in ms */
  timeout?: number;
}

/** What a tool returns */
export interface ToolResult {
  success: boolean;
  /** Structured output data */
  data?: Record<string, unknown>;
  /** Human-readable summary */
  message: string;
  /** If something went wrong */
  error?: string;
  /** Files that were created or modified */
  artifacts?: Artifact[];
}

export interface Artifact {
  path: string;
  type: 'file' | 'directory' | 'url';
  description?: string;
}

// ---------------------------------------------------------------------------
// Task System
// ---------------------------------------------------------------------------

/** A task is a unit of work the orchestrator manages */
export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  /** Which tool(s) this task should use */
  toolHint?: string;
  /** Sub-tasks for complex work */
  subtasks?: Task[];
  /** Output from execution */
  result?: ToolResult;
  /** When the task was created */
  createdAt: number;
  /** When the task last changed status */
  updatedAt: number;
}

export type TaskStatus = 'pending' | 'planning' | 'in_progress' | 'completed' | 'failed' | 'blocked';

// ---------------------------------------------------------------------------
// Agent State
// ---------------------------------------------------------------------------

/** The orchestrator's working memory */
export interface AgentState {
  /** Current project context (if any) */
  project?: ProjectContext;
  /** Active tasks */
  tasks: Task[];
  /** What tools are registered and available */
  availableTools: string[];
  /** Conversation/decision history for context */
  history: HistoryEntry[];
}

export interface ProjectContext {
  /** Claudable project ID (if using Claudable) */
  claudableProjectId?: string;
  /** Direct path to project directory */
  projectPath: string;
  /** What kind of project this is */
  type: 'nextjs' | 'react' | 'node' | 'static' | 'unknown';
  /** Services this project uses */
  services: string[];
}

export interface HistoryEntry {
  timestamp: number;
  action: string;
  toolUsed?: string;
  result: 'success' | 'failure';
  summary: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OpenClawConfig {
  /** Where Claudable is running (if available) */
  claudable?: {
    baseUrl: string;
    /** Direct path to Claudable's project directory for file I/O bypass */
    projectsDir: string;
  };
  /** Docker settings */
  docker?: {
    socketPath?: string;
    defaultImage?: string;
  };
  /** Default working directory for new projects */
  workDir: string;
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Registered tool module paths (for community plugins) */
  plugins: string[];
}
