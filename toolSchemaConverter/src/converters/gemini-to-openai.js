/**
 * Convert Gemini format response to OpenAI format
 */

/**
 * Convert Gemini response to OpenAI response format
 * @param {Object} geminiResponse - Gemini response object
 * @param {string} model - Model name
 * @returns {Object} OpenAI response object
 */
export function convertGeminiResponseToOpenAI(geminiResponse, model = 'gemini-2.5-flash') {
  const message = {
    role: 'assistant',
    content: null
  };

  const toolCalls = [];
  let textContent = '';

  // Process candidates
  if (geminiResponse.candidates && geminiResponse.candidates.length > 0) {
    const candidate = geminiResponse.candidates[0];

    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          textContent += part.text;
        } else if (part.functionCall) {
          // Generate a unique ID for the tool call
          const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substring(7)}`;

          toolCalls.push({
            id: toolCallId,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {})
            }
          });
        }
      }
    }
  }

  // Set message content and tool_calls
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
    message.content = textContent || null;
  } else {
    message.content = textContent;
  }

  // Determine finish_reason
  let finishReason = 'stop';
  if (geminiResponse.candidates && geminiResponse.candidates[0]) {
    const candidate = geminiResponse.candidates[0];
    if (candidate.finishReason === 'MAX_TOKENS') {
      finishReason = 'length';
    } else if (toolCalls.length > 0) {
      finishReason = 'tool_calls';
    }
  }

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        message: message,
        finish_reason: finishReason
      }
    ],
    usage: {
      prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
      completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0
    }
  };
}
