/**
 * Convert Claude format response to OpenAI format
 */

/**
 * Convert Claude response to OpenAI response format
 * @param {Object} claudeResponse - Claude response object
 * @returns {Object} OpenAI response object
 */
export function convertClaudeResponseToOpenAI(claudeResponse) {
  const message = {
    role: 'assistant',
    content: null
  };

  const toolCalls = [];
  let textContent = '';

  // Process content blocks
  if (claudeResponse.content && Array.isArray(claudeResponse.content)) {
    for (const block of claudeResponse.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
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
  if (claudeResponse.stop_reason === 'tool_use') {
    finishReason = 'tool_calls';
  } else if (claudeResponse.stop_reason === 'max_tokens') {
    finishReason = 'length';
  }

  return {
    id: claudeResponse.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: claudeResponse.model || 'claude-sonnet-4-5',
    choices: [
      {
        index: 0,
        message: message,
        finish_reason: finishReason
      }
    ],
    usage: {
      prompt_tokens: claudeResponse.usage?.input_tokens || 0,
      completion_tokens: claudeResponse.usage?.output_tokens || 0,
      total_tokens: (claudeResponse.usage?.input_tokens || 0) + (claudeResponse.usage?.output_tokens || 0)
    }
  };
}
