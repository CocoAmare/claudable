// OpenClaw Audit Logger
// Records every action: what was done, which tool, whether it succeeded,
// and who approved it. Written to a local JSON-lines file for easy parsing.

import * as fs from 'fs/promises';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  timestamp: string;
  tool: string;
  action: string;
  /** Was this auto-allowed, user-approved, or denied? */
  permissionLevel: 'allow' | 'prompt' | 'deny';
  /** Did the action succeed? */
  success: boolean;
  /** Human-readable summary */
  message: string;
  /** Sanitized params (secrets redacted) */
  params?: Record<string, unknown>;
  /** How long the action took in ms */
  durationMs?: number;
  /** Error message if failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// Secrets Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  'token', 'password', 'secret', 'key', 'apikey', 'api_key',
  'authorization', 'auth', 'credential', 'credentials',
]);

/** Redact values for keys that look like secrets. */
function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('token') || lowerKey.includes('secret')) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactParams(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

// ---------------------------------------------------------------------------
// Audit Logger
// ---------------------------------------------------------------------------

export class AuditLogger {
  private logDir: string;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(logDir: string) {
    this.logDir = logDir;
  }

  /** Log an action. Writes are batched and flushed periodically. */
  async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      params: entry.params ? redactParams(entry.params) : undefined,
    };

    const line = JSON.stringify(fullEntry);
    this.buffer.push(line);

    // Flush every 5 seconds or after 50 entries, whichever comes first
    if (this.buffer.length >= 50) {
      await this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush().catch(() => {});
      }, 5000);
    }
  }

  /** Write buffered entries to disk. */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0) return;

    const lines = this.buffer.splice(0);
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const logFile = path.join(this.logDir, `openclaw-${dateStr}.jsonl`);

    try {
      await fs.mkdir(this.logDir, { recursive: true });
      await fs.appendFile(logFile, lines.join('\n') + '\n', 'utf-8');
    } catch (err) {
      // If we can't write the audit log, print to stderr but don't crash
      console.error(`[OpenClaw:Audit] Failed to write log: ${err}`);
    }
  }

  /** Read today's log entries. Useful for the `status` command. */
  async readToday(): Promise<AuditEntry[]> {
    const dateStr = new Date().toISOString().slice(0, 10);
    const logFile = path.join(this.logDir, `openclaw-${dateStr}.jsonl`);

    try {
      const content = await fs.readFile(logFile, 'utf-8');
      return content
        .split('\n')
        .filter(Boolean)
        .map((line: string) => JSON.parse(line) as AuditEntry);
    } catch {
      return [];
    }
  }

  /** Ensure all buffered entries are written before shutdown. */
  async shutdown(): Promise<void> {
    await this.flush();
  }
}
