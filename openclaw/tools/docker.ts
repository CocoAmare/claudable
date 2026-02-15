// OpenClaw Docker Tool
// Container management for project isolation and deployment.

import { spawn } from 'child_process';
import type { OpenClawTool, ToolAction, ToolResult, ToolCapability } from '../types';
import { registry } from './registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a command and capture output. No shell=true, no string interpolation. */
function runCommand(cmd: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
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
// Docker Tool
// ---------------------------------------------------------------------------

interface ContainerRunParams {
  image: string;
  name?: string;
  ports?: string[];    // ["3000:3000", "5432:5432"]
  volumes?: string[];  // ["/host/path:/container/path"]
  env?: Record<string, string>;
  detach?: boolean;
}

interface ContainerActionParams {
  container: string;
  action: 'stop' | 'rm' | 'logs' | 'inspect';
  tail?: number;
}

interface BuildParams {
  context: string;     // directory containing Dockerfile
  tag: string;
  dockerfile?: string; // defaults to "Dockerfile"
}

function createDockerTool(): OpenClawTool {
  return {
    id: 'docker',
    name: 'Docker',
    description: 'Container lifecycle management: build images, run/stop/inspect containers.',
    capabilities: ['container-management', 'deployment'] as ToolCapability[],

    async isAvailable(): Promise<boolean> {
      const { code } = await runCommand('docker', ['info']);
      return code === 0;
    },

    async execute(action: ToolAction): Promise<ToolResult> {
      switch (action.type) {
        case 'run':
          return handleRun(action.params as unknown as ContainerRunParams);
        case 'container-action':
          return handleContainerAction(action.params as unknown as ContainerActionParams);
        case 'build':
          return handleBuild(action.params as unknown as BuildParams);
        case 'ps':
          return handlePs();
        default:
          return { success: false, message: `Unknown docker action: ${action.type}` };
      }
    },
  };

  async function handleRun(params: ContainerRunParams): Promise<ToolResult> {
    const args = ['run'];
    if (params.detach !== false) args.push('-d');
    if (params.name) args.push('--name', params.name);
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
    args.push(params.image);

    const { code, stdout, stderr } = await runCommand('docker', args);
    if (code !== 0) {
      return { success: false, message: `docker run failed`, error: stderr };
    }
    return {
      success: true,
      message: `Container started: ${stdout.slice(0, 12)}`,
      data: { containerId: stdout.slice(0, 12) },
    };
  }

  async function handleContainerAction(params: ContainerActionParams): Promise<ToolResult> {
    const { container, action, tail } = params;
    const args: string[] = [action];
    if (action === 'logs' && tail) args.push('--tail', String(tail));
    args.push(container);

    const { code, stdout, stderr } = await runCommand('docker', args);
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
    const args = ['build', '-t', params.tag];
    if (params.dockerfile) args.push('-f', params.dockerfile);
    args.push(params.context);

    const { code, stdout, stderr } = await runCommand('docker', args);
    if (code !== 0) {
      return { success: false, message: `docker build failed`, error: stderr };
    }
    return {
      success: true,
      message: `Built image: ${params.tag}`,
      data: { output: stdout },
    };
  }

  async function handlePs(): Promise<ToolResult> {
    const { code, stdout, stderr } = await runCommand('docker', ['ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}']);
    if (code !== 0) {
      return { success: false, message: 'docker ps failed', error: stderr };
    }
    const containers = stdout.split('\n').filter(Boolean).map((line) => {
      const [id, name, status, ports] = line.split('\t');
      return { id, name, status, ports };
    });
    return {
      success: true,
      message: `${containers.length} running container(s)`,
      data: { containers },
    };
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerDockerTool(): OpenClawTool {
  const tool = createDockerTool();
  registry.register(tool);
  return tool;
}

export { createDockerTool };
