/**
 * Unified LLM Function Calling Client
 * Supports OpenAI, Claude, Gemini, and Ollama with OpenAI-compatible interface
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { convertRequestToClaudeFormat } from './converters/openai-to-claude.js';
import { convertClaudeResponseToOpenAI } from './converters/claude-to-openai.js';
import { convertRequestToGeminiFormat } from './converters/openai-to-gemini.js';
import { convertGeminiResponseToOpenAI } from './converters/gemini-to-openai.js';
import { convertRequestToOllamaFormat } from './converters/openai-to-ollama.js';
import { convertOllamaResponseToOpenAI } from './converters/ollama-to-openai.js';
import { convertChatRequestToResponsesFormat, convertResponsesResponseToChatFormat } from './converters/chat-to-responses.js';
import { normalizeError, createErrorFromResponse } from './errors.js';

export class UnifiedLLMClient {
  /**
   * Create a unified LLM client
   * @param {Object} config - Configuration object
   * @param {string} config.provider - Provider name: 'openai', 'claude', 'gemini', or 'ollama' (auto-detected from model if not provided)
   * @param {string} [config.apiType] - API type for OpenAI: 'chat-completions' (default) or 'responses'
   * @param {string} [config.apiKey] - API key for the provider
   * @param {string} [config.baseUrl] - Base URL (for Ollama)
   * @param {string} [config.model] - Default model to use
   */
  constructor(config = {}) {
    this.provider = config.provider;
    this.apiType = config.apiType || 'chat-completions';
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.defaultModel = config.model;

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
   * Check if model is GPT-5 or o3 series (requiring special parameter handling)
   */
  _isGPT5Model(model) {
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
   * Create a chat completion (OpenAI-compatible interface)
   * @param {Object} request - OpenAI-format request
   * @returns {Promise<Object>|AsyncGenerator} OpenAI-format response or stream
   */
  async chat(request) {
    // Set default model if not provided
    if (!request.model && this.defaultModel) {
      request.model = this.defaultModel;
    }

    // Auto-detect provider from model name in request
    let effectiveProvider = this.provider;
    if (request.model) {
      const detectedProvider = this._detectProviderFromModel(request.model);
      if (detectedProvider) {
        effectiveProvider = detectedProvider;
        // Re-initialize client if provider changed
        if (effectiveProvider !== this.provider) {
          const oldProvider = this.provider;
          this.provider = effectiveProvider;
          this._initializeClient();
          // Restore old provider after request
          // (Note: This is a temporary switch for this request only)
        }
      }
    }

    // Check if streaming is requested
    const isStreaming = request.stream === true;

    switch (effectiveProvider) {
      case 'openai':
        return isStreaming ? this._chatOpenAIStream(request) : await this._chatOpenAI(request);

      case 'claude':
        return isStreaming ? this._chatClaudeStream(request) : await this._chatClaude(request);

      case 'gemini':
        return isStreaming ? this._chatGeminiStream(request) : await this._chatGemini(request);

      case 'ollama':
        return isStreaming ? this._chatOllamaStream(request) : await this._chatOllama(request);

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  async _chatOpenAI(request) {
    try {
      // Use Responses API if apiType is 'responses'
      if (this.apiType === 'responses') {
        const responsesRequest = convertChatRequestToResponsesFormat(request);

        // Call Responses API (note: OpenAI SDK may not have this yet, using custom call)
        const response = await this._callOpenAIResponsesAPI(responsesRequest);

        // Convert back to Chat Completions format for consistency
        return convertResponsesResponseToChatFormat(response);
      } else {
        // Default: Chat Completions API

        // GPT-5/o3 models use max_completion_tokens instead of max_tokens
        if (request.model && this._isGPT5Model(request.model)) {
          const modifiedRequest = { ...request };

          // Convert max_tokens to max_completion_tokens for GPT-5
          if (modifiedRequest.max_tokens !== undefined) {
            modifiedRequest.max_completion_tokens = modifiedRequest.max_tokens;
            delete modifiedRequest.max_tokens;
          }

          const response = await this.client.chat.completions.create(modifiedRequest);
          return response;
        }

        const response = await this.client.chat.completions.create(request);
        return response;
      }
    } catch (error) {
      throw normalizeError(error, 'openai');
    }
  }

  async _callOpenAIResponsesAPI(request) {
    // OpenAI SDK might not have responses.create yet, so we use fetch
    const url = 'https://api.openai.com/v1/responses';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await createErrorFromResponse(response, 'openai');
      throw error;
    }

    return await response.json();
  }

  async _chatClaude(request) {
    try {
      const claudeRequest = convertRequestToClaudeFormat(request);
      const claudeResponse = await this.client.messages.create(claudeRequest);
      return convertClaudeResponseToOpenAI(claudeResponse);
    } catch (error) {
      throw normalizeError(error, 'claude');
    }
  }

  async _chatGemini(request) {
    try {
      const geminiRequest = convertRequestToGeminiFormat(request);

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

      // Prepare generateContent request (without tools and systemInstruction as they're in model)
      const generateRequest = {
        contents: geminiRequest.contents
      };

      if (geminiRequest.generationConfig) {
        generateRequest.generationConfig = geminiRequest.generationConfig;
      }

      const result = await model.generateContent(generateRequest);
      const response = await result.response;

      // Convert to OpenAI format
      return convertGeminiResponseToOpenAI({
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

  async _chatOllama(request) {
    try {
      const { url, request: ollamaRequest } = convertRequestToOllamaFormat(request, this.baseUrl);

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
      return convertOllamaResponseToOpenAI(ollamaResponse);
    } catch (error) {
      throw normalizeError(error, 'ollama');
    }
  }

  // ============================================
  // Streaming Methods
  // ============================================

  /**
   * OpenAI streaming chat completion
   * @param {Object} request - OpenAI-format request
   * @returns {AsyncGenerator} OpenAI-format stream
   */
  async *_chatOpenAIStream(request) {
    try {
      // Use Responses API if apiType is 'responses'
      if (this.apiType === 'responses') {
        // TODO: Implement Responses API streaming if needed
        throw new Error('Streaming is not yet supported for OpenAI Responses API');
      }

      // Default: Chat Completions API streaming

      // GPT-5/o3 models use max_completion_tokens instead of max_tokens
      const streamRequest = { ...request, stream: true };
      if (request.model && this._isGPT5Model(request.model)) {
        if (streamRequest.max_tokens !== undefined) {
          streamRequest.max_completion_tokens = streamRequest.max_tokens;
          delete streamRequest.max_tokens;
        }
      }

      const stream = await this.client.chat.completions.create(streamRequest);

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      throw normalizeError(error, 'openai');
    }
  }

  /**
   * Claude streaming chat completion
   * @param {Object} request - OpenAI-format request
   * @returns {AsyncGenerator} OpenAI-format stream
   */
  async *_chatClaudeStream(request) {
    try {
      const claudeRequest = convertRequestToClaudeFormat(request);

      const stream = await this.client.messages.stream(claudeRequest);

      let chunkIndex = 0;
      const streamId = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      for await (const event of stream) {
        // Handle different event types
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          // Convert to OpenAI streaming format
          yield {
            id: streamId,
            object: 'chat.completion.chunk',
            created: created,
            model: request.model || 'claude-sonnet-4-5',
            choices: [
              {
                index: 0,
                delta: {
                  content: event.delta.text
                },
                finish_reason: null
              }
            ]
          };
          chunkIndex++;
        } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
          // Final chunk with finish reason
          yield {
            id: streamId,
            object: 'chat.completion.chunk',
            created: created,
            model: request.model || 'claude-sonnet-4-5',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: event.delta.stop_reason === 'end_turn' ? 'stop' : event.delta.stop_reason
              }
            ]
          };
        }
      }
    } catch (error) {
      throw normalizeError(error, 'claude');
    }
  }

  /**
   * Gemini streaming chat completion
   * @param {Object} request - OpenAI-format request
   * @returns {AsyncGenerator} OpenAI-format stream
   */
  async *_chatGeminiStream(request) {
    try {
      const geminiRequest = convertRequestToGeminiFormat(request);

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

      // Prepare generateContent request (without tools and systemInstruction as they're in model)
      const generateRequest = {
        contents: geminiRequest.contents
      };

      if (geminiRequest.generationConfig) {
        generateRequest.generationConfig = geminiRequest.generationConfig;
      }

      const result = await model.generateContentStream(generateRequest);

      const streamId = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      for await (const chunk of result.stream) {
        const text = chunk.text();

        if (text) {
          yield {
            id: streamId,
            object: 'chat.completion.chunk',
            created: created,
            model: request.model || 'gemini-2.5-flash',
            choices: [
              {
                index: 0,
                delta: {
                  content: text
                },
                finish_reason: null
              }
            ]
          };
        }
      }

      // Final chunk
      const response = await result.response;
      const finishReason = response.candidates?.[0]?.finishReason;

      yield {
        id: streamId,
        object: 'chat.completion.chunk',
        created: created,
        model: request.model || 'gemini-2.5-flash',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: finishReason === 'STOP' ? 'stop' : (finishReason || 'stop')
          }
        ]
      };
    } catch (error) {
      throw normalizeError(error, 'gemini');
    }
  }

  /**
   * Ollama streaming chat completion
   * @param {Object} request - OpenAI-format request
   * @returns {AsyncGenerator} OpenAI-format stream
   */
  async *_chatOllamaStream(request) {
    try {
      const { url, request: ollamaRequest } = convertRequestToOllamaFormat(request, this.baseUrl);

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

      const streamId = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      // Parse streaming response (newline-delimited JSON)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);

              if (chunk.message?.content) {
                yield {
                  id: streamId,
                  object: 'chat.completion.chunk',
                  created: created,
                  model: request.model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        content: chunk.message.content
                      },
                      finish_reason: null
                    }
                  ]
                };
              }

              if (chunk.done) {
                yield {
                  id: streamId,
                  object: 'chat.completion.chunk',
                  created: created,
                  model: request.model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: chunk.done_reason || 'stop'
                    }
                  ]
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
