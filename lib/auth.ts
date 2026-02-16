import crypto from 'crypto';
import { type NextRequest, NextResponse } from 'next/server';

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if authentication is enabled.
 * Auth is enabled when AUTH_SECRET is set in the environment.
 */
export function isAuthEnabled(): boolean {
  return !!process.env.AUTH_SECRET;
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured');
  }
  return secret;
}

/**
 * Create a signed session token.
 * Format: <timestamp_base36>.<random_hex>.<hmac_hex>
 */
export function createSessionToken(): string {
  const secret = getAuthSecret();
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(16).toString('hex');
  const payload = `${timestamp}.${random}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

/**
 * Validate a session token. Returns true if the signature matches and the token has not expired.
 */
export function validateSessionToken(token: string): boolean {
  try {
    const secret = getAuthSecret();
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [timestamp, random, signature] = parts;
    const payload = `${timestamp}.${random}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;

    // Check expiry
    const created = parseInt(timestamp, 36);
    if (isNaN(created) || Date.now() - created > TOKEN_EXPIRY_MS) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Extract a session token from request headers or cookies.
 */
function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const cookie = request.cookies.get('__session');
  return cookie?.value ?? null;
}

/**
 * Require authentication on a request.
 * Returns null if auth passes, or a NextResponse error if it fails.
 * When AUTH_SECRET is not set, auth is disabled and all requests pass.
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  if (!isAuthEnabled()) {
    return null;
  }

  const token = extractToken(request);
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 },
    );
  }

  if (!validateSessionToken(token)) {
    return NextResponse.json(
      { success: false, error: 'Invalid or expired session' },
      { status: 401 },
    );
  }

  return null;
}

/**
 * Check if a request originates from localhost.
 */
export function isLocalhostRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    return (
      firstIp === '127.0.0.1' || firstIp === '::1' || firstIp === 'localhost'
    );
  }

  const host = request.headers.get('host') ?? '';
  return (
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}
