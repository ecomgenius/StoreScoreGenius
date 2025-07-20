/**
 * Standardized error handling utilities
 * Provides consistent error responses and logging across the application
 */

import type { Response } from 'express';

/**
 * Standard API error response format
 */
export interface ApiError {
  error: string;
  details?: string;
  code?: string;
  timestamp: string;
  path?: string;
}

/**
 * Creates a standardized error response
 * @param error - The error that occurred
 * @param context - Context describing where the error occurred
 * @param res - Express response object
 * @param statusCode - HTTP status code (default: 500)
 */
export const handleApiError = (
  error: unknown,
  context: string,
  res: Response,
  statusCode: number = 500
): void => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  
  console.error(`${context}:`, {
    error: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });

  const apiError: ApiError = {
    error: `Failed to ${context.toLowerCase()}`,
    details: errorMessage,
    timestamp: new Date().toISOString(),
    path: res.req?.path
  };

  res.status(statusCode).json(apiError);
};

/**
 * Handles authentication errors
 * @param res - Express response object
 * @param message - Optional custom message
 */
export const handleAuthError = (res: Response, message = 'Authentication required'): void => {
  const apiError: ApiError = {
    error: message,
    code: 'AUTH_REQUIRED',
    timestamp: new Date().toISOString(),
    path: res.req?.path
  };

  res.status(401).json(apiError);
};

/**
 * Handles validation errors
 * @param res - Express response object
 * @param validationErrors - Array of validation error messages
 */
export const handleValidationError = (
  res: Response,
  validationErrors: string[]
): void => {
  const apiError: ApiError = {
    error: 'Validation failed',
    details: validationErrors.join(', '),
    code: 'VALIDATION_ERROR',
    timestamp: new Date().toISOString(),
    path: res.req?.path
  };

  res.status(400).json(apiError);
};

/**
 * Handles insufficient credits errors
 * @param res - Express response object
 * @param required - Credits required for the operation
 * @param available - Credits available to the user
 */
export const handleInsufficientCreditsError = (
  res: Response,
  required: number,
  available: number
): void => {
  const apiError: ApiError = {
    error: 'Insufficient credits',
    details: `Required: ${required}, Available: ${available}`,
    code: 'INSUFFICIENT_CREDITS',
    timestamp: new Date().toISOString(),
    path: res.req?.path
  };

  res.status(402).json(apiError);
};

/**
 * Handles subscription required errors
 * @param res - Express response object
 * @param feature - Feature that requires subscription
 */
export const handleSubscriptionRequiredError = (
  res: Response,
  feature: string
): void => {
  const apiError: ApiError = {
    error: 'Subscription required',
    details: `${feature} requires an active subscription`,
    code: 'SUBSCRIPTION_REQUIRED',
    timestamp: new Date().toISOString(),
    path: res.req?.path
  };

  res.status(403).json(apiError);
};

/**
 * Handles rate limiting errors
 * @param res - Express response object
 * @param retryAfter - Seconds until user can retry
 */
export const handleRateLimitError = (
  res: Response,
  retryAfter: number
): void => {
  const apiError: ApiError = {
    error: 'Rate limit exceeded',
    details: `Please try again in ${retryAfter} seconds`,
    code: 'RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString(),
    path: res.req?.path
  };

  res.setHeader('Retry-After', retryAfter);
  res.status(429).json(apiError);
};

/**
 * Handles resource not found errors
 * @param res - Express response object
 * @param resource - The resource that wasn't found
 * @param id - The ID that wasn't found (optional)
 */
export const handleNotFoundError = (
  res: Response,
  resource: string,
  id?: string | number
): void => {
  const apiError: ApiError = {
    error: `${resource} not found`,
    details: id ? `${resource} with ID ${id} does not exist` : undefined,
    code: 'NOT_FOUND',
    timestamp: new Date().toISOString(),
    path: res.req?.path
  };

  res.status(404).json(apiError);
};

/**
 * Logs and handles OpenAI API errors
 * @param error - OpenAI error
 * @param context - Context where the error occurred
 * @param res - Express response object
 */
export const handleOpenAIError = (
  error: any,
  context: string,
  res: Response
): void => {
  const isRateLimited = error.status === 429;
  const isQuotaExceeded = error.code === 'insufficient_quota';
  
  console.error(`OpenAI Error in ${context}:`, {
    status: error.status,
    code: error.code,
    message: error.message,
    timestamp: new Date().toISOString()
  });

  if (isRateLimited) {
    handleRateLimitError(res, 60); // Retry after 60 seconds
    return;
  }

  if (isQuotaExceeded) {
    const apiError: ApiError = {
      error: 'AI service temporarily unavailable',
      details: 'Please try again later',
      code: 'AI_QUOTA_EXCEEDED',
      timestamp: new Date().toISOString(),
      path: res.req?.path
    };
    
    res.status(503).json(apiError);
    return;
  }

  handleApiError(error, `AI ${context}`, res, 500);
};

/**
 * Logs info messages with consistent formatting
 * @param context - Context of the log
 * @param message - Log message
 * @param data - Additional data to log
 */
export const logInfo = (context: string, message: string, data?: any): void => {
  console.log(`[${context}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

/**
 * Logs warning messages with consistent formatting
 * @param context - Context of the log
 * @param message - Warning message
 * @param data - Additional data to log
 */
export const logWarning = (context: string, message: string, data?: any): void => {
  console.warn(`[${context}] WARNING: ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

/**
 * Creates a try-catch wrapper for async route handlers
 * @param handler - Async route handler function
 * @param context - Context for error handling
 * @returns Wrapped handler with error handling
 */
export const asyncHandler = (
  handler: (req: any, res: Response, next?: any) => Promise<void>,
  context: string
) => {
  return async (req: any, res: Response, next?: any) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      handleApiError(error, context, res);
    }
  };
};