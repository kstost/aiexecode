/**
 * Convert OpenAI format request to Claude format
 */

/**
 * Convert OpenAI tools to Claude tools
 * @param {Array} openaiTools - OpenAI tools array
 * @returns {Array} Claude tools array
 */
export function convertToolsToClaudeFormat(openaiTools) {
  if (!openaiTools || !Array.isArray(openaiTools)) {
    return [];
  }

  return openaiTools.map(tool => {
    if (tool.type !== 'function') {
      throw new Error(`Unsupported tool type: ${tool.type}`);
    }

    return {
      name: tool.function.name,
      description: tool.function.description || '',
      input_schema: tool.function.parameters || {
        type: 'object',
        properties: {},
        required: []
      }
    };
  });
}

/**
 * Convert OpenAI messages to Claude messages
 * @param {Array} openaiMessages - OpenAI messages array
 * @returns {Array} Claude messages array
 */
export function convertMessagesToClaudeFormat(openaiMessages) {
  if (!openaiMessages || !Array.isArray(openaiMessages)) {
    return [];
  }

  const claudeMessages = [];
  let systemMessage = null;

  for (const msg of openaiMessages) {
    // Extract system message
    if (msg.role === 'system') {
      systemMessage = msg.content;
      continue;
    }

    // Convert tool_calls from assistant message
    if (msg.role === 'assistant' && msg.tool_calls) {
      const content = [];

      if (msg.content) {
        content.push({
          type: 'text',
          text: msg.content
        });
      }

      for (const toolCall of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments)
        });
      }

      claudeMessages.push({
        role: 'assistant',
        content: content
      });
    }
    // Convert tool results
    else if (msg.role === 'tool') {
      claudeMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: msg.content
          }
        ]
      });
    }
    // Regular messages
    else {
      claudeMessages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }

  return { messages: claudeMessages, system: systemMessage };
}

/**
 * Convert complete OpenAI request to Claude request
 * @param {Object} openaiRequest - OpenAI request object
 * @returns {Object} Claude request object
 */
export function convertRequestToClaudeFormat(openaiRequest) {
  const { messages: claudeMessages, system } = convertMessagesToClaudeFormat(openaiRequest.messages);
  const claudeTools = convertToolsToClaudeFormat(openaiRequest.tools);

  const claudeRequest = {
    model: openaiRequest.model || 'claude-sonnet-4-5',
    max_tokens: openaiRequest.max_tokens || 1024,
    messages: claudeMessages
  };

  if (system) {
    claudeRequest.system = system;
  }

  if (claudeTools.length > 0) {
    claudeRequest.tools = claudeTools;
  }

  if (openaiRequest.temperature !== undefined) {
    claudeRequest.temperature = openaiRequest.temperature;
  }

  return claudeRequest;
}
