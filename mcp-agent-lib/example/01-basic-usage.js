#!/usr/bin/env node

/**
 * 기본 사용 예제 - MCP Agent Client 시작하기
 *
 * 이 예제는 MCP Agent Client의 가장 기본적인 사용 방법을 보여줍니다.
 * - 클라이언트 생성
 * - 서버 연결
 * - 도구 목록 조회
 * - 도구 실행
 */

import { MCPAgentClient } from '../index.js';

async function main() {
  // 1. 클라이언트 인스턴스 생성
  // logLevel을 'info'로 설정하여 진행 상황을 확인할 수 있습니다
  const client = new MCPAgentClient({
    logLevel: 'info',
    enableConsoleDebug: true
  });

  try {
    // 2. 서버 설정으로 초기화
    // mcpServers 객체에 연결할 서버들을 정의합니다
    await client.initialize({
      mcpServers: {
        // stdio 방식 서버 예시
        'example-server': {
          type: 'stdio',
          command: 'node',
          args: ['path/to/your/server.js'],
          // 선택사항: 환경변수 설정
          env: {
            NODE_ENV: 'development'
          }
        }
      }
    });

    console.log('✅ 클라이언트가 성공적으로 초기화되었습니다!');

    // 3. 사용 가능한 도구 목록 조회
    const tools = client.getAvailableTools();
    console.log('\n📋 사용 가능한 도구 목록:');
    tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
      console.log(`    서버: ${tool.server}`);
    });

    // 4. 특정 도구 실행하기
    if (tools.length > 0) {
      const firstTool = tools[0];
      console.log(`\n🔧 도구 실행 예시: ${firstTool.name}`);

      // executeTool()은 도구 이름만으로 자동으로 서버를 찾아 실행합니다
      const result = await client.executeTool(firstTool.name, {
        // 여기에 도구에 필요한 인자를 전달합니다
        // 예: { query: 'test', limit: 10 }
      });

      console.log('✅ 실행 결과:', result);
    }

    // 5. 클라이언트 상태 확인
    const status = client.getStatus();
    console.log('\n📊 클라이언트 상태:');
    console.log(`  - 초기화 완료: ${status.initialized}`);
    console.log(`  - 연결된 서버 수: ${status.connectedServers}/${status.totalServers}`);
    console.log(`  - 사용 가능한 도구 수: ${status.totalTools}`);

  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  } finally {
    // 6. 리소스 정리 및 연결 해제
    await client.disconnect();
    console.log('\n👋 클라이언트 연결이 해제되었습니다.');
  }
}

// 실행
main().catch(console.error);
