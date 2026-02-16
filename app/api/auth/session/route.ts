/**
 * Auth Session API
 * POST /api/auth/session — Create a new session token.
 *
 * This endpoint is only accessible from localhost. It creates a signed
 * session token that the client includes in subsequent API requests.
 *
 * When AUTH_SECRET is not set, returns a stub response (auth is disabled).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isAuthEnabled,
  createSessionToken,
  isLocalhostRequest,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({
      success: true,
      authEnabled: false,
      message: 'Authentication is disabled. Set AUTH_SECRET to enable.',
    });
  }

  if (!isLocalhostRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Not found' },
      { status: 404 },
    );
  }

  const token = createSessionToken();

  const response = NextResponse.json({ success: true, token });
  response.cookies.set('__session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });

  return response;
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    authEnabled: isAuthEnabled(),
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
