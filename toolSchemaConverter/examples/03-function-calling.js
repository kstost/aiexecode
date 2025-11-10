/**
 * Example 3: Function Calling / Tool Use
 *
 * LLM이 함수를 호출하도록 하는 예제 (Responses API 형식)
 */

import { UnifiedLLMClient } from '../src/index.js';

// 함수 정의 (Responses API 형식)
const tools = [
  {
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
  },
  {
    type: 'custom',
    name: 'calculate',
    description: 'Perform a mathematical calculation',
    input_schema: {
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
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  });

  // 1단계: LLM에게 질문하고 함수 호출 유도
  const response = await client.response({
    input: "What's the weather like in Seoul?",
    tools: tools,
    max_output_tokens: 300
  });

  console.log('LLM Response:', JSON.stringify(response.output, null, 2));

  // 함수 호출이 있는지 확인
  const functionCalls = response.output.filter(item => item.type === 'function_call');

  if (functionCalls.length > 0) {
    console.log('\n✓ LLM wants to call a function!');

    const toolCall = functionCalls[0];
    const functionName = toolCall.name;
    const args = toolCall.input;

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
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  });

  const conversation = [
    { role: 'user', content: 'What is 15 multiplied by 23?' }
  ];

  // 1단계: 초기 요청
  console.log('Step 1: Initial request');
  const response1 = await client.response({
    input: conversation,
    tools: tools,
    max_output_tokens: 300
  });

  // 함수 호출 확인
  const functionCalls = response1.output.filter(item => item.type === 'function_call');

  if (functionCalls.length > 0) {
    const toolCall = functionCalls[0];
    const args = toolCall.input;

    console.log(`LLM wants to call: ${toolCall.name}(${JSON.stringify(args)})`);

    // 2단계: 함수 실행
    const result = calculate(args.operation, args.a, args.b);
    console.log(`Function returned: ${result}`);

    // 3단계: 결과를 LLM에게 전달
    conversation.push({ role: 'assistant', content: response1.output });
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.call_id,
      content: JSON.stringify({ result }),
      name: toolCall.name
    });

    console.log('\nStep 2: Sending function result back to LLM');
    const response2 = await client.response({
      input: conversation,
      tools: tools,
      max_output_tokens: 300
    });

    // 최종 답변
    const messageItem = response2.output.find(item => item.type === 'message');
    const finalAnswer = messageItem?.content[0]?.text || '';
    console.log('\nFinal Answer:', finalAnswer);
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

  const client = new UnifiedLLMClient({
    provider: 'claude',
    apiKey,
    model: 'claude-3-haiku-20240307'
  });

  const response = await client.response({
    input: "What's the weather in Tokyo?",
    tools: tools,
    max_output_tokens: 300
  });

  console.log('Claude Response:', JSON.stringify(response.output, null, 2));
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
