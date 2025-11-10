/**
 * Example 10: Production-ready Patterns
 *
 * 프로덕션 환경에서 사용할 수 있는 고급 패턴들
 */

import { UnifiedLLMClient, LLMError } from '../src/index.js';

// ============================================================================
// Pattern 1: Retry with Exponential Backoff
// ============================================================================

class RetryableClient {
  constructor(config = {}) {
    this.client = new UnifiedLLMClient(config);
    this.maxRetries = config.maxRetries || 3;
    this.baseDelay = config.baseDelay || 1000;
  }

  async chat(request, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.client.chat(request);
      } catch (error) {
        lastError = error;

        // 재시도 가능한 에러인지 확인
        if (!this.isRetryable(error)) {
          throw error;
        }

        // 마지막 시도였으면 에러 throw
        if (attempt === maxRetries - 1) {
          throw error;
        }

        // Exponential backoff
        const delay = this.baseDelay * Math.pow(2, attempt);
        console.log(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  isRetryable(error) {
    if (!(error instanceof LLMError)) return false;

    // Rate limit이나 서버 에러는 재시도
    return error.error.type === 'rate_limit_error' ||
           error.status >= 500;
  }
}

async function retryExample() {
  console.log('=== Retry Pattern Example ===\n');

  const client = new RetryableClient({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
    baseDelay: 1000
  });

  try {
    const response = await client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello!' }],
      max_tokens: 50
    });

    console.log('Success:', response.choices[0].message.content);
  } catch (error) {
    console.log('Failed after retries:', error.message);
  }
}

// ============================================================================
// Pattern 2: Request Queue with Rate Limiting
// ============================================================================

class RateLimitedClient {
  constructor(config = {}) {
    this.client = new UnifiedLLMClient(config);
    this.requestsPerMinute = config.requestsPerMinute || 10;
    this.queue = [];
    this.processing = false;
  }

  async chat(request) {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const { request, resolve, reject } = this.queue.shift();

      try {
        const response = await this.client.chat(request);
        resolve(response);
      } catch (error) {
        reject(error);
      }

      // Rate limiting: 60초 / requestsPerMinute
      const delay = (60 * 1000) / this.requestsPerMinute;
      await new Promise(r => setTimeout(r, delay));
    }

    this.processing = false;
  }
}

async function rateLimitExample() {
  console.log('\n=== Rate Limiting Pattern Example ===\n');

  const client = new RateLimitedClient({
    apiKey: process.env.OPENAI_API_KEY,
    requestsPerMinute: 5  // 분당 5개 요청
  });

  const requests = [
    'What is 1+1?',
    'What is 2+2?',
    'What is 3+3?'
  ];

  console.log(`Sending ${requests.length} requests (rate: 5/min)...`);

  const promises = requests.map(content =>
    client.chat({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content }],
      max_tokens: 10
    })
  );

  const results = await Promise.all(promises);

  results.forEach((result, i) => {
    console.log(`${i + 1}. ${result.choices[0].message.content}`);
  });
}

// ============================================================================
// Pattern 3: Caching Layer
// ============================================================================

class CachedClient {
  constructor(config = {}) {
    this.client = new UnifiedLLMClient(config);
    this.cache = new Map();
    this.cacheTTL = config.cacheTTL || 60000; // 1분
  }

  async chat(request) {
    const cacheKey = this.getCacheKey(request);

    // 캐시 확인
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log('[Cache] Hit');
      return cached.response;
    }

    console.log('[Cache] Miss');

    // API 호출
    const response = await this.client.chat(request);

    // 캐시 저장
    this.cache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });

    return response;
  }

  getCacheKey(request) {
    // 간단한 캐시 키 생성 (실제로는 더 정교한 로직 필요)
    return JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature || 1,
      max_tokens: request.max_tokens
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

async function cacheExample() {
  console.log('\n=== Caching Pattern Example ===\n');

  const client = new CachedClient({
    apiKey: process.env.OPENAI_API_KEY,
    cacheTTL: 60000
  });

  const request = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'What is 2+2?' }],
    max_tokens: 10
  };

  // 첫 번째 요청 (캐시 미스)
  console.log('Request 1:');
  const start1 = Date.now();
  await client.chat(request);
  console.log(`Time: ${Date.now() - start1}ms\n`);

  // 두 번째 요청 (캐시 히트)
  console.log('Request 2 (same):');
  const start2 = Date.now();
  await client.chat(request);
  console.log(`Time: ${Date.now() - start2}ms (should be faster)\n`);
}

// ============================================================================
// Pattern 4: Load Balancing across Providers
// ============================================================================

class LoadBalancedClient {
  constructor(providers) {
    this.providers = providers.map(config => ({
      client: new UnifiedLLMClient(config),
      model: config.model,
      weight: config.weight || 1,
      failures: 0
    }));
    this.currentIndex = 0;
  }

  async chat(request) {
    const provider = this.selectProvider();

    try {
      const response = await provider.client.chat({
        ...request,
        model: provider.model
      });

      // 성공 시 실패 카운트 리셋
      provider.failures = 0;
      return response;
    } catch (error) {
      // 실패 카운트 증가
      provider.failures++;

      // 다른 프로바이더로 재시도
      if (this.providers.filter(p => p.failures < 3).length > 1) {
        console.log(`Provider failed, trying another...`);
        return this.chat(request);
      }

      throw error;
    }
  }

  selectProvider() {
    // Round-robin with health check
    const healthyProviders = this.providers.filter(p => p.failures < 3);

    if (healthyProviders.length === 0) {
      // 모든 프로바이더가 실패 상태면 리셋
      this.providers.forEach(p => p.failures = 0);
      return this.providers[0];
    }

    this.currentIndex = (this.currentIndex + 1) % healthyProviders.length;
    return healthyProviders[this.currentIndex];
  }
}

async function loadBalanceExample() {
  console.log('\n=== Load Balancing Pattern Example ===\n');

  const client = new LoadBalancedClient([
    {
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o-mini',
      weight: 2
    },
    {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-haiku-20240307',
      weight: 1
    }
  ]);

  for (let i = 0; i < 3; i++) {
    try {
      const response = await client.chat({
        messages: [{ role: 'user', content: `Request ${i + 1}` }],
        max_tokens: 10
      });

      console.log(`Request ${i + 1}:`, response.choices[0].message.content);
    } catch (error) {
      console.log(`Request ${i + 1}: Error`);
    }
  }
}

// ============================================================================
// Pattern 5: Usage Tracking and Budget Control
// ============================================================================

class BudgetControlledClient {
  constructor(config = {}) {
    this.client = new UnifiedLLMClient(config);
    this.maxBudget = config.maxBudget || 1000; // 토큰 수
    this.usedTokens = 0;
  }

  async chat(request) {
    // 예상 토큰 수 계산 (간단한 추정)
    const estimatedTokens = this.estimateTokens(request);

    if (this.usedTokens + estimatedTokens > this.maxBudget) {
      throw new Error(`Budget exceeded. Used: ${this.usedTokens}, Budget: ${this.maxBudget}`);
    }

    const response = await this.client.chat(request);

    // 실제 사용량 업데이트
    this.usedTokens += response.usage.total_tokens;

    console.log(`Tokens used: ${response.usage.total_tokens}, Total: ${this.usedTokens}/${this.maxBudget}`);

    return response;
  }

  estimateTokens(request) {
    // 간단한 추정 (실제로는 더 정교한 토크나이저 사용)
    const messageTokens = request.messages.reduce((sum, msg) => {
      return sum + (msg.content?.length || 0) / 4; // 대략 4 chars = 1 token
    }, 0);

    return Math.ceil(messageTokens + (request.max_tokens || 100));
  }

  getRemainingBudget() {
    return this.maxBudget - this.usedTokens;
  }

  reset() {
    this.usedTokens = 0;
  }
}

async function budgetExample() {
  console.log('\n=== Budget Control Pattern Example ===\n');

  const client = new BudgetControlledClient({
    apiKey: process.env.OPENAI_API_KEY,
    maxBudget: 500
  });

  try {
    for (let i = 1; i <= 5; i++) {
      const response = await client.chat({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Question ${i}: What is ${i} + ${i}?` }],
        max_tokens: 50
      });

      console.log(`Q${i}: ${response.choices[0].message.content}`);
      console.log(`Remaining budget: ${client.getRemainingBudget()} tokens\n`);
    }
  } catch (error) {
    console.log('Error:', error.message);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    await retryExample();
    await rateLimitExample();
    await cacheExample();
    await loadBalanceExample();
    await budgetExample();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Export classes for use in other modules
export {
  RetryableClient,
  RateLimitedClient,
  CachedClient,
  LoadBalancedClient,
  BudgetControlledClient
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
