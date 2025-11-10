# Changelog

## [0.1.0] - 2025-01-10

### Added
- ✅ **두 가지 OpenAI API 지원**
  - Chat Completions API (기본값, `/v1/chat/completions`)
  - Responses API (gpt-5, `/v1/responses`)
  - `apiType` 옵션으로 선택 가능

- ✅ **통합 LLM 클라이언트**
  - OpenAI, Claude, Gemini, Ollama 통합 지원
  - OpenAI 형식으로 모든 요청/응답 통일

- ✅ **Schema 변환기**
  - OpenAI ↔ Claude
  - OpenAI ↔ Gemini
  - OpenAI ↔ Ollama
  - Chat Completions ↔ Responses API

- ✅ **Function Calling 지원**
  - 모든 provider에서 tools/functions 사용 가능
  - Multi-turn 대화 지원
  - Tool results 자동 변환

- ✅ **문서화**
  - OpenAI.md - OpenAI Function Calling Schema
  - Claude.md - Claude Tool Use Schema
  - Gemini.md - Gemini Function Calling Schema
  - Ollama.md - Ollama Function Calling Schema
  - OpenAI-API-Comparison.md - 두 OpenAI API 비교

- ✅ **예시 코드**
  - basic-usage.js - 기본 사용법
  - openai-both-apis.js - OpenAI 두 API 사용법
  - converter-test.js - 컨버터 테스트

- ✅ **에러 처리**
  - 모든 API 호출에 try-catch
  - Provider별 명확한 에러 메시지

- ✅ **검증**
  - Context7을 통한 공식 문서 검증
  - VERIFICATION_REPORT.md 생성

### Features

#### UnifiedLLMClient
```javascript
const client = new UnifiedLLMClient({
  provider: 'openai',           // 'openai', 'claude', 'gemini', 'ollama'
  apiType: 'chat-completions',  // 'chat-completions' (default), 'responses'
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o'               // or 'gpt-5' for Responses API
});
```

#### 자동 변환
- OpenAI 형식 요청 → 각 provider 형식으로 자동 변환
- 각 provider 응답 → OpenAI 형식으로 자동 변환
- Responses API 응답 → Chat Completions 형식으로 자동 변환

#### 지원 모델
- OpenAI: gpt-4o, gpt-4-turbo, gpt-5 (Responses API)
- Claude: claude-sonnet-4-5, claude-opus-4
- Gemini: gemini-2.5-flash, gemini-pro
- Ollama: llama3.2, mistral, qwen2.5 등

### Known Limitations
- Streaming 미지원 (향후 추가 예정)
- Gemini tool result에서 function name 추적이 heuristic 기반
- Responses API는 OpenAI SDK에 아직 공식 지원되지 않아 fetch 사용

### Dependencies
- openai: ^4.0.0
- @anthropic-ai/sdk: ^0.20.0
- @google/generative-ai: ^0.2.0

### Breaking Changes
- None (첫 릴리스)

## [Upcoming]

### Planned Features
- [ ] Streaming 지원
- [ ] Batch API 지원
- [ ] Vision 지원 (이미지 입력)
- [ ] Audio 지원
- [ ] Rate limiting 처리
- [ ] Retry 로직
- [ ] Caching 지원
- [ ] TypeScript 타입 정의
