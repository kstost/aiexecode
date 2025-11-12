/**
 * Convert Responses API format to Gemini format
 */

/**
 * Convert Responses API request to Gemini format
 * @param {Object} responsesRequest - Responses API format request
 * @returns {Object} Gemini format request
 */
export function convertResponsesRequestToGeminiFormat(responsesRequest) {
  const geminiRequest = {
    contents: []
  };

  // Convert input to contents
  if (typeof responsesRequest.input === 'string') {
    // Simple string input
    geminiRequest.contents.push({
      role: 'user',
      parts: [{ text: responsesRequest.input }]
    });
  } else if (Array.isArray(responsesRequest.input)) {
    // Array input - could be messages or output items
    for (const item of responsesRequest.input) {
      // Handle output items (no role, has type)
      if (!item.role && item.type) {
        if (item.type === 'message') {
          // Message item from output
          const parts = [];
          if (item.content && Array.isArray(item.content)) {
            for (const contentBlock of item.content) {
              if (contentBlock.type === 'output_text' && contentBlock.text) {
                parts.push({ text: contentBlock.text });
              }
            }
          }
          if (parts.length > 0) {
            geminiRequest.contents.push({
              role: 'model',
              parts: parts
            });
          }
        } else if (item.type === 'function_call') {
          // Function call from output - convert to Gemini functionCall
          geminiRequest.contents.push({
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: item.name,
                  args: JSON.parse(item.arguments || '{}')
                }
              }
            ]
          });
        } else if (item.type === 'function_call_output') {
          // Function call output - convert to functionResponse
          geminiRequest.contents.push({
            role: 'function',
            parts: [
              {
                functionResponse: {
                  name: geminiRequest.contents[geminiRequest.contents.length - 1]?.parts?.[0]?.functionCall?.name || 'unknown',
                  response: typeof item.output === 'string' ? JSON.parse(item.output) : item.output
                }
              }
            ]
          });
        }
        // Skip other types like 'reasoning'
        continue;
      }

      if (item.role && item.content) {
        // Message format
        // Handle content that might be an array (OpenAI Responses API format)
        const content = Array.isArray(item.content)
          ? item.content.map(c => c.type === 'input_text' || c.type === 'text' ? c.text : c).filter(Boolean).join('\n')
          : item.content;

        if (item.role === 'system') {
          // System messages go to systemInstruction in Gemini
          geminiRequest.systemInstruction = {
            parts: [{ text: content }]
          };
        } else if (item.role === 'tool') {
          // Tool result
          const lastContent = geminiRequest.contents[geminiRequest.contents.length - 1];
          if (lastContent && lastContent.role === 'model') {
            // Add function response
            geminiRequest.contents.push({
              role: 'function',
              parts: [
                {
                  functionResponse: {
                    name: item.name,
                    response: typeof item.content === 'string' ? JSON.parse(item.content) : item.content
                  }
                }
              ]
            });
          }
        } else if (item.role === 'assistant' && Array.isArray(item.content)) {
          // Assistant with output array (might contain function_call items)
          const parts = [];

          for (const outputItem of item.content) {
            if (outputItem.type === 'message' && outputItem.content) {
              // Message item - extract text content
              for (const contentBlock of outputItem.content) {
                if (contentBlock.type === 'output_text' && contentBlock.text) {
                  parts.push({ text: contentBlock.text });
                }
              }
            } else if (outputItem.type === 'function_call') {
              // Function call - convert to Gemini functionCall
              parts.push({
                functionCall: {
                  name: outputItem.name,
                  args: JSON.parse(outputItem.arguments || '{}')
                }
              });
            }
          }

          // Add message only if there's content
          if (parts.length > 0) {
            geminiRequest.contents.push({
              role: 'model',
              parts: parts
            });
          }
        } else if (item.role === 'assistant') {
          // Assistant message (simple text)
          const content = Array.isArray(item.content)
            ? item.content.map(c => c.type === 'input_text' || c.type === 'text' ? c.text : c).filter(Boolean).join('\n')
            : item.content;
          geminiRequest.contents.push({
            role: 'model',
            parts: [{ text: content }]
          });
        } else {
          // User message
          geminiRequest.contents.push({
            role: 'user',
            parts: [{ text: content }]
          });
        }
      }
    }
  }

  // Handle instructions (system message)
  if (responsesRequest.instructions) {
    geminiRequest.systemInstruction = {
      parts: [{ text: responsesRequest.instructions }]
    };
  }

  // Convert tools from Responses API format to Gemini format
  // Responses API: { type: 'custom', name, description }
  // Gemini: { functionDeclarations: [{ name, description, parameters }] }
  if (responsesRequest.tools && Array.isArray(responsesRequest.tools)) {
    geminiRequest.tools = [
      {
        functionDeclarations: responsesRequest.tools.map(tool => {
          if (tool.type === 'function' && tool.function) {
            // Chat Completions format with nested function object
            return {
              name: tool.function.name,
              description: tool.function.description || `Function: ${tool.function.name}`,
              parameters: tool.function.parameters || {
                type: 'object',
                properties: {}
              }
            };
          } else if (tool.type === 'function' && !tool.function) {
            // Chat Completions format without nested function object
            return {
              name: tool.name,
              description: tool.description || `Function: ${tool.name}`,
              parameters: tool.parameters || {
                type: 'object',
                properties: {}
              }
            };
          } else if (tool.type === 'custom') {
            // Responses API format
            return {
              name: tool.name,
              description: tool.description || `Tool: ${tool.name}`,
              parameters: tool.input_schema || {
                type: 'object',
                properties: {}
              }
            };
          } else if (tool.name && tool.description) {
            // Already in Gemini format (name, description, parameters)
            return {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters || {
                type: 'object',
                properties: {}
              }
            };
          }
          // Fallback: extract name, description, parameters
          return {
            name: tool.name || 'unknown',
            description: tool.description || 'No description',
            parameters: tool.parameters || tool.input_schema || {
              type: 'object',
              properties: {}
            }
          };
        })
      }
    ];
  }

  // Generation config
  geminiRequest.generationConfig = {};

  // Max output tokens
  if (responsesRequest.max_output_tokens !== undefined) {
    geminiRequest.generationConfig.maxOutputTokens = responsesRequest.max_output_tokens;
  }

  // Temperature (Gemini supports this)
  if (responsesRequest.temperature !== undefined) {
    geminiRequest.generationConfig.temperature = responsesRequest.temperature;
  }

  // Top-p (Gemini supports this)
  if (responsesRequest.top_p !== undefined) {
    geminiRequest.generationConfig.topP = responsesRequest.top_p;
  }

  // Remove empty generationConfig
  if (Object.keys(geminiRequest.generationConfig).length === 0) {
    delete geminiRequest.generationConfig;
  }

  // Tool choice (Responses API to Gemini)
  // Map tool_choice to Gemini's function_calling_config
  if (responsesRequest.tool_choice !== undefined && geminiRequest.tools) {
    geminiRequest.toolConfig = {
      function_calling_config: {}
    };

    if (typeof responsesRequest.tool_choice === 'string') {
      if (responsesRequest.tool_choice === 'none') {
        // NONE mode: prohibit function calls
        geminiRequest.toolConfig.function_calling_config.mode = 'NONE';
      } else if (responsesRequest.tool_choice === 'required') {
        // ANY mode: force function call
        geminiRequest.toolConfig.function_calling_config.mode = 'ANY';
      } else if (responsesRequest.tool_choice === 'auto') {
        // AUTO mode: model decides (default, can be omitted)
        geminiRequest.toolConfig.function_calling_config.mode = 'AUTO';
      }
    } else if (responsesRequest.tool_choice?.type === 'function' || responsesRequest.tool_choice?.type === 'custom') {
      // Specific tool - use ANY mode with allowed_function_names
      const toolName = responsesRequest.tool_choice.function?.name || responsesRequest.tool_choice.name;
      geminiRequest.toolConfig.function_calling_config.mode = 'ANY';
      geminiRequest.toolConfig.function_calling_config.allowed_function_names = [toolName];
    }
  }

  return geminiRequest;
}

/**
 * Convert Gemini response to Responses API format
 * @param {Object} geminiResponse - Gemini format response
 * @param {string} model - Model name
 * @param {Object} originalRequest - Original request for context
 * @returns {Object} Responses API format response
 */
export function convertGeminiResponseToResponsesFormat(geminiResponse, model = 'gemini-2.5-flash', originalRequest = {}) {
  const output = [];
  let outputText = '';

  // Process candidates
  if (geminiResponse.candidates && geminiResponse.candidates.length > 0) {
    const candidate = geminiResponse.candidates[0];

    if (candidate.content && candidate.content.parts) {
      const messageContent = [];

      for (const part of candidate.content.parts) {
        if (part.text) {
          // Text content
          messageContent.push({
            type: 'output_text',
            text: part.text,
            annotations: []
          });
          outputText += part.text;
        } else if (part.functionCall) {
          // Function call - add as separate function_call item
          const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          output.push({
            id: `fc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function_call',
            status: 'completed',
            arguments: JSON.stringify(part.functionCall.args || {}),
            call_id: callId,
            name: part.functionCall.name
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
  const responsesResponse = {
    id: `resp_${Date.now()}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
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
    parallel_tool_calls: false,
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
      input_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
      input_tokens_details: {
        cached_tokens: 0
      },
      output_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
      output_tokens_details: {
        reasoning_tokens: 0
      },
      total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0
    },
    user: null,
    metadata: {},
    output_text: outputText
  };

  return responsesResponse;
}
