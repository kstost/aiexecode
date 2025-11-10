/**
 * Streaming Usage Examples
 * Demonstrates how to use streaming with different LLM providers
 */

import { UnifiedLLMClient } from '../src/index.js';

// ============================================
// Example 1: OpenAI Streaming
// ============================================
async function exampleOpenAIStreaming() {
  console.log('\n=== OpenAI Streaming ===\n');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o'
  });

  const stream = await client.chat({
    messages: [
      { role: 'user', content: 'Write a haiku about programming' }
    ],
    stream: true,
    max_tokens: 100
  });

  process.stdout.write('Response: ');
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
  console.log('\n');
}

// ============================================
// Example 2: Claude Streaming
// ============================================
async function exampleClaudeStreaming() {
  console.log('\n=== Claude Streaming ===\n');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  const stream = await client.chat({
    messages: [
      { role: 'user', content: 'Explain async/await in JavaScript in 2 sentences' }
    ],
    stream: true,
    max_tokens: 200
  });

  process.stdout.write('Response: ');
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
  console.log('\n');
}

// ============================================
// Example 3: Gemini Streaming
// ============================================
async function exampleGeminiStreaming() {
  console.log('\n=== Gemini Streaming ===\n');

  const client = new UnifiedLLMClient({
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash'
  });

  const stream = await client.chat({
    messages: [
      { role: 'user', content: 'What are the benefits of streaming responses?' }
    ],
    stream: true,
    max_tokens: 200
  });

  process.stdout.write('Response: ');
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
  console.log('\n');
}

// ============================================
// Example 4: Ollama Streaming
// ============================================
async function exampleOllamaStreaming() {
  console.log('\n=== Ollama Streaming ===\n');

  const client = new UnifiedLLMClient({
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2'
  });

  const stream = await client.chat({
    messages: [
      { role: 'user', content: 'Write a short poem about AI' }
    ],
    stream: true
  });

  process.stdout.write('Response: ');
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
  console.log('\n');
}

// ============================================
// Example 5: Streaming with Function Calling
// ============================================
async function exampleStreamingWithTools() {
  console.log('\n=== Streaming with Function Calling (OpenAI) ===\n');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o'
  });

  const tools = [
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
              description: 'The city and state, e.g. San Francisco, CA'
            }
          },
          required: ['location']
        }
      }
    }
  ];

  const stream = await client.chat({
    messages: [
      { role: 'user', content: 'What is the weather in Tokyo?' }
    ],
    tools: tools,
    stream: true,
    max_tokens: 200
  });

  let toolCalls = [];
  process.stdout.write('Response: ');

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    if (delta?.content) {
      process.stdout.write(delta.content);
    }

    if (delta?.tool_calls) {
      // Accumulate tool calls
      for (const toolCall of delta.tool_calls) {
        if (!toolCalls[toolCall.index]) {
          toolCalls[toolCall.index] = {
            id: toolCall.id,
            type: 'function',
            function: { name: '', arguments: '' }
          };
        }

        if (toolCall.function?.name) {
          toolCalls[toolCall.index].function.name += toolCall.function.name;
        }

        if (toolCall.function?.arguments) {
          toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
        }
      }
    }

    const finishReason = chunk.choices[0]?.finish_reason;
    if (finishReason === 'tool_calls') {
      console.log('\n\nTool calls detected:');
      toolCalls.forEach(tc => {
        console.log(`- ${tc.function.name}(${tc.function.arguments})`);
      });
    }
  }

  console.log('\n');
}

// ============================================
// Run All Examples
// ============================================
async function main() {
  console.log('Streaming Examples for LLM Function Adapter');
  console.log('==========================================');

  try {
    // Run OpenAI example if API key is available
    if (process.env.OPENAI_API_KEY) {
      await exampleOpenAIStreaming();
      await exampleStreamingWithTools();
    } else {
      console.log('Skipping OpenAI examples (no API key)');
    }

    // Run Claude example if API key is available
    if (process.env.ANTHROPIC_API_KEY) {
      await exampleClaudeStreaming();
    } else {
      console.log('Skipping Claude examples (no API key)');
    }

    // Run Gemini example if API key is available
    if (process.env.GEMINI_API_KEY) {
      await exampleGeminiStreaming();
    } else {
      console.log('Skipping Gemini examples (no API key)');
    }

    // Run Ollama example (assumes local server is running)
    try {
      await exampleOllamaStreaming();
    } catch (error) {
      console.log('Skipping Ollama examples (server not available)');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
