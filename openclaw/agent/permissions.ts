// OpenClaw Permission System
// Controls what actions can run automatically vs. what needs confirmation.
// Three levels: allow (just do it), prompt (ask first), deny (never).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionLevel = 'allow' | 'prompt' | 'deny';

export interface PermissionRule {
  /** Which tool this rule applies to, or '*' for all */
  tool: string;
  /** Which action type, or '*' for all actions on that tool */
  action: string;
  /** What to do */
  level: PermissionLevel;
  /** Why this rule exists (shown to user when prompting) */
  reason?: string;
}

export interface PermissionCheck {
  tool: string;
  action: string;
  params: Record<string, unknown>;
}

export interface PermissionResult {
  allowed: boolean;
  level: PermissionLevel;
  reason?: string;
  rule?: PermissionRule;
}

// ---------------------------------------------------------------------------
// Default Rules
// ---------------------------------------------------------------------------

/** Safe by default. Dangerous actions require confirmation. */
const DEFAULT_RULES: PermissionRule[] = [
  // --- Always allowed (read-only, non-destructive) ---
  { tool: 'filesystem', action: 'read',    level: 'allow' },
  { tool: 'filesystem', action: 'list',    level: 'allow' },
  { tool: 'claudable',  action: 'direct-read',   level: 'allow' },
  { tool: 'claudable',  action: 'project-list',  level: 'allow' },
  { tool: 'claudable',  action: 'preview',       level: 'allow' },
  { tool: 'git',        action: 'status',  level: 'allow' },
  { tool: 'git',        action: 'log',     level: 'allow' },
  { tool: 'git',        action: 'branch',  level: 'allow' },
  { tool: 'docker',     action: 'ps',            level: 'allow' },
  { tool: 'docker',     action: 'health',        level: 'allow' },
  { tool: 'docker',     action: 'stats',         level: 'allow' },
  { tool: 'docker',     action: 'hosts',         level: 'allow' },
  { tool: 'docker',     action: 'sandbox-ps',    level: 'allow' },
  { tool: 'docker',     action: 'doctor',        level: 'allow' },

  // --- Needs confirmation (creates or modifies things) ---
  { tool: 'filesystem', action: 'write',   level: 'prompt', reason: 'Will create or overwrite a file' },
  { tool: 'filesystem', action: 'mkdir',   level: 'prompt', reason: 'Will create a directory' },
  { tool: 'filesystem', action: 'delete',  level: 'prompt', reason: 'Will permanently delete a file or directory' },
  { tool: 'claudable',  action: 'generate',      level: 'prompt', reason: 'Will use AI to generate/modify code' },
  { tool: 'claudable',  action: 'direct-write',  level: 'prompt', reason: 'Will write directly to a project file' },
  { tool: 'claudable',  action: 'project-create', level: 'prompt', reason: 'Will create a new project' },
  { tool: 'git',        action: 'commit',  level: 'prompt', reason: 'Will create a git commit' },
  { tool: 'git',        action: 'push',    level: 'prompt', reason: 'Will push code to a remote repository' },
  { tool: 'git',        action: 'init',    level: 'prompt', reason: 'Will initialize a git repository' },
  { tool: 'docker',     action: 'run',     level: 'prompt', reason: 'Will start a new container' },
  { tool: 'docker',     action: 'build',   level: 'prompt', reason: 'Will build a Docker image' },

  { tool: 'docker',     action: 'sandbox-run',     level: 'prompt', reason: 'Will start a sandbox container' },
  { tool: 'docker',     action: 'sandbox-cleanup', level: 'prompt', reason: 'Will remove sandbox containers' },

  // --- Destructive container actions need confirmation ---
  { tool: 'docker', action: 'container-action', level: 'prompt', reason: 'Will modify a running container' },
];

// ---------------------------------------------------------------------------
// Permission Manager
// ---------------------------------------------------------------------------

export class PermissionManager {
  private rules: PermissionRule[];
  /** Actions the user has approved for this session (tool:action keys) */
  private sessionApprovals: Set<string> = new Set();
  /** If true, skip all prompts (for automated/CI use -- be careful) */
  private autoApprove = false;

  constructor(customRules?: PermissionRule[]) {
    this.rules = customRules ?? [...DEFAULT_RULES];
  }

  /** Enable auto-approve mode. Use only in trusted, automated environments. */
  setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
  }

  /** Add a custom rule. Custom rules are checked before defaults. */
  addRule(rule: PermissionRule): void {
    // Insert at the beginning so custom rules take priority
    this.rules.unshift(rule);
  }

  /** Check if an action is allowed. */
  check(req: PermissionCheck): PermissionResult {
    if (this.autoApprove) {
      return { allowed: true, level: 'allow', reason: 'Auto-approve enabled' };
    }

    // Check session approvals first (exact match, then tool-level wildcard)
    const sessionKey = `${req.tool}:${req.action}`;
    if (this.sessionApprovals.has(sessionKey) || this.sessionApprovals.has(`${req.tool}:*`)) {
      return { allowed: true, level: 'allow', reason: 'Approved earlier this session' };
    }

    // Find matching rule (first match wins)
    const rule = this.findRule(req.tool, req.action);
    if (!rule) {
      // No rule found -- default to prompt (safe default)
      return {
        allowed: false,
        level: 'prompt',
        reason: `No permission rule for ${req.tool}:${req.action}`,
      };
    }

    return {
      allowed: rule.level === 'allow',
      level: rule.level,
      reason: rule.reason,
      rule,
    };
  }

  /** Record that the user approved an action for this session. */
  approveForSession(tool: string, action: string): void {
    this.sessionApprovals.add(`${tool}:${action}`);
  }

  /** Record approval for all actions on a tool. */
  approveToolForSession(tool: string): void {
    this.sessionApprovals.add(`${tool}:*`);
  }

  /** Clear all session approvals. */
  clearSessionApprovals(): void {
    this.sessionApprovals.clear();
  }

  private findRule(tool: string, action: string): PermissionRule | undefined {
    // Exact match first
    let rule = this.rules.find((r) => r.tool === tool && r.action === action);
    if (rule) return rule;

    // Tool wildcard
    rule = this.rules.find((r) => r.tool === tool && r.action === '*');
    if (rule) return rule;

    // Global wildcard
    rule = this.rules.find((r) => r.tool === '*' && r.action === '*');
    return rule;
  }
}
