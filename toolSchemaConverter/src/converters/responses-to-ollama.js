/**
 * Convert Responses API format to Ollama format
 */

/**
 * Convert Responses API request to Ollama format
 * @param {Object} responsesRequest - Responses API format request
 * @param {string} baseUrl - Ollama base URL
 * @returns {Object} { url, request } - Ollama API endpoint and request body
 */
export function convertResponsesRequestToOllamaFormat(responsesRequest, baseUrl = 'http://localhost:11434') {
  const ollamaRequest = {
    model: responsesRequest.model || 'llama3.2',
    messages: []
  };

  // Convert input to messages
  if (typeof responsesRequest.input === 'string') {
    // Simple string input
    ollamaRequest.messages.push({
      role: 'user',
      content: responsesRequest.input
    });
  } else if (Array.isArray(responsesRequest.input)) {
    // Array input - could be messages or items
    for (const item of responsesRequest.input) {
      if (item.role && item.content) {
        // Message format
        // Handle content that might be an array (OpenAI Responses API format)
        const content = Array.isArray(item.content)
          ? item.content.map(c => c.type === 'input_text' || c.type === 'text' ? c.text : c).filter(Boolean).join('\n')
          : item.content;

        if (item.role === 'system') {
          // System message
          ollamaRequest.messages.push({
            role: 'system',
            content: content
          });
        } else if (item.role === 'tool') {
          // Tool result
          ollamaRequest.messages.push({
            role: 'tool',
            content: content
          });
        } else if (item.role === 'assistant') {
          // Assistant message
          ollamaRequest.messages.push({
            role: 'assistant',
            content: content
          });
        } else {
          // User message
          ollamaRequest.messages.push({
            role: 'user',
            content: content
          });
        }
      }
    }
  }

  // Add system instruction if provided
  if (responsesRequest.instructions) {
    // Prepend system message
    ollamaRequest.messages.unshift({
      role: 'system',
      content: responsesRequest.instructions
    });
  }

  // Convert tools from Responses API format to Ollama format
  // Ollama uses OpenAI-compatible tool format
  if (responsesRequest.tools && Array.isArray(responsesRequest.tools)) {
    ollamaRequest.tools = responsesRequest.tools.map(tool => {
      if (tool.type === 'function' && tool.function) {
        // Chat Completions format (already compatible)
        return tool;
      } else if (tool.type === 'custom') {
        // Responses API format - convert to OpenAI function format
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            parameters: tool.input_schema || {
              type: 'object',
              properties: {}
            }
          }
        };
      }
      // Pass through
      return tool;
    });
  }

  // Options
  const options = {};

  // Temperature
  if (responsesRequest.temperature !== undefined) {
    options.temperature = responsesRequest.temperature;
  }

  // Top-p
  if (responsesRequest.top_p !== undefined) {
    options.top_p = responsesRequest.top_p;
  }

  // Max tokens (Ollama uses num_predict)
  if (responsesRequest.max_output_tokens !== undefined) {
    options.num_predict = responsesRequest.max_output_tokens;
  }

  if (Object.keys(options).length > 0) {
    ollamaRequest.options = options;
  }

  // Tool choice (Responses API to Ollama)
  // Ollama uses OpenAI-compatible tool_choice format
  if (responsesRequest.tool_choice !== undefined) {
    if (typeof responsesRequest.tool_choice === 'string') {
      // 'auto', 'required', 'none'
      ollamaRequest.tool_choice = responsesRequest.tool_choice;
    } else if (responsesRequest.tool_choice?.type === 'function') {
      // Specific tool
      ollamaRequest.tool_choice = responsesRequest.tool_choice;
    } else if (responsesRequest.tool_choice?.type === 'custom') {
      // Convert custom to function format for Ollama
      ollamaRequest.tool_choice = {
        type: 'function',
        function: {
          name: responsesRequest.tool_choice.name
        }
      };
    }
  }

  // Stream setting (will be overridden by client if streaming)
  ollamaRequest.stream = false;

  return {
    url: `${baseUrl}/api/chat`,
    request: ollamaRequest
  };
}

/**
 * Convert Ollama response to Responses API format
 * @param {Object} ollamaResponse - Ollama format response
 * @param {string} model - Model name
 * @returns {Object} Responses API format response
 */
export function convertOllamaResponseToResponsesFormat(ollamaResponse, model) {
  const output = [];

  // Process message content
  if (ollamaResponse.message) {
    const messageContent = [];

    // Text content
    if (ollamaResponse.message.content) {
      messageContent.push({
        type: 'output_text',
        text: ollamaResponse.message.content,
        annotations: []
      });
    }

    // Tool calls
    if (ollamaResponse.message.tool_calls && Array.isArray(ollamaResponse.message.tool_calls)) {
      for (const toolCall of ollamaResponse.message.tool_calls) {
        output.push({
          type: 'function_call',
          call_id: toolCall.id || `call_${Date.now()}`,
          name: toolCall.function?.name || '',
          input: typeof toolCall.function?.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function?.arguments || {}
        });
      }
    }

    // Add message with text content if any
    if (messageContent.length > 0) {
      output.push({
        type: 'message',
        id: `msg_${Date.now()}`,
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
      id: `msg_${Date.now()}`,
      status: 'completed',
      role: 'assistant',
      content: []
    });
  }

  // Build Responses API response
  const responsesResponse = {
    id: `resp_${Date.now()}`,
    object: 'response',
    created_at: ollamaResponse.created_at || Math.floor(Date.now() / 1000),
    status: ollamaResponse.done ? 'completed' : 'incomplete',
    model: model || ollamaResponse.model || 'llama3.2',
    output: output,
    usage: {
      input_tokens: ollamaResponse.prompt_eval_count || 0,
      output_tokens: ollamaResponse.eval_count || 0,
      total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0)
    }
  };

  // Add reasoning field (empty for Ollama, but structure matches Responses API)
  responsesResponse.reasoning = {
    effort: null,
    summary: null
  };

  // Add additional Responses API fields
  responsesResponse.parallel_tool_calls = true; // Ollama supports parallel tool calls
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
