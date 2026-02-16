import path from 'path';
import fs from 'fs/promises';
import { getPlainServiceToken } from '@/lib/services/tokens';
import { getProjectById, updateProject } from '@/lib/services/project';
import { getProjectService, upsertProjectServiceConnection, updateProjectServiceData } from '@/lib/services/project-services';
import { ensureGitRepository, ensureGitConfig, initializeMainBranch, addOrUpdateRemote, commitAll, pushToRemote } from '@/lib/services/git';
import type { GitHubUserInfo, CreateRepoOptions, GitHubRepositoryInfo } from '@/types/shared';

class GitHubError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'GitHubError';
  }
}

/**
 * Sanitize a string from GitHub profile data for use in git config.
 * Rejects values containing control characters or shell metacharacters.
 */
function sanitizeGitConfigValue(value: string): string {
  // Remove control characters and null bytes
  const cleaned = value.replace(/[\x00-\x1f\x7f]/g, '');
  // Limit length to prevent abuse
  return cleaned.slice(0, 256);
}

/**
 * Validate that a value is safe to use as a URL component.
 */
function sanitizeUrlComponent(value: string): string {
  return encodeURIComponent(value);
}

async function githubFetch(token: string, endpoint: string, init?: RequestInit) {
  const baseUrl = 'https://api.github.com';
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Claudable-Next',
      ...init?.headers,
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const body: any = response.status === 204
    ? null
    : isJson
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    let message = 'GitHub API request failed';
    if (body) {
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object') {
        const errorMessage = (body as Record<string, unknown>).message;
        const errors = (body as Record<string, unknown>).errors;
        if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
          message = errorMessage;
        } else if (Array.isArray(errors) && errors.length > 0) {
          const aggregated = errors
            .map((err) => (err && typeof err === 'object' ? (err as Record<string, unknown>).message : null))
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .join(', ');
          if (aggregated) {
            message = aggregated;
          }
        } else {
          message = JSON.stringify(body);
        }
      }
    }
    throw new GitHubError(message, response.status);
  }

  return body;
}

export async function getGithubUser(): Promise<GitHubUserInfo> {
  const token = await getPlainServiceToken('github');
  if (!token) {
    throw new GitHubError('GitHub token not configured', 401);
  }

  const data = (await githubFetch(token, '/user')) as any;
  return {
    login: data.login,
    name: data.name,
    email: data.email,
  };
}

export async function checkRepositoryAvailability(repoName: string) {
  const token = await getPlainServiceToken('github');
  if (!token) {
    throw new GitHubError('GitHub token not configured', 401);
  }

  const user = await getGithubUser();
  try {
    await githubFetch(token, `/repos/${sanitizeUrlComponent(user.login)}/${sanitizeUrlComponent(repoName)}`);
    return { exists: true, username: user.login };
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return { exists: false, username: user.login };
    }
    throw error;
  }
}

export async function createRepository(options: CreateRepoOptions) {
  const token = await getPlainServiceToken('github');
  if (!token) {
    throw new GitHubError('GitHub token not configured', 401);
  }

  const payload = {
    name: options.repoName,
    description: options.description ?? '',
    private: options.private ?? false,
    auto_init: false,
  };

  try {
    const repo = await githubFetch(token, '/user/repos', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return repo as any;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 422) {
      throw new GitHubError(`Repository name "${options.repoName}" is unavailable or already exists.`, error.status);
    }
    throw error;
  }
}

function resolveProjectRepoPath(projectId: string, repoPath?: string | null) {
  if (repoPath) {
    return path.isAbsolute(repoPath) ? repoPath : path.resolve(process.cwd(), repoPath);
  }
  return path.resolve(process.cwd(), process.env.PROJECTS_DIR || './data/projects', projectId);
}

export async function ensureProjectRepository(projectId: string, repoPath?: string | null) {
  const resolved = resolveProjectRepoPath(projectId, repoPath);
  await fs.mkdir(resolved, { recursive: true });
  return resolved;
}

export async function getGithubRepositoryDetails(owner: string, repo: string): Promise<GitHubRepositoryInfo> {
  const token = await getPlainServiceToken('github');
  if (!token) {
    throw new GitHubError('GitHub token not configured', 401);
  }

  try {
    const data = (await githubFetch(token, `/repos/${sanitizeUrlComponent(owner)}/${sanitizeUrlComponent(repo)}`)) as any;
    if (!data || typeof data.id !== 'number') {
      throw new GitHubError('GitHub repository not found', 404);
    }

    return {
      id: data.id,
      name: data.name,
      full_name: data.full_name,
      owner: {
        login: data.owner?.login ?? owner,
        id: typeof data.owner?.id === 'number' ? data.owner.id : null,
      },
      default_branch: data.default_branch,
    };
  } catch (error) {
    if (error instanceof GitHubError) {
      if (error.status === 404) {
        throw new GitHubError('GitHub repository not found', 404);
      }
      throw error;
    }
    throw new GitHubError('Failed to fetch repository metadata');
  }
}

/**
 * Build an authenticated remote URL using URL-encoded credentials.
 * Tokens and usernames are properly encoded to prevent injection.
 */
function buildAuthenticatedUrl(cloneUrl: string, login: string, token: string): string {
  const encoded = `${sanitizeUrlComponent(login)}:${sanitizeUrlComponent(token)}`;
  return cloneUrl.replace('https://', `https://${encoded}@`);
}

export async function connectProjectToGitHub(projectId: string, options: CreateRepoOptions) {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const token = await getPlainServiceToken('github');
  if (!token) {
    throw new GitHubError('GitHub token not configured', 401);
  }

  const user = await getGithubUser();
  const repo = await createRepository(options);

  const repoPath = await ensureProjectRepository(projectId, project.repoPath);
  ensureGitRepository(repoPath);
  const repoUrl = repo.html_url as string;
  const cloneUrl = repo.clone_url as string;
  const defaultBranch = repo.default_branch as string;

  await updateProject(projectId, { repoPath });

  const userName = sanitizeGitConfigValue(user.name || user.login);
  const userEmail = sanitizeGitConfigValue(user.email || `${user.login}@users.noreply.github.com`);

  ensureGitConfig(repoPath, userName, userEmail);
  initializeMainBranch(repoPath);

  const authenticatedUrl = buildAuthenticatedUrl(cloneUrl, user.login, token);
  addOrUpdateRemote(repoPath, 'origin', authenticatedUrl);
  commitAll(repoPath, 'Initial commit - connected to GitHub');

  await upsertProjectServiceConnection(projectId, 'github', {
    repo_url: repoUrl,
    repo_name: options.repoName,
    clone_url: cloneUrl,
    default_branch: defaultBranch,
    owner: user.login,
  });

  return {
    repo_url: repoUrl,
    clone_url: cloneUrl,
    default_branch: defaultBranch,
    owner: user.login,
  };
}

export async function pushProjectToGitHub(projectId: string) {
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const token = await getPlainServiceToken('github');
    if (!token) {
      throw new GitHubError('GitHub token not configured', 401);
    }

    const service = await getProjectService(projectId, 'github');
    const data = service?.serviceData as Record<string, any> | undefined;
    if (!data?.clone_url || !data?.owner) {
      throw new GitHubError('GitHub repository not connected', 404);
    }

    const repoPath = await ensureProjectRepository(projectId, project.repoPath);
    ensureGitRepository(repoPath);
    const authenticatedUrl = buildAuthenticatedUrl(String(data.clone_url), String(data.owner), token);
    const user = await getGithubUser();
    const userName = sanitizeGitConfigValue(user.name || user.login);
    const userEmail = sanitizeGitConfigValue(user.email || `${user.login}@users.noreply.github.com`);
    ensureGitConfig(repoPath, userName, userEmail);
    addOrUpdateRemote(repoPath, 'origin', authenticatedUrl);
    const committed = commitAll(repoPath, 'Update from Claudable');
    if (!committed) {
      console.log('[GitHubService] No changes to commit before push');
    }

    pushToRemote(repoPath, 'origin', data.default_branch || 'main');

    await updateProjectServiceData(projectId, 'github', {
      last_pushed_at: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof GitHubError) {
      throw error;
    }
    throw new GitHubError('Failed to push project to GitHub');
  }
}
