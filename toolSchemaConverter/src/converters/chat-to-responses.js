/**
 * Convert Chat Completions format to Responses API format
 */

/**
 * Convert Chat Completions request to Responses API request
 * @param {Object} chatRequest - Chat Completions format request
 * @returns {Object} Responses API format request
 */
export function convertChatRequestToResponsesFormat(chatRequest) {
  const responsesRequest = {
    model: chatRequest.model || 'gpt-5'
  };

  // Convert messages to input
  if (chatRequest.messages && chatRequest.messages.length > 0) {
    // For Responses API, we convert messages array to structured input
    // Simple case: if single user message, use as string
    if (chatRequest.messages.length === 1 && chatRequest.messages[0].role === 'user') {
      responsesRequest.input = chatRequest.messages[0].content;
    } else {
      // Complex case: use messages array format
      responsesRequest.input = chatRequest.messages;
    }
  }

  // Copy tools
  if (chatRequest.tools) {
    responsesRequest.tools = chatRequest.tools;
  }

  // Copy other parameters
  if (chatRequest.temperature !== undefined) {
    responsesRequest.temperature = chatRequest.temperature;
  }

  if (chatRequest.max_tokens !== undefined) {
    responsesRequest.max_tokens = chatRequest.max_tokens;
  }

  // Store parameter (default true in Responses API)
  if (chatRequest.store !== undefined) {
    responsesRequest.store = chatRequest.store;
  }

  // Handle response_format -> text.format conversion
  if (chatRequest.response_format) {
    responsesRequest.text = {
      format: chatRequest.response_format
    };
  }

  return responsesRequest;
}

/**
 * Convert Responses API response to Chat Completions format
 * @param {Object} responsesResponse - Responses API format response
 * @returns {Object} Chat Completions format response
 */
export function convertResponsesResponseToChatFormat(responsesResponse) {
  const message = {
    role: 'assistant',
    content: null
  };

  const toolCalls = [];
  let textContent = '';

  // Process output items
  if (responsesResponse.output && Array.isArray(responsesResponse.output)) {
    for (const item of responsesResponse.output) {
      // Handle message type
      if (item.type === 'message' && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === 'output_text') {
            textContent += contentItem.text;
          }
        }
      }
      // Handle function_call type
      else if (item.type === 'function_call') {
        toolCalls.push({
          id: item.call_id,
          type: 'function',
          function: {
            name: item.name,
            arguments: JSON.stringify(item.input || {})
          }
        });
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
  if (toolCalls.length > 0) {
    finishReason = 'tool_calls';
  }

  return {
    id: responsesResponse.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: responsesResponse.created_at || Math.floor(Date.now() / 1000),
    model: responsesResponse.model || 'gpt-5',
    choices: [
      {
        index: 0,
        message: message,
        finish_reason: finishReason
      }
    ],
    usage: responsesResponse.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}
