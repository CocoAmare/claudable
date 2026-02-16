// OpenClaw Docker Tool
// Container lifecycle management with multi-host orchestration, resource limits,
// and health monitoring. Designed for setups like Proxmox where Docker hosts
// are dedicated VMs that OpenClaw manages remotely.

import { spawn } from 'child_process';
import type {
  OpenClawTool,
  ToolAction,
  ToolResult,
  ToolCapability,
  RemoteDockerHost,
  DockerResourceLimits,
  ContainerHealthStatus,
  ContainerStats,
} from '../types';
import { registry } from './registry';

// ---------------------------------------------------------------------------
// Configuration passed at registration time
// ---------------------------------------------------------------------------

export interface DockerToolConfig {
  /** Local socket path (default: /var/run/docker.sock) */
  socketPath?: string;
  /** Remote Docker hosts for multi-host orchestration */
  remoteHosts?: RemoteDockerHost[];
  /** Default resource limits applied to all containers */
  defaultResourceLimits?: DockerResourceLimits;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate a container ID or name: alphanumeric, dashes, underscores, dots. */
function validateContainerId(id: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(id)) {
    throw new Error(`Invalid container ID: must be alphanumeric (dashes, underscores, dots allowed)`);
  }
}

/** Validate a Docker image reference (basic check -- no shell metacharacters). */
function validateImageRef(ref: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/.test(ref)) {
    throw new Error(`Invalid image reference: ${ref}`);
  }
}

/** Validate a host name against the configured remote hosts. */
function resolveHost(name: string, remoteHosts: RemoteDockerHost[]): RemoteDockerHost | undefined {
  return remoteHosts.find((h) => h.name === name);
}

/**
 * Run a Docker command and capture output. No shell=true, no string interpolation.
 * Optionally targets a remote Docker host by setting DOCKER_HOST and TLS env vars.
 */
function runCommand(
  cmd: string,
  args: string[],
  options?: { cwd?: string; host?: RemoteDockerHost }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    if (options?.host) {
      env.DOCKER_HOST = options.host.url;
      if (options.host.tlsCertPath) {
        env.DOCKER_TLS_VERIFY = '1';
        env.DOCKER_CERT_PATH = options.host.tlsCertPath.replace(/\/[^/]+$/, '');
      }
    }

    const proc = spawn(cmd, args, {
      cwd: options?.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number | null) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    proc.on('error', (err: Error) => {
      resolve({ code: 1, stdout: '', stderr: err.message });
    });
  });
}

// ---------------------------------------------------------------------------
// Param interfaces
// ---------------------------------------------------------------------------

interface ContainerRunParams {
  image: string;
  name?: string;
  ports?: string[];         // ["3000:3000", "5432:5432"]
  volumes?: string[];       // ["/host/path:/container/path"]
  env?: Record<string, string>;
  detach?: boolean;
  /** Override resource limits for this container */
  limits?: DockerResourceLimits;
  /** Target a specific remote Docker host by name */
  host?: string;
}

interface ContainerActionParams {
  container: string;
  action: 'stop' | 'rm' | 'logs' | 'inspect';
  tail?: number;
  /** Target a specific remote Docker host by name */
  host?: string;
}

interface BuildParams {
  context: string;          // directory containing Dockerfile
  tag: string;
  dockerfile?: string;      // defaults to "Dockerfile"
  /** Target a specific remote Docker host by name */
  host?: string;
}

interface HealthCheckParams {
  container: string;
  /** Target a specific remote Docker host by name */
  host?: string;
}

interface StatsParams {
  /** Specific container to check, or omit for all running containers */
  container?: string;
  /** Target a specific remote Docker host by name */
  host?: string;
}

interface PsParams {
  /** Target a specific remote Docker host by name */
  host?: string;
}

// ---------------------------------------------------------------------------
// Docker Tool
// ---------------------------------------------------------------------------

function createDockerTool(config?: DockerToolConfig): OpenClawTool {
  const remoteHosts = config?.remoteHosts ?? [];
  const defaultLimits = config?.defaultResourceLimits;

  /** Resolve host from name. Throws if host specified but not found. */
  function getHost(name?: string): RemoteDockerHost | undefined {
    if (!name) return undefined;
    const host = resolveHost(name, remoteHosts);
    if (!host) {
      throw new Error(`Unknown Docker host: "${name}". Available: ${remoteHosts.map((h) => h.name).join(', ') || 'none'}`);
    }
    return host;
  }

  return {
    id: 'docker',
    name: 'Docker',
    description: 'Container lifecycle management with multi-host orchestration, resource limits, and health monitoring.',
    capabilities: ['container-management', 'deployment', 'health-monitoring', 'resource-orchestration'] as ToolCapability[],

    async isAvailable(): Promise<boolean> {
      // Check local Docker first
      const { code } = await runCommand('docker', ['info']);
      return code === 0;
    },

    async execute(action: ToolAction): Promise<ToolResult> {
      try {
        switch (action.type) {
          case 'run':
            return await handleRun(action.params as unknown as ContainerRunParams);
          case 'container-action':
            return await handleContainerAction(action.params as unknown as ContainerActionParams);
          case 'build':
            return await handleBuild(action.params as unknown as BuildParams);
          case 'ps':
            return await handlePs(action.params as unknown as PsParams);
          case 'health':
            return await handleHealth(action.params as unknown as HealthCheckParams);
          case 'stats':
            return await handleStats(action.params as unknown as StatsParams);
          case 'hosts':
            return handleHosts();
          default:
            return { success: false, message: `Unknown docker action: ${action.type}` };
        }
      } catch (err) {
        return {
          success: false,
          message: 'Docker action failed',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };

  // -------------------------------------------------------------------------
  // Action Handlers
  // -------------------------------------------------------------------------

  async function handleRun(params: ContainerRunParams): Promise<ToolResult> {
    validateImageRef(params.image);
    const host = getHost(params.host);

    const args = ['run'];
    if (params.detach !== false) args.push('-d');
    if (params.name) {
      validateContainerId(params.name);
      args.push('--name', params.name);
    }
    if (params.ports) {
      for (const p of params.ports) args.push('-p', p);
    }
    if (params.volumes) {
      for (const v of params.volumes) args.push('-v', v);
    }
    if (params.env) {
      for (const [k, v] of Object.entries(params.env)) {
        args.push('-e', `${k}=${v}`);
      }
    }

    // Apply resource limits: per-container overrides > defaults
    const limits = { ...defaultLimits, ...params.limits };
    if (limits.memoryMb && limits.memoryMb > 0) {
      args.push('--memory', `${limits.memoryMb}m`);
    }
    if (limits.cpus && limits.cpus > 0) {
      args.push('--cpus', String(limits.cpus));
    }
    if (limits.restartPolicy) {
      args.push('--restart', limits.restartPolicy);
    }

    args.push(params.image);

    const { code, stdout, stderr } = await runCommand('docker', args, { host });
    if (code !== 0) {
      return { success: false, message: 'docker run failed', error: stderr };
    }
    const containerId = stdout.slice(0, 12);
    const hostLabel = host ? ` on ${host.name}` : '';
    return {
      success: true,
      message: `Container started: ${containerId}${hostLabel}`,
      data: {
        containerId,
        host: host?.name ?? 'local',
        limits: Object.keys(limits).length > 0 ? limits : undefined,
      },
    };
  }

  async function handleContainerAction(params: ContainerActionParams): Promise<ToolResult> {
    validateContainerId(params.container);
    const host = getHost(params.host);
    const { container, action, tail } = params;

    const args: string[] = [action];
    if (action === 'logs' && tail) args.push('--tail', String(tail));
    args.push(container);

    const { code, stdout, stderr } = await runCommand('docker', args, { host });
    if (code !== 0) {
      return { success: false, message: `docker ${action} failed`, error: stderr };
    }
    return {
      success: true,
      message: `docker ${action} ${container}: OK`,
      data: { output: stdout },
    };
  }

  async function handleBuild(params: BuildParams): Promise<ToolResult> {
    validateImageRef(params.tag);
    const host = getHost(params.host);

    const args = ['build', '-t', params.tag];
    if (params.dockerfile) args.push('-f', params.dockerfile);
    args.push(params.context);

    const { code, stdout, stderr } = await runCommand('docker', args, { host });
    if (code !== 0) {
      return { success: false, message: 'docker build failed', error: stderr };
    }
    return {
      success: true,
      message: `Built image: ${params.tag}`,
      data: { output: stdout },
    };
  }

  async function handlePs(params?: PsParams): Promise<ToolResult> {
    const host = getHost(params?.host);
    const { code, stdout, stderr } = await runCommand(
      'docker',
      ['ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}'],
      { host }
    );
    if (code !== 0) {
      return { success: false, message: 'docker ps failed', error: stderr };
    }
    const containers = stdout.split('\n').filter(Boolean).map((line) => {
      const [id, name, status, ports] = line.split('\t');
      return { id, name, status, ports };
    });
    const hostLabel = host ? ` on ${host.name}` : '';
    return {
      success: true,
      message: `${containers.length} running container(s)${hostLabel}`,
      data: { containers, host: host?.name ?? 'local' },
    };
  }

  async function handleHealth(params: HealthCheckParams): Promise<ToolResult> {
    validateContainerId(params.container);
    const host = getHost(params.host);

    const { code, stdout, stderr } = await runCommand(
      'docker',
      [
        'inspect',
        '--format',
        '{{.Name}}\t{{if .State.Health}}{{.State.Health.Status}}\t{{.State.Health.FailingStreak}}\t{{with index .State.Health.Log 0}}{{.Output}}{{end}}{{else}}none\t0\t{{end}}',
        params.container,
      ],
      { host }
    );

    if (code !== 0) {
      return { success: false, message: 'docker inspect failed', error: stderr };
    }

    const parts = stdout.split('\t');
    const healthStatus: ContainerHealthStatus = {
      containerId: params.container,
      name: (parts[0] ?? '').replace(/^\//, ''),
      status: (parts[1] ?? 'unknown') as ContainerHealthStatus['status'],
      failingStreak: parseInt(parts[2] ?? '0', 10) || 0,
      lastOutput: parts[3] || undefined,
    };

    return {
      success: true,
      message: `${healthStatus.name}: ${healthStatus.status}`,
      data: { health: healthStatus as unknown as Record<string, unknown> },
    };
  }

  async function handleStats(params?: StatsParams): Promise<ToolResult> {
    const host = getHost(params?.host);
    const args = ['stats', '--no-stream', '--format', '{{.ID}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}'];
    if (params?.container) {
      validateContainerId(params.container);
      args.push(params.container);
    }

    const { code, stdout, stderr } = await runCommand('docker', args, { host });
    if (code !== 0) {
      return { success: false, message: 'docker stats failed', error: stderr };
    }

    const containers: ContainerStats[] = stdout.split('\n').filter(Boolean).map((line) => {
      const [containerId, name, cpuPercent, memUsage, , netIO, blockIO, pids] = line.split('\t');
      const [usage, limit] = (memUsage ?? '').split(' / ');
      return {
        containerId: containerId ?? '',
        name: name ?? '',
        cpuPercent: cpuPercent ?? '0%',
        memUsage: usage ?? '',
        memLimit: limit ?? '',
        netIO: netIO ?? '',
        blockIO: blockIO ?? '',
        pids: pids ?? '0',
      };
    });

    const hostLabel = host ? ` on ${host.name}` : '';
    return {
      success: true,
      message: `Resource usage for ${containers.length} container(s)${hostLabel}`,
      data: { stats: containers as unknown as Record<string, unknown>[], host: host?.name ?? 'local' },
    };
  }

  function handleHosts(): ToolResult {
    const hosts = [
      { name: 'local', url: config?.socketPath ?? '/var/run/docker.sock', type: 'socket' },
      ...remoteHosts.map((h) => ({ name: h.name, url: h.url, type: 'remote' })),
    ];
    return {
      success: true,
      message: `${hosts.length} Docker host(s) configured`,
      data: { hosts: hosts as unknown as Record<string, unknown>[] },
    };
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerDockerTool(config?: DockerToolConfig): OpenClawTool {
  const tool = createDockerTool(config);
  registry.register(tool);
  return tool;
}

export { createDockerTool };
