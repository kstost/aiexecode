# Google Gemini Function Calling Schema

## 개요
Google Gemini API는 Function Calling을 통해 모델이 외부 함수를 호출할 수 있도록 지원합니다. 이를 통해 실시간 데이터 접근, 외부 API 통합 등이 가능합니다.

## Schema 구조

### 기본 구조
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "User message"
        }
      ]
    }
  ],
  "tools": [
    {
      "functionDeclarations": [
        {
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
      ]
    }
  ]
}
```

### 주요 필드

#### 1. tools (array)
Tool 정의 배열. 각 tool 객체는:

- **functionDeclarations** (array, required): 함수 선언 배열

#### 2. functionDeclarations (array)
각 함수 선언은 다음 필드를 포함:

- **name** (string, required): 함수의 이름
- **description** (string, optional): 함수의 설명
- **parameters** (object, required): OpenAPI Schema Object 형식의 파라미터 정의

#### 3. parameters - OpenAPI Schema
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
      "description": "The temperature unit"
    }
  },
  "required": ["location"]
}
```

#### 4. toolConfig (optional)
Function calling 동작 제어:
```json
{
  "toolConfig": {
    "functionCallingConfig": {
      "mode": "ANY"
    }
  }
}
```

모드 옵션:
- `AUTO` (기본값): 모델이 자동으로 판단
- `ANY`: 반드시 함수 호출
- `NONE`: 함수 호출 안 함

## Response 구조

### Function Call Response
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "functionCall": {
              "name": "schedule_meeting",
              "args": {
                "attendees": ["Bob", "Alice"],
                "date": "2025-03-27",
                "time": "10:00 AM",
                "topic": "Q3 planning"
              }
            }
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 56,
    "candidatesTokenCount": 20,
    "totalTokenCount": 76
  }
}
```

### Function Result 전달
함수 실행 결과를 모델에 반환:
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Original user query"
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {
          "functionCall": {
            "name": "get_weather",
            "args": {
              "location": "London"
            }
          }
        }
      ]
    },
    {
      "role": "user",
      "parts": [
        {
          "functionResponse": {
            "name": "get_weather",
            "response": {
              "result": {
                "temperature": 25,
                "unit": "celsius"
              }
            }
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
from google import genai
from google.genai import types

# 함수 정의
schedule_meeting_function = {
    "name": "schedule_meeting",
    "description": "Schedules a meeting with specified attendees at a given time and date.",
    "parameters": {
        "type": "object",
        "properties": {
            "attendees": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of people attending the meeting.",
            },
            "date": {
                "type": "string",
                "description": "Date of the meeting (e.g., '2024-07-29')",
            },
            "time": {
                "type": "string",
                "description": "Time of the meeting (e.g., '15:00')",
            },
            "topic": {
                "type": "string",
                "description": "The subject or topic of the meeting.",
            }
        },
        "required": ["attendees", "date", "time", "topic"]
    }
}

# 클라이언트 설정
client = genai.Client()
tools = types.Tool(function_declarations=[schedule_meeting_function])
config = types.GenerateContentConfig(tools=[tools])

# 요청
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Schedule a meeting with Bob and Alice for 03/14/2025 at 10:00 AM about the Q3 planning.",
    config=config,
)
```

### Python - Auto Function Calling
```python
# 함수 자동 실행 설정
def get_weather_forecast(location: str):
    return {"temperature": 25, "unit": "celsius"}

def set_thermostat_temperature(temperature: int):
    return {"status": "success"}

# 설정
client = genai.Client()
config = types.GenerateContentConfig(
    tools=[get_weather_forecast, set_thermostat_temperature]
)

# 요청 - SDK가 자동으로 함수 실행 및 결과 반환
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="If it's warmer than 20°C in London, set the thermostat to 20°C, otherwise set it to 18°C.",
    config=config,
)

print(response.text)
```

### JavaScript SDK
```javascript
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({});

const tools = [
  {
    functionDeclarations: [
      {
        name: "get_weather_forecast",
        description: "Gets the current weather temperature for a given location.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            location: {
              type: Type.STRING,
            },
          },
          required: ["location"],
        },
      },
    ],
  },
];

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "What's the weather in London?",
  config: { tools },
});
```

### JavaScript - Manual Function Calling Loop
```javascript
const toolFunctions = {
  get_weather_forecast: ({ location }) => {
    console.log(`Tool Call: get_weather_forecast(location=${location})`);
    return { temperature: 25, unit: "celsius" };
  },
  set_thermostat_temperature: ({ temperature }) => {
    console.log(`Tool Call: set_thermostat_temperature(temperature=${temperature})`);
    return { status: "success" };
  },
};

let contents = [
  {
    role: "user",
    parts: [{ text: "If it's warmer than 20°C in London, set thermostat to 20°C" }],
  },
];

while (true) {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: { tools },
  });

  if (result.functionCalls && result.functionCalls.length > 0) {
    const functionCall = result.functionCalls[0];
    const toolResponse = toolFunctions[functionCall.name](functionCall.args);

    // Add model's function call to history
    contents.push({
      role: "model",
      parts: [{ functionCall: functionCall }],
    });

    // Add function response to history
    contents.push({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: functionCall.name,
            response: { result: toolResponse },
          },
        },
      ],
    });
  } else {
    console.log(result.text);
    break;
  }
}
```

## 특징

### 1. Compositional (Sequential) Function Calling
Gemini는 여러 함수를 순차적으로 호출하여 복잡한 작업 수행:
```python
# 예: 위치 조회 → 날씨 확인 → 온도 조절
# 1. get_current_location() 호출
# 2. 결과로 get_weather(location) 호출
# 3. 날씨 기반으로 set_thermostat(temp) 호출
```

### 2. Parallel Function Calling
여러 함수를 동시에 호출:
```javascript
response.functionCalls = [
  { name: "get_weather", args: { location: "Paris" } },
  { name: "get_weather", args: { location: "London" } },
  { name: "get_weather", args: { location: "Tokyo" } }
];
```

### 3. Python Function to Schema 자동 변환
```python
from google import genai
from google.genai import types

def multiply(a: float, b: float):
    """Returns a * b."""
    return a * b

client = genai.Client()
fn_decl = types.FunctionDeclaration.from_callable(
    callable=multiply,
    client=client
)

# 자동으로 JSON schema 생성
print(fn_decl.to_json_dict())
```

### 4. Code Execution과 통합
```python
tools = [
    {'code_execution': {}},
    {'function_declarations': [turn_on_lights, turn_off_lights]}
]

await run(prompt, tools=tools, modality="AUDIO")
```

### 5. 지원되는 타입
Python SDK의 Type enum:
- `Type.STRING`
- `Type.NUMBER`
- `Type.INTEGER`
- `Type.BOOLEAN`
- `Type.ARRAY`
- `Type.OBJECT`

## REST API 예시

### cURL
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Schedule a meeting with Bob and Alice for 03/27/2025 at 10:00 AM about the Q3 planning."
          }
        ]
      }
    ],
    "tools": [
      {
        "functionDeclarations": [
          {
            "name": "schedule_meeting",
            "description": "Schedules a meeting with specified attendees at a given time and date.",
            "parameters": {
              "type": "object",
              "properties": {
                "attendees": {
                  "type": "array",
                  "items": {"type": "string"},
                  "description": "List of people attending the meeting."
                },
                "date": {
                  "type": "string",
                  "description": "Date of the meeting (e.g., '\''2024-07-29'\'')"
                },
                "time": {
                  "type": "string",
                  "description": "Time of the meeting (e.g., '\''15:00'\'')"
                },
                "topic": {
                  "type": "string",
                  "description": "The subject or topic of the meeting."
                }
              },
              "required": ["attendees", "date", "time", "topic"]
            }
          }
        ]
      }
    ]
  }'
```

## 주의사항

1. **함수 실행은 클라이언트 책임**: Gemini는 함수 호출 의도만 반환
2. **args는 JSON 객체**: 직접 객체로 반환됨 (문자열 파싱 불필요)
3. **Conversation History 유지**: 각 함수 호출과 응답을 contents 배열에 추가
4. **functionResponse 구조**: `name`과 `response.result` 포함 필요
5. **Role 순서**: user → model → user (functionResponse) 순서 유지

## 참고 자료
- [Gemini Function Calling Guide](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini API Reference](https://ai.google.dev/gemini-api/docs)
- [Google GenAI SDK](https://github.com/google-gemini/generative-ai-js)
