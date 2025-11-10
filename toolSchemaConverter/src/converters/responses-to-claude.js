/**
 * Convert Responses API format to Claude format
 */

/**
 * Convert Responses API request to Claude format
 * @param {Object} responsesRequest - Responses API format request
 * @returns {Object} Claude format request
 */
export function convertResponsesRequestToClaudeFormat(responsesRequest) {
  const claudeRequest = {
    model: responsesRequest.model || 'claude-sonnet-4-5',
    max_tokens: responsesRequest.max_output_tokens || 4096
  };

  // Convert input to messages
  // Responses API input can be: string, array of messages, or array of items
  const messages = [];

  if (typeof responsesRequest.input === 'string') {
    // Simple string input
    messages.push({
      role: 'user',
      content: responsesRequest.input
    });
  } else if (Array.isArray(responsesRequest.input)) {
    // Array input - could be messages or items
    for (const item of responsesRequest.input) {
      if (item.role && item.content) {
        // Already in message format
        // Handle content that might be an array (OpenAI Responses API format)
        const content = Array.isArray(item.content)
          ? item.content.map(c => c.type === 'input_text' || c.type === 'text' ? c.text : c).filter(Boolean).join('\n')
          : item.content;

        if (item.role === 'system') {
          // System messages go to separate field in Claude
          claudeRequest.system = content;
        } else if (item.role === 'tool') {
          // Tool result
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: item.tool_call_id || item.id,
                content: item.content
              }
            ]
          });
        } else {
          messages.push({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: content
          });
        }
      }
    }
  }

  claudeRequest.messages = messages;

  // Handle instructions (system message)
  if (responsesRequest.instructions) {
    claudeRequest.system = responsesRequest.instructions;
  }

  // Convert tools from Responses API format to Claude format
  // Responses API: { type: 'custom', name, description }
  // Claude: { name, description, input_schema }
  if (responsesRequest.tools && Array.isArray(responsesRequest.tools)) {
    claudeRequest.tools = responsesRequest.tools.map(tool => {
      if (tool.type === 'function' && tool.function) {
        // Chat Completions format (for compatibility)
        return {
          name: tool.function.name,
          description: tool.function.description || `Function: ${tool.function.name}`,
          input_schema: tool.function.parameters || {
            type: 'object',
            properties: {}
          }
        };
      } else if (tool.type === 'custom') {
        // Responses API format
        return {
          name: tool.name,
          description: tool.description || `Tool: ${tool.name}`,
          input_schema: tool.input_schema || {
            type: 'object',
            properties: {}
          }
        };
      }
      // If already in Claude format, pass through
      return tool;
    });
  }

  // Temperature (Claude supports this, Responses API may not send it)
  if (responsesRequest.temperature !== undefined) {
    claudeRequest.temperature = responsesRequest.temperature;
  }

  // Top-p (Claude supports this)
  if (responsesRequest.top_p !== undefined) {
    claudeRequest.top_p = responsesRequest.top_p;
  }

  // Tool choice (Responses API to Claude)
  if (responsesRequest.tool_choice !== undefined) {
    if (typeof responsesRequest.tool_choice === 'string') {
      // 'auto', 'required', 'none' -> Claude format
      if (responsesRequest.tool_choice === 'auto') {
        claudeRequest.tool_choice = { type: 'auto' };
      } else if (responsesRequest.tool_choice === 'required') {
        claudeRequest.tool_choice = { type: 'any' };
      }
      // 'none' is handled by not setting tool_choice
    } else if (responsesRequest.tool_choice?.type === 'function' || responsesRequest.tool_choice?.type === 'custom') {
      // Specific tool -> Claude format
      const toolName = responsesRequest.tool_choice.function?.name || responsesRequest.tool_choice.name;
      claudeRequest.tool_choice = {
        type: 'tool',
        name: toolName
      };
    }
  }

  // Metadata (pass through as-is, Claude doesn't use it but won't error)
  if (responsesRequest.metadata) {
    claudeRequest.metadata = responsesRequest.metadata;
  }

  return claudeRequest;
}

/**
 * Convert Claude response to Responses API format
 * @param {Object} claudeResponse - Claude format response
 * @param {string} model - Model name
 * @returns {Object} Responses API format response
 */
export function convertClaudeResponseToResponsesFormat(claudeResponse, model = 'claude-sonnet-4-5') {
  const output = [];

  // Process content blocks
  if (claudeResponse.content && Array.isArray(claudeResponse.content)) {
    const messageContent = [];

    for (const block of claudeResponse.content) {
      if (block.type === 'text') {
        // Text content
        messageContent.push({
          type: 'output_text',
          text: block.text,
          annotations: []
        });
      } else if (block.type === 'tool_use') {
        // Tool call - add as separate function_call item
        output.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          input: block.input
        });
      }
    }

    // Add message with text content if any
    if (messageContent.length > 0) {
      output.push({
        type: 'message',
        id: `msg_${claudeResponse.id}`,
        status: 'completed',
        role: 'assistant',
        content: messageContent
      });
    }
  }

  // If no output items, create empty message
  if (output.length === 0) {
    output.push({
      type: 'message',
      id: `msg_${claudeResponse.id}`,
      status: 'completed',
      role: 'assistant',
      content: []
    });
  }

  // Build Responses API response
  const responsesResponse = {
    id: `resp_${claudeResponse.id}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: claudeResponse.stop_reason === 'end_turn' ? 'completed' : 'incomplete',
    model: model,
    output: output,
    usage: {
      input_tokens: claudeResponse.usage?.input_tokens || 0,
      output_tokens: claudeResponse.usage?.output_tokens || 0,
      total_tokens: (claudeResponse.usage?.input_tokens || 0) + (claudeResponse.usage?.output_tokens || 0)
    }
  };

  // Add reasoning field (empty for Claude, but structure matches Responses API)
  responsesResponse.reasoning = {
    effort: null,
    summary: null
  };

  // Add additional Responses API fields
  responsesResponse.parallel_tool_calls = true; // Claude supports parallel tool calls by default
  responsesResponse.previous_response_id = null;
  responsesResponse.store = true;
  responsesResponse.tool_choice = 'auto';
  responsesResponse.tools = [];
  responsesResponse.temperature = 1.0;
  responsesResponse.top_p = 1.0;
  responsesResponse.truncation = 'disabled';
  responsesResponse.text = {
    format: { type: 'text' }
  };
  responsesResponse.metadata = {};
  responsesResponse.error = null;
  responsesResponse.incomplete_details = null;

  return responsesResponse;
}
