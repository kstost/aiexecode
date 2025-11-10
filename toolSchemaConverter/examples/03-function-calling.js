/**
 * Example 3: Function Calling / Tool Use
 *
 * LLM이 함수를 호출하도록 하는 예제
 */

import { UnifiedLLMClient } from '../src/index.js';

// 함수 정의
const tools = [
  {
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
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Perform a mathematical calculation',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['add', 'subtract', 'multiply', 'divide'],
            description: 'The operation to perform'
          },
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' }
        },
        required: ['operation', 'a', 'b']
      }
    }
  }
];

// 실제 함수 구현
function getWeather(location, unit = 'celsius') {
  // 실제로는 API를 호출하겠지만, 여기서는 mock 데이터
  return {
    location,
    temperature: unit === 'celsius' ? 22 : 72,
    unit,
    condition: 'Sunny'
  };
}

function calculate(operation, a, b) {
  switch (operation) {
    case 'add': return a + b;
    case 'subtract': return a - b;
    case 'multiply': return a * b;
    case 'divide': return a / b;
    default: return null;
  }
}

async function basicFunctionCalling() {
  console.log('=== Basic Function Calling ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  // 1단계: LLM에게 질문하고 함수 호출 유도
  const response = await client.chat({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: "What's the weather like in Seoul?" }
    ],
    tools: tools,
    max_tokens: 200
  });

  const message = response.choices[0].message;
  console.log('LLM Response:', JSON.stringify(message, null, 2));

  // 함수 호출이 있는지 확인
  if (message.tool_calls && message.tool_calls.length > 0) {
    console.log('\n✓ LLM wants to call a function!');

    const toolCall = message.tool_calls[0];
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    console.log(`Function: ${functionName}`);
    console.log(`Arguments:`, args);

    // 함수 실행
    let result;
    if (functionName === 'get_weather') {
      result = getWeather(args.location, args.unit);
    }

    console.log('\nFunction Result:', result);
  }
}

async function completeFunctionCallFlow() {
  console.log('\n=== Complete Function Call Flow ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const messages = [
    { role: 'user', content: 'What is 15 multiplied by 23?' }
  ];

  // 1단계: 초기 요청
  console.log('Step 1: Initial request');
  const response1 = await client.chat({
    model: 'gpt-4o-mini',
    messages: messages,
    tools: tools,
    max_tokens: 200
  });

  const assistantMessage = response1.choices[0].message;
  messages.push(assistantMessage);

  // 함수 호출 확인
  if (assistantMessage.tool_calls) {
    const toolCall = assistantMessage.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);

    console.log(`LLM wants to call: ${toolCall.function.name}(${JSON.stringify(args)})`);

    // 2단계: 함수 실행
    const result = calculate(args.operation, args.a, args.b);
    console.log(`Function returned: ${result}`);

    // 3단계: 결과를 LLM에게 전달
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ result })
    });

    console.log('\nStep 2: Sending function result back to LLM');
    const response2 = await client.chat({
      model: 'gpt-4o-mini',
      messages: messages,
      tools: tools,
      max_tokens: 200
    });

    // 최종 답변
    console.log('\nFinal Answer:', response2.choices[0].message.content);
  }
}

// Claude로 함수 호출
async function claudeFunctionCalling() {
  console.log('\n=== Claude Function Calling ===\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Skipped: ANTHROPIC_API_KEY not set');
    return;
  }

  const client = new UnifiedLLMClient({ apiKey });

  const response = await client.chat({
    model: 'claude-3-haiku-20240307',
    messages: [
      { role: 'user', content: "What's the weather in Tokyo?" }
    ],
    tools: tools,
    max_tokens: 200
  });

  console.log('Claude Response:', response.choices[0].message);
}

async function main() {
  try {
    await basicFunctionCalling();
    await completeFunctionCallFlow();
    await claudeFunctionCalling();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

main();
