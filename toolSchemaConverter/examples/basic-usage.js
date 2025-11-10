/**
 * Basic usage examples for the Unified LLM Function Adapter
 * Using Responses API format
 */

import { UnifiedLLMClient } from '../src/index.js';

// Define a weather tool (Responses API format)
const weatherTool = {
  type: 'custom',
  name: 'get_weather',
  description: 'Get the current weather in a given location',
  input_schema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city and state, e.g. San Francisco, CA'
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'The temperature unit'
      }
    },
    required: ['location']
  }
};

// Example 1: Using with OpenAI
async function exampleOpenAI() {
  console.log('\n=== OpenAI Example ===');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o'
  });

  const response = await client.response({
    input: 'What is the weather like in Paris?',
    tools: [weatherTool],
    max_output_tokens: 300
  });

  console.log(JSON.stringify(response, null, 2));
}

// Example 2: Using with Claude
async function exampleClaude() {
  console.log('\n=== Claude Example ===');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  const response = await client.response({
    input: 'What is the weather like in Paris?',
    tools: [weatherTool],
    max_output_tokens: 300
  });

  console.log(JSON.stringify(response, null, 2));
}

// Example 3: Using with Gemini
async function exampleGemini() {
  console.log('\n=== Gemini Example ===');

  const client = new UnifiedLLMClient({
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash'
  });

  const response = await client.response({
    input: 'What is the weather like in Paris?',
    tools: [weatherTool],
    max_output_tokens: 300
  });

  console.log(JSON.stringify(response, null, 2));
}

// Example 4: Using with Ollama
async function exampleOllama() {
  console.log('\n=== Ollama Example ===');

  const client = new UnifiedLLMClient({
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2'
  });

  const response = await client.response({
    input: 'What is the weather like in Paris?',
    tools: [weatherTool],
    max_output_tokens: 300
  });

  console.log(JSON.stringify(response, null, 2));
}

// Example 5: Multi-turn conversation with tool use
async function exampleMultiTurn() {
  console.log('\n=== Multi-turn Conversation Example ===');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  // First request
  let response = await client.response({
    input: 'What is the weather like in Tokyo?',
    tools: [weatherTool],
    max_output_tokens: 300
  });

  console.log('First response:', JSON.stringify(response, null, 2));

  // Check if tool was called
  const functionCalls = response.output.filter(item => item.type === 'function_call');

  if (functionCalls.length > 0) {
    const toolCall = functionCalls[0];
    console.log(`\nTool called: ${toolCall.name}`);
    console.log(`Arguments: ${JSON.stringify(toolCall.input, null, 2)}`);

    // Simulate tool execution
    const toolResult = {
      location: 'Tokyo',
      temperature: 22,
      unit: 'celsius',
      description: 'Partly cloudy'
    };

    // Build conversation with tool result
    const conversation = [
      { role: 'user', content: 'What is the weather like in Tokyo?' },
      { role: 'assistant', content: response.output },
      {
        role: 'tool',
        tool_call_id: toolCall.call_id,
        content: JSON.stringify(toolResult),
        name: toolCall.name
      }
    ];

    // Second request with tool result
    response = await client.response({
      input: conversation,
      tools: [weatherTool],
      max_output_tokens: 300
    });

    console.log('\nFinal response:', JSON.stringify(response, null, 2));
  }
}

// Run examples
async function main() {
  try {
    // Uncomment the example you want to run
    // await exampleOpenAI();
    // await exampleClaude();
    // await exampleGemini();
    // await exampleOllama();
    await exampleMultiTurn();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

main();
