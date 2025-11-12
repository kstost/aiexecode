/**
 * LLM Function Adapter
 * Unified interface for LLMs using OpenAI Responses API format
 */

export { UnifiedLLMClient } from './client.js';

// Export Responses API converters
export {
  convertResponsesRequestToClaudeFormat,
  convertClaudeResponseToResponsesFormat
} from './converters/responses-to-claude.js';

export {
  convertResponsesRequestToGeminiFormat,
  convertGeminiResponseToResponsesFormat
} from './converters/responses-to-gemini.js';

export {
  convertResponsesRequestToOllamaFormat,
  convertOllamaResponseToResponsesFormat
} from './converters/responses-to-ollama.js';

// Export error classes
export {
  LLMError,
  AuthenticationError,
  InvalidRequestError,
  RateLimitError,
  NotFoundError
} from './errors.js';
