/**
 * Example 1: Basic Chat
 *
 * 가장 기본적인 채팅 사용법
 */

import { UnifiedLLMClient } from '../src/index.js';

async function basicChatExample() {
  console.log('=== Basic Chat Example ===\n');

  // API Key 설정 (환경 변수 또는 직접 입력)
  const apiKey = process.env.OPENAI_API_KEY;

  // 클라이언트 생성
  const client = new UnifiedLLMClient({
    provider: 'openai',
    apiKey,
    model: 'gpt-4o-mini'
  });

  // 간단한 채팅 (Responses API 형식)
  const response = await client.response({
    input: 'Hello! How are you?',
    max_output_tokens: 100
  });

  // 응답에서 텍스트 추출
  const messageItem = response.output.find(item => item.type === 'message');
  const text = messageItem?.content[0]?.text || '';

  console.log('Response:', text);
  console.log('\nUsage:', response.usage);
}

// 다양한 모델로 테스트
async function multipleModels() {
  console.log('\n=== Testing Multiple Models ===\n');

  const models = [
    { key: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', name: 'OpenAI', provider: 'openai' },
    { key: process.env.ANTHROPIC_API_KEY, model: 'claude-3-haiku-20240307', name: 'Claude', provider: 'claude' },
    { key: process.env.GEMINI_API_KEY, model: 'gemini-2.5-flash', name: 'Gemini', provider: 'gemini' }
  ];

  for (const { key, model, name, provider } of models) {
    if (!key) {
      console.log(`${name}: Skipped (no API key)\n`);
      continue;
    }

    const client = new UnifiedLLMClient({
      provider,
      apiKey: key,
      model
    });

    try {
      const response = await client.response({
        input: 'Say hello in one word',
        max_output_tokens: 50
      });

      const messageItem = response.output.find(item => item.type === 'message');
      const text = messageItem?.content[0]?.text || '';

      console.log(`${name}:`, text);
    } catch (error) {
      console.log(`${name}: Error -`, error.message);
    }
  }
}

// 실행
async function main() {
  try {
    await basicChatExample();
    await multipleModels();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
