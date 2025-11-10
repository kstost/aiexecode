# OpenAI GPT-5 모델 및 API 사용법 조사 보고서

## 목차
1. [개요](#1-개요)
2. [GPT-5 모델 특징](#2-gpt-5-모델-특징)
3. [Responses API vs Chat Completions API](#3-responses-api-vs-chat-completions-api)
4. [Responses API 상세 사양](#4-responses-api-상세-사양)
5. [Harmony 응답 포맷](#5-harmony-응답-포맷)
6. [프롬프팅 베스트 프랙티스](#6-프롬프팅-베스트-프랙티스)
7. [코드 예제](#7-코드-예제)
8. [마이그레이션 가이드](#8-마이그레이션-가이드)
9. [제한사항 및 주의사항](#9-제한사항-및-주의사항)

---

## 1. 개요

### GPT-5란?
GPT-5는 OpenAI의 최신 대규모 언어 모델로, 이전 모델 대비 다음과 같은 개선사항을 제공합니다:
- **고급 추론 능력**: Chain of Thought (CoT) 기반 추론
- **에이전트 작업 최적화**: 자율적인 다단계 작업 수행
- **향상된 명령 준수**: 정확한 지시 따르기
- **도구 사용 능력**: 커스텀 도구 통합 지원

### 사용 가능한 모델
- **gpt-5**: 기본 모델
- **gpt-5-mini**: 경량화 모델
- **gpt-5-nano**: 초경량 모델

---

## 2. GPT-5 모델 특징

### 2.1 Chain of Thought (CoT) 지원
GPT-5는 내장된 추론 과정을 통해 복잡한 문제를 단계별로 해결합니다.

**주요 이점:**
- 턴 간 CoT 전달로 향상된 지능
- 생성된 추론 토큰 감소
- 캐시 히트율 증가
- 응답 지연 시간 감소

### 2.2 추론 노력(Reasoning Effort) 제어
4단계의 추론 노력 수준 제공:
- **minimal**: 최소한의 추론
- **low**: 낮은 수준의 추론
- **medium**: 중간 수준의 추론 (기본값)
- **high**: 높은 수준의 추론

### 2.3 출력 상세도(Verbosity) 제어
3단계의 출력 상세도 제공:
- **low**: 간결한 응답
- **medium**: 중간 수준의 상세도
- **high**: 매우 상세한 응답

### 2.4 커스텀 도구 지원
개발자가 정의한 커스텀 도구를 모델이 사용할 수 있습니다:
```json
{
  "type": "custom",
  "name": "code_exec",
  "description": "Executes arbitrary python code"
}
```

---

## 3. Responses API vs Chat Completions API

### 3.1 Responses API (권장)

**엔드포인트:** `POST /v1/responses`

**특징:**
- ✅ GPT-5 전용 설계
- ✅ Chain of Thought 완벽 지원
- ✅ 턴 간 CoT 전달 가능
- ✅ 향상된 성능 및 효율성
- ✅ reasoning, text, tools 등 세밀한 제어

**기본 요청 구조:**
```json
{
  "model": "gpt-5",
  "input": "사용자 입력",
  "reasoning": {
    "effort": "medium"
  },
  "text": {
    "verbosity": "medium"
  },
  "max_output_tokens": 1000,
  "tools": []
}
```

### 3.2 Chat Completions API (호환성)

**엔드포인트:** `POST /v1/chat/completions`

**특징:**
- ⚠️ GPT-5 제한적 지원
- ⚠️ CoT 기능 제한
- ✅ 기존 코드 호환성
- ✅ 익숙한 인터페이스

**GPT-5용 요청 구조:**
```json
{
  "model": "gpt-5",
  "messages": [
    {"role": "user", "content": "질문"}
  ],
  "reasoning_effort": "medium",
  "verbosity": "low",
  "tools": []
}
```

**주요 차이점:**

| 항목 | Responses API | Chat Completions API |
|------|---------------|---------------------|
| 엔드포인트 | `/v1/responses` | `/v1/chat/completions` |
| 입력 형식 | `input` (문자열) | `messages` (배열) |
| CoT 지원 | 완전 지원 | 제한적 |
| 추론 제어 | `reasoning.effort` | `reasoning_effort` |
| 상세도 제어 | `text.verbosity` | `verbosity` |
| 권장 사항 | ✅ GPT-5 권장 | ⚠️ 호환성 목적 |

---

## 4. Responses API 상세 사양

### 4.1 요청 파라미터

#### 필수 파라미터
```typescript
{
  model: string;        // "gpt-5", "gpt-5-mini", "gpt-5-nano"
  input: string;        // 사용자 입력 프롬프트
}
```

#### 선택적 파라미터
```typescript
{
  reasoning?: {
    effort: "minimal" | "low" | "medium" | "high";
  };

  text?: {
    verbosity: "low" | "medium" | "high";
  };

  max_output_tokens?: number;  // 출력 최대 토큰 수

  tools?: Array<{
    type: "custom";
    name: string;
    description?: string;
  }>;
}
```

### 4.2 응답 구조

```typescript
{
  id: string;                    // 응답 고유 ID
  object: "response";            // 객체 타입
  created: number;               // Unix 타임스탬프
  model: string;                 // 사용된 모델
  choices: [
    {
      index: number;
      message: {
        role: "assistant";
        content: string;         // 생성된 텍스트
        tool_calls?: Array<{     // 도구 호출 (선택적)
          ...
        }>;
      };
      finish_reason: string;     // "stop" | "length" | "tool_calls"
    }
  ];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### 4.3 지원되지 않는 파라미터

**중요:** GPT-5 모델 사용 시 다음 파라미터는 **지원되지 않으며** 오류를 발생시킵니다:
- ❌ `temperature`
- ❌ `top_p`
- ❌ `logprobs`

---

## 5. Harmony 응답 포맷

GPT-5는 내부적으로 **Harmony** 포맷을 사용합니다. 이는 구조화된 대화 및 추론 과정을 표현하기 위한 특수 포맷입니다.

### 5.1 특수 토큰

```
<|start|>     - 메시지 시작 (Token ID: 200006)
<|end|>       - 메시지 종료 (Token ID: 200007)
<|message|>   - 헤더에서 콘텐츠로 전환 (Token ID: 200008)
<|channel|>   - 채널 정보로 전환 (Token ID: 200005)
<|constrain|> - 데이터 타입 정의 (Token ID: 200003)
<|return|>    - 응답 완료 (Token ID: 200002)
<|call|>      - 도구 호출 (Token ID: 200012)
```

### 5.2 메시지 구조

```
<|start|>{role}<|channel|>{channel}<|message|>{content}<|end|>
```

**예시:**
```
<|start|>assistant<|channel|>analysis<|message|>사용자가 2+2를 물었습니다. 간단한 산술 계산입니다.<|end|>
<|start|>assistant<|channel|>final<|message|>2 + 2 = 4입니다.<|return|>
```

### 5.3 메시지 역할 (Roles)

- **system**: 시스템 설정 (추론 노력, 메타 정보, 내장 도구)
- **developer**: 개발자 지침 (시스템 프롬프트, 사용 가능한 함수 도구)
- **user**: 사용자 입력
- **assistant**: 모델 출력 (도구 호출 또는 메시지)
- **tool**: 도구 실행 결과

**역할 우선순위:** `system > developer > user > assistant > tool`

### 5.4 채널 (Channels)

GPT-5는 3가지 채널을 사용하여 메시지를 분류합니다:

- **final**: 최종 사용자에게 표시되는 응답
- **analysis**: Chain of Thought (CoT) - 모델의 내부 추론 과정
- **commentary**: 함수 도구 호출 및 내장 도구 사용

### 5.5 시스템 메시지 예시

```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2025-06-28

Reasoning: high

# Valid channels: analysis, commentary, final. Channel must be included for every message.
Calls to these tools must go to the commentary channel: 'functions'.<|end|>
```

### 5.6 개발자 메시지 예시 (도구 정의)

```
<|start|>developer<|message|># Instructions

Always respond in riddles

# Tools

## functions

namespace functions {

// Gets the current weather in the provided location.
type get_current_weather = (_: {
  location: string,  // The city and state, e.g. San Francisco, CA
  format?: "celsius" | "fahrenheit",  // default: celsius
}) => any;

} // namespace functions<|end|>
```

### 5.7 도구 호출 흐름

**1. 분석 단계:**
```
<|start|>assistant<|channel|>analysis<|message|>날씨 정보를 얻기 위해 get_weather 함수를 사용해야 합니다.<|end|>
```

**2. 도구 호출:**
```
<|start|>assistant<|channel|>commentary to=functions.get_weather<|constrain|>json<|message|>{"location":"San Francisco"}<|call|>
```

**3. 도구 응답:**
```
<|start|>functions.get_weather to=assistant<|channel|>commentary<|message|>{"sunny": true, "temperature": 20}<|end|>
```

**4. 최종 응답:**
```
<|start|>assistant<|channel|>final<|message|>샌프란시스코는 현재 맑은 날씨이며 기온은 20도입니다.<|return|>
```

---

## 6. 프롬프팅 베스트 프랙티스

### 6.1 에이전트 작업 (Agentic Tasks)

GPT-5는 자율적인 다단계 작업 수행에 최적화되어 있습니다.

**권장 프롬프트 패턴:**
```
Remember, you are an agent - please keep going until the user's query
is completely resolved, before ending your turn and yielding back to the user.
Decompose the user's query into all required sub-requests, and confirm that
each is completed. Do not stop after completing only part of the request.
Only terminate your turn when you are sure that the problem is solved.
```

**핵심 원칙:**
- ✅ 작업을 하위 작업으로 분해
- ✅ 각 하위 작업 완료 확인
- ✅ 부분 완료 후 중단하지 않기
- ✅ 문제가 완전히 해결될 때까지 계속 진행

### 6.2 자율성 (Autonomy) 프롬프팅

**Cursor의 사례 연구:**

**Before (과도한 장려):**
```
Be THOROUGH when gathering information. Make sure you have the FULL picture
before replying. Use additional tool calls or clarifying questions as needed.
```
❌ 문제: GPT-5가 작은 작업에서도 도구를 과도하게 사용

**After (균형잡힌 접근):**
```
If you've performed an edit that may partially fulfill the USER's query,
but you're not confident, gather more information or use more tools before
ending your turn.
Bias towards not asking the user for help if you can find the answer yourself.
```
✅ 개선: 내부 지식과 외부 도구 사용의 균형

### 6.3 코딩 작업 프롬프팅

**명확성 우선:**
```
Write code for clarity first. Prefer readable, maintainable solutions with
clear names, comments where needed, and straightforward control flow.
Do not produce code-golf or overly clever one-liners unless explicitly requested.
Use high verbosity for writing code and code tools.
```

**적극적인 코드 편집:**
```
Be aware that the code edits you make will be displayed to the user as
proposed changes, which means (a) your code edits can be quite proactive,
as the user can always reject, and (b) your code should be well-written
and easy to quickly review.
```

### 6.4 충돌하는 지시사항 피하기

**나쁜 예 (모순된 지침):**
```
- Never schedule an appointment without explicit patient consent recorded in the chart
- auto-assign the earliest same-day slot without contacting the patient
```

**좋은 예 (명확한 지침):**
```
1. Always look up the patient profile before taking any other actions
2. For high-urgency symptoms, escalate as EMERGENCY first
3. Only schedule with explicit consent
```

### 6.5 구조화된 사양 사용

Cursor 팀이 발견한 패턴:
```xml
<instruction_spec>
  <goal>사용자 쿼리 완전히 해결</goal>
  <approach>단계별 분해 및 확인</approach>
  <tools>필요시 적극 활용</tools>
</instruction_spec>
```

XML 형식의 구조화된 사양이 명령 준수를 향상시킵니다.

### 6.6 추론 노력 수준 선택 가이드

| 작업 유형 | 권장 노력 수준 | 이유 |
|----------|---------------|------|
| 간단한 질문 | minimal/low | 과도한 추론 불필요 |
| 복잡한 수학 문제 | high | 단계별 검증 필요 |
| 코드 생성 | medium/high | 엣지 케이스 고려 |
| 일반 대화 | low/medium | 자연스러운 응답 |
| 다단계 계획 | high | 전체적인 분석 필요 |

---

## 7. 코드 예제

### 7.1 기본 Responses API 호출

**Python:**
```python
import openai

client = openai.OpenAI(api_key="your-api-key")

response = client.post(
    "/v1/responses",
    json={
        "model": "gpt-5",
        "input": "What is 2 + 2?",
        "reasoning": {
            "effort": "minimal"
        },
        "text": {
            "verbosity": "low"
        }
    }
)

print(response.json())
```

**JavaScript/TypeScript:**
```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
  },
  body: JSON.stringify({
    model: 'gpt-5',
    input: 'What is 2 + 2?',
    reasoning: {
      effort: 'minimal'
    },
    text: {
      verbosity: 'low'
    }
  })
});

const data = await response.json();
console.log(data);
```

**cURL:**
```bash
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-5",
    "input": "What is 2 + 2?",
    "reasoning": {
      "effort": "minimal"
    }
  }'
```

### 7.2 커스텀 도구 사용

```javascript
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
  },
  body: JSON.stringify({
    model: 'gpt-5',
    input: 'Use the code_exec tool to calculate the area of a circle with radius 5',
    tools: [
      {
        type: 'custom',
        name: 'code_exec',
        description: 'Executes arbitrary python code'
      }
    ]
  })
});
```

### 7.3 Harmony 포맷 사용 (Python)

```python
from openai_harmony import (
    Author,
    Conversation,
    DeveloperContent,
    HarmonyEncodingName,
    Message,
    Role,
    SystemContent,
    ToolDescription,
    load_harmony_encoding,
    ReasoningEffort
)

# 인코딩 로드
encoding = load_harmony_encoding(HarmonyEncodingName.HARMONY_GPT_OSS)

# 시스템 메시지 구성
system_message = (
    SystemContent.new()
        .with_model_identity(
            "You are ChatGPT, a large language model trained by OpenAI."
        )
        .with_reasoning_effort(ReasoningEffort.HIGH)
        .with_conversation_start_date("2025-06-28")
        .with_knowledge_cutoff("2024-06")
        .with_required_channels(["analysis", "commentary", "final"])
)

# 개발자 메시지 (도구 정의)
developer_message = (
    DeveloperContent.new()
        .with_instructions("Always respond in riddles")
        .with_tools([
            ToolDescription.new(
                "get_current_weather",
                "Gets the current weather in the provided location.",
                parameters={
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "The city and state, e.g. San Francisco, CA"
                        },
                        "format": {
                            "type": "string",
                            "enum": ["celsius", "fahrenheit"],
                            "default": "celsius"
                        }
                    },
                    "required": ["location"]
                }
            )
        ])
)

# 대화 생성
convo = Conversation.from_messages([
    Message.from_role_and_content(Role.SYSTEM, system_message),
    Message.from_role_and_content(Role.DEVELOPER, developer_message),
    Message.from_role_and_content(Role.USER, "What is the weather in Tokyo?")
])

# 완성을 위한 토큰으로 렌더링
tokens = encoding.render_conversation_for_completion(convo, Role.ASSISTANT)

# 모델 응답 후, 토큰을 메시지로 파싱
parsed_response = encoding.parse_messages_from_completion_tokens(
    new_tokens,
    Role.ASSISTANT
)
```

### 7.4 스트리밍 파싱 (Python)

```python
from openai_harmony import (
    load_harmony_encoding,
    StreamableParser,
    HarmonyEncodingName,
    Role
)

encoding = load_harmony_encoding(HarmonyEncodingName.HARMONY_GPT_OSS)
stream = StreamableParser(encoding, role=Role.ASSISTANT)

# 토큰을 하나씩 처리
for token in streaming_tokens:
    stream.process(token)
    print("Current channel:", stream.current_channel)
    print("Content delta:", stream.last_content_delta)
    print("Full content:", stream.current_content)
```

---

## 8. 마이그레이션 가이드

### 8.1 Chat Completions에서 Responses API로

**Before (Chat Completions):**
```python
response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is 2 + 2?"}
    ],
    temperature=0.7,
    max_tokens=100
)
```

**After (Responses API):**
```python
response = requests.post(
    "https://api.openai.com/v1/responses",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
    json={
        "model": "gpt-5",
        "input": "What is 2 + 2?",
        "reasoning": {"effort": "low"},
        "text": {"verbosity": "medium"},
        "max_output_tokens": 100
    }
)
```

### 8.2 주요 변경사항

| Chat Completions | Responses API | 변경 내용 |
|-----------------|---------------|----------|
| `messages` | `input` | 배열 → 문자열 |
| `temperature` | ❌ 제거 | `reasoning.effort` 사용 |
| `top_p` | ❌ 제거 | 지원 안 함 |
| `max_tokens` | `max_output_tokens` | 이름 변경 |
| N/A | `reasoning` | 새로운 파라미터 |
| N/A | `text` | 새로운 파라미터 |

### 8.3 자동 마이그레이션 도구

OpenAI는 마이그레이션 팩을 제공합니다:
```bash
# OpenAI Completions → Responses Migration Pack
# Codex CLI를 사용하여 자동 마이그레이션
```

---

## 9. 제한사항 및 주의사항

### 9.1 지원되지 않는 기능

**Responses API에서 지원 안 함:**
- ❌ `temperature` 파라미터
- ❌ `top_p` 파라미터
- ❌ `logprobs` 파라미터
- ⚠️ Streaming (현재 미지원, 향후 추가 예정)

### 9.2 Chat Completions API 제한사항

GPT-5를 Chat Completions API로 사용 시:
- ⚠️ Chain of Thought 기능 제한
- ⚠️ 추론 제어 제한적
- ⚠️ 최적화된 성능 미제공
- ✅ 기본 호환성만 제공

### 9.3 비용 고려사항

GPT-5는 고급 모델이므로:
- 💰 이전 모델보다 높은 비용
- 💰 추론 토큰 추가 비용 가능
- ✅ 추론 노력 수준 조정으로 비용 최적화 가능
- ✅ 캐시 히트율 증가로 장기적 비용 절감

### 9.4 모델별 기능 차이

| 기능 | gpt-5 | gpt-5-mini | gpt-5-nano |
|------|-------|------------|-----------|
| CoT 지원 | ✅ | ✅ | ✅ |
| 추론 노력 | ✅ 전체 | ✅ 제한적 | ⚠️ 최소 |
| 커스텀 도구 | ✅ | ✅ | ⚠️ 제한적 |
| 응답 속도 | 보통 | 빠름 | 매우 빠름 |
| 비용 | 높음 | 중간 | 낮음 |

### 9.5 프로덕션 사용 권장사항

1. **Responses API 우선 사용**
   - GPT-5의 모든 기능 활용
   - 향상된 성능 및 효율성

2. **적절한 추론 노력 수준 선택**
   - 간단한 작업: minimal/low
   - 복잡한 작업: medium/high

3. **에러 처리 강화**
   - API 오류 처리
   - 재시도 로직 구현
   - Rate limiting 고려

4. **모니터링 및 로깅**
   - API 사용량 추적
   - 응답 시간 모니터링
   - 비용 추적

---

## 부록: 참고 자료

### 공식 문서
- [OpenAI Platform Documentation](https://platform.openai.com/docs)
- [GPT-5 Prompting Guide](https://nbviewer.org/format/script/github/openai/openai-cookbook/blob/main/examples/gpt-5/gpt-5_prompting_guide)
- [OpenAI Harmony Format](https://github.com/openai/harmony)
- [Responses API Starter App](https://github.com/openai/openai-responses-starter-app)

### 관련 도구
- **openai-harmony**: Python/Rust 라이브러리
- **Codex CLI**: 마이그레이션 도구
- **GPT-5 Coding Examples**: 데모 애플리케이션

### 커뮤니티 리소스
- OpenAI Cookbook
- OpenAI Developer Forum
- GitHub Issues

---

## 결론

GPT-5는 OpenAI의 가장 발전된 모델로, Responses API를 통해 최상의 성능을 제공합니다. Chain of Thought, 세밀한 추론 제어, 커스텀 도구 지원 등의 기능을 활용하여 더 지능적이고 효율적인 AI 애플리케이션을 구축할 수 있습니다.

**핵심 요약:**
- ✅ Responses API 사용 권장
- ✅ reasoning, text 파라미터로 세밀한 제어
- ✅ Harmony 포맷 이해 (고급 사용자)
- ✅ 프롬프팅 베스트 프랙티스 적용
- ⚠️ temperature, top_p 미지원 주의
- ⚠️ 스트리밍 현재 미지원

---

**보고서 작성일:** 2025-01-10
**버전:** 1.0
**작성자:** Claude (Anthropic)
**조사 방법:** Context7을 통한 공식 문서 분석
