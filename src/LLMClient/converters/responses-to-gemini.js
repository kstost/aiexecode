/**
 * Convert Responses API format to Gemini format
 */

/**
 * Remove markdown code block wrapper from text
 * Handles all possible cases mechanically without regex
 * @param {string} text - Raw text possibly wrapped in markdown code block
 * @returns {string} Cleaned text
 */
function removeMarkdownCodeBlock(text) {
  // Case 1: null, undefined, empty string, non-string
  if (!text || typeof text !== 'string') {
    return text;
  }

  let result = text;
  let startIndex = 0;
  let endIndex = result.length;

  // ============================================
  // PHASE 1: Process opening ``` marker
  // ============================================

  // Case 2: Text doesn't start with ``` at all
  if (!result.startsWith('```')) {
    // No opening marker - return as is (trimmed)
    return result.trim();
  }

  // Case 3: Text starts with ``` - remove it
  startIndex = 3;

  // Now check what comes after ```
  // Possible cases:
  // - ```\n... (no language identifier)
  // - ```json\n... (with language identifier)
  // - ```json ... (language identifier with spaces)
  // - ``` json\n... (spaces before language identifier)
  // - ```{... (no newline, content starts immediately - edge case)

  // Skip any spaces immediately after ```
  while (startIndex < endIndex && result[startIndex] === ' ') {
    startIndex++;
  }

  // Case 4: After ``` and optional spaces, look for newline
  const firstNewlinePos = result.indexOf('\n', startIndex);

  if (firstNewlinePos === -1) {
    // Case 5: No newline found after ``` - entire rest is content
    // Example: ```{"key":"value"}``` or ```{"key":"value"}
    // Content starts right after ``` (and any spaces we skipped)
    // Don't advance startIndex further - keep content starting position
  } else {
    // Case 6: Newline exists - check what's between ``` and \n
    const betweenBackticksAndNewline = result.substring(startIndex, firstNewlinePos);

    // Trim to check if it's a language identifier
    const trimmed = betweenBackticksAndNewline.trim();

    if (trimmed.length === 0) {
      // Case 7: Nothing between ``` and \n (or only whitespace)
      // Example: ```\n... or ```  \n...
      // Content starts after the newline
      startIndex = firstNewlinePos + 1;
    } else {
      // Case 8: Something exists between ``` and \n
      // Check if it looks like a language identifier (alphanumeric, underscore, dash only)
      let isLanguageIdentifier = true;
      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        const isValid = (char >= 'a' && char <= 'z') ||
                       (char >= 'A' && char <= 'Z') ||
                       (char >= '0' && char <= '9') ||
                       char === '_' || char === '-';
        if (!isValid) {
          isLanguageIdentifier = false;
          break;
        }
      }

      if (isLanguageIdentifier) {
        // Case 9: It's a language identifier like "json", "javascript", etc.
        // Skip it and the newline - content starts after newline
        startIndex = firstNewlinePos + 1;
      } else {
        // Case 10: It's actual content (contains special chars like {, [, etc.)
        // Example: ```{"key": "value"}\n...
        // Keep this content - don't skip anything
        // startIndex already points to start of this content
      }
    }
  }

  // ============================================
  // PHASE 2: Process closing ``` marker
  // ============================================

  // Work backwards from end to find closing ```

  // Case 11: Find where actual content ends (before any trailing ``` and whitespace)

  // Step 1: Skip trailing whitespace from the end
  let checkPos = endIndex - 1;
  while (checkPos >= startIndex && (result[checkPos] === ' ' || result[checkPos] === '\t' ||
         result[checkPos] === '\n' || result[checkPos] === '\r')) {
    checkPos--;
  }

  // Step 2: Check if we have ``` at this position (working backwards)
  if (checkPos >= startIndex + 2 &&
      result[checkPos] === '`' &&
      result[checkPos - 1] === '`' &&
      result[checkPos - 2] === '`') {
    // Case 12: Found closing ``` marker
    // Move back before the ```
    endIndex = checkPos - 2;

    // Also trim any whitespace before the ```
    while (endIndex > startIndex && (result[endIndex - 1] === ' ' || result[endIndex - 1] === '\t' ||
           result[endIndex - 1] === '\n' || result[endIndex - 1] === '\r')) {
      endIndex--;
    }
  } else {
    // Case 13: No closing ``` found
    // Use position after trimming trailing whitespace
    // Add 1 because checkPos is the last non-whitespace character's index
    endIndex = checkPos + 1;
  }

  // ============================================
  // PHASE 3: Extract and return cleaned content
  // ============================================

  // Case 14: Extract the content between processed boundaries
  if (startIndex >= endIndex) {
    // Case 15: Nothing left after processing (empty content between markers)
    return '';
  }

  result = result.substring(startIndex, endIndex);

  // Case 16: Final trim to remove any remaining edge whitespace
  return result.trim();
}

/**
 * Remove Gemini-incompatible fields from JSON Schema
 * @param {Object} schema - JSON Schema object
 * @returns {Object} Cleaned schema
 */
function cleanSchemaForGemini(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // Deep clone to avoid mutating original
  const cleaned = JSON.parse(JSON.stringify(schema));

  // Recursive function to clean schema objects
  function cleanObject(obj) {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Remove Gemini-incompatible fields
    delete obj.additionalProperties;
    delete obj.$schema;
    delete obj.$id;
    delete obj.$ref;
    delete obj.definitions;
    delete obj.$defs;

    // Recursively clean nested objects
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (Array.isArray(obj[key])) {
          obj[key].forEach(item => cleanObject(item));
        } else {
          cleanObject(obj[key]);
        }
      }
    }
  }

  cleanObject(cleaned);
  return cleaned;
}

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
          let response;
          if (typeof item.output === 'string') {
            try {
              // Try to parse as JSON
              response = JSON.parse(item.output);
            } catch {
              // If not valid JSON, wrap plain text in object
              response = { result: item.output };
            }
          } else {
            response = item.output;
          }

          geminiRequest.contents.push({
            role: 'function',
            parts: [
              {
                functionResponse: {
                  name: geminiRequest.contents[geminiRequest.contents.length - 1]?.parts?.[0]?.functionCall?.name || 'unknown',
                  response: response
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
            let response;
            if (typeof item.content === 'string') {
              try {
                // Try to parse as JSON
                response = JSON.parse(item.content);
              } catch {
                // If not valid JSON, wrap plain text in object
                response = { result: item.content };
              }
            } else {
              response = item.content;
            }

            geminiRequest.contents.push({
              role: 'function',
              parts: [
                {
                  functionResponse: {
                    name: item.name,
                    response: response
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
          let parameters;

          if (tool.type === 'function' && tool.function) {
            // Chat Completions format with nested function object
            parameters = tool.function.parameters || {
              type: 'object',
              properties: {}
            };
          } else if (tool.type === 'function' && !tool.function) {
            // Chat Completions format without nested function object
            parameters = tool.parameters || {
              type: 'object',
              properties: {}
            };
          } else if (tool.type === 'custom') {
            // Responses API format
            parameters = tool.input_schema || {
              type: 'object',
              properties: {}
            };
          } else if (tool.name && tool.description) {
            // Already in Gemini format (name, description, parameters)
            parameters = tool.parameters || {
              type: 'object',
              properties: {}
            };
          } else {
            // Fallback: extract name, description, parameters
            parameters = tool.parameters || tool.input_schema || {
              type: 'object',
              properties: {}
            };
          }

          // Clean parameters for Gemini compatibility
          const cleanedParameters = cleanSchemaForGemini(parameters);

          // Build function declaration
          if (tool.type === 'function' && tool.function) {
            return {
              name: tool.function.name,
              description: tool.function.description || `Function: ${tool.function.name}`,
              parameters: cleanedParameters
            };
          } else if (tool.type === 'function' && !tool.function) {
            return {
              name: tool.name,
              description: tool.description || `Function: ${tool.name}`,
              parameters: cleanedParameters
            };
          } else if (tool.type === 'custom') {
            return {
              name: tool.name,
              description: tool.description || `Tool: ${tool.name}`,
              parameters: cleanedParameters
            };
          } else if (tool.name && tool.description) {
            return {
              name: tool.name,
              description: tool.description,
              parameters: cleanedParameters
            };
          }

          return {
            name: tool.name || 'unknown',
            description: tool.description || 'No description',
            parameters: cleanedParameters
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
      // First pass: collect raw text
      for (const part of candidate.content.parts) {
        if (part.text) {
          outputText += part.text;
        }
      }

      // Clean up markdown code blocks from output text (Gemini often wraps JSON in ```json...```)
      let cleanedText = outputText;
      if (originalRequest.text?.format?.type === 'json_schema') {
        cleanedText = removeMarkdownCodeBlock(outputText);
      }

      // Second pass: build message content with cleaned text
      const messageContent = [];
      let hasText = false;

      for (const part of candidate.content.parts) {
        if (part.text && !hasText) {
          // Add cleaned text as a single content block (only once)
          messageContent.push({
            type: 'output_text',
            text: cleanedText,
            annotations: []
          });
          hasText = true;
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

  // Use cleaned text for output_text field
  let cleanedOutputText = outputText;
  if (originalRequest.text?.format?.type === 'json_schema') {
    cleanedOutputText = removeMarkdownCodeBlock(outputText);
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
    text: originalRequest.text || {
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
    output_text: cleanedOutputText
  };

  return responsesResponse;
}
