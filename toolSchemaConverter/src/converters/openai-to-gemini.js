/**
 * Convert OpenAI format request to Gemini format
 */

/**
 * Convert OpenAI tools to Gemini function declarations
 * @param {Array} openaiTools - OpenAI tools array
 * @returns {Array} Gemini tools array
 */
export function convertToolsToGeminiFormat(openaiTools) {
  if (!openaiTools || !Array.isArray(openaiTools)) {
    return [];
  }

  const functionDeclarations = openaiTools.map(tool => {
    if (tool.type !== 'function') {
      throw new Error(`Unsupported tool type: ${tool.type}`);
    }

    return {
      name: tool.function.name,
      description: tool.function.description || '',
      parameters: tool.function.parameters || {
        type: 'object',
        properties: {},
        required: []
      }
    };
  });

  return [{ functionDeclarations }];
}

/**
 * Convert OpenAI messages to Gemini contents
 * @param {Array} openaiMessages - OpenAI messages array
 * @returns {Object} Gemini contents and system instruction
 */
export function convertMessagesToGeminiFormat(openaiMessages) {
  if (!openaiMessages || !Array.isArray(openaiMessages)) {
    return { contents: [], systemInstruction: null };
  }

  const contents = [];
  let systemInstruction = null;

  for (const msg of openaiMessages) {
    // Extract system message
    if (msg.role === 'system') {
      systemInstruction = msg.content;
      continue;
    }

    // Convert assistant message with tool_calls
    if (msg.role === 'assistant' && msg.tool_calls) {
      const parts = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      for (const toolCall of msg.tool_calls) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments)
          }
        });
      }

      contents.push({
        role: 'model',
        parts: parts
      });
    }
    // Convert tool results
    else if (msg.role === 'tool') {
      // Gemini requires function name for functionResponse
      // Try to extract from previous assistant message's tool_calls
      let functionName = msg.name || 'unknown_function';

      // If name is not provided, try to find it from tool_call_id
      if (!msg.name && msg.tool_call_id) {
        // Look back in contents to find the corresponding functionCall
        for (let i = contents.length - 1; i >= 0; i--) {
          const prevContent = contents[i];
          if (prevContent.role === 'model' && prevContent.parts) {
            for (const part of prevContent.parts) {
              if (part.functionCall) {
                // Match by tool_call_id if possible (note: this is a heuristic)
                functionName = part.functionCall.name;
                break;
              }
            }
          }
          if (functionName !== 'unknown_function') break;
        }
      }

      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: functionName,
              response: {
                result: msg.content
              }
            }
          }
        ]
      });
    }
    // Regular user message
    else if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    }
    // Regular assistant message
    else if (msg.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: msg.content }]
      });
    }
  }

  return { contents, systemInstruction };
}

/**
 * Convert complete OpenAI request to Gemini request
 * @param {Object} openaiRequest - OpenAI request object
 * @returns {Object} Gemini request object
 */
export function convertRequestToGeminiFormat(openaiRequest) {
  const { contents, systemInstruction } = convertMessagesToGeminiFormat(openaiRequest.messages);
  const tools = convertToolsToGeminiFormat(openaiRequest.tools);

  const geminiRequest = {
    contents: contents
  };

  if (systemInstruction) {
    geminiRequest.systemInstruction = systemInstruction;
  }

  const generationConfig = {};

  if (openaiRequest.temperature !== undefined) {
    generationConfig.temperature = openaiRequest.temperature;
  }

  if (openaiRequest.max_tokens !== undefined) {
    generationConfig.maxOutputTokens = openaiRequest.max_tokens;
  }

  if (Object.keys(generationConfig).length > 0) {
    geminiRequest.generationConfig = generationConfig;
  }

  if (tools.length > 0) {
    geminiRequest.tools = tools;
  }

  return geminiRequest;
}
