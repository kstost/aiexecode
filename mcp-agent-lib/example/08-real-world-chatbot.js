#!/usr/bin/env node

/**
 * 실전 예제: AI 챗봇 구현
 *
 * MCP Agent Client를 사용하여 실제 AI 챗봇을 만드는 예제입니다.
 * 여러 MCP 서버의 도구를 활용하여 파일 검색, 데이터 조회, 코드 실행 등을
 * 자연어로 수행할 수 있습니다.
 */

import { MCPAgentClient } from '../index.js';
import readline from 'readline';

// ========================================
// 챗봇 클래스
// ========================================

class MCPChatbot {
  constructor() {
    this.client = null;
    this.conversationHistory = [];
  }

  async initialize() {
    console.log('🤖 MCP Chatbot 초기화 중...\n');

    this.client = new MCPAgentClient({
      logLevel: 'warn',  // 챗봇 동작 중에는 경고만 표시
      enableConsoleDebug: false,
      timeout: 30000,
      retries: 3
    });

    // 여러 기능을 제공하는 MCP 서버들에 연결
    await this.client.initialize({
      mcpServers: {
        // 파일 시스템 도구
        'filesystem': {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
        },

        // GitHub 도구 (예시)
        'github': {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: {
            GITHUB_TOKEN: process.env.GITHUB_TOKEN || ''
          }
        },

        // 메모리/메모장 도구 (예시)
        'memory': {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory']
        }
      }
    });

    // 사용 가능한 기능 출력
    const tools = this.client.getAvailableTools();
    const resources = this.client.getAvailableResources();
    const prompts = this.client.getAvailablePrompts();

    console.log('✅ 초기화 완료!\n');
    console.log('📋 사용 가능한 기능:');
    console.log(`  - 도구: ${tools.length}개`);
    console.log(`  - 리소스: ${resources.length}개`);
    console.log(`  - 프롬프트: ${prompts.length}개\n`);

    // 도구 목록 표시
    if (tools.length > 0) {
      console.log('🔧 사용 가능한 도구:');
      const toolsByServer = {};
      tools.forEach(tool => {
        if (!toolsByServer[tool.server]) {
          toolsByServer[tool.server] = [];
        }
        toolsByServer[tool.server].push(tool.name);
      });

      for (const [server, toolNames] of Object.entries(toolsByServer)) {
        console.log(`  ${server}:`);
        toolNames.forEach(name => console.log(`    - ${name}`));
      }
      console.log();
    }
  }

  // 사용자 의도 파싱 (간단한 키워드 기반)
  parseIntent(message) {
    const lowerMsg = message.toLowerCase();

    // 파일 관련
    if (lowerMsg.includes('파일') || lowerMsg.includes('file')) {
      if (lowerMsg.includes('읽') || lowerMsg.includes('read')) {
        return { action: 'readFile', query: message };
      }
      if (lowerMsg.includes('찾') || lowerMsg.includes('search')) {
        return { action: 'searchFiles', query: message };
      }
      if (lowerMsg.includes('쓰') || lowerMsg.includes('write')) {
        return { action: 'writeFile', query: message };
      }
    }

    // GitHub 관련
    if (lowerMsg.includes('github') || lowerMsg.includes('깃허브')) {
      return { action: 'github', query: message };
    }

    // 메모 관련
    if (lowerMsg.includes('메모') || lowerMsg.includes('기억') || lowerMsg.includes('저장')) {
      return { action: 'memory', query: message };
    }

    // 도구 목록 조회
    if (lowerMsg.includes('도구') || lowerMsg.includes('기능') || lowerMsg.includes('help')) {
      return { action: 'listTools', query: message };
    }

    return { action: 'unknown', query: message };
  }

  // 메시지 처리
  async processMessage(message) {
    this.conversationHistory.push({ role: 'user', content: message });

    const intent = this.parseIntent(message);
    let response = '';

    try {
      switch (intent.action) {
        case 'listTools':
          response = this.getToolsList();
          break;

        case 'readFile':
          response = await this.handleFileRead(message);
          break;

        case 'searchFiles':
          response = await this.handleFileSearch(message);
          break;

        case 'github':
          response = await this.handleGitHub(message);
          break;

        case 'memory':
          response = await this.handleMemory(message);
          break;

        default:
          response = await this.handleGeneral(message);
      }

    } catch (error) {
      response = `❌ 죄송합니다. 오류가 발생했습니다: ${error.message}`;
    }

    this.conversationHistory.push({ role: 'assistant', content: response });
    return response;
  }

  getToolsList() {
    const tools = this.client.getAvailableTools();
    let response = '🔧 사용 가능한 도구:\n\n';

    const byServer = {};
    tools.forEach(tool => {
      if (!byServer[tool.server]) byServer[tool.server] = [];
      byServer[tool.server].push(tool);
    });

    for (const [server, toolList] of Object.entries(byServer)) {
      response += `📦 ${server}:\n`;
      toolList.forEach(tool => {
        response += `  • ${tool.name}\n`;
        if (tool.description) {
          response += `    ${tool.description}\n`;
        }
      });
      response += '\n';
    }

    return response;
  }

  async handleFileRead(message) {
    // 간단한 파일 경로 추출 (실제로는 더 정교한 파싱 필요)
    const pathMatch = message.match(/["']([^"']+)["']|\/[^\s]+/);
    if (!pathMatch) {
      return '파일 경로를 찾을 수 없습니다. 예: "/tmp/test.txt 파일 읽어줘"';
    }

    const filePath = pathMatch[1] || pathMatch[0];

    try {
      const result = await this.client.executeTool('read_file', {
        path: filePath
      });

      return `📄 파일 내용:\n\n${result.data}`;
    } catch (error) {
      return `파일을 읽을 수 없습니다: ${error.message}`;
    }
  }

  async handleFileSearch(message) {
    // 검색어 추출
    const searchMatch = message.match(/["']([^"']+)["']/);
    if (!searchMatch) {
      return '검색어를 찾을 수 없습니다. 예: "test 파일 찾아줘"';
    }

    try {
      const result = await this.client.executeTool('search_files', {
        pattern: searchMatch[1]
      });

      return `🔍 검색 결과:\n\n${result.data}`;
    } catch (error) {
      return `검색 중 오류 발생: ${error.message}`;
    }
  }

  async handleGitHub(message) {
    const tools = this.client.getAvailableTools();
    const githubTools = tools.filter(t => t.server === 'github');

    if (githubTools.length === 0) {
      return 'GitHub 도구를 사용할 수 없습니다.';
    }

    // 첫 번째 GitHub 도구 실행 (예시)
    try {
      const result = await this.client.executeTool(githubTools[0].name);
      return `🐙 GitHub 결과:\n\n${JSON.stringify(result.data, null, 2)}`;
    } catch (error) {
      return `GitHub 작업 실패: ${error.message}`;
    }
  }

  async handleMemory(message) {
    // 메모 저장 로직
    try {
      const result = await this.client.executeTool('store_memory', {
        key: 'user_note',
        value: message
      });

      return `💾 메모를 저장했습니다.`;
    } catch (error) {
      return `메모 저장 실패: ${error.message}`;
    }
  }

  async handleGeneral(message) {
    // 일반 메시지 처리
    const tools = this.client.getAvailableTools();

    return `저는 다음 기능들을 도울 수 있습니다:\n\n` +
           `• 파일 읽기/쓰기/검색\n` +
           `• GitHub 작업\n` +
           `• 메모 저장\n\n` +
           `"도구" 또는 "help"를 입력하면 상세한 기능 목록을 볼 수 있습니다.`;
  }

  async shutdown() {
    console.log('\n👋 챗봇을 종료합니다...');
    await this.client.disconnect();
  }
}

// ========================================
// 메인 실행
// ========================================

async function main() {
  const chatbot = new MCPChatbot();

  try {
    await chatbot.initialize();

    // readline 인터페이스 생성
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('💬 채팅을 시작합니다. (종료: exit, quit, bye)\n');

    // 대화 루프
    const askQuestion = () => {
      rl.question('You: ', async (input) => {
        const message = input.trim();

        // 종료 명령
        if (['exit', 'quit', 'bye'].includes(message.toLowerCase())) {
          rl.close();
          await chatbot.shutdown();
          return;
        }

        // 빈 입력 무시
        if (!message) {
          askQuestion();
          return;
        }

        // 메시지 처리
        const response = await chatbot.processMessage(message);
        console.log(`\nBot: ${response}\n`);

        askQuestion();
      });
    };

    askQuestion();

  } catch (error) {
    console.error('❌ 챗봇 초기화 실패:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
