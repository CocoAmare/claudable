import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Middleware — runs on the Edge Runtime.
 *
 * Responsibilities:
 *  1. Security headers on every response
 *  2. CSRF validation (Origin check) on state-changing API requests
 *  3. Localhost restriction on sensitive internal endpoints
 *  4. Session-token authentication when AUTH_SECRET is set
 *
 * Auth uses Web Crypto API (Edge-compatible) for HMAC validation.
 */

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

const AUTH_EXEMPT_PREFIXES = ['/api/auth'];

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function jsonError(error: string, status: number): NextResponse {
  return addSecurityHeaders(
    NextResponse.json({ success: false, error }, { status }),
  );
}

function isLocalhostRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    return firstIp === '127.0.0.1' || firstIp === '::1' || firstIp === 'localhost';
  }
  const host = request.headers.get('host') ?? '';
  return (
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const cookie = request.cookies.get('__session');
  return cookie?.value ?? null;
}

/**
 * Validate a session token using Web Crypto API (Edge-compatible).
 */
async function validateTokenEdge(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [timestamp, , signature] = parts;
    const payload = parts.slice(0, 2).join('.');

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expected = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (!timingSafeEqual(signature, expected)) return false;

    const created = parseInt(timestamp, 36);
    if (isNaN(created) || Date.now() - created > TOKEN_EXPIRY_MS) return false;

    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * Restrict /api/tokens/internal/<provider>/token to localhost.
 */
function checkLocalhostRestriction(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  if (/^\/api\/tokens\/internal\/.+\/token$/.test(pathname)) {
    if (!isLocalhostRequest(request)) {
      return jsonError('Not found', 404);
    }
  }
  return null;
}

/**
 * CSRF: Verify Origin matches Host on state-changing requests.
 */
function checkCsrf(request: NextRequest): NextResponse | null {
  const method = request.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return null;
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    // No Origin header — same-origin browser requests, non-browser clients (curl, SDKs).
    return null;
  }

  const host = request.headers.get('host');
  if (!host) {
    return jsonError('Missing host header', 400);
  }

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return jsonError('Origin mismatch', 403);
    }
  } catch {
    return jsonError('Invalid origin header', 400);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Non-API routes: just add security headers
  if (!pathname.startsWith('/api/')) {
    return addSecurityHeaders(NextResponse.next());
  }

  // 1. Localhost restriction on sensitive endpoints
  const localhostCheck = checkLocalhostRestriction(request);
  if (localhostCheck) return localhostCheck;

  // 2. CSRF validation
  const csrfCheck = checkCsrf(request);
  if (csrfCheck) return csrfCheck;

  // 3. Authentication (when AUTH_SECRET is set)
  const authSecret = process.env.AUTH_SECRET;
  if (authSecret) {
    const isExempt = AUTH_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
    if (!isExempt) {
      const token = extractToken(request);
      if (!token || !(await validateTokenEdge(token, authSecret))) {
        return jsonError('Authentication required', 401);
      }
    }
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    // All routes except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
