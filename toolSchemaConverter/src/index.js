/**
 * LLM Function Adapter
 * Unified interface for function calling across OpenAI, Claude, Gemini, and Ollama
 */

export { UnifiedLLMClient } from './client.js';

// Export converters for advanced usage
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
