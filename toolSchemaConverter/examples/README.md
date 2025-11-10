# LLM Function Adapter - Examples

이 폴더에는 LLM Function Adapter 라이브러리의 사용 예제들이 포함되어 있습니다.

## 📚 예제 목록

### 기본 사용법

- **01-basic-chat.js** - 가장 기본적인 채팅 사용법
  - 단일 메시지 전송
  - 여러 모델 테스트
  - Provider 자동 감지

- **02-streaming.js** - 실시간 스트리밍 응답
  - 기본 스트리밍
  - 진행 상황 추적
  - GPT-5 스트리밍

- **03-function-calling.js** - 함수 호출/도구 사용
  - 기본 함수 호출
  - 완전한 함수 호출 플로우
  - Claude 함수 호출

- **04-multi-turn-conversation.js** - 멀티턴 대화
  - 간단한 대화
  - 컨텍스트가 있는 대화
  - 도구 호출이 포함된 대화

### 고급 기능

- **05-gpt5-models.js** - GPT-5 및 o3 모델
  - 모든 GPT-5 모델 테스트
  - GPT-5 스트리밍
  - 함수 호출
  - 모델 비교

- **06-all-providers.js** - 모든 Provider 사용
  - OpenAI, Claude, Gemini, Ollama
  - Provider별 스트리밍
  - Provider별 함수 호출
  - 자동 Provider 감지

- **07-error-handling.js** - 에러 처리
  - 잘못된 API 키
  - 모델 없음
  - Rate Limit
  - 네트워크 에러
  - Fallback 전략
  - 재시도 로직

- **08-advanced-parameters.js** - 고급 파라미터
  - Temperature 제어
  - Top-P 제어
  - System messages
  - Max tokens
  - Stop sequences
  - Presence/Frequency penalty
  - Multiple choices (n parameter)
  - Seed (재현성)

### 실전 예제

- **09-real-world-chatbot.js** - 실전 챗봇
  - 도구를 사용하는 챗봇
  - 대화 기록 관리
  - Interactive CLI
  - 멀티모델 Fallback

- **10-production-patterns.js** - 프로덕션 패턴
  - Retry with Exponential Backoff
  - Rate Limiting
  - Caching
  - Load Balancing
  - Budget Control

### 기존 예제

- **basic-usage.js** - 기본 사용 예제
- **converter-test.js** - 변환기 테스트
- **openai-both-apis.js** - OpenAI Chat & Responses API
- **streaming-usage.js** - 스트리밍 사용 예제

## 🚀 실행 방법

### 환경 변수 설정

```bash
export OPENAI_API_KEY="your-openai-key"
export ANTHROPIC_API_KEY="your-claude-key"
export GEMINI_API_KEY="your-gemini-key"
export OLLAMA_BASE_URL="http://localhost:11434"  # optional
```

### 예제 실행

```bash
# 기본 채팅
node examples/01-basic-chat.js

# 스트리밍
node examples/02-streaming.js

# 함수 호출
node examples/03-function-calling.js

# GPT-5 모델
node examples/05-gpt5-models.js

# 모든 Provider
node examples/06-all-providers.js

# Interactive 챗봇
node examples/09-real-world-chatbot.js --interactive

# Production 패턴
node examples/10-production-patterns.js
```

## 📖 주요 기능별 예제

### GPT-5 사용하기

```javascript
import { UnifiedLLMClient } from './src/index.js';

const client = new UnifiedLLMClient({
  apiKey: process.env.OPENAI_API_KEY
});

const response = await client.chat({
  model: 'gpt-5',  // 또는 'gpt-5-mini', 'gpt-5-nano', 'o3', 'o3-mini'
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  max_tokens: 100  // 자동으로 max_completion_tokens로 변환됨
});
```

### 함수 호출

```javascript
const tools = [{
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get weather information',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string' }
      },
      required: ['city']
    }
  }
}];

const response = await client.chat({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: "What's the weather?" }],
  tools: tools
});
```

### 스트리밍

```javascript
const stream = await client.chat({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  process.stdout.write(content);
}
```

### 에러 처리

```javascript
import { LLMError } from './src/index.js';

try {
  const response = await client.chat({...});
} catch (error) {
  if (error instanceof LLMError) {
    console.log('Error type:', error.error.type);
    console.log('Message:', error.error.message);
    console.log('Status:', error.status);
  }
}
```

## 🎯 시나리오별 추천 예제

- **빠르게 시작하기** → `01-basic-chat.js`
- **GPT-5 사용하기** → `05-gpt5-models.js`
- **챗봇 만들기** → `09-real-world-chatbot.js`
- **프로덕션 준비** → `10-production-patterns.js`
- **에러 처리** → `07-error-handling.js`
- **모든 기능 보기** → 순서대로 01~10 모두 실행

## 💡 팁

1. **API 키 관리**: `.env` 파일 사용 권장
2. **비용 관리**: `max_tokens` 설정으로 비용 제어
3. **에러 처리**: 항상 try-catch로 에러 처리
4. **Rate Limit**: 프로덕션에서는 Rate Limiting 패턴 사용
5. **캐싱**: 동일한 요청은 캐싱으로 비용 절감

## 📝 더 알아보기

- [README.md](../README.md) - 전체 라이브러리 문서
- [CHANGELOG.md](../CHANGELOG.md) - 변경 이력
- [GPT5_API_Report.md](../GPT5_API_Report.md) - GPT-5 API 명세
