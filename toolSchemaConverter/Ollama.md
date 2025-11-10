# Ollama Function Calling Schema

## 개요
Ollama는 OpenAI와 유사한 Function Calling 인터페이스를 제공하여 로컬에서 실행되는 LLM이 외부 도구를 사용할 수 있도록 지원합니다. Ollama의 Tool 스키마는 OpenAI API와 높은 호환성을 가지고 있습니다.

## Schema 구조

### 기본 구조
```json
{
  "model": "llama3.2",
  "messages": [
    {
      "role": "user",
      "content": "User message"
    }
  ],
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
          "required": ["param_name"]
        }
      }
    }
  ],
  "stream": false
}
```

### 주요 필드

#### 1. tools (array)
Tool 정의 배열. 각 tool은:

- **type** (string, required): `"function"` (현재는 function만 지원)
- **function** (object, required): 함수 정의 객체

#### 2. function (object)
- **name** (string, required): 함수의 이름
- **description** (string, required): 함수의 기능 설명
- **parameters** (object, required): JSON Schema 형식의 파라미터 정의

#### 3. parameters - JSON Schema
```json
{
  "type": "object",
  "properties": {
    "city": {
      "type": "string",
      "description": "The city to get the weather for"
    },
    "format": {
      "type": "string",
      "description": "The format to return the weather in",
      "enum": ["celsius", "fahrenheit"]
    }
  },
  "required": ["city"]
}
```

#### 4. stream (boolean)
- `true`: 스트리밍 응답 (기본값)
- `false`: 단일 JSON 응답

## Response 구조

### Tool Call Response (Non-streaming)
```json
{
  "model": "llama3.2",
  "created_at": "2025-07-07T20:32:53.844124Z",
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "function": {
          "name": "get_weather",
          "arguments": {
            "city": "Tokyo"
          }
        }
      }
    ]
  },
  "done_reason": "stop",
  "done": true,
  "total_duration": 3244883583,
  "load_duration": 2969184542,
  "prompt_eval_count": 169,
  "prompt_eval_duration": 141656333,
  "eval_count": 18,
  "eval_duration": 133293625
}
```

### Tool Call Response (Streaming)
```json
{
  "model": "llama3.2",
  "created_at": "2025-07-07T20:22:19.184789Z",
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "function": {
          "name": "get_weather",
          "arguments": {
            "city": "Tokyo"
          }
        }
      }
    ]
  },
  "done": false
}
```

### Tool Result 전달
함수 실행 결과를 대화 히스토리에 추가:
```json
{
  "model": "llama3.2",
  "messages": [
    {
      "role": "user",
      "content": "what is the weather in Toronto?"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "function": {
            "name": "get_temperature",
            "arguments": {
              "city": "Toronto"
            }
          }
        }
      ]
    },
    {
      "role": "tool",
      "content": "11 degrees celsius",
      "tool_name": "get_temperature"
    }
  ],
  "stream": false,
  "tools": [...]
}
```

## 예시

### cURL - Basic Tool Call
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [
    {
      "role": "user",
      "content": "what is the weather in tokyo?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the weather in a given city",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "The city to get the weather for"
            }
          },
          "required": ["city"]
        }
      }
    }
  ],
  "stream": false
}'
```

### cURL - With History and Tool Result
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [
    {
      "role": "user",
      "content": "what is the weather in Toronto?"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "function": {
            "name": "get_temperature",
            "arguments": {
              "city": "Toronto"
            }
          }
        }
      ]
    },
    {
      "role": "tool",
      "content": "11 degrees celsius",
      "tool_name": "get_temperature"
    }
  ],
  "stream": false,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the weather in a given city",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string",
              "description": "The city to get the weather for"
            }
          },
          "required": ["city"]
        }
      }
    }
  ]
}'
```

### Python 예시
```python
import requests
import json

def get_weather(city: str) -> str:
    # 실제 날씨 API 호출
    return f"The weather in {city} is sunny and 20°C"

# Ollama API 요청
url = "http://localhost:11434/api/chat"
payload = {
    "model": "llama3.2",
    "messages": [
        {
            "role": "user",
            "content": "What is the weather in Paris?"
        }
    ],
    "tools": [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get the weather in a given city",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "city": {
                            "type": "string",
                            "description": "The city to get the weather for"
                        }
                    },
                    "required": ["city"]
                }
            }
        }
    ],
    "stream": False
}

response = requests.post(url, json=payload)
result = response.json()

# Tool call 확인
if result["message"].get("tool_calls"):
    for tool_call in result["message"]["tool_calls"]:
        function_name = tool_call["function"]["name"]
        arguments = tool_call["function"]["arguments"]

        # 함수 실행
        if function_name == "get_weather":
            weather_result = get_weather(arguments["city"])

            # 결과를 다시 모델에 전달
            payload["messages"].append(result["message"])
            payload["messages"].append({
                "role": "tool",
                "content": weather_result,
                "tool_name": function_name
            })

            # 최종 응답 요청
            final_response = requests.post(url, json=payload)
            print(final_response.json()["message"]["content"])
```

## 특징

### 1. OpenAI 호환성
Ollama의 Tool 스키마는 OpenAI API와 거의 동일하여, OpenAI용 코드를 쉽게 이식 가능

### 2. 로컬 실행
- 인터넷 연결 불필요
- 데이터 프라이버시 보장
- API 사용료 없음

### 3. 지원 모델
Tool calling을 지원하는 모델:
- llama3.2
- llama3.1
- mistral
- qwen2.5
- 기타 tool calling 지원 모델

### 4. Streaming 지원
```json
{
  "stream": true
}
```
실시간으로 tool call 응답을 받을 수 있음

### 5. Message Roles
- `user`: 사용자 메시지
- `assistant`: 모델 응답
- `tool`: 도구 실행 결과

## Structured Outputs

Ollama는 구조화된 출력도 지원:
```bash
curl -X POST http://localhost:11434/api/chat -d '{
  "model": "llama3.1",
  "messages": [
    {
      "role": "user",
      "content": "Ollama is 22 years old. Return JSON with age and availability."
    }
  ],
  "stream": false,
  "format": {
    "type": "object",
    "properties": {
      "age": {
        "type": "integer"
      },
      "available": {
        "type": "boolean"
      }
    },
    "required": ["age", "available"]
  }
}'
```

Response:
```json
{
  "message": {
    "role": "assistant",
    "content": "{\"age\": 22, \"available\": false}"
  }
}
```

## API 엔드포인트

### POST /api/chat
메인 채팅 엔드포인트. Tool calling 지원.

**주요 파라미터:**
- `model` (string, required): 사용할 모델 이름
- `messages` (array, required): 대화 히스토리
- `tools` (array, optional): 사용 가능한 도구 정의
- `stream` (boolean, optional): 스트리밍 여부
- `keep_alive` (string, optional): 모델 메모리 유지 시간 (예: "5m")
- `format` (object, optional): 구조화된 출력 형식

## 주의사항

1. **로컬 서버 필요**: Ollama가 localhost:11434에서 실행 중이어야 함
2. **모델 호환성**: 모든 모델이 tool calling을 지원하는 것은 아님
3. **arguments는 JSON 객체**: 직접 객체로 반환됨 (파싱 불필요)
4. **Tool 실행은 클라이언트 책임**: Ollama는 tool call 의도만 반환
5. **Context 관리**: 대화 히스토리를 직접 관리해야 함

## Model Template

Tool calling을 위한 모델 템플릿 (Mistral 예시):
```go
{{- range $index, $_ := .Messages }}
{{- if eq .Role "user" }}
{{- if and (le (len (slice $.Messages $index)) 2) $.Tools }}[AVAILABLE_TOOLS] {{ json $.Tools }}[/AVAILABLE_TOOLS]
{{- end }}[INST] {{ .Content }}[/INST]
{{- else if eq .Role "assistant" }}
{{- if .ToolCalls }}[TOOL_CALLS] [
{{- range .ToolCalls }}{"name": "{{ .Function.Name }}", "arguments": {{ json .Function.Arguments }}}
{{- end }}]</s>
{{- end }}
{{- else if eq .Role "tool" }}[TOOL_RESULTS] {"content": {{ .Content }}}[/TOOL_RESULTS]
{{- end }}
{{- end }}
```

## 모델 관리

### 모델 로드
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": []
}'
```

### 모델 언로드
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [],
  "keep_alive": 0
}'
```

## 참고 자료
- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Ollama GitHub Repository](https://github.com/ollama/ollama)
- [Ollama Python Library](https://github.com/ollama/ollama-python)
- [Ollama JavaScript Library](https://github.com/ollama/ollama-js)
