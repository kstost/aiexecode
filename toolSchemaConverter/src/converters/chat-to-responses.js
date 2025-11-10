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

  // Convert tools from Chat Completions format to Responses API format
  // Chat Completions: { type: 'function', function: { name, description, parameters } }
  // Responses API: { type: 'custom', name, description }
  if (chatRequest.tools && Array.isArray(chatRequest.tools)) {
    responsesRequest.tools = chatRequest.tools.map(tool => {
      if (tool.type === 'function' && tool.function) {
        return {
          type: 'custom',
          name: tool.function.name,
          description: tool.function.description || `Function: ${tool.function.name}`
        };
      }
      // If already in Responses API format, pass through
      return tool;
    });
  }

  // IMPORTANT: GPT-5 does NOT support temperature, top_p, logprobs
  // These parameters will cause API errors if included

  // max_tokens -> max_output_tokens (Responses API uses different name)
  if (chatRequest.max_tokens !== undefined) {
    responsesRequest.max_output_tokens = chatRequest.max_tokens;
  }

  // max_output_tokens has priority if explicitly set
  if (chatRequest.max_output_tokens !== undefined) {
    responsesRequest.max_output_tokens = chatRequest.max_output_tokens;
  }

  // GPT-5 specific: reasoning effort control
  // Supports: "minimal", "low", "medium", "high"
  if (chatRequest.reasoning_effort !== undefined) {
    responsesRequest.reasoning = {
      effort: chatRequest.reasoning_effort
    };
  }

  // Alternative: reasoning object format
  if (chatRequest.reasoning !== undefined) {
    responsesRequest.reasoning = chatRequest.reasoning;
  }

  // GPT-5 specific: text verbosity control
  // Supports: "low", "medium", "high", "concise", "verbose"
  if (chatRequest.text_verbosity !== undefined) {
    if (!responsesRequest.text) {
      responsesRequest.text = {};
    }
    responsesRequest.text.verbosity = chatRequest.text_verbosity;
  }

  // Also support verbosity without text_ prefix
  if (chatRequest.verbosity !== undefined) {
    if (!responsesRequest.text) {
      responsesRequest.text = {};
    }
    responsesRequest.text.verbosity = chatRequest.verbosity;
  }

  // Alternative: text object format (highest priority)
  if (chatRequest.text !== undefined) {
    responsesRequest.text = chatRequest.text;
  }

  // Store parameter (default true in Responses API)
  if (chatRequest.store !== undefined) {
    responsesRequest.store = chatRequest.store;
  }

  // Handle response_format -> text.format conversion
  if (chatRequest.response_format) {
    if (!responsesRequest.text) {
      responsesRequest.text = {};
    }
    responsesRequest.text.format = chatRequest.response_format;
  }

  // previous_response_id for conversation chaining
  if (chatRequest.previous_response_id !== undefined) {
    responsesRequest.previous_response_id = chatRequest.previous_response_id;
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
  let reasoningContent = '';

  // Process output items
  if (responsesResponse.output && Array.isArray(responsesResponse.output)) {
    for (const item of responsesResponse.output) {
      // Handle reasoning type (GPT-5 Chain of Thought)
      if (item.type === 'reasoning') {
        // Extract reasoning summary or content
        if (item.summary && Array.isArray(item.summary)) {
          for (const summaryItem of item.summary) {
            if (summaryItem.type === 'output_text' || summaryItem.text) {
              reasoningContent += (summaryItem.text || summaryItem.output_text || '');
            }
          }
        }
        // Some responses might have content array for reasoning
        if (item.content && Array.isArray(item.content)) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text' || contentItem.text) {
              reasoningContent += (contentItem.text || contentItem.output_text || '');
            }
          }
        }
      }
      // Handle message type
      else if (item.type === 'message' && item.content) {
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
  // If we have reasoning content, prepend it to the final content
  let finalContent = textContent;
  if (reasoningContent) {
    // Store reasoning in a special field for inspection (optional)
    message.reasoning = reasoningContent;

    // Optionally prepend reasoning to content (commented out by default)
    // finalContent = `[Reasoning]\n${reasoningContent}\n\n[Answer]\n${textContent}`;
  }

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
    message.content = finalContent || null;
  } else {
    message.content = finalContent;
  }

  // Determine finish_reason
  let finishReason = 'stop';
  if (toolCalls.length > 0) {
    finishReason = 'tool_calls';
  }

  // Build final response
  const chatResponse = {
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

  // Preserve original Responses API output for debugging/inspection
  if (responsesResponse.output) {
    chatResponse._responses_output = responsesResponse.output;
  }

  return chatResponse;
}
