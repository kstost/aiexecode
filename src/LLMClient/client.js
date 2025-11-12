/**
 * Unified LLM Client with Responses API Interface
 * Supports OpenAI, Claude, Gemini, and Ollama with OpenAI Responses API-compatible interface
 */

import fs from 'fs';
import path from 'path';
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
   * @param {string} [config.logDir] - Directory path for logging request/response payloads (if not provided, logging is disabled)
   */
  constructor(config = {}) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.defaultModel = config.model;
    this.logDir = config.logDir;
    this.explicitProvider = !!config.provider; // Track if provider was explicitly set

    // Auto-detect provider from model if not explicitly provided
    if (!this.provider && this.defaultModel) {
      this.provider = this._detectProviderFromModel(this.defaultModel);
    }

    // Default to openai if still no provider
    this.provider = this.provider || 'openai';

    // Create log directory if specified and doesn't exist
    if (this.logDir) {
      try {
        if (!fs.existsSync(this.logDir)) {
          fs.mkdirSync(this.logDir, { recursive: true });
        }
      } catch (error) {
        console.error(`Failed to create log directory: ${error.message}`);
        this.logDir = null; // Disable logging if directory creation fails
      }
    }

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
   * Log payload to file
   * @param {Object} payload - Request or response payload
   * @param {string} type - 'REQ' or 'RES'
   * @param {string} providerName - Provider name
   */
  _logPayload(payload, type, providerName) {
    if (!this.logDir) return;

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

      const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`;
      const filename = `${timestamp}-${type}-${providerName}.json`;
      const filepath = path.join(this.logDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to log payload: ${error.message}`);
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

    // Convert instructions field to input array (Method 2)
    // If instructions is provided, add it as a system role message at the beginning of input array
    if (request.instructions) {
      // Ensure input is an array
      if (!request.input) {
        request.input = [];
      } else if (typeof request.input === 'string') {
        // Convert string input to array format
        request.input = [
          {
            role: 'user',
            content: [{ type: 'input_text', text: request.input }]
          }
        ];
      }

      // Check if input already has a system message
      const hasSystemMessage = Array.isArray(request.input) &&
                                request.input.some(item => item.role === 'system');

      if (!hasSystemMessage) {
        // Add instructions as system message at the beginning
        const systemMessage = {
          role: 'system',
          content: typeof request.instructions === 'string'
            ? [{ type: 'input_text', text: request.instructions }]
            : request.instructions
        };

        request.input.unshift(systemMessage);
      }

      // Remove instructions field to avoid duplication
      delete request.instructions;
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

    // Log request payload
    this._logPayload(request, 'REQ', effectiveProvider);

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
      // Log response payload
      this._logPayload(response, 'RES', 'openai');
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

      // OpenAI Responses API uses role-based input with content arrays
      // No conversion needed - keep the format as-is
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

    // Log raw request payload before API call
    this._logPayload(openAIRequest, 'REQ-RAW', 'openai');

    // Use OpenAI SDK to call Responses API (like ai_request.js)
    const data = await this.client.responses.create(openAIRequest);

    // Ensure all required fields are present and properly formatted
    const normalizedResponse = {
      id: data.id,
      object: data.object || 'response',
      created_at: data.created_at || Math.floor(Date.now() / 1000),
      status: data.status || 'completed',
      background: data.background !== undefined ? data.background : false,
      billing: data.billing || { payer: 'developer' },
      error: data.error || null,
      incomplete_details: data.incomplete_details || null,
      instructions: data.instructions || openAIRequest.instructions || null,
      max_output_tokens: data.max_output_tokens || openAIRequest.max_output_tokens || null,
      max_tool_calls: data.max_tool_calls || null,
      model: data.model,
      output: data.output || [],
      parallel_tool_calls: data.parallel_tool_calls !== undefined ? data.parallel_tool_calls : true,
      previous_response_id: data.previous_response_id || null,
      prompt_cache_key: data.prompt_cache_key || null,
      prompt_cache_retention: data.prompt_cache_retention || null,
      reasoning: data.reasoning || { effort: openAIRequest.reasoning?.effort || null, summary: openAIRequest.reasoning?.summary || null },
      safety_identifier: data.safety_identifier || null,
      service_tier: data.service_tier || 'default',
      store: data.store !== undefined ? data.store : (openAIRequest.store !== undefined ? openAIRequest.store : true),
      temperature: data.temperature !== undefined ? data.temperature : (openAIRequest.temperature !== undefined ? openAIRequest.temperature : 1),
      text: data.text || { format: { type: 'text' }, verbosity: 'medium' },
      tool_choice: data.tool_choice || openAIRequest.tool_choice || 'auto',
      tools: data.tools || openAIRequest.tools || [],
      top_logprobs: data.top_logprobs !== undefined ? data.top_logprobs : 0,
      top_p: data.top_p !== undefined ? data.top_p : (openAIRequest.top_p !== undefined ? openAIRequest.top_p : 1),
      truncation: data.truncation || 'disabled',
      usage: data.usage || {
        input_tokens: 0,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 0,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 0
      },
      user: data.user || null,
      metadata: data.metadata || {},
      output_text: data.output_text !== undefined ? data.output_text : ''
    };

    // Normalize output items
    if (normalizedResponse.output && Array.isArray(normalizedResponse.output)) {
      for (const item of normalizedResponse.output) {
        // Ensure function_call items have proper structure
        if (item.type === 'function_call') {
          // Ensure id field exists
          if (!item.id) {
            item.id = `fc_${item.call_id || Date.now()}`;
          }
          // Ensure status field exists
          if (!item.status) {
            item.status = 'completed';
          }
          // Keep arguments as string (per spec)
          if (typeof item.arguments !== 'string' && item.input) {
            item.arguments = JSON.stringify(item.input);
          }
          // Ensure call_id exists
          if (!item.call_id && item.id) {
            item.call_id = item.id.replace(/^fc_/, 'call_');
          }
        }
        // Ensure message items have proper structure
        else if (item.type === 'message') {
          if (!item.id) {
            item.id = `msg_${Date.now()}`;
          }
          if (!item.status) {
            item.status = 'completed';
          }
        }
        // Ensure reasoning items have proper structure
        else if (item.type === 'reasoning') {
          if (!item.id) {
            item.id = `rs_${Date.now()}`;
          }
        }
      }
    }

    // Calculate output_text if not provided
    if (normalizedResponse.output_text === '' && normalizedResponse.output) {
      let outputText = '';
      for (const item of normalizedResponse.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text' && content.text) {
              outputText += content.text;
            }
          }
        }
      }
      normalizedResponse.output_text = outputText;
    }

    // Ensure usage has proper structure
    if (!normalizedResponse.usage.input_tokens_details) {
      normalizedResponse.usage.input_tokens_details = { cached_tokens: 0 };
    }
    if (!normalizedResponse.usage.output_tokens_details) {
      normalizedResponse.usage.output_tokens_details = { reasoning_tokens: 0 };
    }

    return normalizedResponse;
  }

  async _responseClaude(request) {
    try {
      const claudeRequest = convertResponsesRequestToClaudeFormat(request);
      // Log raw request payload before API call
      this._logPayload(claudeRequest, 'REQ-RAW', 'claude');
      const claudeResponse = await this.client.messages.create(claudeRequest);
      const response = convertClaudeResponseToResponsesFormat(claudeResponse, request.model, request);
      // Log response payload
      this._logPayload(response, 'RES', 'claude');
      return response;
    } catch (error) {
      throw normalizeError(error, 'claude');
    }
  }

  async _responseGemini(request) {
    try {
      const geminiRequest = convertResponsesRequestToGeminiFormat(request);
      // Log raw request payload before API call
      this._logPayload(geminiRequest, 'REQ-RAW', 'gemini');

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

      if (geminiRequest.toolConfig) {
        generateRequest.toolConfig = geminiRequest.toolConfig;
      }

      const result = await model.generateContent(generateRequest);
      const response = await result.response;

      // Convert to Responses API format
      const convertedResponse = convertGeminiResponseToResponsesFormat({
        candidates: [
          {
            content: response.candidates?.[0]?.content,
            finishReason: response.candidates?.[0]?.finishReason
          }
        ],
        usageMetadata: response.usageMetadata
      }, request.model, request);
      // Log response payload
      this._logPayload(convertedResponse, 'RES', 'gemini');
      return convertedResponse;
    } catch (error) {
      throw normalizeError(error, 'gemini');
    }
  }

  async _responseOllama(request) {
    try {
      const { url, request: ollamaRequest } = convertResponsesRequestToOllamaFormat(request, this.baseUrl);
      // Log raw request payload before API call
      this._logPayload(ollamaRequest, 'REQ-RAW', 'ollama');

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
      // Log Ollama's raw response for debugging
      this._logPayload(ollamaResponse, 'RES-RAW', 'ollama');
      const convertedResponse = convertOllamaResponseToResponsesFormat(ollamaResponse, request.model, request);
      // Log response payload
      this._logPayload(convertedResponse, 'RES', 'ollama');
      return convertedResponse;
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
    const chunks = []; // Collect all chunks for logging
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

      // Log raw request payload before API call
      this._logPayload(streamRequest, 'REQ-RAW', 'openai');

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
          const deltaChunk = {
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
          chunks.push(deltaChunk);
          yield deltaChunk;
        } else if (chunk.type === 'response.done' || chunk.type === 'response.completed') {
          // Stream completed
          const doneChunk = {
            id: streamId,
            object: 'response.done',
            created_at: created,
            model: streamRequest.model,
            status: 'completed'
          };
          chunks.push(doneChunk);
          // Log all chunks
          this._logPayload(chunks, 'RES', 'openai');
          yield doneChunk;
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
    const chunks = []; // Collect all chunks for logging
    try {
      const claudeRequest = convertResponsesRequestToClaudeFormat(request);
      // Log raw request payload before API call
      this._logPayload(claudeRequest, 'REQ-RAW', 'claude');
      const stream = await this.client.messages.stream(claudeRequest);

      const streamId = `resp_${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      let currentMessageId = `msg_${Date.now()}`;

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          // Convert to Responses API streaming format
          const deltaChunk = {
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
          chunks.push(deltaChunk);
          yield deltaChunk;
        } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
          // Final chunk
          const doneChunk = {
            id: streamId,
            object: 'response.done',
            created_at: created,
            model: request.model || 'claude-sonnet-4-5',
            status: 'completed'
          };
          chunks.push(doneChunk);
          // Log all chunks
          this._logPayload(chunks, 'RES', 'claude');
          yield doneChunk;
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
    const chunks = []; // Collect all chunks for logging
    try {
      const geminiRequest = convertResponsesRequestToGeminiFormat(request);
      // Log raw request payload before API call
      this._logPayload(geminiRequest, 'REQ-RAW', 'gemini');

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

      if (geminiRequest.toolConfig) {
        generateRequest.toolConfig = geminiRequest.toolConfig;
      }

      const result = await model.generateContentStream(generateRequest);

      const streamId = `resp_${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      const messageId = `msg_${Date.now()}`;

      for await (const chunk of result.stream) {
        const text = chunk.text();

        if (text) {
          const deltaChunk = {
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
          chunks.push(deltaChunk);
          yield deltaChunk;
        }
      }

      // Final chunk
      const doneChunk = {
        id: streamId,
        object: 'response.done',
        created_at: created,
        model: request.model || 'gemini-2.5-flash',
        status: 'completed'
      };
      chunks.push(doneChunk);
      // Log all chunks
      this._logPayload(chunks, 'RES', 'gemini');
      yield doneChunk;
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
    const chunks = []; // Collect all chunks for logging
    try {
      const { url, request: ollamaRequest } = convertResponsesRequestToOllamaFormat(request, this.baseUrl);

      // Ensure stream is enabled
      ollamaRequest.stream = true;

      // Log raw request payload before API call
      this._logPayload(ollamaRequest, 'REQ-RAW', 'ollama');

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
                const deltaChunk = {
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
                chunks.push(deltaChunk);
                yield deltaChunk;
              }

              if (chunk.done) {
                const doneChunk = {
                  id: streamId,
                  object: 'response.done',
                  created_at: created,
                  model: request.model,
                  status: 'completed'
                };
                chunks.push(doneChunk);
                // Log all chunks
                this._logPayload(chunks, 'RES', 'ollama');
                yield doneChunk;
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
