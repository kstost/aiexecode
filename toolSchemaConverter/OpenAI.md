# OpenAI Function Calling Schema

## 개요
OpenAI API는 Function Calling을 통해 모델이 외부 도구나 함수를 호출할 수 있도록 지원합니다. 이를 통해 실시간 데이터 조회, 외부 API 호출 등의 작업을 수행할 수 있습니다.

## Schema 구조

### 기본 구조
```json
{
  "model": "gpt-4o",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "function_name",
        "description": "Function description",
        "parameters": {
          "type": "object",
          "properties": {
            "param_name": {
              "type": "string",
              "description": "Parameter description"
            }
          },
          "required": ["param_name"],
          "additionalProperties": false
        }
      },
      "strict": true
    }
  ],
  "tool_choice": "auto"
}
```

### 주요 필드

#### 1. tools (array)
- **type**: `"function"` - 툴의 타입을 지정 (현재는 function만 지원)
- **function**: 함수 정의 객체

#### 2. function (object)
- **name** (string, required): 함수의 이름
- **description** (string, optional): 함수의 설명
- **parameters** (object, required): JSON Schema 형식의 파라미터 정의
  - **type**: `"object"` (고정)
  - **properties**: 각 파라미터의 정의
  - **required**: 필수 파라미터 배열
  - **additionalProperties**: 추가 속성 허용 여부 (strict 모드에서는 false)
- **strict** (boolean, optional): Strict 모드 활성화 여부

#### 3. parameters - JSON Schema
```json
{
  "type": "object",
  "properties": {
    "location": {
      "type": "string",
      "description": "The city and state, e.g. San Francisco, CA"
    },
    "unit": {
      "type": "string",
      "enum": ["celsius", "fahrenheit"],
      "description": "The temperature unit to use"
    }
  },
  "required": ["location"]
}
```

#### 4. tool_choice (string | object)
모델의 함수 호출 동작을 제어:
- `"auto"` (기본값): 모델이 자동으로 판단
- `"required"`: 반드시 하나 이상의 함수 호출
- `"none"`: 함수 호출 안 함
- `{"type": "function", "function": {"name": "specific_function"}}`: 특정 함수 강제 호출

## Response 구조

### Function Call Response
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\": \"San Francisco, CA\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

### Function Result 전달
함수 실행 결과를 다시 모델에 전달:
```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "call_abc123",
      "content": "The weather in San Francisco is sunny and 70°F"
    }
  ]
}
```

## 예시

### Python SDK
```python
from openai import OpenAI

client = OpenAI()

tools = [
    {
        "type": "function",
        "name": "get_weather",
        "description": "Get current temperature for a given location.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "City and country e.g. Bogotá, Colombia",
                }
            },
            "required": ["location"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "What is the weather like in Paris today?"}
    ],
    tools=tools,
)
```

### JavaScript SDK
```javascript
import OpenAI from "openai";
const client = new OpenAI();

const tools = [
    {
        type: "function",
        name: "get_weather",
        description: "Get current temperature for a given location.",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "City and country e.g. Bogotá, Colombia",
                },
            },
            required: ["location"],
            additionalProperties: false,
        },
        strict: true,
    },
];

const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
        { role: "user", content: "What is the weather like in Paris today?" },
    ],
    tools,
});
```

## 특징

### 1. Strict Mode
- `strict: true` 설정 시, 모델이 정의된 스키마를 엄격하게 준수
- `additionalProperties: false` 필수
- 더 정확하고 예측 가능한 함수 호출 보장

### 2. Parallel Function Calling
- 모델이 동시에 여러 함수를 호출할 수 있음
- `tool_calls` 배열에 여러 함수 호출이 포함될 수 있음

### 3. Tool Choice Control
```json
{
  "tool_choice": {
    "type": "allowed_tools",
    "mode": "auto",
    "tools": [
      { "type": "function", "name": "get_weather" },
      { "type": "function", "name": "search_docs" }
    ]
  }
}
```

### 4. 지원되는 데이터 타입
- `string`
- `number` / `integer`
- `boolean`
- `array`
- `object`
- `enum` (특정 값들의 집합)
- `null`

## 주의사항

1. **함수 실행은 클라이언트 측에서**: OpenAI는 함수를 직접 실행하지 않고, 호출 의도만 반환
2. **arguments는 JSON 문자열**: 파싱 필요
3. **비용**: Function calling 사용 시 추가 토큰 소비
4. **Streaming 지원**: 실시간으로 함수 호출 인자를 받을 수 있음

## 참고 자료
- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
