/**
 * Example 7: Error Handling
 *
 * 다양한 에러 상황 처리 예제
 */

import { UnifiedLLMClient, LLMError } from '../src/index.js';

async function handleInvalidAPIKey() {
  console.log('=== Invalid API Key Error ===\n');

  const client = new UnifiedLLMClient({
    apiKey: 'invalid-key-12345'
  });

  try {
    await client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }]
    });
  } catch (error) {
    if (error instanceof LLMError) {
      console.log('Caught LLMError:');
      console.log('  Type:', error.error.type);
      console.log('  Message:', error.error.message);
      console.log('  Status:', error.status);
      console.log('  Provider:', error.provider);
      console.log('\nJSON format:');
      console.log(JSON.stringify(error.toJSON(), null, 2));
    }
  }
}

async function handleModelNotFound() {
  console.log('\n=== Model Not Found Error ===\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('Skipped: ANTHROPIC_API_KEY not set');
    return;
  }

  const client = new UnifiedLLMClient({ apiKey });

  try {
    await client.chat({
      model: 'claude-nonexistent-model-9999',
      messages: [{ role: 'user', content: 'Hello' }]
    });
  } catch (error) {
    console.log('Error Type:', error.error.type);
    console.log('Error Message:', error.error.message);
    console.log('HTTP Status:', error.status);

    // not_found_error 인지 확인
    if (error.error.type === 'not_found_error') {
      console.log('\n✓ Correctly identified as not_found_error');
    }
  }
}

async function handleRateLimitError() {
  console.log('\n=== Rate Limit Error (Simulated) ===\n');

  // 실제 rate limit 에러는 발생시키기 어려우므로, 에러 구조만 확인
  const mockError = new LLMError('Rate limit exceeded', {
    type: 'rate_limit_error',
    code: 'rate_limit_exceeded',
    status: 429,
    provider: 'openai'
  });

  console.log('Simulated rate limit error:');
  console.log(JSON.stringify(mockError.toJSON(), null, 2));

  // 실제 애플리케이션에서의 처리 예시
  if (mockError.error.type === 'rate_limit_error') {
    console.log('\n✓ Would implement retry with exponential backoff');
  }
}

async function handleNetworkError() {
  console.log('\n=== Network/Connection Error ===\n');

  const client = new UnifiedLLMClient({
    provider: 'ollama',
    baseURL: 'http://localhost:99999'  // 잘못된 포트
  });

  try {
    await client.chat({
      model: 'llama2',
      messages: [{ role: 'user', content: 'Hello' }]
    });
  } catch (error) {
    console.log('Error caught:');
    console.log('  Type:', error.error.type);
    console.log('  Message:', error.error.message);
    console.log('  Provider:', error.provider);

    if (error.error.type === 'api_error' || error.error.type === 'not_found_error') {
      console.log('\n✓ Network error handled correctly');
    }
  }
}

async function gracefulErrorHandling() {
  console.log('\n=== Graceful Error Handling with Fallback ===\n');

  const providers = [
    {
      name: 'Primary (Invalid)',
      apiKey: 'invalid-key',
      model: 'gpt-4o-mini'
    },
    {
      name: 'Fallback (Valid)',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o-mini'
    }
  ];

  const message = 'What is 2+2?';

  for (const config of providers) {
    try {
      console.log(`Trying ${config.name}...`);

      const client = new UnifiedLLMClient({ apiKey: config.apiKey });
      const response = await client.chat({
        model: config.model,
        messages: [{ role: 'user', content: message }],
        max_tokens: 10
      });

      console.log(`✓ Success with ${config.name}`);
      console.log(`  Answer: ${response.choices[0].message.content}\n`);
      break;  // 성공하면 중단
    } catch (error) {
      console.log(`✗ Failed with ${config.name}: ${error.error.type}`);

      if (config === providers[providers.length - 1]) {
        console.log('  All providers failed!\n');
      } else {
        console.log('  Trying next provider...\n');
      }
    }
  }
}

async function errorLogging() {
  console.log('=== Error Logging Example ===\n');

  const client = new UnifiedLLMClient({
    apiKey: 'invalid-key'
  });

  try {
    await client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }]
    });
  } catch (error) {
    // 로그에 기록할 정보
    const logEntry = {
      timestamp: new Date().toISOString(),
      errorType: error.error.type,
      errorMessage: error.error.message,
      httpStatus: error.status,
      provider: error.provider,
      model: 'gpt-4o-mini'
    };

    console.log('Log entry:');
    console.log(JSON.stringify(logEntry, null, 2));

    // 실제 애플리케이션에서는 여기서 로깅 시스템에 전송
    // logger.error('LLM API Error', logEntry);
  }
}

async function retryLogic() {
  console.log('\n=== Retry Logic Example ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY || 'invalid'
  });

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    console.log(`Attempt ${attempt}/${maxRetries}...`);

    try {
      const response = await client.chat({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5
      });

      console.log('✓ Success!');
      console.log('  Response:', response.choices[0].message.content);
      break;
    } catch (error) {
      console.log(`✗ Failed: ${error.error.type}`);

      // Rate limit이나 일시적 오류인 경우만 재시도
      if (error.error.type === 'rate_limit_error' || error.status >= 500) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;  // Exponential backoff
          console.log(`  Retrying in ${delay}ms...\n`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } else {
        // 인증 오류 등은 재시도 안 함
        console.log('  Error type not retryable. Aborting.\n');
        break;
      }
    }
  }
}

async function main() {
  try {
    await handleInvalidAPIKey();
    await handleModelNotFound();
    await handleRateLimitError();
    await handleNetworkError();
    await gracefulErrorHandling();
    await errorLogging();
    await retryLogic();
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

main();
