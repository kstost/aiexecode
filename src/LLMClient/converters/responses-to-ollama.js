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
    const toolCalls = []; // Collect tool calls to add to assistant message
    const callIdToName = {}; // Map call_id to function name

    for (const item of responsesRequest.input) {
      if (item.type === 'function_call') {
        // Store call_id -> name mapping
        if (item.call_id && item.name) {
          callIdToName[item.call_id] = item.name;
        }

        // Function call - convert to Ollama tool_calls format (no id or type fields)
        toolCalls.push({
          function: {
            name: item.name,
            arguments: JSON.parse(item.arguments) // Ollama expects object, not string
          }
        });
      } else if (item.type === 'function_call_output') {
        // If we have pending tool calls, add assistant message with tool_calls first
        if (toolCalls.length > 0) {
          ollamaRequest.messages.push({
            role: 'assistant',
            content: '',
            tool_calls: [...toolCalls]
          });
          toolCalls.length = 0; // Clear the array
        }

        // Function call output - convert to tool message (Ollama uses tool_name, not tool_call_id)
        // Look up the function name from the call_id
        const toolName = callIdToName[item.call_id] || '';
        ollamaRequest.messages.push({
          role: 'tool',
          content: item.output,
          tool_name: toolName
        });
      } else if (item.role && item.content) {
        // If we have pending tool calls, add assistant message with tool_calls first
        if (toolCalls.length > 0) {
          ollamaRequest.messages.push({
            role: 'assistant',
            content: '',
            tool_calls: [...toolCalls]
          });
          toolCalls.length = 0; // Clear the array
        }

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

    // If there are remaining tool calls at the end, add them
    if (toolCalls.length > 0) {
      ollamaRequest.messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [...toolCalls]
      });
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
      } else if (tool.type === 'function' && !tool.function) {
        // Flat function format - convert to nested format for Ollama
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            parameters: tool.parameters || {
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
 * @param {Object} originalRequest - Original request for context
 * @returns {Object} Responses API format response
 */
export function convertOllamaResponseToResponsesFormat(ollamaResponse, model, originalRequest = {}) {
  const output = [];
  let outputText = '';

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
      outputText = ollamaResponse.message.content;
    }

    // Tool calls
    if (ollamaResponse.message.tool_calls && Array.isArray(ollamaResponse.message.tool_calls)) {
      for (const toolCall of ollamaResponse.message.tool_calls) {
        const callId = toolCall.id || `call_${Date.now()}`;
        output.push({
          id: `fc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function_call',
          status: 'completed',
          arguments: typeof toolCall.function?.arguments === 'string'
            ? toolCall.function.arguments
            : JSON.stringify(toolCall.function?.arguments || {}),
          call_id: callId,
          name: toolCall.function?.name || ''
        });
      }
    }

    // Add message with text content if any
    if (messageContent.length > 0) {
      output.push({
        id: `msg_${Date.now()}`,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: messageContent
      });
    }
  }

  // If no output items, create empty message
  if (output.length === 0) {
    output.push({
      id: `msg_${Date.now()}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: []
    });
  }

  // Build Responses API response with ALL required fields
  // Parse created_at from Ollama's ISO format to Unix timestamp
  let createdAt = Math.floor(Date.now() / 1000);
  if (ollamaResponse.created_at) {
    if (typeof ollamaResponse.created_at === 'string') {
      createdAt = Math.floor(new Date(ollamaResponse.created_at).getTime() / 1000);
    } else if (typeof ollamaResponse.created_at === 'number') {
      createdAt = ollamaResponse.created_at;
    }
  }

  const responsesResponse = {
    id: `resp_${Date.now()}`,
    object: 'response',
    created_at: createdAt,
    status: ollamaResponse.done ? 'completed' : 'incomplete',
    background: false,
    billing: {
      payer: 'developer'
    },
    error: null,
    incomplete_details: null,
    instructions: originalRequest.instructions || null,
    max_output_tokens: originalRequest.max_output_tokens || null,
    max_tool_calls: null,
    model: model || ollamaResponse.model || 'llama3.2',
    output: output,
    parallel_tool_calls: true,
    previous_response_id: null,
    prompt_cache_key: null,
    prompt_cache_retention: null,
    reasoning: {
      effort: originalRequest.reasoning?.effort || null,
      summary: originalRequest.reasoning?.summary || null
    },
    safety_identifier: null,
    service_tier: 'default',
    store: originalRequest.store !== undefined ? originalRequest.store : true,
    temperature: originalRequest.temperature !== undefined ? originalRequest.temperature : 1,
    text: {
      format: {
        type: 'text'
      },
      verbosity: 'medium'
    },
    tool_choice: originalRequest.tool_choice || 'auto',
    tools: originalRequest.tools || [],
    top_logprobs: 0,
    top_p: originalRequest.top_p !== undefined ? originalRequest.top_p : 1,
    truncation: 'disabled',
    usage: {
      input_tokens: ollamaResponse.prompt_eval_count || 0,
      input_tokens_details: {
        cached_tokens: 0
      },
      output_tokens: ollamaResponse.eval_count || 0,
      output_tokens_details: {
        reasoning_tokens: 0
      },
      total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0)
    },
    user: null,
    metadata: {},
    output_text: outputText
  };

  return responsesResponse;
}
