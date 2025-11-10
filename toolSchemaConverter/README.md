# LLM Function Adapter

OpenAI 형식의 Function Calling 인터페이스를 사용하여 OpenAI, Claude, Gemini, Ollama를 통합적으로 사용할 수 있는 JavaScript 라이브러리입니다.

## 특징

- ✅ **통합 인터페이스**: OpenAI 형식으로 모든 LLM 제공자 사용
- ✅ **자동 변환**: 요청/응답을 자동으로 각 제공자 형식으로 변환
- ✅ **Function Calling 지원**: 모든 제공자에서 도구 사용 가능
- ✅ **Multi-turn 대화**: 대화 히스토리 및 도구 결과 관리
- ✅ **TypeScript 불필요**: 순수 JavaScript로 작동

## 설치

```bash
npm install
```

## 환경 변수 설정

```bash
# OpenAI
export OPENAI_API_KEY="your-openai-api-key"

# Claude (Anthropic)
export ANTHROPIC_API_KEY="your-anthropic-api-key"

# Gemini (Google)
export GEMINI_API_KEY="your-gemini-api-key"

# Ollama (로컬, API 키 불필요)
# Ollama가 localhost:11434에서 실행 중이어야 함
```

## OpenAI API 타입 선택

OpenAI는 두 가지 API를 제공합니다:

### 1. **Chat Completions API** (기본값, 안정적)
- 전통적인 API
- 모든 LLM과 호환성 최고
- `/v1/chat/completions` 엔드포인트

### 2. **Responses API** (새로운, 더 풍부)
- gpt-5 등 최신 모델 지원
- 자동 대화 저장
- Reasoning, function calls 등 풍부한 Item 타입
- `/v1/responses` 엔드포인트

```javascript
// Chat Completions API (기본값)
const client = new UnifiedLLMClient({
  provider: 'openai',
  apiType: 'chat-completions', // 또는 생략
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o'
});

// Responses API (gpt-5)
const client = new UnifiedLLMClient({
  provider: 'openai',
  apiType: 'responses',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-5'
});
```

**참고**: Responses API를 사용해도 응답은 Chat Completions 형식으로 변환되어 일관성을 유지합니다.

## 기본 사용법

### 1. OpenAI 형식으로 Claude 사용

```javascript
import { UnifiedLLMClient } from './src/index.js';

const client = new UnifiedLLMClient({
  provider: 'claude',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5'
});

// OpenAI 형식의 요청
const request = {
  messages: [
    { role: 'user', content: 'What is the weather like in Paris?' }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' }
          },
          required: ['location']
        }
      }
    }
  ],
  max_tokens: 1024
};

// OpenAI 형식의 응답 받기
const response = await client.chat(request);
console.log(response);
```

### 2. 제공자별 사용 예시

#### OpenAI
```javascript
const client = new UnifiedLLMClient({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o'
});
```

#### Claude
```javascript
const client = new UnifiedLLMClient({
  provider: 'claude',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5'
});
```

#### Gemini
```javascript
const client = new UnifiedLLMClient({
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.5-flash'
});
```

#### Ollama
```javascript
const client = new UnifiedLLMClient({
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2'
});
```

### 3. Multi-turn 대화 (도구 사용 포함)

```javascript
const messages = [
  { role: 'user', content: 'What is the weather in Tokyo?' }
];

// 첫 번째 요청
let response = await client.chat({
  messages: messages,
  tools: [weatherTool],
  max_tokens: 1024
});

// 도구 호출 확인
if (response.choices[0].message.tool_calls) {
  const toolCall = response.choices[0].message.tool_calls[0];

  // 도구 실행 (실제 구현 필요)
  const toolResult = getWeather(JSON.parse(toolCall.function.arguments));

  // 대화에 추가
  messages.push(response.choices[0].message);
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify(toolResult),
    name: toolCall.function.name
  });

  // 최종 응답 받기
  response = await client.chat({
    messages: messages,
    tools: [weatherTool],
    max_tokens: 1024
  });

  console.log(response.choices[0].message.content);
}
```

## 응답 형식

모든 제공자의 응답은 OpenAI 형식으로 통일됩니다:

```javascript
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "claude-sonnet-4-5",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The weather in Paris...",
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\": \"Paris\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 30,
    "total_tokens": 80
  }
}
```

## 고급 사용법

### 개별 컨버터 직접 사용

```javascript
import {
  convertRequestToClaudeFormat,
  convertClaudeResponseToOpenAI
} from './src/index.js';

// OpenAI 요청을 Claude 형식으로 변환
const claudeRequest = convertRequestToClaudeFormat(openaiRequest);

// Claude 응답을 OpenAI 형식으로 변환
const openaiResponse = convertClaudeResponseToOpenAI(claudeResponse);
```

## 프로젝트 구조

```
toolSchemaConverter/
├── src/
│   ├── index.js                      # 메인 엔트리포인트
│   ├── client.js                     # 통합 클라이언트
│   └── converters/
│       ├── openai-to-claude.js       # OpenAI → Claude 변환
│       ├── claude-to-openai.js       # Claude → OpenAI 변환
│       ├── openai-to-gemini.js       # OpenAI → Gemini 변환
│       ├── gemini-to-openai.js       # Gemini → OpenAI 변환
│       ├── openai-to-ollama.js       # OpenAI → Ollama 변환
│       └── ollama-to-openai.js       # Ollama → OpenAI 변환
├── examples/
│   └── basic-usage.js                # 사용 예시
├── docs/
│   ├── OpenAI.md                     # OpenAI Schema 문서
│   ├── Claude.md                     # Claude Schema 문서
│   ├── Gemini.md                     # Gemini Schema 문서
│   └── Ollama.md                     # Ollama Schema 문서
├── package.json
└── README.md
```

## 예시 실행

```bash
# 기본 예시 실행
npm run example

# OpenAI 두 API 비교 예시
npm run example:openai-apis

# 컨버터 테스트
npm run test-converters

# 또는 직접 실행
node examples/basic-usage.js
node examples/openai-both-apis.js
node examples/converter-test.js
```

## 지원하는 기능

### OpenAI
- ✅ Chat Completions API (gpt-4o, gpt-4-turbo 등)
- ✅ Responses API (gpt-5 등 최신 모델)
- ✅ Function calling
- ✅ Multi-turn conversations
- ✅ 두 API 간 자동 변환
- ⏳ Streaming (향후 지원 예정)

### Claude
- ✅ Tool use
- ✅ Multi-turn conversations
- ✅ System prompts
- ✅ Parallel tool calls

### Gemini
- ✅ Function declarations
- ✅ Sequential function calling
- ✅ System instructions

### Ollama
- ✅ Function calling (호환 모델)
- ✅ 로컬 실행
- ✅ OpenAI 호환 형식

## 주의사항

1. **API 키**: 각 제공자별로 유효한 API 키가 필요합니다 (Ollama 제외)
2. **모델 호환성**: 모든 모델이 function calling을 지원하는 것은 아닙니다
3. **OpenAI API 타입**:
   - Chat Completions: 안정적, 모든 모델 지원
   - Responses API: gpt-5 등 최신 모델, 더 풍부한 기능
   - 기본값은 Chat Completions (호환성 최고)
4. **Ollama**: Ollama를 사용하려면 로컬에서 Ollama 서버가 실행 중이어야 합니다
5. **비용**: OpenAI, Claude, Gemini는 사용량에 따라 비용이 발생합니다
6. **응답 형식**: 모든 응답은 OpenAI Chat Completions 형식으로 통일됩니다

## 라이선스

MIT

## 참고 자료

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Claude Tool Use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use)
- [Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
