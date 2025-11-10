/**
 * Example 6: Using All Providers
 *
 * OpenAI, Claude, Gemini, Ollama 모든 Provider 사용 예제
 */

import { UnifiedLLMClient } from '../src/index.js';

const PROVIDERS = [
  {
    name: 'OpenAI GPT-4o-mini',
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  },
  {
    name: 'OpenAI GPT-5',
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5-mini'
  },
  {
    name: 'Claude Haiku',
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-haiku-20240307'
  },
  {
    name: 'Gemini Flash',
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash'
  },
  {
    name: 'Ollama Llama',
    provider: 'ollama',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: 'llama2'
  }
];

async function testAllProviders() {
  console.log('=== Testing All Providers ===\n');

  const prompt = 'What is 2+2? Answer with just the number.';

  for (const config of PROVIDERS) {
    if (!config.apiKey && config.provider !== 'ollama') {
      console.log(`${config.name}: Skipped (no API key)\n`);
      continue;
    }

    try {
      const client = new UnifiedLLMClient(config);

      const start = Date.now();
      const response = await client.response({
        input: prompt,
        max_output_tokens: 50
      });
      const duration = Date.now() - start;

      const messageItem = response.output.find(item => item.type === 'message');
      const text = messageItem?.content[0]?.text || '';

      console.log(`${config.name}:`);
      console.log(`  Answer: ${text}`);
      console.log(`  Time: ${duration}ms\n`);
    } catch (error) {
      console.log(`${config.name}: Error - ${error.message}\n`);
    }
  }
}

async function streamingComparison() {
  console.log('\n=== Streaming Comparison ===\n');

  const providers = [
    { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', name: 'OpenAI' },
    { provider: 'claude', apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-haiku-20240307', name: 'Claude' },
    { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY, model: 'gemini-2.5-flash', name: 'Gemini' }
  ];

  const prompt = 'Count from 1 to 5';

  for (const config of providers) {
    if (!config.apiKey) continue;

    console.log(`${config.name} (streaming):`);

    const client = new UnifiedLLMClient(config);
    const stream = await client.response({
      input: prompt,
      max_output_tokens: 100,
      stream: true
    });

    process.stdout.write('  ');
    for await (const chunk of stream) {
      if (chunk.object === 'response.delta' && chunk.delta?.text) {
        process.stdout.write(chunk.delta.text);
      } else if (chunk.object === 'response.done') {
        process.stdout.write('\n\n');
      }
    }
  }
}

async function functionCallingComparison() {
  console.log('=== Function Calling Comparison ===\n');

  // Responses API 형식의 도구 정의
  const tools = [{
    type: 'custom',
    name: 'get_weather',
    description: 'Get weather information',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    }
  }];

  const providers = [
    { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', name: 'OpenAI' },
    { provider: 'claude', apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-haiku-20240307', name: 'Claude' }
  ];

  const prompt = "What's the weather in Paris?";

  for (const config of providers) {
    if (!config.apiKey) continue;

    console.log(`${config.name}:`);

    const client = new UnifiedLLMClient(config);
    const response = await client.response({
      input: prompt,
      tools: tools,
      max_output_tokens: 300
    });

    const functionCalls = response.output.filter(item => item.type === 'function_call');

    if (functionCalls.length > 0) {
      console.log(`  ✓ Called function: ${functionCalls[0].name}`);
      console.log(`  Arguments: ${JSON.stringify(functionCalls[0].input, null, 2)}\n`);
    } else {
      const messageItem = response.output.find(item => item.type === 'message');
      const text = messageItem?.content[0]?.text || '';
      console.log(`  Direct answer: ${text}\n`);
    }
  }
}

async function autoProviderDetection() {
  console.log('\n=== Auto Provider Detection ===\n');

  // Provider를 명시하지 않아도 모델 이름으로 자동 감지
  const tests = [
    { model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY },
    { model: 'claude-3-haiku-20240307', apiKey: process.env.ANTHROPIC_API_KEY },
    { model: 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY },
    { model: 'gpt-5-mini', apiKey: process.env.OPENAI_API_KEY }
  ];

  for (const { model, apiKey } of tests) {
    if (!apiKey) continue;

    // provider 파라미터 없이 클라이언트 생성 (모델명으로 자동 감지)
    const client = new UnifiedLLMClient({ apiKey, model });

    try {
      const response = await client.response({
        input: 'Hi',
        max_output_tokens: 10
      });

      console.log(`✓ ${model}: Auto-detected and working`);
    } catch (error) {
      console.log(`✗ ${model}: ${error.message}`);
    }
  }
}

async function main() {
  try {
    await testAllProviders();
    await streamingComparison();
    await functionCallingComparison();
    await autoProviderDetection();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
