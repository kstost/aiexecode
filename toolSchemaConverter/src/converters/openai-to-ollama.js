/**
 * Convert OpenAI format request to Ollama format
 */

/**
 * Convert OpenAI request to Ollama request
 * Ollama uses the same format as OpenAI for tools, so minimal conversion needed
 * @param {Object} openaiRequest - OpenAI request object
 * @param {string} baseUrl - Ollama base URL (default: http://localhost:11434)
 * @returns {Object} Ollama request object
 */
export function convertRequestToOllamaFormat(openaiRequest, baseUrl = 'http://localhost:11434') {
  const ollamaRequest = {
    model: openaiRequest.model || 'llama3.2',
    messages: openaiRequest.messages || [],
    stream: openaiRequest.stream !== undefined ? openaiRequest.stream : false
  };

  // Tools - Ollama uses the same format as OpenAI
  if (openaiRequest.tools && openaiRequest.tools.length > 0) {
    ollamaRequest.tools = openaiRequest.tools;
  }

  // Options
  const options = {};

  if (openaiRequest.temperature !== undefined) {
    options.temperature = openaiRequest.temperature;
  }

  if (openaiRequest.max_tokens !== undefined) {
    options.num_predict = openaiRequest.max_tokens;
  }

  if (Object.keys(options).length > 0) {
    ollamaRequest.options = options;
  }

  return {
    url: `${baseUrl}/api/chat`,
    request: ollamaRequest
  };
}
