import { API_BASE_URL } from "@lib/api";

export type UserFriendlyError = {
  type: 'network' | 'not_found' | 'server_error' | 'unknown';
  userMessage: string;
  technicalMessage: string;
  shouldShowRetry: boolean;
};

export function getUserFriendlyApiError(error: unknown): UserFriendlyError {
  // Log technical error for developers
  console.error("API Error:", error);

  if (error instanceof TypeError && error.message.includes('fetch')) {
    // Network/connection error (server not running, etc.)
    return {
      type: 'network',
      userMessage: `Unable to connect to the assistant server. Please check that the local server is running and try again.`,
      technicalMessage: error.message,
      shouldShowRetry: true,
    };
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('failed to fetch') || message.includes('network error')) {
      return {
        type: 'network',
        userMessage: `Unable to connect to the assistant server. Please check that the local server is running and try again.`,
        technicalMessage: error.message,
        shouldShowRetry: true,
      };
    }
    
    if (message.includes('not found') || message.includes('404')) {
      return {
        type: 'not_found',
        userMessage: 'The requested conversation was not found.',
        technicalMessage: error.message,
        shouldShowRetry: false,
      };
    }
    
    if (message.includes('500') || message.includes('internal server error')) {
      return {
        type: 'server_error',
        userMessage: 'The assistant server encountered an error. Please try again in a moment.',
        technicalMessage: error.message,
        shouldShowRetry: true,
      };
    }
    
    // Return the original error message for other known cases
    return {
      type: 'unknown',
      userMessage: error.message,
      technicalMessage: error.message,
      shouldShowRetry: true,
    };
  }

  // Fallback for unknown error types
  return {
    type: 'unknown',
    userMessage: 'An unexpected error occurred. Please try again.',
    technicalMessage: String(error),
    shouldShowRetry: true,
  };
}

export function getExpectedServerUrl(): string {
  return API_BASE_URL;
}