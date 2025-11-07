#!/usr/bin/env node

/**
 * HTTP 서버 연결 예제
 *
 * stdio 방식 대신 HTTP/HTTPS를 통해 원격 MCP 서버에 연결하는 방법입니다.
 * 인증이 필요한 경우 Bearer 토큰을 헤더에 포함시킬 수 있습니다.
 */

import { MCPAgentClient } from '../index.js';

async function main() {
  const client = new MCPAgentClient({
    logLevel: 'info',
    enableConsoleDebug: true
  });

  try {
    await client.initialize({
      mcpServers: {
        // HTTP 방식 서버 (인증 없음)
        'public-api': {
          type: 'http',
          url: 'https://api.example.com/mcp'
        },

        // HTTP 방식 서버 (Bearer 토큰 인증)
        'secured-api': {
          type: 'http',
          url: 'https://secure-api.example.com/mcp',
          headers: {
            'Authorization': 'Bearer YOUR_TOKEN_HERE',
            'X-API-Key': 'your-api-key'
          }
        },

        // 로컬 HTTP 서버
        'local-http': {
          type: 'http',
          url: 'http://localhost:3000/mcp'
        }
      }
    });

    console.log('✅ HTTP 서버들에 연결되었습니다.');

    // 연결된 서버별 상태 확인
    const status = client.getStatus();
    console.log('\n📊 서버별 상태:');
    for (const [serverName, serverStatus] of Object.entries(status.servers)) {
      console.log(`\n${serverName}:`);
      console.log(`  - 상태: ${serverStatus.status}`);
      console.log(`  - 타입: ${serverStatus.type}`);
      console.log(`  - 도구 수: ${serverStatus.toolCount}`);
    }

    // 특정 서버의 도구만 조회
    const publicTools = client.getServerTools('public-api');
    console.log('\n🔧 public-api의 도구:');
    publicTools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

  } catch (error) {
    console.error('❌ 오류:', error.message);

    // HTTP 인증 실패 시 자세한 정보가 로그에 출력됩니다
    if (error.message.includes('401')) {
      console.error('💡 인증 토큰을 확인해주세요.');
    }
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
