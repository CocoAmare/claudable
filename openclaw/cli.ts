#!/usr/bin/env node
// OpenClaw CLI
// Usage:
//   openclaw tools                          List available tools
//   openclaw status                         Show agent state and recent activity
//   openclaw doctor                         Run environment diagnostics
//   openclaw run <tool> <action> [json]     Run a tool action directly
//   openclaw generate <projectId> "prompt"  Ask Claudable to generate code
//   openclaw write <projectId> <file>       Write stdin to a project file
//   openclaw logs [count]                   Show recent audit log entries
//
// Flags:
//   --yes, -y          Auto-approve all permission prompts
//   --quiet, -q        Suppress non-essential output
//   --fix              Auto-fix issues found by doctor

import * as readline from 'readline';
import { OpenClaw } from './index';
import { getDefaultConfig } from './config';
import type { ToolResult, OpenClawConfig } from './types';
import type { PromptFn } from './agent/orchestrator';

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

let quiet = false;

function log(msg: string): void {
  if (!quiet) console.log(msg);
}

function logResult(result: ToolResult): void {
  if (result.success) {
    console.log(`  OK: ${result.message}`);
    if (result.data) {
      console.log(JSON.stringify(result.data, null, 2));
    }
    if (result.artifacts && result.artifacts.length > 0) {
      for (const a of result.artifacts) {
        console.log(`  -> ${a.type}: ${a.path}${a.description ? ` (${a.description})` : ''}`);
      }
    }
  } else {
    console.error(`  FAILED: ${result.message}`);
    if (result.error) console.error(`  Error: ${result.error}`);
  }
}

// ---------------------------------------------------------------------------
// Interactive permission prompt
// ---------------------------------------------------------------------------

function createTerminalPrompt(): PromptFn {
  return async (tool: string, action: string, reason: string): Promise<boolean> => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    return new Promise((resolve) => {
      console.error(`\n  Permission required: ${tool} -> ${action}`);
      console.error(`  Reason: ${reason}`);
      rl.question('  Allow? (y/N): ', (answer: string) => {
        rl.close();
        const approved = answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
        resolve(approved);
      });
    });
  };
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/** Validate a project ID: alphanumeric, dashes, underscores only. */
function validateProjectId(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    console.error('Error: Project ID must be alphanumeric (dashes and underscores allowed)');
    process.exit(1);
  }
  return id;
}

/** Validate a file path: no null bytes, no control characters. */
function validateFilePath(p: string): string {
  if (/[\x00-\x1f]/.test(p)) {
    console.error('Error: File path contains invalid characters');
    process.exit(1);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdTools(agent: OpenClaw): Promise<void> {
  const availability = await agent.checkTools();
  console.log('\nRegistered tools:\n');
  for (const id of agent.listTools()) {
    const tool = agent.getTool(id);
    const available = availability.get(id) ?? false;
    const status = available ? 'available' : 'unavailable';
    const icon = available ? '+' : '-';
    console.log(`  [${icon}] ${tool?.name ?? id} (${id}) -- ${status}`);
    if (tool?.description) {
      console.log(`      ${tool.description}`);
    }
  }
  console.log('');
}

async function cmdStatus(agent: OpenClaw): Promise<void> {
  const state = agent.getState();
  console.log('\nOpenClaw Status:\n');

  console.log(`  Available tools: ${state.availableTools.join(', ') || 'none'}`);

  if (state.project) {
    console.log(`  Active project: ${state.project.projectPath}`);
    if (state.project.claudableProjectId) {
      console.log(`  Claudable ID: ${state.project.claudableProjectId}`);
    }
  }

  const active = state.tasks.filter((t) => t.status === 'in_progress');
  const pending = state.tasks.filter((t) => t.status === 'pending');
  console.log(`  Tasks: ${active.length} active, ${pending.length} pending`);

  const recent = state.history.slice(-5);
  if (recent.length > 0) {
    console.log('\n  Recent activity:');
    for (const h of recent) {
      const time = new Date(h.timestamp).toLocaleTimeString();
      const icon = h.result === 'success' ? '+' : 'x';
      console.log(`    [${icon}] ${time} ${h.action} (${h.toolUsed ?? '?'}) -- ${h.summary}`);
    }
  }
  console.log('');
}

async function cmdRun(agent: OpenClaw, toolId: string, actionType: string, paramsJson: string): Promise<void> {
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(paramsJson);
  } catch {
    console.error('Error: Invalid JSON for params');
    console.error('Usage: openclaw run <tool> <action> \'{"key": "value"}\'');
    process.exit(1);
    return; // unreachable, but makes TS happy
  }

  log(`Running ${toolId} -> ${actionType}...`);
  const result = await agent.run(toolId, { type: actionType, params });
  logResult(result);
  process.exit(result.success ? 0 : 1);
}

async function cmdGenerate(agent: OpenClaw, projectId: string, instruction: string): Promise<void> {
  const validId = validateProjectId(projectId);
  log(`Sending to Claudable: "${instruction}" (project: ${validId})`);

  const result = await agent.run('claudable', {
    type: 'generate',
    params: { projectId: validId, instruction },
  });
  logResult(result);
  process.exit(result.success ? 0 : 1);
}

async function cmdWrite(agent: OpenClaw, projectId: string, filePath: string): Promise<void> {
  const validId = validateProjectId(projectId);
  const validPath = validateFilePath(filePath);

  // Read content from stdin
  const chunks: string[] = [];
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string);
  }
  const content = chunks.join('');

  if (content.length === 0) {
    console.error('Error: No content provided on stdin');
    console.error('Usage: echo "content" | openclaw write <projectId> <file>');
    process.exit(1);
  }

  log(`Writing ${validPath} to project ${validId} (${content.length} chars)...`);
  const result = await agent.run('claudable', {
    type: 'direct-write',
    params: { projectId: validId, filePath: validPath, content },
  });
  logResult(result);
  process.exit(result.success ? 0 : 1);
}

async function cmdLogs(agent: OpenClaw, count: number): Promise<void> {
  // Read today's audit log via the orchestrator
  const state = agent.getState();
  const history = state.history.slice(-count);

  if (history.length === 0) {
    console.log('No activity logged this session.');
    return;
  }

  console.log(`\nLast ${history.length} actions:\n`);
  for (const h of history) {
    const time = new Date(h.timestamp).toLocaleTimeString();
    const icon = h.result === 'success' ? '+' : 'x';
    console.log(`  [${icon}] ${time}  ${h.toolUsed ?? '?'} -> ${h.action}`);
    console.log(`          ${h.summary}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Doctor: comprehensive diagnostics with optional --fix auto-remediation
// ---------------------------------------------------------------------------

interface DiagnosticResult {
  label: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  detail: string;
  /** If fixable, a function that attempts the fix. Only called with --fix. */
  fix?: () => Promise<string>;
}

async function cmdDoctor(agent: OpenClaw, config: OpenClawConfig, fix: boolean): Promise<void> {
  console.log(`\nOpenClaw Doctor${fix ? ' (--fix mode)' : ''}\n`);
  const results: DiagnosticResult[] = [];

  // 1. Check all registered tools
  const availability = await agent.checkTools();
  for (const id of agent.listTools()) {
    const tool = agent.getTool(id);
    const available = availability.get(id) ?? false;
    results.push({
      label: tool?.name ?? id,
      status: available ? 'ok' : 'warn',
      detail: available ? 'available' : 'not reachable',
    });
  }

  // 2. Check remote Docker hosts (if configured)
  if (config.docker?.remoteHosts && config.docker.remoteHosts.length > 0) {
    for (const host of config.docker.remoteHosts) {
      const hostResult = await agent.run('docker', { type: 'ps', params: { host: host.name } });
      results.push({
        label: `Docker Host: ${host.name}`,
        status: hostResult.success ? 'ok' : 'fail',
        detail: hostResult.success
          ? `${host.url} -- ${hostResult.message}`
          : `${host.url} -- ${hostResult.error ?? 'unreachable'}`,
      });
    }
  } else {
    results.push({
      label: 'Remote Docker Hosts',
      status: 'skip',
      detail: 'none configured (set OPENCLAW_DOCKER_HOSTS)',
    });
  }

  // 3. Check Docker sandbox
  if (config.docker?.sandbox?.enabled) {
    const sb = config.docker.sandbox;
    const sandboxPs = await agent.run('docker', { type: 'sandbox-ps', params: {} });
    if (sandboxPs.success) {
      const count = (sandboxPs.data?.containers as unknown[])?.length ?? 0;
      results.push({
        label: `Sandbox (${sb.mode})`,
        status: 'ok',
        detail: `${count} container(s), network=${sb.network}, max=${sb.maxContainers}`,
      });
    } else {
      results.push({
        label: `Sandbox (${sb.mode})`,
        status: 'fail',
        detail: sandboxPs.error ?? 'sandbox unavailable',
      });
    }

    // Check if sandbox network exists
    const netCheck = await checkDockerNetwork(sb.network ?? 'openclaw-sandbox');
    if (!netCheck) {
      results.push({
        label: 'Sandbox Network',
        status: 'fail',
        detail: `network "${sb.network}" does not exist`,
        fix: async () => {
          const { spawn: spawnProc } = await import('child_process');
          return new Promise((resolve) => {
            const proc = spawnProc('docker', ['network', 'create', sb.network ?? 'openclaw-sandbox'], {
              stdio: ['ignore', 'pipe', 'pipe'],
            });
            let out = '';
            proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
            proc.stderr.on('data', (d: Buffer) => { out += d.toString(); });
            proc.on('close', (code: number | null) => {
              resolve(code === 0
                ? `Created network "${sb.network}"`
                : `Failed to create network: ${out.trim()}`
              );
            });
          });
        },
      });
    } else {
      results.push({
        label: 'Sandbox Network',
        status: 'ok',
        detail: sb.network ?? 'openclaw-sandbox',
      });
    }
  } else {
    results.push({
      label: 'Docker Sandbox',
      status: 'skip',
      detail: 'not configured (set OPENCLAW_SANDBOX=mode=local or mode=dind)',
    });
  }

  // 4. Check resource limits configuration
  if (config.docker?.defaultResourceLimits) {
    const lim = config.docker.defaultResourceLimits;
    const parts: string[] = [];
    if (lim.memoryMb) parts.push(`memory=${lim.memoryMb}MB`);
    if (lim.cpus) parts.push(`cpus=${lim.cpus}`);
    if (lim.restartPolicy) parts.push(`restart=${lim.restartPolicy}`);
    results.push({
      label: 'Default Resource Limits',
      status: 'ok',
      detail: parts.join(', '),
    });
  } else {
    results.push({
      label: 'Default Resource Limits',
      status: 'warn',
      detail: 'none set (containers run without limits -- set OPENCLAW_DOCKER_LIMITS)',
    });
  }

  // 5. Check Claudable connectivity (if configured)
  if (config.claudable) {
    const claudableCheck = await agent.run('claudable', { type: 'project-list', params: {} });
    results.push({
      label: 'Claudable API',
      status: claudableCheck.success ? 'ok' : 'fail',
      detail: claudableCheck.success
        ? config.claudable.baseUrl
        : `${config.claudable.baseUrl} -- ${claudableCheck.error ?? 'unreachable'}`,
    });
  }

  // 6. Check Node.js version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  results.push({
    label: 'Node.js',
    status: major >= 20 ? 'ok' : 'warn',
    detail: `${nodeVersion}${major < 20 ? ' (>=20 recommended)' : ''}`,
  });

  // 7. Check work directory
  const fsCheck = await agent.run('filesystem', { type: 'list', params: { directory: config.workDir } });
  results.push({
    label: 'Work Directory',
    status: fsCheck.success ? 'ok' : 'fail',
    detail: fsCheck.success ? config.workDir : `${config.workDir} -- not accessible`,
    fix: fsCheck.success ? undefined : async () => {
      const fsp = await import('fs/promises');
      await fsp.mkdir(config.workDir, { recursive: true });
      return `Created ${config.workDir}`;
    },
  });

  // 8. Check audit log directory
  const auditDir = config.auditLogDir ?? './data/logs';
  let auditOk = false;
  try {
    const fsp = await import('fs/promises');
    await fsp.access(auditDir);
    auditOk = true;
  } catch { /* doesn't exist */ }
  results.push({
    label: 'Audit Logging',
    status: auditOk ? 'ok' : 'warn',
    detail: auditOk ? auditDir : `${auditDir} -- directory missing`,
    fix: auditOk ? undefined : async () => {
      const fsp = await import('fs/promises');
      await fsp.mkdir(auditDir, { recursive: true });
      return `Created ${auditDir}`;
    },
  });

  // 9. Plugins
  results.push({
    label: 'Plugins',
    status: 'ok',
    detail: config.plugins.length > 0
      ? `${config.plugins.length} configured`
      : 'none',
  });

  // Print results
  const STATUS_ICONS: Record<DiagnosticResult['status'], string> = {
    ok: '+',
    warn: '!',
    fail: 'x',
    skip: '-',
  };

  let maxLabel = 0;
  for (const r of results) {
    if (r.label.length > maxLabel) maxLabel = r.label.length;
  }

  for (const r of results) {
    const icon = STATUS_ICONS[r.status];
    const padding = '.'.repeat(maxLabel - r.label.length + 3);
    const fixable = r.fix ? ' [fixable]' : '';
    console.log(`  [${icon}] ${r.label} ${padding} ${r.detail}${fixable}`);
  }

  // Auto-fix pass (only with --fix)
  const fixable = results.filter((r) => r.fix && (r.status === 'fail' || r.status === 'warn'));
  if (fix && fixable.length > 0) {
    console.log('\n  Applying fixes:\n');
    for (const r of fixable) {
      try {
        const msg = await r.fix!();
        console.log(`  [+] ${r.label}: ${msg}`);
      } catch (err) {
        console.error(`  [x] ${r.label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log('');
  } else if (!fix && fixable.length > 0) {
    console.log(`\n  ${fixable.length} issue(s) can be auto-fixed. Run: openclaw doctor --fix`);
  }

  const failCount = results.filter((r) => r.status === 'fail').length;
  const warnCount = results.filter((r) => r.status === 'warn').length;
  console.log('');
  if (failCount > 0) {
    console.log(`  ${failCount} issue(s) found. Fix the [x] items above.`);
  } else if (warnCount > 0) {
    console.log(`  All systems operational. ${warnCount} warning(s) -- see [!] items.`);
  } else {
    console.log('  All systems operational.');
  }
  console.log('');
}

/** Check if a Docker network exists. */
async function checkDockerNetwork(name: string): Promise<boolean> {
  const { spawn: spawnProc } = await import('child_process');
  return new Promise((resolve) => {
    const proc = spawnProc('docker', ['network', 'inspect', name], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.on('close', (code: number | null) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
OpenClaw - Autonomous Agent Framework

Usage:
  openclaw tools                           List available tools
  openclaw status                          Show agent state
  openclaw doctor                          Run environment diagnostics
  openclaw run <tool> <action> '<json>'    Run a tool action
  openclaw generate <projectId> "prompt"   Generate code via Claudable
  openclaw write <projectId> <file>        Write stdin to project file
  openclaw logs [count]                    Show recent activity

Flags:
  --yes, -y    Auto-approve permission prompts
  --quiet, -q  Suppress non-essential output
  --fix        Auto-fix issues found by doctor

Examples:
  openclaw tools
  openclaw doctor
  openclaw generate my-app "Build a todo app with auth"
  echo "body { color: red }" | openclaw write my-app app/globals.css
  openclaw run docker ps '{}'
  openclaw run docker health '{"container": "my-app"}'
  openclaw run docker stats '{}'
  openclaw run docker hosts '{}'
  openclaw run git status '{"repoPath": "./data/projects/my-app"}'
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse flags
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === '--yes' || arg === '-y') flags.add('yes');
    else if (arg === '--quiet' || arg === '-q') flags.add('quiet');
    else if (arg === '--fix') flags.add('fix');
    else if (arg === '--help' || arg === '-h') { printUsage(); process.exit(0); }
    else positional.push(arg);
  }

  quiet = flags.has('quiet');
  const autoApprove = flags.has('yes');

  if (positional.length === 0) {
    printUsage();
    process.exit(0);
  }

  // Create agent
  const config = getDefaultConfig();
  const agent = await OpenClaw.create({
    config,
    promptFn: autoApprove ? undefined : createTerminalPrompt(),
    autoApprove,
  });

  // Handle shutdown -- ensure audit logs flush before exit
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await agent.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });

  // Route command
  const command = positional[0];

  switch (command) {
    case 'tools':
      await cmdTools(agent);
      break;

    case 'status':
      await cmdStatus(agent);
      break;

    case 'doctor':
      await cmdDoctor(agent, config, flags.has('fix'));
      break;

    case 'run':
      if (positional.length < 4) {
        console.error('Usage: openclaw run <tool> <action> \'<json>\'');
        process.exit(1);
      }
      await cmdRun(agent, positional[1], positional[2], positional[3]);
      break;

    case 'generate':
      if (positional.length < 3) {
        console.error('Usage: openclaw generate <projectId> "instruction"');
        process.exit(1);
      }
      await cmdGenerate(agent, positional[1], positional.slice(2).join(' '));
      break;

    case 'write':
      if (positional.length < 3) {
        console.error('Usage: echo "content" | openclaw write <projectId> <file>');
        process.exit(1);
      }
      await cmdWrite(agent, positional[1], positional[2]);
      break;

    case 'logs':
      await cmdLogs(agent, parseInt(positional[1] ?? '20', 10));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }

  await agent.shutdown();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
