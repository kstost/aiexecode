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
  const client = new UnifiedLLMClient({ apiKey });

  // 간단한 채팅
  const response = await client.chat({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'Hello! How are you?' }
    ],
    max_tokens: 100
  });

  console.log('Response:', response.choices[0].message.content);
  console.log('\nUsage:', response.usage);
}

// 다양한 모델로 테스트
async function multipleModels() {
  console.log('\n=== Testing Multiple Models ===\n');

  const models = [
    { key: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', name: 'OpenAI' },
    { key: process.env.ANTHROPIC_API_KEY, model: 'claude-3-haiku-20240307', name: 'Claude' },
    { key: process.env.GEMINI_API_KEY, model: 'gemini-2.5-flash', name: 'Gemini' }
  ];

  for (const { key, model, name } of models) {
    if (!key) {
      console.log(`${name}: Skipped (no API key)\n`);
      continue;
    }

    const client = new UnifiedLLMClient({ apiKey: key });

    try {
      const response = await client.chat({
        model: model,
        messages: [{ role: 'user', content: 'Say hello in one word' }],
        max_tokens: 10
      });

      console.log(`${name}:`, response.choices[0].message.content);
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
