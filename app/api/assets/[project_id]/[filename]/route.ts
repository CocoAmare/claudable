import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectById } from '@/lib/services/project';

interface RouteContext {
  params: Promise<{ project_id: string; filename: string }>;
}

const PROJECTS_DIR = process.env.PROJECTS_DIR || './data/projects';
const PROJECTS_DIR_ABSOLUTE = path.isAbsolute(PROJECTS_DIR)
  ? PROJECTS_DIR
  : path.resolve(process.cwd(), PROJECTS_DIR);

function inferContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Resolve an asset path safely, preventing directory traversal.
 * Returns the absolute file path or null if the path escapes the assets directory.
 */
function resolveAssetPath(projectId: string, filename: string): string | null {
  // Strip directory components — only the basename is meaningful for assets
  const safeName = path.basename(filename);
  if (!safeName || safeName === '.' || safeName === '..') {
    return null;
  }

  const assetsDir = path.resolve(PROJECTS_DIR_ABSOLUTE, projectId, 'assets');
  const resolved = path.resolve(assetsDir, safeName);

  // Belt-and-suspenders: verify the resolved path is inside the assets directory
  if (!resolved.startsWith(assetsDir + path.sep) && resolved !== assetsDir) {
    return null;
  }

  return resolved;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { project_id, filename } = await params;

  try {
    const project = await getProjectById(project_id);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const filePath = resolveAssetPath(project_id, filename);
    if (!filePath) {
      return NextResponse.json({ success: false, error: 'Invalid filename' }, { status: 400 });
    }

    const fileStat = await fs.stat(filePath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return NextResponse.json({ success: false, error: 'Image not found' }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(filePath);
    const response = new NextResponse(fileBuffer as unknown as BodyInit);
    response.headers.set('Content-Type', inferContentType(filename));
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return response;
  } catch (error) {
    console.error('[Assets Get] Failed for project:', project_id);
    return NextResponse.json(
      { success: false, error: 'Failed to load image' },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
