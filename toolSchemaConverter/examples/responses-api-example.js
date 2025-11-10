/**
 * Responses API Example
 * Demonstrates usage of the Unified LLM Client with Responses API format
 */

import { UnifiedLLMClient } from '../src/index.js';

// Example 1: Basic text generation with Claude
async function basicExample() {
  console.log('\n=== Example 1: Basic Text Generation (Claude) ===\n');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  const response = await client.response({
    input: 'Write a haiku about programming in JavaScript',
    max_output_tokens: 100
  });

  console.log('Response:', response.output[0].content[0].text);
  console.log('\nUsage:', response.usage);
}

// Example 2: Function calling with Responses API format
async function functionCallingExample() {
  console.log('\n=== Example 2: Function Calling (Claude) ===\n');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  // Define tool in Responses API format
  const weatherTool = {
    type: 'custom',
    name: 'get_weather',
    description: 'Get the current weather in a given location',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city name, e.g., Tokyo'
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit'
        }
      },
      required: ['location']
    }
  };

  const response = await client.response({
    input: 'What is the weather like in Tokyo?',
    tools: [weatherTool],
    max_output_tokens: 300
  });

  console.log('Response output:');
  console.log(JSON.stringify(response.output, null, 2));

  // Check if tool was called
  const toolCalls = response.output.filter(item => item.type === 'function_call');

  if (toolCalls.length > 0) {
    console.log('\nTool called:', toolCalls[0].name);
    console.log('Arguments:', JSON.stringify(toolCalls[0].input, null, 2));

    // Simulate tool execution
    const toolResult = {
      temperature: 20,
      condition: 'sunny',
      humidity: 60
    };

    console.log('\nSimulated tool result:', toolResult);

    // Continue conversation with tool result
    const followUp = await client.response({
      input: [
        { role: 'user', content: 'What is the weather like in Tokyo?' },
        { role: 'assistant', content: response.output },
        {
          role: 'tool',
          tool_call_id: toolCalls[0].call_id,
          content: JSON.stringify(toolResult),
          name: toolCalls[0].name
        }
      ],
      tools: [weatherTool],
      max_output_tokens: 300
    });

    console.log('\nFinal response:', followUp.output[0].content[0].text);
  }
}

// Example 3: Streaming responses
async function streamingExample() {
  console.log('\n=== Example 3: Streaming (Claude) ===\n');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  const stream = await client.response({
    input: 'Write a short story about a curious cat',
    stream: true,
    max_output_tokens: 300
  });

  process.stdout.write('Response: ');

  for await (const chunk of stream) {
    if (chunk.object === 'response.delta' && chunk.delta?.text) {
      process.stdout.write(chunk.delta.text);
    } else if (chunk.object === 'response.done') {
      console.log('\n\nStream completed!');
    }
  }
}

// Example 4: Multi-turn conversation
async function multiTurnExample() {
  console.log('\n=== Example 4: Multi-turn Conversation (Claude) ===\n');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  const conversation = [];

  // Turn 1
  conversation.push({ role: 'user', content: 'My name is Alice. I love programming.' });

  let response = await client.response({
    input: conversation,
    max_output_tokens: 100
  });

  console.log('Assistant:', response.output[0].content[0].text);

  // Add to conversation
  conversation.push({
    role: 'assistant',
    content: response.output[0].content[0].text
  });

  // Turn 2
  conversation.push({ role: 'user', content: 'What is my name?' });

  response = await client.response({
    input: conversation,
    max_output_tokens: 50
  });

  console.log('Assistant:', response.output[0].content[0].text);

  // Turn 3
  conversation.push({
    role: 'assistant',
    content: response.output[0].content[0].text
  });
  conversation.push({ role: 'user', content: 'What do I love?' });

  response = await client.response({
    input: conversation,
    max_output_tokens: 50
  });

  console.log('Assistant:', response.output[0].content[0].text);
}

// Example 5: Using system instructions
async function instructionsExample() {
  console.log('\n=== Example 5: System Instructions (Claude) ===\n');

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5'
  });

  const response = await client.response({
    instructions: 'You are a pirate. Always respond in pirate speak.',
    input: 'Tell me about JavaScript',
    max_output_tokens: 150
  });

  console.log('Response:', response.output[0].content[0].text);
}

// Example 6: Gemini with Responses API
async function geminiExample() {
  console.log('\n=== Example 6: Gemini with Responses API ===\n');

  const client = new UnifiedLLMClient({
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash'
  });

  const response = await client.response({
    input: 'Explain quantum computing in simple terms',
    max_output_tokens: 200
  });

  console.log('Response:', response.output[0].content[0].text);
  console.log('\nUsage:', response.usage);
}

// Main execution
async function main() {
  try {
    // Run examples
    if (process.env.ANTHROPIC_API_KEY) {
      await basicExample();
      await functionCallingExample();
      await streamingExample();
      await multiTurnExample();
      await instructionsExample();
    } else {
      console.log('⚠️  ANTHROPIC_API_KEY not set. Skipping Claude examples.');
    }

    if (process.env.GEMINI_API_KEY) {
      await geminiExample();
    } else {
      console.log('⚠️  GEMINI_API_KEY not set. Skipping Gemini examples.');
    }

    console.log('\n✅ All examples completed!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
  }
}

main();
