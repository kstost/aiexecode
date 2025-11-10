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
    // Array input - could be messages or items
    for (const item of responsesRequest.input) {
      if (item.role && item.content) {
        // Message format
        if (item.role === 'system') {
          // System messages go to systemInstruction in Gemini
          geminiRequest.systemInstruction = {
            parts: [{ text: item.content }]
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
        } else if (item.role === 'assistant') {
          // Assistant message
          geminiRequest.contents.push({
            role: 'model',
            parts: [{ text: item.content }]
          });
        } else {
          // User message
          geminiRequest.contents.push({
            role: 'user',
            parts: [{ text: item.content }]
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
            // Chat Completions format (for compatibility)
            return {
              name: tool.function.name,
              description: tool.function.description || `Function: ${tool.function.name}`,
              parameters: tool.function.parameters || {
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
          }
          // If already in Gemini format, pass through
          return tool;
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
  // Note: Gemini doesn't have direct tool_choice control, but we can configure function calling mode
  if (responsesRequest.tool_choice !== undefined) {
    if (typeof responsesRequest.tool_choice === 'string') {
      if (responsesRequest.tool_choice === 'none') {
        // Remove tools if none
        delete geminiRequest.tools;
      } else if (responsesRequest.tool_choice === 'required') {
        // Gemini will call functions automatically if tools are provided
        // We can add a note in generationConfig if needed
        if (!geminiRequest.generationConfig) {
          geminiRequest.generationConfig = {};
        }
        // Gemini doesn't have exact equivalent, but we keep tools enabled
      }
      // 'auto' is default behavior in Gemini
    } else if (responsesRequest.tool_choice?.type === 'function' || responsesRequest.tool_choice?.type === 'custom') {
      // Specific tool - filter to only that tool
      const toolName = responsesRequest.tool_choice.function?.name || responsesRequest.tool_choice.name;
      if (geminiRequest.tools && geminiRequest.tools[0]?.functionDeclarations) {
        geminiRequest.tools[0].functionDeclarations = geminiRequest.tools[0].functionDeclarations.filter(
          fn => fn.name === toolName
        );
      }
    }
  }

  return geminiRequest;
}

/**
 * Convert Gemini response to Responses API format
 * @param {Object} geminiResponse - Gemini format response
 * @param {string} model - Model name
 * @returns {Object} Responses API format response
 */
export function convertGeminiResponseToResponsesFormat(geminiResponse, model = 'gemini-2.5-flash') {
  const output = [];

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
        } else if (part.functionCall) {
          // Function call - add as separate function_call item
          output.push({
            type: 'function_call',
            call_id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: part.functionCall.name,
            input: part.functionCall.args || {}
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
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: model,
    output: output,
    usage: {
      input_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
      output_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0
    }
  };

  // Add reasoning field (empty for Gemini, but structure matches Responses API)
  responsesResponse.reasoning = {
    effort: null,
    summary: null
  };

  // Add additional Responses API fields
  responsesResponse.parallel_tool_calls = false; // Gemini does sequential function calling
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
