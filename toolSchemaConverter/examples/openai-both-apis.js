/**
 * Example: Using both OpenAI Chat Completions and Responses API
 */

import { UnifiedLLMClient } from '../src/index.js';

// Define a weather tool
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

// Example 1: Using Chat Completions API (default)
async function exampleChatCompletions() {
  console.log('\\n=== OpenAI Chat Completions API ===');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiType: 'chat-completions', // or omit (default)
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o'  // or 'gpt-5' if available
  });

  const request = {
    messages: [
      { role: 'user', content: 'What is the weather like in Paris?' }
    ],
    tools: [weatherTool]
  };

  const response = await client.chat(request);
  console.log('Response:', JSON.stringify(response, null, 2));
}

// Example 2: Using Responses API (new, richer features)
async function exampleResponsesAPI() {
  console.log('\\n=== OpenAI Responses API ===');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiType: 'responses',  // Use new Responses API
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5'
  });

  const request = {
    messages: [
      { role: 'user', content: 'What is the weather like in Paris?' }
    ],
    tools: [weatherTool]
  };

  const response = await client.chat(request);
  console.log('Response (converted to Chat format):', JSON.stringify(response, null, 2));
  console.log('\\nNote: Response is automatically converted to Chat Completions format for consistency');
}

// Example 2b: Using GPT-5 specific parameters
async function exampleGPT5Parameters() {
  console.log('\\n=== GPT-5 Specific Parameters ===');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiType: 'responses',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5'
  });

  const request = {
    messages: [
      { role: 'user', content: 'Solve this math problem: What is the square root of 144 plus the cube root of 27?' }
    ],
    // GPT-5 specific: reasoning effort control
    // Options: "minimal", "low", "medium", "high"
    reasoning_effort: 'high',  // Use high reasoning for complex problem

    // GPT-5 specific: verbosity control
    // Options: "low", "medium", "high"
    verbosity: 'medium',

    // Use max_output_tokens (not max_tokens for Responses API)
    max_output_tokens: 500
  };

  const response = await client.chat(request);

  console.log('\\nAnswer:', response.choices[0].message.content);

  // Check if reasoning was included
  if (response.choices[0].message.reasoning) {
    console.log('\\nReasoning (Chain of Thought):', response.choices[0].message.reasoning);
  }

  // Original Responses API output is preserved in _responses_output
  if (response._responses_output) {
    console.log('\\nOriginal output items:', response._responses_output.map(item => item.type));
  }
}

// Example 2c: Alternative parameter format
async function exampleGPT5AlternativeFormat() {
  console.log('\\n=== GPT-5 Alternative Parameter Format ===');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiType: 'responses',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5'
  });

  const request = {
    messages: [
      { role: 'user', content: 'Explain quantum entanglement in simple terms.' }
    ],
    // Alternative: use reasoning object directly
    reasoning: {
      effort: 'medium'
    },
    // Alternative: use text object directly
    text: {
      verbosity: 'high'
    },
    max_output_tokens: 1000
  };

  const response = await client.chat(request);
  console.log('\\nResponse:', response.choices[0].message.content);
}

// Example 3: Comparing both APIs
async function compareBothAPIs() {
  console.log('\\n=== Comparing Chat Completions vs Responses API ===');

  const chatClient = new UnifiedLLMClient({
    provider: 'openai',
    apiType: 'chat-completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o'
  });

  const responsesClient = new UnifiedLLMClient({
    provider: 'openai',
    apiType: 'responses',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5'
  });

  const request = {
    messages: [
      { role: 'user', content: 'Tell me a one-sentence story about a robot.' }
    ]
  };

  console.log('\\nChat Completions API:');
  const chatResponse = await chatClient.chat(request);
  console.log(chatResponse.choices[0].message.content);

  console.log('\\nResponses API:');
  const responsesResponse = await responsesClient.chat(request);
  console.log(responsesResponse.choices[0].message.content);
}

// Example 4: Multi-turn with Responses API
async function exampleMultiTurnResponses() {
  console.log('\\n=== Multi-turn Conversation with Responses API ===');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiType: 'responses',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5'
  });

  const messages = [
    { role: 'user', content: 'What is the weather in Tokyo?' }
  ];

  const request = {
    messages: messages,
    tools: [weatherTool]
  };

  // First request
  let response = await client.chat(request);
  console.log('First response:', JSON.stringify(response, null, 2));

  // Check if tool was called
  if (response.choices[0].message.tool_calls) {
    const toolCall = response.choices[0].message.tool_calls[0];
    console.log(`\\nTool called: ${toolCall.function.name}`);

    // Simulate tool execution
    const toolResult = {
      location: 'Tokyo',
      temperature: 22,
      unit: 'celsius',
      description: 'Partly cloudy'
    };

    // Add to conversation
    messages.push(response.choices[0].message);
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolResult),
      name: toolCall.function.name
    });

    // Get final response
    request.messages = messages;
    response = await client.chat(request);
    console.log('\\nFinal response:', response.choices[0].message.content);
  }
}

// Run examples
async function main() {
  try {
    console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? 'Set' : 'Not set');

    if (!process.env.OPENAI_API_KEY) {
      console.log('\\nPlease set OPENAI_API_KEY environment variable');
      return;
    }

    // Uncomment the example you want to run
    // await exampleChatCompletions();
    // await exampleResponsesAPI();
    // await exampleGPT5Parameters();
    // await exampleGPT5AlternativeFormat();
    // await compareBothAPIs();
    await exampleMultiTurnResponses();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

main();
