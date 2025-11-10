# Examples

이 디렉토리는 LLM Function Adapter의 사용 예제를 포함하고 있습니다.

## Responses API 예제 (권장)

본 라이브러리는 **OpenAI Responses API 형식**을 표준으로 사용합니다.

### 기본 예제

1. **01-basic-chat.js** - 기본 채팅 및 여러 제공자 사용
   ```bash
   node examples/01-basic-chat.js
   ```

2. **02-streaming.js** - 스트리밍 응답 처리
   ```bash
   node examples/02-streaming.js
   ```

3. **03-function-calling.js** - Function Calling / Tool Use
   ```bash
   node examples/03-function-calling.js
   ```

4. **06-all-providers.js** - 모든 제공자 비교 (OpenAI, Claude, Gemini, Ollama)
   ```bash
   node examples/06-all-providers.js
   ```

5. **basic-usage.js** - 기본 사용법 종합
   ```bash
   node examples/basic-usage.js
   ```

6. **responses-api-example.js** - Responses API 상세 예제
   ```bash
   node examples/responses-api-example.js
   ```

## 레거시 예제

- **converter-test.js** - Chat Completions API 컨버터 테스트 (하위 호환성용)

## 환경 변수 설정

예제를 실행하기 전에 필요한 API 키를 설정하세요:

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

## Responses API vs Chat Completions API

본 라이브러리는 **Responses API** 형식을 기본으로 사용합니다:

### Responses API (권장)
```javascript
const client = new UnifiedLLMClient({
  provider: 'claude',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-haiku-20240307'
});

const response = await client.response({
  input: 'Hello!',
  max_output_tokens: 100
});

// 응답 구조
// response.output[0].content[0].text
```

### Chat Completions API (레거시)
```javascript
// 레거시 컨버터를 통해 여전히 지원됨
import { convertRequestToClaudeFormat } from '../src/index.js';
```

## 기능별 예제

### 텍스트 생성
- 01-basic-chat.js
- responses-api-example.js

### 스트리밍
- 02-streaming.js
- 06-all-providers.js (streamingComparison)

### Function Calling
- 03-function-calling.js
- basic-usage.js
- responses-api-example.js

### Multi-turn 대화
- responses-api-example.js (multiTurnExample)
- 03-function-calling.js (completeFunctionCallFlow)

### 여러 제공자 사용
- 06-all-providers.js
- 01-basic-chat.js (multipleModels)

## 추가 정보

더 자세한 정보는 프로젝트 루트의 README.md를 참조하세요.
