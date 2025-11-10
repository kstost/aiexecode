/**
 * OpenAI-compatible error handling
 */

/**
 * OpenAI API Error class
 * Follows OpenAI error format:
 * {
 *   error: {
 *     message: string,
 *     type: string,
 *     param: string | null,
 *     code: string | null
 *   }
 * }
 */
export class LLMError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LLMError';

    // OpenAI error structure
    this.error = {
      message: message,
      type: options.type || 'api_error',
      param: options.param || null,
      code: options.code || null
    };

    // HTTP status code (if applicable)
    this.status = options.status || 500;

    // Original error (for debugging)
    this.originalError = options.originalError || null;

    // Provider information
    this.provider = options.provider || 'unknown';
  }

  /**
   * Convert to JSON (OpenAI format)
   */
  toJSON() {
    return {
      error: this.error
    };
  }

  /**
   * Convert to string
   */
  toString() {
    return `${this.provider} Error [${this.error.type}]: ${this.error.message}`;
  }
}

/**
 * Map HTTP status codes to OpenAI error types
 */
const ERROR_TYPE_MAP = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  403: 'permission_error',
  404: 'not_found_error',
  429: 'rate_limit_error',
  500: 'api_error',
  502: 'api_error',
  503: 'api_error'
};

/**
 * Create LLMError from HTTP response
 */
export async function createErrorFromResponse(response, provider) {
  const status = response.status;
  let errorData = null;

  try {
    const text = await response.text();
    errorData = JSON.parse(text);
  } catch (e) {
    // Failed to parse JSON
    return new LLMError(
      `HTTP ${status}: ${response.statusText}`,
      {
        type: ERROR_TYPE_MAP[status] || 'api_error',
        status: status,
        provider: provider
      }
    );
  }

  // Extract error information
  let message = errorData.error?.message || errorData.message || response.statusText;
  let type = errorData.error?.type || ERROR_TYPE_MAP[status] || 'api_error';
  let param = errorData.error?.param || null;
  let code = errorData.error?.code || null;

  return new LLMError(message, {
    type: type,
    param: param,
    code: code,
    status: status,
    provider: provider,
    originalError: errorData
  });
}

/**
 * Convert provider-specific error to LLMError
 */
export function normalizeError(error, provider) {
  // Already an LLMError
  if (error instanceof LLMError) {
    return error;
  }

  // Anthropic SDK error (check BEFORE OpenAI SDK error, as both have error.status && error.error)
  if (provider === 'claude' && error.status) {
    // Parse Claude error from error.error object (Anthropic SDK provides parsed error)
    let errorType = ERROR_TYPE_MAP[error.status] || 'api_error';
    let code = null;
    let message = error.message || 'Claude API error';

    // Anthropic SDK provides error.error object with structure:
    // { type: 'error', error: { type: 'not_found_error', message: '...' } }
    if (error.error && error.error.error) {
      const claudeError = error.error.error;

      if (claudeError.type) {
        code = claudeError.type;

        // Map Claude error types to OpenAI error types
        const claudeType = claudeError.type;
        if (claudeType === 'not_found_error') {
          errorType = 'not_found_error';
        } else if (claudeType === 'invalid_request_error') {
          errorType = 'invalid_request_error';
        } else if (claudeType === 'authentication_error') {
          errorType = 'authentication_error';
        } else if (claudeType === 'permission_error') {
          errorType = 'permission_error';
        } else if (claudeType === 'rate_limit_error') {
          errorType = 'rate_limit_error';
        } else if (claudeType === 'overloaded_error') {
          errorType = 'api_error';
        }
      }

      // Use the actual error message from Claude
      if (claudeError.message) {
        message = claudeError.message;
      }
    }

    return new LLMError(
      message,
      {
        type: errorType,
        param: null,
        code: code,
        status: error.status,
        provider: 'claude',
        originalError: error
      }
    );
  }

  // OpenAI SDK error
  if (error.status && error.error) {
    return new LLMError(
      error.error.message || error.message,
      {
        type: error.error.type || ERROR_TYPE_MAP[error.status] || 'api_error',
        param: error.error.param || null,
        code: error.error.code || null,
        status: error.status,
        provider: provider,
        originalError: error
      }
    );
  }

  // Google Generative AI error
  if (provider === 'gemini') {
    // Extract status from error message if available
    let status = 500;
    const statusMatch = error.message?.match(/\[(\d+)\s+/);
    if (statusMatch) {
      status = parseInt(statusMatch[1]);
    }

    return new LLMError(
      error.message || 'Gemini API error',
      {
        type: ERROR_TYPE_MAP[status] || 'api_error',
        param: null,
        code: null,
        status: status,
        provider: 'gemini',
        originalError: error
      }
    );
  }

  // Ollama error
  if (provider === 'ollama') {
    return new LLMError(
      error.message || 'Ollama API error',
      {
        type: 'api_error',
        param: null,
        code: null,
        status: error.status || 500,
        provider: 'ollama',
        originalError: error
      }
    );
  }

  // Network errors (connection refused, DNS errors, etc)
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return new LLMError(
      error.message || 'Network connection error',
      {
        type: 'api_error',
        param: null,
        code: error.code,
        status: 500,
        provider: provider,
        originalError: error
      }
    );
  }

  // TypeError (usually from URL parsing or network issues)
  if (error instanceof TypeError) {
    return new LLMError(
      error.message || 'Request error',
      {
        type: 'api_error',
        param: null,
        code: null,
        status: 500,
        provider: provider,
        originalError: error
      }
    );
  }

  // Generic error
  return new LLMError(
    error.message || 'Unknown error',
    {
      type: 'api_error',
      status: 500,
      provider: provider,
      originalError: error
    }
  );
}

/**
 * Specific error types for common cases
 */

export class AuthenticationError extends LLMError {
  constructor(message, provider) {
    super(message, {
      type: 'authentication_error',
      code: 'invalid_api_key',
      status: 401,
      provider: provider
    });
    this.name = 'AuthenticationError';
  }
}

export class InvalidRequestError extends LLMError {
  constructor(message, param, provider) {
    super(message, {
      type: 'invalid_request_error',
      param: param,
      status: 400,
      provider: provider
    });
    this.name = 'InvalidRequestError';
  }
}

export class RateLimitError extends LLMError {
  constructor(message, provider) {
    super(message, {
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
      status: 429,
      provider: provider
    });
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends LLMError {
  constructor(message, provider) {
    super(message, {
      type: 'not_found_error',
      status: 404,
      provider: provider
    });
    this.name = 'NotFoundError';
  }
}
