/**
 * Normalize input to OpenAI Responses API format
 *
 * Converts various input formats to the standard Responses API format:
 * input: [
 *   { type: 'message', content: 'text' },
 *   { type: 'function_call', call_id: 'xxx', name: 'tool', arguments: '{}' },
 *   { type: 'function_call_output', call_id: 'xxx', output: 'result' }
 * ]
 */

/**
 * Convert input to OpenAI Responses API format
 *
 * OpenAI Responses API actually accepts:
 * - String input directly
 * - Array of messages in Chat Completions format (role-based)
 *
 * @param {string|Array} input - Input in various formats
 * @returns {string|Array} Normalized input (string or role-based array)
 */
export function normalizeInput(input) {
  // Simple string input - return as-is
  if (typeof input === 'string') {
    return input;
  }

  // Array input
  if (Array.isArray(input) && input.length > 0) {
    const firstItem = input[0];

    // Already in Chat Completions format (role-based) - return as-is
    if (firstItem.role) {
      return input;
    }

    // Convert from our custom format to Chat Completions format
    if (firstItem.type === 'message' || firstItem.type === 'function_call' || firstItem.type === 'function_call_output') {
      return convertResponsesInputToChatCompletions(input);
    }
  }

  // Fallback to string
  return String(input);
}

/**
 * Convert our internal format to Chat Completions format
 * @param {Array} items - Internal format items
 * @returns {Array} Chat Completions format messages
 */
function convertResponsesInputToChatCompletions(items) {
  const messages = [];
  const pendingToolCalls = [];
  let currentAssistantContent = '';

  for (const item of items) {
    if (item.type === 'message') {
      // If we have pending tool calls, create assistant message first
      if (pendingToolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: currentAssistantContent || null,
          tool_calls: [...pendingToolCalls]
        });
        pendingToolCalls.length = 0;
        currentAssistantContent = '';
      }

      // Regular message
      messages.push({
        role: 'user',
        content: item.content
      });
    } else if (item.type === 'function_call') {
      // Tool call
      pendingToolCalls.push({
        id: item.call_id,
        type: 'function',
        function: {
          name: item.name,
          arguments: item.arguments
        }
      });
    } else if (item.type === 'function_call_output') {
      // If we have pending tool calls, create assistant message first
      if (pendingToolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [...pendingToolCalls]
        });
        pendingToolCalls.length = 0;
      }

      // Tool result
      messages.push({
        role: 'tool',
        tool_call_id: item.call_id,
        content: item.output
      });
    }
  }

  // Flush any remaining tool calls
  if (pendingToolCalls.length > 0) {
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [...pendingToolCalls]
    });
  }

  return messages;
}

/**
 * LEGACY: Convert Chat Completions messages to Responses API input
 * @param {Array} messages - Chat Completions format messages
 * @returns {Array} Responses API format input
 */
function convertChatCompletionsToResponsesInput(messages) {
  const result = [];

  for (const msg of messages) {
    const { role, content } = msg;

    if (role === 'system') {
      // System messages become regular messages with system content
      // Note: In real Responses API, system messages go to 'instructions' parameter
      result.push({
        type: 'message',
        content: `[System]: ${content}`
      });
    } else if (role === 'user') {
      result.push({
        type: 'message',
        content: content
      });
    } else if (role === 'assistant') {
      // Assistant message with potential tool calls
      if (Array.isArray(content)) {
        // Content is array (Responses API style already)
        for (const item of content) {
          if (typeof item === 'string') {
            result.push({ type: 'message', content: item });
          } else if (item.type === 'text') {
            result.push({ type: 'message', content: item.text });
          } else if (item.type === 'function_call') {
            result.push({
              type: 'function_call',
              call_id: item.call_id,
              name: item.name,
              arguments: typeof item.input === 'string' ? item.input : JSON.stringify(item.input)
            });
          }
        }
      } else if (typeof content === 'string') {
        // Simple text content
        result.push({ type: 'message', content: content });
      }

      // Check for tool_calls (Chat Completions format)
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const toolCall of msg.tool_calls) {
          result.push({
            type: 'function_call',
            call_id: toolCall.id,
            name: toolCall.function?.name || toolCall.name,
            arguments: typeof toolCall.function?.arguments === 'string'
              ? toolCall.function.arguments
              : JSON.stringify(toolCall.function?.arguments || toolCall.arguments || {})
          });
        }
      }
    } else if (role === 'tool') {
      // Tool result
      result.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id || msg.call_id,
        output: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      });
    }
  }

  return result;
}

/**
 * Convert Responses API output back to Chat Completions messages
 * Useful for compatibility
 * @param {Array} output - Responses API output array
 * @returns {Array} Chat Completions format messages
 */
export function convertResponsesOutputToMessages(output) {
  const messages = [];
  const toolCalls = [];
  let textContent = '';

  for (const item of output) {
    if (item.type === 'message') {
      // Extract text from message
      if (item.content && Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          if (contentItem.type === 'output_text' && contentItem.text) {
            textContent += contentItem.text;
          }
        }
      }
    } else if (item.type === 'function_call') {
      // Tool call
      toolCalls.push({
        id: item.call_id,
        type: 'function',
        function: {
          name: item.name,
          arguments: typeof item.arguments === 'string'
            ? item.arguments
            : JSON.stringify(item.input || item.arguments || {})
        }
      });
    }
  }

  // Create assistant message
  const assistantMsg = {
    role: 'assistant',
    content: textContent || null
  };

  if (toolCalls.length > 0) {
    assistantMsg.tool_calls = toolCalls;
  }

  messages.push(assistantMsg);

  return messages;
}
