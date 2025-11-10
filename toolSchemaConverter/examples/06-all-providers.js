/**
 * Example 6: Using All Providers
 *
 * OpenAI, Claude, Gemini, Ollama 모든 Provider 사용 예제
 */

import { UnifiedLLMClient } from '../src/index.js';

const PROVIDERS = [
  {
    name: 'OpenAI GPT-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  },
  {
    name: 'OpenAI GPT-5',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5-nano'
  },
  {
    name: 'Claude Haiku',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-haiku-20240307'
  },
  {
    name: 'Gemini Flash',
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash'
  },
  {
    name: 'Ollama Llama',
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: 'llama2',
    provider: 'ollama'
  }
];

async function testAllProviders() {
  console.log('=== Testing All Providers ===\n');

  const prompt = 'What is 2+2? Answer with just the number.';

  for (const config of PROVIDERS) {
    if (!config.apiKey && config.name !== 'Ollama Llama') {
      console.log(`${config.name}: Skipped (no API key)\n`);
      continue;
    }

    try {
      const client = new UnifiedLLMClient(config);

      const start = Date.now();
      const response = await client.chat({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10
      });
      const duration = Date.now() - start;

      console.log(`${config.name}:`);
      console.log(`  Answer: ${response.choices[0].message.content}`);
      console.log(`  Time: ${duration}ms\n`);
    } catch (error) {
      console.log(`${config.name}: Error - ${error.message}\n`);
    }
  }
}

async function streamingComparison() {
  console.log('\n=== Streaming Comparison ===\n');

  const providers = [
    { apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', name: 'OpenAI' },
    { apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-haiku-20240307', name: 'Claude' },
    { apiKey: process.env.GEMINI_API_KEY, model: 'gemini-2.5-flash', name: 'Gemini' }
  ];

  const prompt = 'Count from 1 to 5';

  for (const { apiKey, model, name } of providers) {
    if (!apiKey) continue;

    console.log(`${name} (streaming):`);

    const client = new UnifiedLLMClient({ apiKey });
    const stream = await client.chat({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      stream: true
    });

    process.stdout.write('  ');
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      process.stdout.write(content);
    }
    process.stdout.write('\n\n');
  }
}

async function functionCallingComparison() {
  console.log('=== Function Calling Comparison ===\n');

  const tools = [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather information',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' }
        },
        required: ['city']
      }
    }
  }];

  const providers = [
    { apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', name: 'OpenAI' },
    { apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-haiku-20240307', name: 'Claude' }
  ];

  const prompt = "What's the weather in Paris?";

  for (const { apiKey, model, name } of providers) {
    if (!apiKey) continue;

    console.log(`${name}:`);

    const client = new UnifiedLLMClient({ apiKey });
    const response = await client.chat({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      tools: tools,
      max_tokens: 200
    });

    const message = response.choices[0].message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      console.log(`  ✓ Called function: ${message.tool_calls[0].function.name}`);
      console.log(`  Arguments: ${message.tool_calls[0].function.arguments}\n`);
    } else {
      console.log(`  Direct answer: ${message.content}\n`);
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
    { model: 'gpt-5', apiKey: process.env.OPENAI_API_KEY }
  ];

  for (const { model, apiKey } of tests) {
    if (!apiKey) continue;

    // provider 파라미터 없이 클라이언트 생성
    const client = new UnifiedLLMClient({ apiKey });

    try {
      const response = await client.chat({
        model: model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
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
