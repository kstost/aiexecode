/**
 * Convert Responses API format to Claude format
 */

/**
 * Convert Responses API request to Claude format
 * @param {Object} responsesRequest - Responses API format request
 * @returns {Object} Claude format request
 */
export function convertResponsesRequestToClaudeFormat(responsesRequest) {
  /*
    claude-sonnet-4-5 64000
    claude-3-haiku  4096
    claude-4-5-haiku  64000
  */
  const modelMaxTokensMap = {
    'claude-sonnet-4-20250514': 64000,
    'claude-3-7-sonnet-20250219': 64000,
    'claude-opus-4-20250514': 4096 * 2,
    'claude-3-5-haiku-20241022': 4096 * 2,
    'claude-3-haiku-20240307': 4096,
  };

  const model = responsesRequest.model;
  if (!model) {
    throw new Error('Model name is required');
  }

  const defaultMaxTokens = modelMaxTokensMap[model];// || 999999999999;
  if (!defaultMaxTokens) {
    throw new Error(`Unsupported model: ${model}. Supported models are: ${Object.keys(modelMaxTokensMap).join(', ')}`);
  }

  const claudeRequest = {
    model: model,
    max_tokens: responsesRequest.max_output_tokens || defaultMaxTokens
  };
  // console.log(claudeRequest);

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
    // Array input - could be messages or output items
    for (const item of responsesRequest.input) {
      // Handle output items (no role, has type)
      if (!item.role && item.type) {
        if (item.type === 'message') {
          // Message item from output
          const textBlocks = [];
          if (item.content && Array.isArray(item.content)) {
            for (const contentBlock of item.content) {
              if (contentBlock.type === 'output_text' && contentBlock.text) {
                textBlocks.push({
                  type: 'text',
                  text: contentBlock.text
                });
              }
            }
          }
          // Only include messages with actual content (skip empty messages)
          if (textBlocks.length > 0) {
            messages.push({
              role: 'assistant',
              content: textBlocks
            });
          }
        } else if (item.type === 'function_call') {
          // Function call from output - convert to assistant message with tool_use
          messages.push({
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: item.call_id || item.id,
                name: item.name,
                input: JSON.parse(item.arguments || '{}')
              }
            ]
          });
        } else if (item.type === 'function_call_output') {
          // Function call output - convert to tool_result
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: item.call_id,
                content: item.output
              }
            ]
          });
        }
        // Skip other types like 'reasoning'
        continue;
      }

      if (item.role && item.content) {
        // Already in message format

        if (item.role === 'system') {
          // System messages go to separate field in Claude
          const content = Array.isArray(item.content)
            ? item.content.map(c => c.type === 'input_text' || c.type === 'text' ? c.text : c).filter(Boolean).join('\n')
            : item.content;
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
        } else if (item.role === 'assistant' && Array.isArray(item.content)) {
          // Assistant with output array (might contain function_call items)
          const textBlocks = [];
          const toolUseBlocks = [];

          for (const outputItem of item.content) {
            if (outputItem.type === 'message' && outputItem.content) {
              // Message item - extract text content
              for (const contentBlock of outputItem.content) {
                if (contentBlock.type === 'output_text' && contentBlock.text) {
                  textBlocks.push({
                    type: 'text',
                    text: contentBlock.text
                  });
                }
              }
            } else if (outputItem.type === 'function_call') {
              // Function call - convert to Claude tool_use
              toolUseBlocks.push({
                type: 'tool_use',
                id: outputItem.call_id || outputItem.id,
                name: outputItem.name,
                input: JSON.parse(outputItem.arguments || '{}')
              });
            }
          }

          // Claude requires text blocks to come before tool_use blocks
          const claudeContent = [...textBlocks, ...toolUseBlocks];

          // Add message only if there's content
          if (claudeContent.length > 0) {
            messages.push({
              role: 'assistant',
              content: claudeContent
            });
          }
        } else {
          // Handle content that might be an array (OpenAI Responses API format)
          const content = Array.isArray(item.content)
            ? item.content.map(c => c.type === 'input_text' || c.type === 'text' ? c.text : c).filter(Boolean).join('\n')
            : item.content;

          messages.push({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: content
          });
        }
      }
    }
  }

  // Merge consecutive messages with the same role (Claude doesn't allow this)
  const mergedMessages = [];
  for (let i = 0; i < messages.length; i++) {
    const currentMsg = messages[i];

    // Check if the next message has the same role
    if (i < messages.length - 1 && messages[i + 1].role === currentMsg.role) {
      // Merge content from consecutive same-role messages
      const mergedContent = Array.isArray(currentMsg.content) ? [...currentMsg.content] : [currentMsg.content];

      // Keep merging while the next message has the same role
      while (i < messages.length - 1 && messages[i + 1].role === currentMsg.role) {
        i++;
        const nextContent = messages[i].content;
        if (Array.isArray(nextContent)) {
          mergedContent.push(...nextContent);
        } else {
          mergedContent.push(nextContent);
        }
      }

      mergedMessages.push({
        role: currentMsg.role,
        content: mergedContent
      });
    } else {
      mergedMessages.push(currentMsg);
    }
  }

  claudeRequest.messages = mergedMessages;

  // Handle instructions (system message)
  if (responsesRequest.instructions) {
    claudeRequest.system = responsesRequest.instructions;
  }

  // Convert tools from Responses API format to Claude format
  // Responses API: { type: 'function', name, description, parameters }
  // Claude: { name, description, input_schema } (NO type field)
  if (responsesRequest.tools && Array.isArray(responsesRequest.tools)) {
    claudeRequest.tools = responsesRequest.tools.map(tool => {
      if (tool.type === 'function') {
        if (tool.function) {
          // Chat Completions format (for compatibility)
          return {
            name: tool.function.name,
            description: tool.function.description || `Function: ${tool.function.name}`,
            input_schema: tool.function.parameters || {
              type: 'object',
              properties: {}
            }
          };
        } else {
          // Responses API format with type: 'function'
          return {
            name: tool.name,
            description: tool.description || `Function: ${tool.name}`,
            input_schema: tool.parameters || {
              type: 'object',
              properties: {}
            }
          };
        }
      } else if (tool.type === 'custom') {
        // Responses API custom format
        return {
          name: tool.name,
          description: tool.description || `Tool: ${tool.name}`,
          input_schema: tool.input_schema || {
            type: 'object',
            properties: {}
          }
        };
      }
      // If already in Claude format (no type field), pass through
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema
      };
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

  // Handle json_schema format by converting to tool use
  // OpenAI Responses API: text.format.type = "json_schema" with schema
  // Claude: Use a synthetic tool to enforce structured output
  if (responsesRequest.text?.format?.type === 'json_schema') {
    const schemaName = responsesRequest.text.format.name || 'output';
    const schema = responsesRequest.text.format.schema;

    // Create a synthetic tool that represents the JSON schema
    const syntheticTool = {
      name: schemaName,
      description: `Generate structured output matching the ${schemaName} schema`,
      input_schema: schema
    };

    // Replace tools array with only the synthetic tool (to ensure structured output)
    claudeRequest.tools = [syntheticTool];

    // Force tool use with this specific tool (ignore original tool_choice)
    claudeRequest.tool_choice = {
      type: 'tool',
      name: schemaName
    };

    // Claude requires conversation to end with user message when tool_choice is set
    // If last message is assistant, add a dummy user message
    if (claudeRequest.messages.length > 0 && claudeRequest.messages[claudeRequest.messages.length - 1].role === 'assistant') {
      claudeRequest.messages.push({
        role: 'user',
        content: [{ type: 'text', text: 'Please provide the structured output.' }]
      });
    }
  }

  return claudeRequest;
}

/**
 * Convert Claude response to Responses API format
 * @param {Object} claudeResponse - Claude format response
 * @param {string} model - Model name
 * @param {Object} originalRequest - Original request for context
 * @returns {Object} Responses API format response
 */
export function convertClaudeResponseToResponsesFormat(claudeResponse, model = 'claude-sonnet-4-5', originalRequest = {}) {
  const output = [];
  let outputText = '';

  // Check if this was a json_schema request converted to tool use
  const wasJsonSchemaRequest = originalRequest.text?.format?.type === 'json_schema';
  const schemaName = originalRequest.text?.format?.name;

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
        outputText += block.text;
      } else if (block.type === 'tool_use') {
        // Check if this is a synthetic tool for json_schema
        if (wasJsonSchemaRequest && block.name === schemaName) {
          // Convert tool_use back to plain text JSON (for json_schema requests)
          const jsonOutput = JSON.stringify(block.input);
          messageContent.push({
            type: 'output_text',
            text: jsonOutput,
            annotations: []
          });
          outputText += jsonOutput;
        } else {
          // Regular tool call - add as separate function_call item
          output.push({
            id: `fc_${block.id}`,
            type: 'function_call',
            status: 'completed',
            arguments: JSON.stringify(block.input),
            call_id: block.id,
            name: block.name
          });
        }
      }
    }

    // Add message with text content if any
    if (messageContent.length > 0) {
      output.push({
        id: `msg_${claudeResponse.id}`,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: messageContent
      });
    }
  }

  // If no output items, create a message with placeholder text
  // (Claude may return empty response for various reasons)
  if (output.length === 0) {
    output.push({
      id: `msg_${claudeResponse.id}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: outputText || ' ',
          annotations: []
        }
      ]
    });
  }

  // Build Responses API response with ALL required fields
  const responsesResponse = {
    id: `resp_${claudeResponse.id}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: claudeResponse.stop_reason === 'end_turn' || claudeResponse.stop_reason === 'tool_use' ? 'completed' : 'incomplete',
    background: false,
    billing: {
      payer: 'developer'
    },
    error: null,
    incomplete_details: null,
    instructions: originalRequest.instructions || null,
    max_output_tokens: originalRequest.max_output_tokens || null,
    max_tool_calls: null,
    model: model,
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
      input_tokens: claudeResponse.usage?.input_tokens || 0,
      input_tokens_details: {
        cached_tokens: 0
      },
      output_tokens: claudeResponse.usage?.output_tokens || 0,
      output_tokens_details: {
        reasoning_tokens: 0
      },
      total_tokens: (claudeResponse.usage?.input_tokens || 0) + (claudeResponse.usage?.output_tokens || 0)
    },
    user: null,
    metadata: {},
    output_text: outputText
  };

  return responsesResponse;
}
