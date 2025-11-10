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

export class UnifiedLLMClient {
  /**
   * Create a unified LLM client
   * @param {Object} config - Configuration object
   * @param {string} config.provider - Provider name: 'openai', 'claude', 'gemini', or 'ollama'
   * @param {string} [config.apiType] - API type for OpenAI: 'chat-completions' (default) or 'responses'
   * @param {string} [config.apiKey] - API key for the provider
   * @param {string} [config.baseUrl] - Base URL (for Ollama)
   * @param {string} [config.model] - Default model to use
   */
  constructor(config = {}) {
    this.provider = config.provider || 'openai';
    this.apiType = config.apiType || 'chat-completions';
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.defaultModel = config.model;

    this._initializeClient();
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
   * @returns {Promise<Object>} OpenAI-format response
   */
  async chat(request) {
    // Set default model if not provided
    if (!request.model && this.defaultModel) {
      request.model = this.defaultModel;
    }

    switch (this.provider) {
      case 'openai':
        return await this._chatOpenAI(request);

      case 'claude':
        return await this._chatClaude(request);

      case 'gemini':
        return await this._chatGemini(request);

      case 'ollama':
        return await this._chatOllama(request);

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
        const response = await this.client.chat.completions.create(request);
        return response;
      }
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
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
      const error = await response.json();
      throw new Error(`OpenAI Responses API error: ${error.message || response.statusText}`);
    }

    return await response.json();
  }

  async _chatClaude(request) {
    try {
      const claudeRequest = convertRequestToClaudeFormat(request);
      const claudeResponse = await this.client.messages.create(claudeRequest);
      return convertClaudeResponseToOpenAI(claudeResponse);
    } catch (error) {
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  async _chatGemini(request) {
    try {
      const geminiRequest = convertRequestToGeminiFormat(request);
      const model = this.client.getGenerativeModel({ model: request.model || 'gemini-2.5-flash' });

      const result = await model.generateContent(geminiRequest);
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
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  async _chatOllama(request) {
    const { url, request: ollamaRequest } = convertRequestToOllamaFormat(request, this.baseUrl);

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

    const ollamaResponse = await response.json();
    return convertOllamaResponseToOpenAI(ollamaResponse);
  }
}
