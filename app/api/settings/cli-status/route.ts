/**
 * CLI Status API Route
 * GET /api/settings/cli-status - Check CLI installation status
 */

import { NextResponse } from 'next/server';
import { spawnSync } from 'child_process';
import type { CLIStatus } from '@/types/backend';
import { CODEX_MODEL_DEFINITIONS } from '@/lib/constants/codexModels';
import { QWEN_MODEL_DEFINITIONS } from '@/lib/constants/qwenModels';
import { GLM_MODEL_DEFINITIONS } from '@/lib/constants/glmModels';
import { CURSOR_MODEL_DEFINITIONS } from '@/lib/constants/cursorModels';

/**
 * Run a CLI command safely using spawnSync with array arguments (no shell).
 */
function checkCLIVersion(executable: string): { installed: boolean; version?: string; error?: string } {
  try {
    const result = spawnSync(executable, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });

    if (result.error) {
      return { installed: false, error: 'CLI not found' };
    }

    if (result.status !== 0) {
      return { installed: false, error: 'CLI check failed' };
    }

    const output = `${(result.stdout ?? '').trim()} ${(result.stderr ?? '').trim()}`.trim();
    return {
      installed: true,
      version: output || 'installed',
    };
  } catch {
    return { installed: false, error: 'CLI check failed' };
  }
}

/**
 * GET /api/settings/cli-status
 * Check CLI installation status
 */
export async function GET() {
  try {
    const claudeStatus = checkCLIVersion('claude');
    const codexExe = process.platform === 'win32' ? 'codex.cmd' : 'codex';
    const cursorExe = process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent';
    const qwenExe = process.platform === 'win32' ? 'qwen.cmd' : 'qwen';

    const codexStatus = checkCLIVersion(codexExe);
    const cursorStatus = checkCLIVersion(cursorExe);
    const qwenStatus = checkCLIVersion(qwenExe);

    const status: CLIStatus = {
      claude: {
        installed: claudeStatus.installed,
        version: claudeStatus.version,
        checking: false,
        error: claudeStatus.error,
      },
      cursor: {
        installed: cursorStatus.installed,
        version: cursorStatus.version,
        checking: false,
        error: cursorStatus.error,
        models: CURSOR_MODEL_DEFINITIONS.map((model) => model.id),
      },
      codex: {
        installed: codexStatus.installed,
        version: codexStatus.version,
        checking: false,
        error: codexStatus.error,
        models: CODEX_MODEL_DEFINITIONS.map((model) => model.id),
      },
      gemini: {
        installed: false,
        checking: false,
      },
      qwen: {
        installed: qwenStatus.installed,
        version: qwenStatus.version,
        checking: false,
        error: qwenStatus.error,
        models: QWEN_MODEL_DEFINITIONS.map((model) => model.id),
      },
      glm: {
        installed: claudeStatus.installed,
        version: claudeStatus.version,
        checking: false,
        error: claudeStatus.error,
        models: GLM_MODEL_DEFINITIONS.map((model) => model.id),
      },
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error('[API] Failed to check CLI status:', error);
    return NextResponse.json(
      { error: 'Failed to check CLI status' },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
