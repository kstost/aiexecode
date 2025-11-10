/**
 * LLM Function Adapter
 * Unified interface for LLMs using OpenAI Responses API format
 */

export { UnifiedLLMClient } from './client.js';

// Export Responses API converters (Primary - Recommended)
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

// Export legacy Chat Completions converters (for backward compatibility)
export {
  convertToolsToClaudeFormat,
  convertMessagesToClaudeFormat,
  convertRequestToClaudeFormat
} from './converters/openai-to-claude.js';

export {
  convertClaudeResponseToOpenAI
} from './converters/claude-to-openai.js';

export {
  convertToolsToGeminiFormat,
  convertMessagesToGeminiFormat,
  convertRequestToGeminiFormat
} from './converters/openai-to-gemini.js';

export {
  convertGeminiResponseToOpenAI
} from './converters/gemini-to-openai.js';

export {
  convertRequestToOllamaFormat
} from './converters/openai-to-ollama.js';

export {
  convertOllamaResponseToOpenAI
} from './converters/ollama-to-openai.js';

export {
  convertChatRequestToResponsesFormat,
  convertResponsesResponseToChatFormat
} from './converters/chat-to-responses.js';

// Export error classes
export {
  LLMError,
  AuthenticationError,
  InvalidRequestError,
  RateLimitError,
  NotFoundError
} from './errors.js';
