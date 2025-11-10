/**
 * Convert Ollama format response to OpenAI format
 */

/**
 * Convert Ollama response to OpenAI response format
 * @param {Object} ollamaResponse - Ollama response object
 * @returns {Object} OpenAI response object
 */
export function convertOllamaResponseToOpenAI(ollamaResponse) {
  const message = {
    role: 'assistant',
    content: null
  };

  // Process message
  if (ollamaResponse.message) {
    message.content = ollamaResponse.message.content || null;

    // Convert tool_calls
    if (ollamaResponse.message.tool_calls && ollamaResponse.message.tool_calls.length > 0) {
      message.tool_calls = ollamaResponse.message.tool_calls.map((toolCall, index) => {
        // Generate ID if not present
        const id = toolCall.id || `call_${Date.now()}_${index}`;

        return {
          id: id,
          type: 'function',
          function: {
            name: toolCall.function.name,
            arguments: typeof toolCall.function.arguments === 'string'
              ? toolCall.function.arguments
              : JSON.stringify(toolCall.function.arguments)
          }
        };
      });
    }
  }

  // Determine finish_reason
  let finishReason = 'stop';
  if (ollamaResponse.done_reason === 'length') {
    finishReason = 'length';
  } else if (message.tool_calls && message.tool_calls.length > 0) {
    finishReason = 'tool_calls';
  }

  // Calculate token usage
  const promptTokens = ollamaResponse.prompt_eval_count || 0;
  const completionTokens = ollamaResponse.eval_count || 0;

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: ollamaResponse.created_at ? Math.floor(new Date(ollamaResponse.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000),
    model: ollamaResponse.model || 'llama3.2',
    choices: [
      {
        index: 0,
        message: message,
        finish_reason: finishReason
      }
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    }
  };
}
