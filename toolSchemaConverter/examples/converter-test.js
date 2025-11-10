/**
 * Test the converters independently
 */

import {
  convertRequestToClaudeFormat,
  convertClaudeResponseToOpenAI,
  convertRequestToGeminiFormat,
  convertGeminiResponseToOpenAI,
  convertRequestToOllamaFormat,
  convertOllamaResponseToOpenAI
} from '../src/index.js';

// Sample OpenAI request
const openaiRequest = {
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the weather in Paris?' }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City name'
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit']
            }
          },
          required: ['location']
        }
      }
    }
  ],
  temperature: 0.7,
  max_tokens: 1024
};

// Test Claude conversion
console.log('=== OpenAI to Claude Conversion ===');
const claudeRequest = convertRequestToClaudeFormat(openaiRequest);
console.log(JSON.stringify(claudeRequest, null, 2));

// Sample Claude response
const claudeResponse = {
  id: 'msg_123',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'tool_use',
      id: 'toolu_xyz',
      name: 'get_weather',
      input: {
        location: 'Paris',
        unit: 'celsius'
      }
    }
  ],
  model: 'claude-sonnet-4-5',
  stop_reason: 'tool_use',
  usage: {
    input_tokens: 50,
    output_tokens: 30
  }
};

console.log('\n=== Claude to OpenAI Conversion ===');
const openaiFromClaude = convertClaudeResponseToOpenAI(claudeResponse);
console.log(JSON.stringify(openaiFromClaude, null, 2));

// Test Gemini conversion
console.log('\n=== OpenAI to Gemini Conversion ===');
const geminiRequest = convertRequestToGeminiFormat(openaiRequest);
console.log(JSON.stringify(geminiRequest, null, 2));

// Sample Gemini response
const geminiResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            functionCall: {
              name: 'get_weather',
              args: {
                location: 'Paris',
                unit: 'celsius'
              }
            }
          }
        ]
      },
      finishReason: 'STOP'
    }
  ],
  usageMetadata: {
    promptTokenCount: 50,
    candidatesTokenCount: 30,
    totalTokenCount: 80
  }
};

console.log('\n=== Gemini to OpenAI Conversion ===');
const openaiFromGemini = convertGeminiResponseToOpenAI(geminiResponse, 'gemini-2.5-flash');
console.log(JSON.stringify(openaiFromGemini, null, 2));

// Test Ollama conversion
console.log('\n=== OpenAI to Ollama Conversion ===');
const ollamaRequest = convertRequestToOllamaFormat(openaiRequest);
console.log(JSON.stringify(ollamaRequest, null, 2));

// Sample Ollama response
const ollamaResponse = {
  model: 'llama3.2',
  created_at: '2025-01-10T12:00:00Z',
  message: {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        function: {
          name: 'get_weather',
          arguments: {
            location: 'Paris',
            unit: 'celsius'
          }
        }
      }
    ]
  },
  done_reason: 'stop',
  done: true,
  prompt_eval_count: 50,
  eval_count: 30
};

console.log('\n=== Ollama to OpenAI Conversion ===');
const openaiFromOllama = convertOllamaResponseToOpenAI(ollamaResponse);
console.log(JSON.stringify(openaiFromOllama, null, 2));
