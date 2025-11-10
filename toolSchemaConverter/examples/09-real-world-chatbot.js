/**
 * Example 9: Real-world Chatbot
 *
 * 실제 프로덕션 환경에서 사용 가능한 챗봇 예제
 */

import { UnifiedLLMClient } from '../src/index.js';
import * as readline from 'readline';

// 도구 정의
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current time',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'Timezone (optional)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Perform mathematical calculation',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Mathematical expression (e.g., "2 + 2", "sqrt(16)")'
          }
        },
        required: ['expression']
      }
    }
  }
];

// 도구 실행 함수
function executeTool(toolName, args) {
  switch (toolName) {
    case 'get_current_time':
      return {
        time: new Date().toLocaleString(),
        timezone: args.timezone || 'local'
      };

    case 'search_web':
      // 실제로는 검색 API를 호출하겠지만, 여기서는 mock
      return {
        query: args.query,
        results: [
          `Mock result for "${args.query}": This is a simulated search result.`
        ]
      };

    case 'calculate':
      try {
        // 안전하지 않으므로 실제로는 math parser 사용 권장
        const result = eval(args.expression.replace('sqrt', 'Math.sqrt'));
        return { result };
      } catch (error) {
        return { error: 'Invalid expression' };
      }

    default:
      return { error: 'Unknown tool' };
  }
}

class Chatbot {
  constructor(config = {}) {
    this.client = new UnifiedLLMClient({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY
    });

    this.model = config.model || 'gpt-4o-mini';
    this.messages = [];
    this.maxHistoryLength = config.maxHistoryLength || 20;

    // 시스템 메시지 설정
    this.messages.push({
      role: 'system',
      content: config.systemMessage || 'You are a helpful AI assistant. You can search the web, get current time, and perform calculations when needed.'
    });
  }

  async chat(userMessage) {
    // 사용자 메시지 추가
    this.messages.push({
      role: 'user',
      content: userMessage
    });

    let maxIterations = 5;  // 무한 루프 방지
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // LLM 호출
      const response = await this.client.chat({
        model: this.model,
        messages: this.messages,
        tools: tools,
        max_tokens: 500
      });

      const assistantMessage = response.choices[0].message;
      this.messages.push(assistantMessage);

      // 도구 호출이 있는지 확인
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // 각 도구 호출 처리
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);

          console.log(`[Tool] ${toolName}(${JSON.stringify(args)})`);

          // 도구 실행
          const result = executeTool(toolName, args);

          // 결과를 메시지에 추가
          this.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }

        // 다음 반복에서 도구 결과를 포함한 응답 생성
        continue;
      }

      // 도구 호출이 없으면 최종 응답 반환
      this.trimHistory();
      return assistantMessage.content;
    }

    throw new Error('Max iterations reached');
  }

  trimHistory() {
    // 시스템 메시지를 제외하고 오래된 메시지 제거
    if (this.messages.length > this.maxHistoryLength) {
      const systemMessage = this.messages[0];
      const recentMessages = this.messages.slice(-this.maxHistoryLength + 1);
      this.messages = [systemMessage, ...recentMessages];
    }
  }

  reset() {
    const systemMessage = this.messages[0];
    this.messages = [systemMessage];
  }

  getHistory() {
    return this.messages;
  }
}

// CLI 인터페이스
async function interactiveChatbot() {
  console.log('=== Interactive Chatbot ===');
  console.log('Commands: /exit, /reset, /history\n');

  const chatbot = new Chatbot({
    model: 'gpt-4o-mini',
    systemMessage: 'You are a helpful assistant with access to tools for getting time, searching, and calculating.'
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      const message = input.trim();

      if (!message) {
        askQuestion();
        return;
      }

      if (message === '/exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }

      if (message === '/reset') {
        chatbot.reset();
        console.log('Chat history cleared.\n');
        askQuestion();
        return;
      }

      if (message === '/history') {
        console.log('\nHistory:');
        console.log(JSON.stringify(chatbot.getHistory(), null, 2));
        console.log('');
        askQuestion();
        return;
      }

      try {
        const response = await chatbot.chat(message);
        console.log(`\nBot: ${response}\n`);
      } catch (error) {
        console.log(`\nError: ${error.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

// 프로그래밍 방식 사용 예제
async function programmatiExample() {
  console.log('=== Programmatic Chatbot Example ===\n');

  const chatbot = new Chatbot({
    model: 'gpt-4o-mini'
  });

  const testMessages = [
    "What time is it?",
    "Calculate 25 * 4",
    "What is the square root of 144?"
  ];

  for (const message of testMessages) {
    console.log(`User: ${message}`);
    const response = await chatbot.chat(message);
    console.log(`Bot: ${response}\n`);
  }

  console.log('Conversation history length:', chatbot.getHistory().length);
}

// 멀티모델 fallback 챗봇
class MultiModelChatbot extends Chatbot {
  constructor(config = {}) {
    super(config);

    this.models = config.models || [
      { apiKey: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini', name: 'OpenAI' },
      { apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-haiku-20240307', name: 'Claude' }
    ];

    this.currentModelIndex = 0;
  }

  async chat(userMessage) {
    for (let i = 0; i < this.models.length; i++) {
      const modelConfig = this.models[this.currentModelIndex];

      if (!modelConfig.apiKey) {
        this.currentModelIndex = (this.currentModelIndex + 1) % this.models.length;
        continue;
      }

      try {
        this.client = new UnifiedLLMClient({ apiKey: modelConfig.apiKey });
        this.model = modelConfig.model;

        return await super.chat(userMessage);
      } catch (error) {
        console.log(`[Fallback] ${modelConfig.name} failed, trying next...`);
        this.currentModelIndex = (this.currentModelIndex + 1) % this.models.length;

        if (i === this.models.length - 1) {
          throw error;
        }
      }
    }
  }
}

// 메인
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--interactive')) {
    await interactiveChatbot();
  } else if (args.includes('--multi-model')) {
    console.log('=== Multi-model Fallback Example ===\n');
    const chatbot = new MultiModelChatbot();
    const response = await chatbot.chat('Hello! What can you do?');
    console.log('Bot:', response);
  } else {
    await programmatiExample();

    console.log('\nTip: Run with --interactive for interactive mode');
    console.log('     Run with --multi-model for multi-model fallback example');
  }
}

// 모듈로 사용 가능
export { Chatbot, MultiModelChatbot };

// 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
