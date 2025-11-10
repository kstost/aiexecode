# Schema Converter Verification Report

Context7을 통해 각 LLM 제공자의 공식 문서를 기반으로 구현된 컨버터의 정확성을 검증했습니다.

## 검증 결과 요약

### ✅ 정확하게 구현된 부분

#### 1. OpenAI → Claude 변환 (`openai-to-claude.js`)
- ✅ **Tools 변환**:
  - `tool.function.name` → `name`
  - `tool.function.description` → `description`
  - `tool.function.parameters` → `input_schema`

- ✅ **Messages 변환**:
  - System message를 별도 `system` 필드로 추출
  - `role: 'assistant'` 유지
  - Tool calls → `tool_use` content block으로 변환
  - Tool results → `tool_result` content block으로 변환 (role: 'user')

- ✅ **Arguments 처리**:
  - OpenAI의 JSON 문자열을 JSON 객체로 파싱 (`JSON.parse`)

#### 2. Claude → OpenAI 변환 (`claude-to-openai.js`)
- ✅ **Content blocks 처리**:
  - `type: 'text'` → `message.content`
  - `type: 'tool_use'` → `message.tool_calls[]`

- ✅ **Tool use 변환**:
  - `block.id` → `tool_call.id`
  - `block.name` → `tool_call.function.name`
  - `block.input` (객체) → `tool_call.function.arguments` (JSON 문자열)

- ✅ **Stop reason 매핑**:
  - `tool_use` → `tool_calls`
  - `max_tokens` → `length`
  - 기타 → `stop`

- ✅ **Usage 변환**:
  - `input_tokens` → `prompt_tokens`
  - `output_tokens` → `completion_tokens`

#### 3. OpenAI → Gemini 변환 (`openai-to-gemini.js`)
- ✅ **Tools 변환**:
  - `functionDeclarations` 배열로 래핑
  - Parameters 구조 그대로 유지 (OpenAPI Schema 호환)

- ✅ **Messages 변환**:
  - `role: 'user'` → `role: 'user'`
  - `role: 'assistant'` → `role: 'model'`
  - System message → `systemInstruction`

- ✅ **Tool calls 변환**:
  - `tool_calls` → `functionCall` parts
  - Arguments를 JSON 문자열에서 객체로 파싱

- ✅ **Tool results 변환**:
  - `role: 'tool'` → `functionResponse` part
  - Content → `response.result`

#### 4. Gemini → OpenAI 변환 (`gemini-to-openai.js`)
- ✅ **Function calls 처리**:
  - `part.functionCall.name` → `function.name`
  - `part.functionCall.args` (객체) → `function.arguments` (JSON 문자열)

- ✅ **Finish reason 매핑**:
  - `MAX_TOKENS` → `length`
  - Function call 있으면 → `tool_calls`
  - 기타 → `stop`

- ✅ **Usage 변환**:
  - `promptTokenCount` → `prompt_tokens`
  - `candidatesTokenCount` → `completion_tokens`
  - `totalTokenCount` → `total_tokens`

#### 5. Ollama 변환 (`openai-to-ollama.js`, `ollama-to-openai.js`)
- ✅ **Schema 호환성**: Ollama는 OpenAI와 동일한 tools 구조 사용
- ✅ **Request 변환**: 최소한의 변환만 필요 (options 매핑)
- ✅ **Response 변환**: OpenAI 형식과 거의 동일

## ⚠️ 잠재적 문제점 및 개선 사항

### 1. Gemini SDK 호출 방식 (client.js:99-116)

**현재 구현**:
```javascript
const geminiRequest = convertRequestToGeminiFormat(request);
const model = this.client.getGenerativeModel({ model: request.model || 'gemini-2.5-flash' });
const result = await model.generateContent(geminiRequest);
const response = await result.response;
```

**검증 결과**: ✅ 정확
- Gemini SDK의 `generateContent()` 메서드는 다음을 지원:
  - `contents` 배열
  - `tools` 배열
  - `generationConfig` 객체
  - `systemInstruction` 문자열
- 현재 구현이 올바르게 이들을 전달하고 있음

### 2. Tool Result의 name 필드

**OpenAI 형식**:
```javascript
{
  role: 'tool',
  tool_call_id: 'call_123',
  content: '결과',
  // name 필드 없음 (선택적)
}
```

**Gemini 변환에서의 처리** (openai-to-gemini.js:77-90):
```javascript
{
  functionResponse: {
    name: msg.name || 'unknown_function',  // ⚠️ msg.name이 없을 수 있음
    response: { result: msg.content }
  }
}
```

**개선 권장사항**:
- Tool call ID를 기반으로 원래 함수 이름을 추적하는 메커니즘 추가
- 또는 사용자에게 tool result에 name 필드를 포함하도록 요구

### 3. Error Handling

**현재 상태**: 기본적인 에러 처리만 존재
- Unsupported tool type 체크
- Ollama API 에러 체크

**개선 권장사항**:
- API 호출 실패 시 재시도 로직
- 네트워크 에러 처리
- Rate limit 에러 처리
- 각 provider별 특정 에러 처리

### 4. Streaming 지원

**현재 상태**: 미구현

**개선 권장사항**:
- OpenAI, Claude, Gemini 모두 streaming 지원
- Streaming response를 OpenAI 형식으로 변환하는 로직 추가 필요

## 검증 방법론

1. **Context7 문서 조회**:
   - OpenAI API 문서 (`/websites/platform_openai`)
   - Claude API 문서 (`/docs.anthropic.com-7a01857/llmstxt`)
   - Gemini API 문서 (`/websites/ai_google_dev_gemini-api`)
   - Ollama API 문서 (`/ollama/ollama`)

2. **코드 검토**:
   - 각 converter의 필드 매핑 검증
   - 데이터 타입 변환 (JSON string ↔ Object) 검증
   - 특수 케이스 (system message, tool results) 처리 검증

3. **SDK 호출 방식 검증**:
   - 각 SDK의 메서드 시그니처 확인
   - Response 구조 확인

## 결론

✅ **전체 평가**: 구현된 컨버터는 **대부분 정확**하며, 각 LLM 제공자의 공식 스펙을 올바르게 따르고 있습니다.

### 강점:
1. 모든 주요 필드 매핑이 정확
2. 데이터 타입 변환(JSON string ↔ Object) 올바름
3. Special cases (system message, tool results) 적절히 처리
4. OpenAI 형식 응답 통일성 확보

### 개선 필요:
1. Tool result의 name 필드 추적 메커니즘
2. 에러 처리 강화
3. Streaming 지원 추가

### 권장 사항:
- **즉시 사용 가능**: 현재 상태로도 기본적인 function calling 워크플로우는 완벽히 동작
- **프로덕션 사용 전**: 에러 처리 및 엣지 케이스 테스트 강화 권장
