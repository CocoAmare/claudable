// OpenClaw Git Tool
// Git operations: init, commit, push, branch, status.
// Uses spawn with array args -- never shell interpolation.

import { spawn } from 'child_process';
import type { OpenClawTool, ToolAction, ToolResult, ToolCapability } from '../types';
import { registry } from './registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runGit(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, {
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
// Git Tool
// ---------------------------------------------------------------------------

interface GitActionParams {
  repoPath: string;
}

interface InitParams extends GitActionParams {
  defaultBranch?: string;
}

interface CommitParams extends GitActionParams {
  message: string;
  addAll?: boolean;
  files?: string[];
}

interface PushParams extends GitActionParams {
  remote?: string;
  branch?: string;
  setUpstream?: boolean;
}

interface BranchParams extends GitActionParams {
  name?: string;
  checkout?: boolean;
  delete?: boolean;
}

function createGitTool(): OpenClawTool {
  return {
    id: 'git',
    name: 'Git',
    description: 'Version control operations: init, commit, push, branch, status, log.',
    capabilities: ['git-operations'] as ToolCapability[],

    async isAvailable(): Promise<boolean> {
      const { code } = await runGit(['--version'], process.cwd());
      return code === 0;
    },

    async execute(action: ToolAction): Promise<ToolResult> {
      switch (action.type) {
        case 'init':
          return handleInit(action.params as unknown as InitParams);
        case 'status':
          return handleStatus(action.params as unknown as GitActionParams);
        case 'commit':
          return handleCommit(action.params as unknown as CommitParams);
        case 'push':
          return handlePush(action.params as unknown as PushParams);
        case 'branch':
          return handleBranch(action.params as unknown as BranchParams);
        case 'log':
          return handleLog(action.params as unknown as GitActionParams);
        default:
          return { success: false, message: `Unknown git action: ${action.type}` };
      }
    },
  };

  async function handleInit(params: InitParams): Promise<ToolResult> {
    const args = ['init'];
    if (params.defaultBranch) args.push('-b', params.defaultBranch);

    const { code, stdout, stderr } = await runGit(args, params.repoPath);
    if (code !== 0) {
      return { success: false, message: 'git init failed', error: stderr };
    }
    return { success: true, message: stdout || 'Initialized git repository' };
  }

  async function handleStatus(params: GitActionParams): Promise<ToolResult> {
    const { code, stdout, stderr } = await runGit(['status', '--porcelain'], params.repoPath);
    if (code !== 0) {
      return { success: false, message: 'git status failed', error: stderr };
    }

    const files = stdout.split('\n').filter(Boolean).map((line) => ({
      status: line.slice(0, 2).trim(),
      file: line.slice(3),
    }));

    return {
      success: true,
      message: files.length === 0 ? 'Working tree clean' : `${files.length} changed file(s)`,
      data: { files, clean: files.length === 0 },
    };
  }

  async function handleCommit(params: CommitParams): Promise<ToolResult> {
    const { repoPath, message, addAll, files } = params;

    // Stage files
    if (addAll) {
      const add = await runGit(['add', '-A'], repoPath);
      if (add.code !== 0) {
        return { success: false, message: 'git add failed', error: add.stderr };
      }
    } else if (files && files.length > 0) {
      const add = await runGit(['add', ...files], repoPath);
      if (add.code !== 0) {
        return { success: false, message: 'git add failed', error: add.stderr };
      }
    }

    const { code, stdout, stderr } = await runGit(['commit', '-m', message], repoPath);
    if (code !== 0) {
      return { success: false, message: 'git commit failed', error: stderr };
    }
    return { success: true, message: stdout };
  }

  async function handlePush(params: PushParams): Promise<ToolResult> {
    const { repoPath, remote = 'origin', branch } = params;
    const args = ['push'];
    if (params.setUpstream) args.push('-u');
    args.push(remote);
    if (branch) args.push(branch);

    const { code, stdout, stderr } = await runGit(args, repoPath);
    if (code !== 0) {
      return { success: false, message: 'git push failed', error: stderr };
    }
    return { success: true, message: stderr || stdout || 'Pushed successfully' };
  }

  async function handleBranch(params: BranchParams): Promise<ToolResult> {
    const { repoPath, name } = params;

    if (!name) {
      // List branches
      const { code, stdout, stderr } = await runGit(['branch', '-a'], repoPath);
      if (code !== 0) {
        return { success: false, message: 'git branch failed', error: stderr };
      }
      const branches = stdout.split('\n').filter(Boolean).map((b) => b.trim());
      return {
        success: true,
        message: `${branches.length} branch(es)`,
        data: { branches },
      };
    }

    if (params.delete) {
      const { code, stderr } = await runGit(['branch', '-d', name], repoPath);
      if (code !== 0) {
        return { success: false, message: `Failed to delete branch ${name}`, error: stderr };
      }
      return { success: true, message: `Deleted branch ${name}` };
    }

    if (params.checkout) {
      const { code, stderr } = await runGit(['checkout', '-b', name], repoPath);
      if (code !== 0) {
        // Branch might exist, try just checkout
        const co = await runGit(['checkout', name], repoPath);
        if (co.code !== 0) {
          return { success: false, message: `Failed to checkout ${name}`, error: co.stderr };
        }
        return { success: true, message: `Switched to ${name}` };
      }
      return { success: true, message: `Created and switched to ${name}` };
    }

    const { code, stderr } = await runGit(['branch', name], repoPath);
    if (code !== 0) {
      return { success: false, message: `Failed to create branch ${name}`, error: stderr };
    }
    return { success: true, message: `Created branch ${name}` };
  }

  async function handleLog(params: GitActionParams): Promise<ToolResult> {
    const { code, stdout, stderr } = await runGit(
      ['log', '--oneline', '-20'],
      params.repoPath
    );
    if (code !== 0) {
      return { success: false, message: 'git log failed', error: stderr };
    }
    const commits = stdout.split('\n').filter(Boolean).map((line) => {
      const spaceIdx = line.indexOf(' ');
      return { hash: line.slice(0, spaceIdx), message: line.slice(spaceIdx + 1) };
    });
    return {
      success: true,
      message: `${commits.length} recent commit(s)`,
      data: { commits },
    };
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGitTool(): OpenClawTool {
  const tool = createGitTool();
  registry.register(tool);
  return tool;
}

export { createGitTool };
