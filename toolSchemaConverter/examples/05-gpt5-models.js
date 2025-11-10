/**
 * Example 5: GPT-5 and o3 Models
 *
 * GPT-5 시리즈 모델 사용 예제
 */

import { UnifiedLLMClient } from '../src/index.js';

async function testAllGPT5Models() {
  console.log('=== Testing All GPT-5 Models ===\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('Error: OPENAI_API_KEY not set');
    return;
  }

  const client = new UnifiedLLMClient({ apiKey });

  const models = [
    { name: 'gpt-5', description: 'GPT-5 base model' },
    { name: 'gpt-5-mini', description: 'GPT-5 mini (faster, cheaper)' },
    { name: 'gpt-5-nano', description: 'GPT-5 nano (fastest)' },
    { name: 'o3', description: 'o3 reasoning model' },
    { name: 'o3-mini', description: 'o3-mini reasoning model' }
  ];

  for (const { name, description } of models) {
    try {
      console.log(`Testing: ${name} - ${description}`);

      const response = await client.chat({
        model: name,
        messages: [
          { role: 'user', content: 'What is 2+2? Answer in one word.' }
        ],
        max_tokens: 10  // 자동으로 max_completion_tokens로 변환됨
      });

      console.log(`✓ ${name}:`, response.choices[0].message.content);
      console.log(`  Tokens: ${response.usage.total_tokens}\n`);
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}\n`);
    }
  }
}

async function gpt5Streaming() {
  console.log('=== GPT-5 Streaming ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  console.log('Streaming response from gpt-5-nano:\n');

  const stream = await client.chat({
    model: 'gpt-5-nano',
    messages: [
      { role: 'user', content: 'Write a three-line poem about code' }
    ],
    max_tokens: 100,
    stream: true
  });

  process.stdout.write('Response: ');
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
  process.stdout.write('\n\n');
}

async function gpt5WithFunctions() {
  console.log('=== GPT-5 with Function Calling ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const tools = [{
    type: 'function',
    function: {
      name: 'get_time',
      description: 'Get current time in a timezone',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Timezone name (e.g., America/New_York)'
          }
        },
        required: ['timezone']
      }
    }
  }];

  const response = await client.chat({
    model: 'gpt-5',
    messages: [
      { role: 'user', content: "What time is it in Seoul?" }
    ],
    tools: tools,
    max_tokens: 150
  });

  console.log('Response:', JSON.stringify(response.choices[0].message, null, 2));
}

async function compareModels() {
  console.log('\n=== Comparing GPT-5 Models ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const prompt = 'Explain quantum computing in one sentence.';
  const models = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'];

  console.log(`Prompt: "${prompt}"\n`);

  for (const model of models) {
    const start = Date.now();

    try {
      const response = await client.chat({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100
      });

      const duration = Date.now() - start;

      console.log(`${model}:`);
      console.log(`  Response: ${response.choices[0].message.content}`);
      console.log(`  Time: ${duration}ms`);
      console.log(`  Tokens: ${response.usage.total_tokens}\n`);
    } catch (error) {
      console.log(`${model}: Error - ${error.message}\n`);
    }
  }
}

async function o3ReasoningModel() {
  console.log('=== o3 Reasoning Model ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  console.log('Testing o3-mini for complex reasoning:\n');

  const response = await client.chat({
    model: 'o3-mini',
    messages: [
      {
        role: 'user',
        content: 'If a train travels 120 km in 2 hours, and then 180 km in 3 hours, what is the average speed?'
      }
    ],
    max_tokens: 200
  });

  console.log('Question: Complex math problem');
  console.log('o3-mini answer:', response.choices[0].message.content);
  console.log('\nUsage:', response.usage);
}

async function main() {
  try {
    await testAllGPT5Models();
    await gpt5Streaming();
    await gpt5WithFunctions();
    await compareModels();
    await o3ReasoningModel();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
