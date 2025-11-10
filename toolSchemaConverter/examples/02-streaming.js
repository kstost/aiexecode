/**
 * Example 2: Streaming Responses
 *
 * 실시간 스트리밍 응답 받기
 */

import { UnifiedLLMClient } from '../src/index.js';

async function basicStreaming() {
  console.log('=== Basic Streaming Example ===\n');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  });

  const stream = await client.response({
    input: 'Write a haiku about programming',
    max_output_tokens: 100,
    stream: true  // 스트리밍 활성화
  });

  // 스트리밍 응답 처리 (Responses API 형식)
  process.stdout.write('Response: ');
  for await (const chunk of stream) {
    if (chunk.object === 'response.delta' && chunk.delta?.text) {
      process.stdout.write(chunk.delta.text);
    } else if (chunk.object === 'response.done') {
      process.stdout.write('\n\n');
    }
  }
}

async function streamingWithProgress() {
  console.log('=== Streaming with Progress ===\n');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  });

  const stream = await client.response({
    input: 'Count from 1 to 10',
    max_output_tokens: 100,
    stream: true
  });

  let chunkCount = 0;
  let totalContent = '';

  for await (const chunk of stream) {
    if (chunk.object === 'response.delta' && chunk.delta?.text) {
      chunkCount++;
      totalContent += chunk.delta.text;

      // 진행 상황 표시
      process.stdout.write(`\rChunks: ${chunkCount}, Chars: ${totalContent.length}`);
    }
  }

  console.log('\n\nFinal content:', totalContent);
  console.log(`Total chunks received: ${chunkCount}`);
}

// GPT-5 스트리밍
async function gpt5Streaming() {
  console.log('\n=== GPT-5 Streaming ===\n');

  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-5-mini'
  });

  try {
    const stream = await client.response({
      input: 'Explain AI in one sentence',
      max_output_tokens: 100,
      stream: true
    });

    process.stdout.write('GPT-5 Response: ');
    for await (const chunk of stream) {
      if (chunk.object === 'response.delta' && chunk.delta?.text) {
        process.stdout.write(chunk.delta.text);
      } else if (chunk.object === 'response.done') {
        process.stdout.write('\n');
      }
    }
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
