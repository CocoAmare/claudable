// OpenClaw Configuration
// Defaults for running alongside Claudable in the same repo.
// Override these via environment variables or by passing config to OpenClaw.create().

import * as path from 'path';
import type { OpenClawConfig } from './types';

/** Resolve a path relative to this project's root. */
function fromRoot(...segments: string[]): string {
  return path.resolve(__dirname, '..', ...segments);
}

/**
 * Default configuration when running inside the Claudable repo.
 * Set OPENCLAW_STANDALONE=1 to skip Claudable integration.
 */
export function getDefaultConfig(): OpenClawConfig {
  const standalone = process.env.OPENCLAW_STANDALONE === '1';

  const config: OpenClawConfig = {
    workDir: process.env.OPENCLAW_WORK_DIR ?? fromRoot('data', 'projects'),
    logLevel: (process.env.OPENCLAW_LOG_LEVEL as OpenClawConfig['logLevel']) ?? 'info',
    plugins: [],
  };

  // Claudable integration (skip if standalone)
  if (!standalone) {
    const claudablePort = process.env.PORT ?? process.env.CLAUDABLE_PORT ?? '3000';
    config.claudable = {
      baseUrl: process.env.CLAUDABLE_URL ?? `http://localhost:${claudablePort}`,
      projectsDir: process.env.PROJECTS_DIR ?? fromRoot('data', 'projects'),
    };
  }

  // Docker
  if (process.env.DOCKER_HOST || process.env.OPENCLAW_DOCKER !== '0') {
    config.docker = {
      socketPath: process.env.DOCKER_HOST ?? '/var/run/docker.sock',
    };
  }

  // Community plugins (comma-separated paths)
  if (process.env.OPENCLAW_PLUGINS) {
    config.plugins = process.env.OPENCLAW_PLUGINS.split(',').map((p: string) => p.trim()).filter(Boolean);
  }

  return config;
}
