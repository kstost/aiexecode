/**
 * OpenAI-compatible error handling
 */

/**
 * OpenAI API Error class
 * Follows OpenAI Responses API error format
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

    // Store original request for response format
    this.request = options.request || {};
  }

  /**
   * Convert to OpenAI Responses API error format
   */
  toResponsesFormat() {
    return {
      id: `resp_error_${Date.now()}`,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      status: 'failed',
      background: false,
      billing: {
        payer: 'developer'
      },
      error: {
        type: this.error.type,
        message: this.error.message,
        code: this.error.code,
        param: this.error.param
      },
      incomplete_details: null,
      instructions: this.request.instructions || null,
      max_output_tokens: this.request.max_output_tokens || null,
      max_tool_calls: null,
      model: this.request.model || null,
      output: [],
      parallel_tool_calls: true,
      previous_response_id: null,
      prompt_cache_key: null,
      prompt_cache_retention: null,
      reasoning: {
        effort: this.request.reasoning?.effort || null,
        summary: this.request.reasoning?.summary || null
      },
      safety_identifier: null,
      service_tier: 'default',
      store: this.request.store !== undefined ? this.request.store : true,
      temperature: this.request.temperature !== undefined ? this.request.temperature : 1,
      text: {
        format: {
          type: 'text'
        },
        verbosity: 'medium'
      },
      tool_choice: this.request.tool_choice || 'auto',
      tools: this.request.tools || [],
      top_logprobs: 0,
      top_p: this.request.top_p !== undefined ? this.request.top_p : 1,
      truncation: 'disabled',
      usage: {
        input_tokens: 0,
        input_tokens_details: {
          cached_tokens: 0
        },
        output_tokens: 0,
        output_tokens_details: {
          reasoning_tokens: 0
        },
        total_tokens: 0
      },
      user: null,
      metadata: {},
      output_text: ''
    };
  }

  /**
   * Convert to JSON (Legacy OpenAI error format)
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
