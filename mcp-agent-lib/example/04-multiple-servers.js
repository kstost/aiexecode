#!/usr/bin/env node

/**
 * 다중 서버 연결 예제
 *
 * 여러 MCP 서버에 동시에 연결하여 사용하는 방법입니다.
 * 각 서버는 서로 다른 전송 방식(stdio, HTTP, SSE)을 사용할 수 있습니다.
 */

import { MCPAgentClient } from '../index.js';

async function main() {
  const client = new MCPAgentClient({
    logLevel: 'info',
    enableConsoleDebug: true
  });

  try {
    // 여러 서버에 동시 연결
    await client.initialize({
      mcpServers: {
        // 파일 시스템 도구를 제공하는 서버
        'filesystem': {
          type: 'stdio',
          command: 'node',
          args: ['servers/filesystem-server.js']
        },

        // 데이터베이스 도구를 제공하는 서버
        'database': {
          type: 'stdio',
          command: 'python',
          args: ['-m', 'mcp_server_db']
        },

        // 원격 API 서버
        'remote-api': {
          type: 'http',
          url: 'https://api.example.com/mcp',
          headers: {
            'Authorization': 'Bearer TOKEN'
          }
        },

        // 실시간 이벤트 서버
        'event-stream': {
          type: 'sse',
          url: 'https://events.example.com/mcp'
        }
      }
    });

    console.log('✅ 모든 서버에 연결되었습니다.');

    // 1. 전체 도구 목록 조회 (모든 서버의 도구)
    const allTools = client.getAvailableTools();
    console.log(`\n📋 총 ${allTools.length}개의 도구 사용 가능:`);

    // 서버별로 그룹화하여 출력
    const toolsByServer = {};
    allTools.forEach(tool => {
      if (!toolsByServer[tool.server]) {
        toolsByServer[tool.server] = [];
      }
      toolsByServer[tool.server].push(tool);
    });

    for (const [serverName, tools] of Object.entries(toolsByServer)) {
      console.log(`\n${serverName} (${tools.length}개):`);
      tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
    }

    // 2. 특정 서버의 도구만 사용
    console.log('\n🔧 filesystem 서버의 도구 실행:');
    const fsTools = client.getServerTools('filesystem');
    if (fsTools.length > 0) {
      // callTool()을 사용하여 특정 서버의 도구를 직접 호출
      const result = await client.callTool('filesystem', fsTools[0].name, {
        path: '/tmp'
      });
      console.log('결과:', result);
    }

    // 3. 도구 이름만으로 자동 실행 (어느 서버의 도구인지 자동 검색)
    console.log('\n🔍 자동 서버 검색으로 도구 실행:');
    if (allTools.length > 0) {
      // executeTool()은 도구 이름만으로 자동으로 서버를 찾습니다
      const result = await client.executeTool(allTools[0].name);
      console.log(`${allTools[0].name} (서버: ${result.server}):`, result.data);
    }

    // 4. 리소스 목록 조회 (모든 서버)
    const resources = await client.listAllResources();
    console.log(`\n📄 사용 가능한 리소스: ${resources.length}개`);
    resources.forEach(resource => {
      console.log(`  - ${resource.name} (${resource.serverName})`);
      console.log(`    URI: ${resource.uri}`);
    });

    // 5. 프롬프트 목록 조회 (모든 서버)
    const prompts = await client.listAllPrompts();
    console.log(`\n💬 사용 가능한 프롬프트: ${prompts.length}개`);
    prompts.forEach(prompt => {
      console.log(`  - ${prompt.name} (${prompt.serverName})`);
      console.log(`    ${prompt.description}`);
    });

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
