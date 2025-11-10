/**
 * Basic usage examples for the Unified LLM Function Adapter
 */

import { UnifiedLLMClient } from '../src/index.js';

// Define a weather tool (OpenAI format)
const weatherTool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get the current weather in a given location',
    parameters: {
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
  }
};

// Example 1: Using with OpenAI
async function exampleOpenAI() {
  console.log('\\n=== OpenAI Example ===');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o'
  });

  const request = {
    messages: [
      { role: 'user', content: 'What is the weather like in Paris?' }
    ],
    tools: [weatherTool]
  };

  const response = await client.chat(request);
  console.log(JSON.stringify(response, null, 2));
}

// Example 2: Using with Claude
async function exampleClaude() {
  console.log('\\n=== Claude Example ===');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  const request = {
    messages: [
      { role: 'user', content: 'What is the weather like in Paris?' }
    ],
    tools: [weatherTool],
    max_tokens: 1024
  };

  const response = await client.chat(request);
  console.log(JSON.stringify(response, null, 2));
}

// Example 3: Using with Gemini
async function exampleGemini() {
  console.log('\\n=== Gemini Example ===');

  const client = new UnifiedLLMClient({
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash'
  });

  const request = {
    messages: [
      { role: 'user', content: 'What is the weather like in Paris?' }
    ],
    tools: [weatherTool]
  };

  const response = await client.chat(request);
  console.log(JSON.stringify(response, null, 2));
}

// Example 4: Using with Ollama
async function exampleOllama() {
  console.log('\\n=== Ollama Example ===');

  const client = new UnifiedLLMClient({
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2'
  });

  const request = {
    messages: [
      { role: 'user', content: 'What is the weather like in Paris?' }
    ],
    tools: [weatherTool]
  };

  const response = await client.chat(request);
  console.log(JSON.stringify(response, null, 2));
}

// Example 5: Multi-turn conversation with tool use
async function exampleMultiTurn() {
  console.log('\\n=== Multi-turn Conversation Example ===');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  const messages = [
    { role: 'user', content: 'What is the weather like in Tokyo?' }
  ];

  const request = {
    messages: messages,
    tools: [weatherTool],
    max_tokens: 1024
  };

  // First request
  let response = await client.chat(request);
  console.log('First response:', JSON.stringify(response, null, 2));

  // Check if tool was called
  if (response.choices[0].message.tool_calls) {
    const toolCall = response.choices[0].message.tool_calls[0];
    console.log(`\\nTool called: ${toolCall.function.name}`);
    console.log(`Arguments: ${toolCall.function.arguments}`);

    // Simulate tool execution
    const toolResult = {
      location: 'Tokyo',
      temperature: 22,
      unit: 'celsius',
      description: 'Partly cloudy'
    };

    // Add assistant message and tool result to conversation
    messages.push(response.choices[0].message);
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolResult),
      name: toolCall.function.name
    });

    // Second request with tool result
    request.messages = messages;
    response = await client.chat(request);
    console.log('\\nFinal response:', JSON.stringify(response, null, 2));
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
