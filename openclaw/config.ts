// OpenClaw Configuration
// Defaults for running alongside Claudable in the same repo.
// Override these via environment variables or by passing config to OpenClaw.create().

import * as path from 'path';
import { fileURLToPath } from 'url';
import type { OpenClawConfig, RemoteDockerHost, DockerResourceLimits } from './types';

/** Resolve the directory of this file, compatible with both CJS and ESM. */
const _thisDir = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

/** Resolve a path relative to this project's root. */
function fromRoot(...segments: string[]): string {
  return path.resolve(_thisDir, '..', ...segments);
}

const VALID_LOG_LEVELS = new Set<OpenClawConfig['logLevel']>(['debug', 'info', 'warn', 'error']);
const VALID_RESTART_POLICIES = new Set<NonNullable<DockerResourceLimits['restartPolicy']>>(['no', 'always', 'unless-stopped', 'on-failure']);

/**
 * Parse remote Docker hosts from OPENCLAW_DOCKER_HOSTS env var.
 * Format: "name=url,name2=url2" or "name=url;tlsCert=path;tlsKey=path;tlsCa=path,..."
 */
function parseRemoteHosts(raw: string): RemoteDockerHost[] {
  const hosts: RemoteDockerHost[] = [];
  for (const entry of raw.split(',').map((s: string) => s.trim()).filter(Boolean)) {
    const parts = entry.split(';');
    const nameUrl = parts[0].split('=');
    if (nameUrl.length < 2 || !nameUrl[0] || !nameUrl[1]) continue;

    const host: RemoteDockerHost = { name: nameUrl[0], url: nameUrl[1] };

    for (const part of parts.slice(1)) {
      const [key, val] = part.split('=');
      if (!key || !val) continue;
      if (key === 'tlsCert') host.tlsCertPath = val;
      else if (key === 'tlsKey') host.tlsKeyPath = val;
      else if (key === 'tlsCa') host.tlsCaPath = val;
    }

    // Basic validation: URL must start with tcp:// or unix://
    if (/^(tcp|unix):\/\//.test(host.url)) {
      hosts.push(host);
    }
  }
  return hosts;
}

/**
 * Parse default resource limits from OPENCLAW_DOCKER_LIMITS env var.
 * Format: "memoryMb=512,cpus=1.0,restartPolicy=unless-stopped"
 */
function parseResourceLimits(raw: string): DockerResourceLimits {
  const limits: DockerResourceLimits = {};
  for (const pair of raw.split(',').map((s: string) => s.trim()).filter(Boolean)) {
    const [key, val] = pair.split('=');
    if (!key || !val) continue;
    if (key === 'memoryMb') {
      const n = parseInt(val, 10);
      if (n > 0) limits.memoryMb = n;
    } else if (key === 'cpus') {
      const n = parseFloat(val);
      if (n > 0) limits.cpus = n;
    } else if (key === 'restartPolicy' && VALID_RESTART_POLICIES.has(val as DockerResourceLimits['restartPolicy'] & string)) {
      limits.restartPolicy = val as DockerResourceLimits['restartPolicy'];
    }
  }
  return limits;
}

/**
 * Default configuration when running inside the Claudable repo.
 * Set OPENCLAW_STANDALONE=1 to skip Claudable integration.
 */
export function getDefaultConfig(): OpenClawConfig {
  const standalone = process.env.OPENCLAW_STANDALONE === '1';

  const config: OpenClawConfig = {
    workDir: process.env.OPENCLAW_WORK_DIR ?? fromRoot('data', 'projects'),
    logLevel: VALID_LOG_LEVELS.has(process.env.OPENCLAW_LOG_LEVEL as OpenClawConfig['logLevel'])
      ? (process.env.OPENCLAW_LOG_LEVEL as OpenClawConfig['logLevel'])
      : 'info',
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

    // Remote Docker hosts (e.g. Proxmox VMs)
    if (process.env.OPENCLAW_DOCKER_HOSTS) {
      config.docker.remoteHosts = parseRemoteHosts(process.env.OPENCLAW_DOCKER_HOSTS);
    }

    // Default resource limits for all containers
    if (process.env.OPENCLAW_DOCKER_LIMITS) {
      config.docker.defaultResourceLimits = parseResourceLimits(process.env.OPENCLAW_DOCKER_LIMITS);
    }
  }

  // Community plugins (comma-separated paths)
  if (process.env.OPENCLAW_PLUGINS) {
    config.plugins = process.env.OPENCLAW_PLUGINS.split(',').map((p: string) => p.trim()).filter(Boolean);
  }

  return config;
}
