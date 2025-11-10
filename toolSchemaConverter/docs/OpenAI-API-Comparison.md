# OpenAI API 비교: Chat Completions vs Responses

## 개요

OpenAI는 두 가지 주요 API를 제공합니다. 본 라이브러리는 두 API를 모두 지원하며, 응답은 Chat Completions 형식으로 통일됩니다.

## API 비교표

| 특징 | Chat Completions API | Responses API |
|------|---------------------|---------------|
| **엔드포인트** | `/v1/chat/completions` | `/v1/responses` |
| **입력 형식** | `messages` 배열 | `input` (문자열 또는 구조화) |
| **출력 형식** | `choices[].message` | `output[Items]` |
| **대화 관리** | 수동 (messages에 추가) | 자동 (`previous_response_id`) |
| **여러 응답** | `n` 파라미터 지원 | 단일 응답만 |
| **자동 저장** | 선택적 (`store` 파라미터) | 기본 활성화 |
| **Item 타입** | `message`만 | `reasoning`, `message`, `function_call` 등 |
| **지원 모델** | gpt-4o, gpt-4-turbo 등 | gpt-5 등 최신 모델 |
| **안정성** | 매우 안정적 (오래됨) | 새로운 기능 |

## Chat Completions API

### 요청 예시
```javascript
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "tools": [...],
  "temperature": 0.7,
  "max_tokens": 1024
}
```

### 응답 예시
```javascript
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I assist you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

### 장점
- ✅ 매우 안정적이고 검증됨
- ✅ 모든 OpenAI 모델 지원
- ✅ 다른 LLM(Claude, Gemini)과 호환성 최고
- ✅ 여러 응답 생성 가능 (`n` 파라미터)
- ✅ 풍부한 커뮤니티 예제

### 단점
- ❌ 대화 히스토리를 수동으로 관리해야 함
- ❌ Reasoning 등 고급 기능 제한적

## Responses API

### 요청 예시
```javascript
{
  "model": "gpt-5",
  "input": "Hello!",  // 또는 messages 배열
  "tools": [...],
  "temperature": 0.7,
  "max_tokens": 1024,
  "store": true,
  "previous_response_id": "resp_123..."  // 대화 체이닝
}
```

### 응답 예시
```javascript
{
  "id": "resp_68af4030592c81938ec0a5fbab4a3e9f",
  "object": "response",
  "created_at": 1756315696,
  "model": "gpt-5",
  "output": [
    {
      "id": "rs_68af4030baa48193b0b43b4c2a176a1a",
      "type": "reasoning",
      "content": [],
      "summary": []
    },
    {
      "id": "msg_68af40337e58819392e935fb",
      "type": "message",
      "status": "completed",
      "content": [
        {
          "type": "output_text",
          "text": "Hello! How can I help you?",
          "annotations": []
        }
      ],
      "role": "assistant"
    }
  ]
}
```

### 장점
- ✅ 자동 대화 저장 및 관리
- ✅ Reasoning 과정 노출
- ✅ 풍부한 Item 타입 (message, reasoning, function_call 등)
- ✅ gpt-5 등 최신 모델 지원
- ✅ `previous_response_id`로 대화 체이닝 간편

### 단점
- ❌ 상대적으로 새로움 (검증 부족)
- ❌ 여러 응답 생성 불가 (`n` 파라미터 없음)
- ❌ 다른 LLM과 호환성 낮음

## 본 라이브러리에서의 사용

### Chat Completions API (기본값)
```javascript
const client = new UnifiedLLMClient({
  provider: 'openai',
  apiType: 'chat-completions', // 또는 생략
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o'
});

const response = await client.chat({
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
});
```

### Responses API
```javascript
const client = new UnifiedLLMClient({
  provider: 'openai',
  apiType: 'responses',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-5'
});

const response = await client.chat({
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
});

// 응답은 자동으로 Chat Completions 형식으로 변환됨
console.log(response.choices[0].message.content);
```

## 변환 로직

본 라이브러리는 내부적으로 다음과 같이 변환합니다:

### Chat → Responses 변환
```javascript
// Input
{
  messages: [
    { role: 'user', content: 'Hello' }
  ]
}

// Converted to
{
  input: 'Hello'  // 또는 messages 배열
}
```

### Responses → Chat 변환
```javascript
// Responses API output
{
  output: [
    { type: 'reasoning', ... },
    { type: 'message', content: [{text: 'Hello!'}] },
    { type: 'function_call', name: 'get_weather', ... }
  ]
}

// Converted to Chat Completions format
{
  choices: [{
    message: {
      role: 'assistant',
      content: 'Hello!',
      tool_calls: [...]
    }
  }]
}
```

## 권장 사항

### Chat Completions API를 사용하세요:
- ✅ 안정성이 중요한 프로덕션 환경
- ✅ 다른 LLM(Claude, Gemini)과 함께 사용
- ✅ 여러 응답 생성이 필요한 경우
- ✅ 검증된 API가 필요한 경우

### Responses API를 사용하세요:
- ✅ gpt-5 등 최신 모델 사용
- ✅ Reasoning 과정을 보고 싶은 경우
- ✅ 자동 대화 관리가 필요한 경우
- ✅ 새로운 기능을 실험하는 경우

## 참고 자료

- [OpenAI Responses vs Chat Completions](https://platform.openai.com/docs/guides/responses-vs-chat-completions)
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
