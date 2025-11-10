# LLM Function Adapter

OpenAI Responses API 형식의 통일된 인터페이스로 OpenAI, Claude, Gemini, Ollama를 사용할 수 있는 JavaScript 라이브러리입니다.

## 특징

- ✅ **Responses API 기준**: OpenAI의 최신 Responses API 형식을 표준으로 사용
- ✅ **통합 인터페이스**: 모든 LLM 제공자를 하나의 일관된 방식으로 사용
- ✅ **자동 변환**: 요청/응답을 자동으로 각 제공자 형식으로 변환
- ✅ **Function Calling 지원**: 모든 제공자에서 도구 사용 가능
- ✅ **Streaming 지원**: 모든 제공자에서 실시간 스트리밍 응답
- ✅ **Multi-turn 대화**: 대화 히스토리 및 도구 결과 관리
- ✅ **GPT-5 지원**: Chain of Thought 추론, reasoning effort 제어
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

## OpenAI Responses API란?

OpenAI의 **Responses API**는 최신 LLM 모델(GPT-5, o3 등)을 위해 설계된 새로운 API입니다.

### Responses API vs Chat Completions API

| 특징 | Responses API | Chat Completions API |
|------|---------------|---------------------|
| 엔드포인트 | `/v1/responses` | `/v1/chat/completions` |
| 입력 형식 | `input` (문자열 또는 배열) | `messages` (배열) |
| 시스템 메시지 | `instructions` | `messages` 배열 내 |
| 토큰 제한 | `max_output_tokens` | `max_tokens` |
| 추론 제어 | `reasoning.effort` | ❌ 미지원 |
| 상세도 제어 | `text.verbosity` | ❌ 미지원 |
| CoT 추론 | ✅ 완벽 지원 | ⚠️ 제한적 |
| 도구 형식 | `{ type: 'custom', name, description }` | `{ type: 'function', function: {...} }` |
| 응답 구조 | `output` 배열 (item 타입별) | `choices[].message` |
| 권장 사용 | ✅ GPT-5, o3 등 최신 모델 | ⚠️ 레거시 호환성 |

본 라이브러리는 **Responses API 형식을 기본**으로 하며, 모든 제공자(Claude, Gemini, Ollama 포함)가 동일한 인터페이스를 사용합니다.

## 기본 사용법

### 1. 간단한 텍스트 생성

```javascript
import { UnifiedLLMClient } from './src/index.js';

const client = new UnifiedLLMClient({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-5'
});

// Responses API 형식 요청
const response = await client.response({
  input: 'What is the meaning of life?',
  max_output_tokens: 100
});

console.log(response.output[0].content[0].text);
```

### 2. 제공자별 사용 예시

#### OpenAI (GPT-5)
```javascript
const client = new UnifiedLLMClient({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-5'
});

const response = await client.response({
  input: 'Solve this complex problem: ...',
  reasoning: { effort: 'high' },  // "minimal" | "low" | "medium" | "high"
  text: { verbosity: 'medium' },   // "low" | "medium" | "high"
  max_output_tokens: 1000
});

// Chain of Thought 추론 과정 확인
if (response.reasoning?.summary) {
  console.log('CoT:', response.reasoning.summary);
}
```

#### Claude
```javascript
const client = new UnifiedLLMClient({
  provider: 'claude',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5'
});

const response = await client.response({
  input: 'Write a haiku about programming',
  instructions: 'You are a creative poet.',
  max_output_tokens: 100
});

console.log(response.output[0].content[0].text);
```

#### Gemini
```javascript
const client = new UnifiedLLMClient({
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.5-flash'
});

const response = await client.response({
  input: 'Explain quantum computing',
  max_output_tokens: 200
});
```

#### Ollama (로컬)
```javascript
const client = new UnifiedLLMClient({
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2'
});

const response = await client.response({
  input: 'What is Rust programming language?',
  max_output_tokens: 150
});
```

### 3. Function Calling (도구 사용)

```javascript
const client = new UnifiedLLMClient({
  provider: 'claude',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-5'
});

// Responses API 형식의 도구 정의
const weatherTool = {
  type: 'custom',
  name: 'get_weather',
  description: 'Get the current weather in a given location',
  input_schema: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' },
      unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
    },
    required: ['location']
  }
};

const response = await client.response({
  input: 'What is the weather like in Tokyo?',
  tools: [weatherTool],
  max_output_tokens: 500
});

// 도구 호출 확인
const toolCalls = response.output.filter(item => item.type === 'function_call');

if (toolCalls.length > 0) {
  console.log('Tool called:', toolCalls[0].name);
  console.log('Arguments:', toolCalls[0].input);

  // 도구 실행 (실제 구현 필요)
  const toolResult = { temperature: 20, condition: 'sunny' };

  // 도구 결과와 함께 대화 이어가기
  const followUp = await client.response({
    input: [
      { role: 'user', content: 'What is the weather like in Tokyo?' },
      { role: 'assistant', content: response.output },
      { role: 'tool', tool_call_id: toolCalls[0].call_id, content: JSON.stringify(toolResult) }
    ],
    tools: [weatherTool],
    max_output_tokens: 500
  });

  console.log(followUp.output[0].content[0].text);
}
```

### 4. Streaming 응답

```javascript
const client = new UnifiedLLMClient({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-5'
});

const stream = await client.response({
  input: 'Write a story about a brave knight',
  stream: true,
  max_output_tokens: 500
});

// 스트림 처리
for await (const chunk of stream) {
  if (chunk.object === 'response.delta' && chunk.delta?.text) {
    process.stdout.write(chunk.delta.text);
  } else if (chunk.object === 'response.done') {
    console.log('\n\nStream completed!');
  }
}
```

### 5. 대화 이어가기 (Multi-turn)

```javascript
const conversation = [
  { role: 'user', content: 'My name is Alice' }
];

// 첫 번째 요청
let response = await client.response({
  input: conversation,
  max_output_tokens: 100
});

console.log(response.output[0].content[0].text);
// "Hello Alice! How can I help you today?"

// 대화 추가
conversation.push({
  role: 'assistant',
  content: response.output[0].content[0].text
});
conversation.push({
  role: 'user',
  content: 'What is my name?'
});

// 두 번째 요청
response = await client.response({
  input: conversation,
  max_output_tokens: 100
});

console.log(response.output[0].content[0].text);
// "Your name is Alice."
```

## Responses API 응답 형식

모든 제공자의 응답은 OpenAI Responses API 형식으로 통일됩니다:

```javascript
{
  "id": "resp_abc123",
  "object": "response",
  "created_at": 1677652288,
  "status": "completed",
  "model": "gpt-5",
  "output": [
    {
      "type": "message",
      "id": "msg_xyz789",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "The meaning of life is...",
          "annotations": []
        }
      ]
    }
  ],
  "reasoning": {
    "effort": "high",
    "summary": "First, I considered..."
  },
  "usage": {
    "input_tokens": 20,
    "output_tokens": 150,
    "total_tokens": 170
  }
}
```

### Output Item 타입

- **message**: 일반 텍스트 응답
- **function_call**: 도구 호출
- **reasoning**: Chain of Thought 추론 (GPT-5)

## 고급 기능

### 1. GPT-5 Reasoning Control

```javascript
const response = await client.response({
  input: 'Solve this math problem step by step: 234 * 567',
  reasoning: {
    effort: 'high'  // 높은 추론 노력 투입
  },
  text: {
    verbosity: 'high'  // 상세한 설명
  },
  max_output_tokens: 2000
});

// 추론 과정 확인
if (response.reasoning?.summary) {
  console.log('Reasoning process:', response.reasoning.summary);
}

// 최종 답변
console.log('Answer:', response.output[0].content[0].text);
```

### 2. 개별 컨버터 직접 사용

```javascript
import {
  convertResponsesRequestToClaudeFormat,
  convertClaudeResponseToResponsesFormat
} from './src/index.js';

// Responses API 요청을 Claude 형식으로 변환
const claudeRequest = convertResponsesRequestToClaudeFormat({
  input: 'Hello',
  max_output_tokens: 100
});

// Claude 응답을 Responses API 형식으로 변환
const responsesResponse = convertClaudeResponseToResponsesFormat(claudeResponse, 'claude-sonnet-4-5');
```

### 3. 자동 제공자 감지

```javascript
// 모델명으로 제공자 자동 감지
const client = new UnifiedLLMClient({
  model: 'claude-sonnet-4-5'  // provider 자동으로 'claude'로 설정
});

const response = await client.response({
  input: 'Hello',
  max_output_tokens: 100
});
```

## 프로젝트 구조

```
toolSchemaConverter/
├── src/
│   ├── index.js                        # 메인 엔트리포인트
│   ├── client.js                       # 통합 클라이언트
│   ├── errors.js                       # 에러 처리
│   └── converters/
│       ├── responses-to-claude.js      # Responses API → Claude
│       ├── responses-to-gemini.js      # Responses API → Gemini
│       ├── responses-to-ollama.js      # Responses API → Ollama
│       ├── chat-to-responses.js        # Chat Completions ↔ Responses API
│       ├── openai-to-claude.js         # (레거시) OpenAI → Claude
│       ├── claude-to-openai.js         # (레거시) Claude → OpenAI
│       ├── openai-to-gemini.js         # (레거시) OpenAI → Gemini
│       ├── gemini-to-openai.js         # (레거시) Gemini → OpenAI
│       ├── openai-to-ollama.js         # (레거시) OpenAI → Ollama
│       └── ollama-to-openai.js         # (레거시) Ollama → OpenAI
├── examples/
│   └── (사용 예시 파일들)
├── docs/
│   ├── OpenAI.md                       # OpenAI Schema 문서
│   ├── Claude.md                       # Claude Schema 문서
│   ├── Gemini.md                       # Gemini Schema 문서
│   ├── Ollama.md                       # Ollama Schema 문서
│   └── GPT5_API_Report.md              # GPT-5 및 Responses API 상세 문서
├── package.json
└── README.md
```

## 지원하는 기능

### OpenAI
- ✅ Responses API (gpt-5, o3 등)
- ✅ Chain of Thought (CoT) 추론
- ✅ Reasoning effort 제어
- ✅ Text verbosity 제어
- ✅ Function calling
- ✅ Multi-turn conversations
- ✅ Streaming

### Claude
- ✅ Responses API 형식으로 변환
- ✅ Tool use
- ✅ Multi-turn conversations
- ✅ System prompts (instructions)
- ✅ Parallel tool calls
- ✅ Streaming

### Gemini
- ✅ Responses API 형식으로 변환
- ✅ Function declarations
- ✅ Sequential function calling
- ✅ System instructions
- ✅ Streaming

### Ollama
- ✅ Responses API 형식으로 변환
- ✅ Function calling (호환 모델)
- ✅ 로컬 실행
- ✅ Streaming

## 주요 차이점 및 마이그레이션

### Chat Completions API에서 마이그레이션

기존 Chat Completions API를 사용하던 코드를 Responses API로 변경:

**Before (Chat Completions):**
```javascript
const response = await client.chat({
  messages: [
    { role: 'system', content: 'You are helpful' },
    { role: 'user', content: 'Hello' }
  ],
  max_tokens: 100,
  temperature: 0.7
});

console.log(response.choices[0].message.content);
```

**After (Responses API):**
```javascript
const response = await client.response({
  instructions: 'You are helpful',
  input: 'Hello',
  max_output_tokens: 100,
  temperature: 0.7
});

console.log(response.output[0].content[0].text);
```

### 레거시 컨버터

Chat Completions API 형식의 컨버터는 하위 호환성을 위해 여전히 제공됩니다:

```javascript
import {
  convertRequestToClaudeFormat,  // Chat Completions → Claude
  convertClaudeResponseToOpenAI  // Claude → Chat Completions
} from './src/index.js';
```

## 제한사항 및 주의사항

1. **API 키**: 각 제공자별로 유효한 API 키가 필요합니다 (Ollama 제외)
2. **모델 호환성**: 모든 모델이 function calling을 지원하는 것은 아닙니다
3. **GPT-5 / Responses API**:
   - ❌ `temperature`, `top_p`는 일부 모델에서 미지원
   - ✅ `reasoning.effort`: "minimal", "low", "medium", "high"
   - ✅ `text.verbosity`: "low", "medium", "high"
   - ✅ Chain of Thought 추론 과정 접근 가능
4. **Ollama**: 로컬에서 Ollama 서버 실행 필수
5. **비용**: OpenAI, Claude, Gemini는 사용량에 따라 비용 발생
6. **Streaming**: 모든 제공자에서 `stream: true` 옵션으로 스트리밍 가능

## 참고 자료

- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Claude Tool Use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use)
- [Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [GPT-5 및 Responses API 상세 문서](./docs/GPT5_API_Report.md)

## 라이선스

MIT
