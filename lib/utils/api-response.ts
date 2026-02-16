import { NextResponse } from 'next/server';

/**
 * Standard API response utilities for consistent error handling and responses
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Create a successful API response
 */
export function createSuccessResponse<T>(data: T, status: number = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    data
  }, { status });
}

/**
 * Create an error response with consistent format.
 * Never includes internal error details in the response body.
 */
export function createErrorResponse(
  error: string,
  status: number = 500
): NextResponse<ApiResponse> {
  return NextResponse.json({
    success: false,
    error,
  }, { status });
}

/**
 * Handle API errors consistently with logging.
 * Logs full error details server-side but returns only a generic message to clients.
 */
export function handleApiError(
  error: unknown,
  context: string,
  defaultMessage: string = 'Operation failed'
): NextResponse<ApiResponse> {
  console.error(`[${context}] ${defaultMessage}:`, error);

  // Determine appropriate status code based on error type
  let status = 500;
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('not found') || msg.includes('Not found')) {
      status = 404;
    } else if (
      msg.includes('Invalid') ||
      msg.includes('missing') ||
      msg.includes('required') ||
      msg.includes('Unauthorized')
    ) {
      status = 400;
    }
  }

  return createErrorResponse(defaultMessage, status);
}

/**
 * Wrapper for async API handlers with consistent error handling
 */
export function withApiHandler<T = any>(
  handler: () => Promise<NextResponse<ApiResponse<T>>>,
  context: string,
  errorMessage?: string
): Promise<NextResponse<ApiResponse<T>>> {
  return handler().catch((error) => handleApiError(error, context, errorMessage));
}