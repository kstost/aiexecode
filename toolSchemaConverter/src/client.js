/**
 * Unified LLM Client with Responses API Interface
 * Supports OpenAI, Claude, Gemini, and Ollama with OpenAI Responses API-compatible interface
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { convertResponsesRequestToClaudeFormat, convertClaudeResponseToResponsesFormat } from './converters/responses-to-claude.js';
import { convertResponsesRequestToGeminiFormat, convertGeminiResponseToResponsesFormat } from './converters/responses-to-gemini.js';
import { convertResponsesRequestToOllamaFormat, convertOllamaResponseToResponsesFormat } from './converters/responses-to-ollama.js';
import { normalizeInput } from './converters/input-normalizer.js';
import { normalizeError, createErrorFromResponse } from './errors.js';

export class UnifiedLLMClient {
  /**
   * Create a unified LLM client
   * @param {Object} config - Configuration object
   * @param {string} config.provider - Provider name: 'openai', 'claude', 'gemini', or 'ollama' (auto-detected from model if not provided)
   * @param {string} [config.apiKey] - API key for the provider
   * @param {string} [config.baseUrl] - Base URL (for Ollama)
   * @param {string} [config.model] - Default model to use
   */
  constructor(config = {}) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.defaultModel = config.model;
    this.explicitProvider = !!config.provider; // Track if provider was explicitly set

    // Auto-detect provider from model if not explicitly provided
    if (!this.provider && this.defaultModel) {
      this.provider = this._detectProviderFromModel(this.defaultModel);
    }

    // Default to openai if still no provider
    this.provider = this.provider || 'openai';

    this._initializeClient();
  }

  /**
   * Auto-detect provider from model name
   */
  _detectProviderFromModel(model) {
    if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-') || model.startsWith('text-')) {
      return 'openai';
    } else if (model.startsWith('claude-')) {
      return 'claude';
    } else if (model.startsWith('gemini-')) {
      return 'gemini';
    } else if (model.includes('llama') || model.includes('mistral') || model.includes('codellama')) {
      return 'ollama';
    }
    return null;
  }

  /**
   * Check if model is GPT-5, o3, or other reasoning models
   */
  _isReasoningModel(model) {
    return model === 'gpt-5' || model === 'gpt-5-mini' || model === 'gpt-5-nano' ||
           model === 'o3' || model === 'o3-mini';
  }

  _initializeClient() {
    switch (this.provider) {
      case 'openai':
        this.client = new OpenAI({ apiKey: this.apiKey });
        break;

      case 'claude':
        this.client = new Anthropic({ apiKey: this.apiKey });
        break;

      case 'gemini':
        this.client = new GoogleGenerativeAI(this.apiKey);
        break;

      case 'ollama':
        // Ollama doesn't have an official SDK, we'll use fetch
        this.baseUrl = this.baseUrl || 'http://localhost:11434';
        break;

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  /**
   * Create a response (Responses API-compatible interface)
   * @param {Object} request - Responses API format request
   * @returns {Promise<Object>|AsyncGenerator} Responses API format response or stream
   */
  async response(request) {
    // Set default model if not provided
    if (!request.model && this.defaultModel) {
      request.model = this.defaultModel;
    }

    // Auto-detect provider from model name in request
    // Only if provider was not explicitly set in constructor
    let effectiveProvider = this.provider;
    if (request.model && !this.explicitProvider) {
      const detectedProvider = this._detectProviderFromModel(request.model);
      if (detectedProvider) {
        effectiveProvider = detectedProvider;
        // Re-initialize client if provider changed
        if (effectiveProvider !== this.provider) {
          const oldProvider = this.provider;
          this.provider = effectiveProvider;
          this._initializeClient();
        }
      }
    }

    // Check if streaming is requested
    const isStreaming = request.stream === true;

    switch (effectiveProvider) {
      case 'openai':
        return isStreaming ? this._responseOpenAIStream(request) : await this._responseOpenAI(request);

      case 'claude':
        return isStreaming ? this._responseClaudeStream(request) : await this._responseClaude(request);

      case 'gemini':
        return isStreaming ? this._responseGeminiStream(request) : await this._responseGemini(request);

      case 'ollama':
        return isStreaming ? this._responseOllamaStream(request) : await this._responseOllama(request);

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  async _responseOpenAI(request) {
    try {
      // Call OpenAI Responses API directly
      const response = await this._callOpenAIResponsesAPI(request);
      return response;
    } catch (error) {
      throw normalizeError(error, 'openai');
    }
  }

  async _callOpenAIResponsesAPI(request) {
    // Convert to proper Responses API format (like ai_request.js)
    const openAIRequest = { ...request };

    // 1. Normalize input to Responses API format
    // Convert from string or Chat Completions format to proper input array
    if (openAIRequest.input) {
      openAIRequest.input = normalizeInput(openAIRequest.input);
    }

    // 2. Tools conversion
    // OpenAI uses: { type: 'function', name, description, parameters }
    // Not: { type: 'custom', name, description, input_schema }
    if (openAIRequest.tools && Array.isArray(openAIRequest.tools)) {
      openAIRequest.tools = openAIRequest.tools.map(tool => {
        if (tool.type === 'custom' && tool.input_schema) {
          // Convert custom format to OpenAI Responses API format
          return {
            type: 'function',
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            parameters: tool.input_schema
          };
        } else if (tool.type === 'function' && tool.function) {
          // Convert Chat Completions format to Responses API format
          return {
            type: 'function',
            name: tool.function.name,
            description: tool.function.description || `Function: ${tool.function.name}`,
            parameters: tool.function.parameters
          };
        }
        // Already in correct format or pass through
        return tool;
      });
    }

    // Add reasoning configuration for reasoning models (like ai_request.js)
    // Check if model supports reasoning
    const reasoningModels = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o3', 'o3-mini'];
    const currentModel = openAIRequest.model || 'gpt-4o-mini';

    if (reasoningModels.some(m => currentModel.startsWith(m))) {
      // Add reasoning configuration if not already present
      if (!openAIRequest.reasoning) {
        openAIRequest.reasoning = {
          effort: 'medium',
          summary: 'auto'
        };
      }
    }

    // Use OpenAI SDK to call Responses API (like ai_request.js)
    const data = await this.client.responses.create(openAIRequest);

    // Parse function call arguments if they are strings
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'function_call' && typeof item.arguments === 'string') {
          try {
            item.input = JSON.parse(item.arguments);
            delete item.arguments; // Keep only 'input' for consistency
          } catch (e) {
            // If parsing fails, keep as string
            item.input = item.arguments;
          }
        }
      }
    }

    return data;
  }

  async _responseClaude(request) {
    try {
      const claudeRequest = convertResponsesRequestToClaudeFormat(request);
      const claudeResponse = await this.client.messages.create(claudeRequest);
      return convertClaudeResponseToResponsesFormat(claudeResponse, request.model);
    } catch (error) {
      throw normalizeError(error, 'claude');
    }
  }

  async _responseGemini(request) {
    try {
      const geminiRequest = convertResponsesRequestToGeminiFormat(request);

      // Create model configuration
      const modelConfig = { model: request.model || 'gemini-2.5-flash' };

      // Add tools to model config if present
      if (geminiRequest.tools && geminiRequest.tools.length > 0) {
        modelConfig.tools = geminiRequest.tools;
      }

      // Add system instruction to model config if present
      if (geminiRequest.systemInstruction) {
        modelConfig.systemInstruction = geminiRequest.systemInstruction;
      }

      const model = this.client.getGenerativeModel(modelConfig);

      // Prepare generateContent request
      const generateRequest = {
        contents: geminiRequest.contents
      };

      if (geminiRequest.generationConfig) {
        generateRequest.generationConfig = geminiRequest.generationConfig;
      }

      const result = await model.generateContent(generateRequest);
      const response = await result.response;

      // Convert to Responses API format
      return convertGeminiResponseToResponsesFormat({
        candidates: [
          {
            content: response.candidates?.[0]?.content,
            finishReason: response.candidates?.[0]?.finishReason
          }
        ],
        usageMetadata: response.usageMetadata
      }, request.model);
    } catch (error) {
      throw normalizeError(error, 'gemini');
    }
  }

  async _responseOllama(request) {
    try {
      const { url, request: ollamaRequest } = convertResponsesRequestToOllamaFormat(request, this.baseUrl);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ollamaRequest)
      });

      if (!response.ok) {
        const error = await createErrorFromResponse(response, 'ollama');
        throw error;
      }

      const ollamaResponse = await response.json();
      return convertOllamaResponseToResponsesFormat(ollamaResponse, request.model);
    } catch (error) {
      throw normalizeError(error, 'ollama');
    }
  }

  // ============================================
  // Streaming Methods
  // ============================================

  /**
   * OpenAI streaming response
   * @param {Object} request - Responses API format request
   * @returns {AsyncGenerator} Responses API format stream
   */
  async *_responseOpenAIStream(request) {
    try {
      // Prepare streaming request (same as non-streaming)
      const streamRequest = { ...request, stream: true };

      // 1. Normalize input to Responses API format
      if (streamRequest.input) {
        streamRequest.input = normalizeInput(streamRequest.input);
      }

      // 2. Tools conversion
      if (streamRequest.tools && Array.isArray(streamRequest.tools)) {
        streamRequest.tools = streamRequest.tools.map(tool => {
          if (tool.type === 'custom' && tool.input_schema) {
            return {
              type: 'function',
              name: tool.name,
              description: tool.description || `Tool: ${tool.name}`,
              parameters: tool.input_schema
            };
          } else if (tool.type === 'function' && tool.function) {
            return {
              type: 'function',
              name: tool.function.name,
              description: tool.function.description || `Function: ${tool.function.name}`,
              parameters: tool.function.parameters
            };
          }
          return tool;
        });
      }

      // Add reasoning configuration for reasoning models
      const reasoningModels = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o3', 'o3-mini'];
      const currentModel = streamRequest.model || 'gpt-4o-mini';

      if (reasoningModels.some(m => currentModel.startsWith(m))) {
        if (!streamRequest.reasoning) {
          streamRequest.reasoning = {
            effort: 'medium',
            summary: 'auto'
          };
        }
      }

      // Use OpenAI SDK for streaming (like ai_request.js)
      const stream = await this.client.responses.create(streamRequest);

      // Stream the response chunks and convert to consistent format
      const streamId = `resp_${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      let currentMessageId = null;

      for await (const chunk of stream) {
        // Convert OpenAI SDK streaming format to our standard format
        if (chunk.type === 'response.output_text.delta') {
          // Text delta
          yield {
            id: streamId,
            object: 'response.delta',
            created_at: created,
            model: streamRequest.model,
            delta: {
              type: 'output_text',
              message_id: chunk.item_id,
              text: chunk.delta
            }
          };
        } else if (chunk.type === 'response.done' || chunk.type === 'response.completed') {
          // Stream completed
          yield {
            id: streamId,
            object: 'response.done',
            created_at: created,
            model: streamRequest.model,
            status: 'completed'
          };
        }
        // Ignore other chunk types for now (response.created, response.in_progress, etc.)
      }
    } catch (error) {
      throw normalizeError(error, 'openai');
    }
  }

  /**
   * Claude streaming response
   * @param {Object} request - Responses API format request
   * @returns {AsyncGenerator} Responses API format stream
   */
  async *_responseClaudeStream(request) {
    try {
      const claudeRequest = convertResponsesRequestToClaudeFormat(request);
      const stream = await this.client.messages.stream(claudeRequest);

      const streamId = `resp_${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      let currentMessageId = `msg_${Date.now()}`;

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          // Convert to Responses API streaming format
          yield {
            id: streamId,
            object: 'response.delta',
            created_at: created,
            model: request.model || 'claude-sonnet-4-5',
            delta: {
              type: 'output_text',
              message_id: currentMessageId,
              text: event.delta.text
            }
          };
        } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
          // Final chunk
          yield {
            id: streamId,
            object: 'response.done',
            created_at: created,
            model: request.model || 'claude-sonnet-4-5',
            status: 'completed'
          };
        }
      }
    } catch (error) {
      throw normalizeError(error, 'claude');
    }
  }

  /**
   * Gemini streaming response
   * @param {Object} request - Responses API format request
   * @returns {AsyncGenerator} Responses API format stream
   */
  async *_responseGeminiStream(request) {
    try {
      const geminiRequest = convertResponsesRequestToGeminiFormat(request);

      // Create model configuration
      const modelConfig = { model: request.model || 'gemini-2.5-flash' };

      if (geminiRequest.tools && geminiRequest.tools.length > 0) {
        modelConfig.tools = geminiRequest.tools;
      }

      if (geminiRequest.systemInstruction) {
        modelConfig.systemInstruction = geminiRequest.systemInstruction;
      }

      const model = this.client.getGenerativeModel(modelConfig);

      const generateRequest = {
        contents: geminiRequest.contents
      };

      if (geminiRequest.generationConfig) {
        generateRequest.generationConfig = geminiRequest.generationConfig;
      }

      const result = await model.generateContentStream(generateRequest);

      const streamId = `resp_${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      const messageId = `msg_${Date.now()}`;

      for await (const chunk of result.stream) {
        const text = chunk.text();

        if (text) {
          yield {
            id: streamId,
            object: 'response.delta',
            created_at: created,
            model: request.model || 'gemini-2.5-flash',
            delta: {
              type: 'output_text',
              message_id: messageId,
              text: text
            }
          };
        }
      }

      // Final chunk
      yield {
        id: streamId,
        object: 'response.done',
        created_at: created,
        model: request.model || 'gemini-2.5-flash',
        status: 'completed'
      };
    } catch (error) {
      throw normalizeError(error, 'gemini');
    }
  }

  /**
   * Ollama streaming response
   * @param {Object} request - Responses API format request
   * @returns {AsyncGenerator} Responses API format stream
   */
  async *_responseOllamaStream(request) {
    try {
      const { url, request: ollamaRequest } = convertResponsesRequestToOllamaFormat(request, this.baseUrl);

      // Ensure stream is enabled
      ollamaRequest.stream = true;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ollamaRequest)
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const streamId = `resp_${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      const messageId = `msg_${Date.now()}`;

      // Parse streaming response (newline-delimited JSON)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);

              if (chunk.message?.content) {
                yield {
                  id: streamId,
                  object: 'response.delta',
                  created_at: created,
                  model: request.model,
                  delta: {
                    type: 'output_text',
                    message_id: messageId,
                    text: chunk.message.content
                  }
                };
              }

              if (chunk.done) {
                yield {
                  id: streamId,
                  object: 'response.done',
                  created_at: created,
                  model: request.model,
                  status: 'completed'
                };
              }
            } catch (parseError) {
              console.error('Error parsing Ollama stream chunk:', parseError);
            }
          }
        }
      }
    } catch (error) {
      throw normalizeError(error, 'ollama');
    }
  }
}
