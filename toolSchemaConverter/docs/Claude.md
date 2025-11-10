# Claude (Anthropic) Tool Use Schema

## 개요
Claude API는 Tool Use (Function Calling)를 통해 외부 도구와의 상호작용을 지원합니다. Claude는 사용자의 요청을 분석하여 적절한 도구를 선택하고 호출할 수 있습니다.

## Schema 구조

### 기본 구조
```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "tools": [
    {
      "name": "tool_name",
      "description": "Tool description",
      "input_schema": {
        "type": "object",
        "properties": {
          "param_name": {
            "type": "string",
            "description": "Parameter description"
          }
        },
        "required": ["param_name"]
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "User message"
    }
  ]
}
```

### 주요 필드

#### 1. tools (array)
Tool 정의 배열. 각 tool은 다음 필드를 포함:

- **name** (string, required): 도구의 이름
- **description** (string, required): 도구의 기능 설명
- **input_schema** (object, required): JSON Schema 형식의 입력 파라미터 정의

#### 2. input_schema (object)
JSON Schema 형식을 따름:
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
      "enum": ["celsius", "fahrenheit"]
    }
  },
  "required": ["location"]
}
```

#### 3. messages (array)
대화 히스토리. Tool 사용 시 특별한 content 블록 포함:
- **role**: `"user"` | `"assistant"`
- **content**: string 또는 content block 배열

## Response 구조

### Tool Use Response
```json
{
  "id": "msg_abc123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_xyz789",
      "name": "get_weather",
      "input": {
        "location": "San Francisco, CA"
      }
    }
  ],
  "model": "claude-sonnet-4-5",
  "stop_reason": "tool_use",
  "usage": {
    "input_tokens": 50,
    "output_tokens": 30
  }
}
```

### Tool Result 전달
도구 실행 결과를 Claude에게 반환:
```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_xyz789",
      "content": "The weather in San Francisco is sunny and 70°F"
    }
  ]
}
```

#### Tool Result with Multiple Content Types
```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_xyz789",
      "content": [
        {
          "type": "text",
          "text": "Temperature: 15°C"
        },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "/9j/4AAQSkZJRg..."
          }
        }
      ]
    }
  ]
}
```

## 예시

### Python SDK
```python
from anthropic import Anthropic

client = Anthropic()

tools = [
    {
        "name": "get_weather",
        "description": "Get the current weather in a given location",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city and state, e.g. San Francisco, CA"
                }
            },
            "required": ["location"]
        }
    }
]

response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    tools=tools,
    messages=[
        {
            "role": "user",
            "content": "What is the weather like in San Francisco?"
        }
    ]
)

# Check if tool was used
if response.stop_reason == "tool_use":
    for content in response.content:
        if content.type == "tool_use":
            print(f"Tool: {content.name}")
            print(f"Input: {content.input}")
```

### TypeScript SDK
```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const tools = [
  {
    name: "get_weather",
    description: "Get the current weather in a given location",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The city and state, e.g. San Francisco, CA",
        },
      },
      required: ["location"],
    },
  },
];

const response = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  tools,
  messages: [
    {
      role: "user",
      content: "What is the weather like in San Francisco?",
    },
  ],
});
```

## 특징

### 1. Tool Use Workflow
1. **요청**: tools 배열과 함께 메시지 전송
2. **응답**: `stop_reason: "tool_use"` 일 때, content에 `tool_use` 블록 포함
3. **실행**: 클라이언트가 도구 실행
4. **결과 전달**: `tool_result` 블록으로 결과 반환
5. **최종 응답**: Claude가 결과를 바탕으로 최종 답변 생성

### 2. Parallel Tool Calls
Claude는 여러 도구를 동시에 호출할 수 있음:
```python
# Multiple tool_use blocks in response
response.content = [
    {
        "type": "tool_use",
        "id": "toolu_1",
        "name": "get_weather",
        "input": {"location": "Paris"}
    },
    {
        "type": "tool_use",
        "id": "toolu_2",
        "name": "get_weather",
        "input": {"location": "London"}
    }
]
```

### 3. Tool Result 옵션

#### Error Handling
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_xyz",
  "content": "Error: City not found",
  "is_error": true
}
```

#### Empty Result
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_xyz"
}
```

### 4. 좋은 Tool Description 작성
```json
{
  "name": "get_stock_price",
  "description": "Retrieves the current stock price for a given stock ticker. The ticker must be a valid symbol for a company publicly traded on a major US stock exchange like the NYSE or NASDAQ. The tool will return the latest trading price in USD. This tool should be used when the user is asking for the current or latest price of a specific stock. It will not provide any other information about the stock or company.",
  "input_schema": {
    "type": "object",
    "properties": {
      "ticker": {
        "type": "string",
        "description": "The stock ticker symbol for the company (e.g., AAPL, MSFT)."
      }
    },
    "required": ["ticker"]
  }
}
```

### 5. MCP (Model Context Protocol) 지원
Claude는 MCP 서버를 통한 도구 사용도 지원:
```json
{
  "type": "mcp_tool_use",
  "id": "toolu_123",
  "realm": "my_mcp_server",
  "tool": {
    "name": "get_weather",
    "input": {
      "location": "San Francisco, CA"
    }
  }
}
```

### 6. Prompt Caching
도구 정의를 캐싱하여 비용과 지연 시간 절감:
```python
# Tool definitions can be cached
response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    tools=tools,  # This will be cached
    messages=messages
)
```

## 지원되는 데이터 타입
- `string`
- `number` / `integer`
- `boolean`
- `array`
- `object`
- `enum`

## 주의사항

1. **도구 실행은 클라이언트 책임**: Claude는 도구를 직접 실행하지 않음
2. **Tool Result 순서**: tool_result 블록은 content 배열의 가장 앞에 위치해야 함
3. **Input은 JSON 객체**: 문자열이 아닌 객체로 직접 반환됨 (OpenAI와 차이점)
4. **stop_reason 확인 필수**: `tool_use` 여부를 항상 확인해야 함
5. **Multiple turns**: 복잡한 작업은 여러 차례의 tool use를 거칠 수 있음

## 참고 자료
- [Claude Tool Use Documentation](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use)
- [Anthropic API Reference](https://docs.anthropic.com/en/api)
- [Claude Agent SDK](https://docs.anthropic.com/en/api/agent-sdk)
