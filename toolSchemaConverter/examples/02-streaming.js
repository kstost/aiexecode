/**
 * Example 2: Streaming Responses
 *
 * 실시간 스트리밍 응답 받기
 */

import { UnifiedLLMClient } from '../src/index.js';

async function basicStreaming() {
  console.log('=== Basic Streaming Example ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const stream = await client.chat({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'Write a haiku about programming' }
    ],
    max_tokens: 100,
    stream: true  // 스트리밍 활성화
  });

  // 스트리밍 응답 처리
  process.stdout.write('Response: ');
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }
  process.stdout.write('\n\n');
}

async function streamingWithProgress() {
  console.log('=== Streaming with Progress ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const stream = await client.chat({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'Count from 1 to 10' }
    ],
    max_tokens: 100,
    stream: true
  });

  let chunkCount = 0;
  let totalContent = '';

  for await (const chunk of stream) {
    chunkCount++;
    const content = chunk.choices[0]?.delta?.content || '';
    totalContent += content;

    // 진행 상황 표시
    process.stdout.write(`\rChunks: ${chunkCount}, Chars: ${totalContent.length}`);
  }

  console.log('\n\nFinal content:', totalContent);
  console.log(`Total chunks received: ${chunkCount}`);
}

// GPT-5 스트리밍
async function gpt5Streaming() {
  console.log('\n=== GPT-5 Streaming ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  try {
    const stream = await client.chat({
      model: 'gpt-5-nano',
      messages: [
        { role: 'user', content: 'Explain AI in one sentence' }
      ],
      max_tokens: 50,
      stream: true
    });

    process.stdout.write('GPT-5 Response: ');
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      process.stdout.write(content);
    }
    process.stdout.write('\n');
  } catch (error) {
    console.log('GPT-5 Error:', error.message);
  }
}

async function main() {
  try {
    await basicStreaming();
    await streamingWithProgress();
    await gpt5Streaming();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
