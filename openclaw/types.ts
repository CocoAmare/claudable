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
  | 'monitoring'
  | 'health-monitoring'
  | 'resource-orchestration';

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
// Docker Orchestration
// ---------------------------------------------------------------------------

/** A remote Docker host reachable over TCP with optional TLS mutual auth. */
export interface RemoteDockerHost {
  /** Friendly name for this host, e.g. "proxmox-worker" */
  name: string;
  /** Docker daemon URL, e.g. "tcp://192.168.1.50:2376" */
  url: string;
  /** TLS client certificate path (for mutual auth) */
  tlsCertPath?: string;
  /** TLS client key path */
  tlsKeyPath?: string;
  /** TLS CA certificate path */
  tlsCaPath?: string;
}

/** Hard resource limits enforced by Docker -- OpenClaw cannot override these. */
export interface DockerResourceLimits {
  /** Memory limit in MB (maps to --memory) */
  memoryMb?: number;
  /** CPU quota as fractional cores, e.g. 1.5 = 1.5 CPUs (maps to --cpus) */
  cpus?: number;
  /** Restart policy: 'no' | 'always' | 'unless-stopped' | 'on-failure' */
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
}

/** Container health check configuration (maps to Docker HEALTHCHECK). */
export interface DockerHealthCheck {
  /** Command to run, e.g. ["CMD-SHELL", "curl -f http://localhost/ || exit 1"] */
  test: string[];
  /** Interval between checks in seconds (default: 30) */
  intervalSeconds?: number;
  /** Timeout for each check in seconds (default: 30) */
  timeoutSeconds?: number;
  /** Retries before marking unhealthy (default: 3) */
  retries?: number;
  /** Grace period before first check in seconds (default: 0) */
  startPeriodSeconds?: number;
}

/** Health status of a running container. */
export interface ContainerHealthStatus {
  containerId: string;
  name: string;
  status: 'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown';
  failingStreak: number;
  lastOutput?: string;
}

/** Resource usage snapshot from docker stats. */
export interface ContainerStats {
  containerId: string;
  name: string;
  cpuPercent: string;
  memUsage: string;
  memLimit: string;
  netIO: string;
  blockIO: string;
  pids: string;
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
    /** Local socket path, e.g. /var/run/docker.sock */
    socketPath?: string;
    /** Default image for new containers */
    defaultImage?: string;
    /** Remote Docker hosts for multi-host orchestration (e.g. Proxmox VMs) */
    remoteHosts?: RemoteDockerHost[];
    /** Default resource limits applied to all containers unless overridden */
    defaultResourceLimits?: DockerResourceLimits;
  };
  /** Default working directory for new projects */
  workDir: string;
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Registered tool module paths (for community plugins) */
  plugins: string[];
  /** Directory for audit log files */
  auditLogDir?: string;
}
