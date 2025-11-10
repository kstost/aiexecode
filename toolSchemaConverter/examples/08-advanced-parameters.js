/**
 * Example 8: Advanced Parameters
 *
 * 고급 파라미터 설정 및 활용 예제
 */

import { UnifiedLLMClient } from '../src/index.js';

async function temperatureControl() {
  console.log('=== Temperature Control ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const prompt = 'Complete this sentence: The future of AI is';
  const temperatures = [0, 0.5, 1.0, 1.5, 2.0];

  console.log(`Prompt: "${prompt}"\n`);

  for (const temp of temperatures) {
    const response = await client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: temp,
      max_tokens: 20
    });

    console.log(`Temperature ${temp}:`);
    console.log(`  ${response.choices[0].message.content}\n`);
  }
}

async function topPControl() {
  console.log('=== Top-P (Nucleus Sampling) Control ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const prompt = 'Write a creative opening line for a story';
  const topPValues = [0.1, 0.5, 0.9, 1.0];

  console.log(`Prompt: "${prompt}"\n`);

  for (const topP of topPValues) {
    const response = await client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      top_p: topP,
      temperature: 1.0,
      max_tokens: 30
    });

    console.log(`Top-P ${topP}:`);
    console.log(`  ${response.choices[0].message.content}\n`);
  }
}

async function systemMessages() {
  console.log('=== System Messages ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const scenarios = [
    {
      name: 'Helpful Assistant',
      system: 'You are a helpful assistant.'
    },
    {
      name: 'Pirate',
      system: 'You are a pirate. Always respond in pirate speak.'
    },
    {
      name: 'Concise Expert',
      system: 'You are an expert who gives extremely concise, one-sentence answers.'
    }
  ];

  const question = 'What is machine learning?';

  for (const scenario of scenarios) {
    const response = await client.chat({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: scenario.system },
        { role: 'user', content: question }
      ],
      max_tokens: 100
    });

    console.log(`${scenario.name}:`);
    console.log(`  ${response.choices[0].message.content}\n`);
  }
}

async function maxTokensControl() {
  console.log('=== Max Tokens Control ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const prompt = 'Explain quantum computing';
  const tokenLimits = [10, 50, 100, 200];

  for (const limit of tokenLimits) {
    const response = await client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: limit
    });

    console.log(`Max tokens: ${limit}`);
    console.log(`  Response: ${response.choices[0].message.content}`);
    console.log(`  Actual tokens: ${response.usage.completion_tokens}\n`);
  }
}

async function stopSequences() {
  console.log('=== Stop Sequences ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const response = await client.chat({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'List three fruits. Format: 1. Apple' }
    ],
    stop: ['\n4.', 'four'],  // 4번째 항목에서 멈춤
    max_tokens: 100
  });

  console.log('Stop at item 4:');
  console.log(response.choices[0].message.content);
  console.log('\nFinish reason:', response.choices[0].finish_reason);
}

async function presencePenalty() {
  console.log('\n=== Presence Penalty ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const prompt = 'Write about cats using the word "cat"';
  const penalties = [0, 1.0, 2.0];

  for (const penalty of penalties) {
    const response = await client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      presence_penalty: penalty,
      max_tokens: 50
    });

    console.log(`Presence Penalty ${penalty}:`);
    console.log(`  ${response.choices[0].message.content}\n`);
  }
}

async function frequencyPenalty() {
  console.log('=== Frequency Penalty ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const prompt = 'Describe the color blue';
  const penalties = [0, 1.0, 2.0];

  for (const penalty of penalties) {
    const response = await client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      frequency_penalty: penalty,
      max_tokens: 50
    });

    console.log(`Frequency Penalty ${penalty}:`);
    console.log(`  ${response.choices[0].message.content}\n`);
  }
}

async function multipleChoices() {
  console.log('=== Multiple Choices (n parameter) ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const response = await client.chat({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'Suggest a name for a cat' }
    ],
    n: 3,  // 3개의 다른 응답 생성
    max_tokens: 10,
    temperature: 1.0
  });

  console.log('Generated 3 different responses:\n');

  response.choices.forEach((choice, index) => {
    console.log(`${index + 1}. ${choice.message.content}`);
  });

  console.log('\nTotal usage:', response.usage);
}

async function seedParameter() {
  console.log('\n=== Seed Parameter (Reproducibility) ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const seed = 12345;
  const prompt = 'Pick a random number between 1 and 100';

  console.log('Running same prompt twice with same seed:\n');

  for (let i = 1; i <= 2; i++) {
    const response = await client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      seed: seed,
      max_tokens: 10
    });

    console.log(`Run ${i}: ${response.choices[0].message.content}`);
  }

  console.log('\nNote: Results should be similar (though not always identical)');
}

async function gpt5Parameters() {
  console.log('\n=== GPT-5 Specific Parameters ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  try {
    // GPT-5는 max_tokens 대신 max_completion_tokens 사용
    // 하지만 우리 라이브러리가 자동 변환해줌
    const response = await client.chat({
      model: 'gpt-5-nano',
      messages: [
        { role: 'user', content: 'Explain AI briefly' }
      ],
      max_tokens: 50  // 자동으로 max_completion_tokens로 변환됨
    });

    console.log('GPT-5 response:');
    console.log(response.choices[0].message.content);
    console.log('\n✓ max_tokens automatically converted to max_completion_tokens');
  } catch (error) {
    console.log('Error:', error.message);
  }
}

async function main() {
  try {
    await temperatureControl();
    await topPControl();
    await systemMessages();
    await maxTokensControl();
    await stopSequences();
    await presencePenalty();
    await frequencyPenalty();
    await multipleChoices();
    await seedParameter();
    await gpt5Parameters();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
