#!/usr/bin/env node

/**
 * 에러 처리 및 재시도 예제
 *
 * MCP 클라이언트의 강력한 에러 처리와 자동 재시도 기능을 보여줍니다.
 * - 자동 재시도 설정
 * - 타임아웃 처리
 * - 서버 연결 끊김 감지
 * - 이벤트 기반 에러 모니터링
 */

import { MCPAgentClient } from '../index.js';

async function main() {
  const client = new MCPAgentClient({
    logLevel: 'info',
    enableConsoleDebug: true,

    // 재시도 설정
    timeout: 10000,        // 10초 타임아웃
    retries: 5,            // 최대 5회 재시도
    retryDelay: 1000,      // 첫 재시도는 1초 후
    maxRetryDelay: 30000   // 최대 30초까지 지연
  });

  // 1. 서버 에러 이벤트 리스너
  client.on('serverError', (serverName, error) => {
    console.error(`⚠️ 서버 에러 [${serverName}]:`, error.message);
  });

  // 2. 서버 연결 해제 이벤트 리스너
  client.on('serverDisconnected', (serverName) => {
    console.warn(`🔌 서버 연결 끊김: ${serverName}`);
  });

  // 3. 서버 상태 변경 이벤트 리스너
  client.on('serverStatusChange', ({ serverName, status, previousStatus }) => {
    console.log(`📡 ${serverName}: ${previousStatus} → ${status}`);
  });

  try {
    await client.initialize({
      mcpServers: {
        'test-server': {
          type: 'stdio',
          command: 'node',
          args: ['server.js']
        }
      }
    });

    // 예제 1: 기본 재시도 (클라이언트 설정 사용)
    try {
      console.log('\n🔧 도구 실행 (자동 재시도 활성화)...');
      const result = await client.executeTool('some-tool', {
        param: 'value'
      });
      console.log('✅ 성공:', result);
    } catch (error) {
      console.error('❌ 모든 재시도 실패:', error.message);
    }

    // 예제 2: 커스텀 재시도 설정
    try {
      console.log('\n🔧 도구 실행 (커스텀 타임아웃/재시도)...');
      const result = await client.executeTool(
        'slow-tool',
        { query: 'test' },
        {
          timeout: 5000,   // 이 호출만 5초 타임아웃
          retries: 2       // 이 호출만 2회 재시도
        }
      );
      console.log('✅ 성공:', result);
    } catch (error) {
      console.error('❌ 실패:', error.message);
    }

    // 예제 3: 서버 상태 확인 후 실행
    const status = client.getStatus();
    console.log('\n📊 현재 서버 상태:');
    for (const [serverName, serverStatus] of Object.entries(status.servers)) {
      console.log(`${serverName}: ${serverStatus.status}`);

      if (serverStatus.status === 'connected') {
        console.log(`  ✅ 연결됨 - ${serverStatus.toolCount}개 도구 사용 가능`);
      } else if (serverStatus.status === 'partially_connected') {
        console.log(`  ⚠️ 부분 연결 - 일부 기능만 사용 가능`);
      } else {
        console.log(`  ❌ 연결 안됨 - 사용 불가`);
      }
    }

    // 예제 4: 특정 서버 연결 해제 및 재연결 처리
    console.log('\n🔌 test-server 연결 해제...');
    await client.disconnectServer('test-server');

    const updatedStatus = client.getStatus();
    console.log(`연결된 서버: ${updatedStatus.connectedServers}/${updatedStatus.totalServers}`);

  } catch (error) {
    // 초기화 실패 처리
    if (error.message.includes('not allowed')) {
      console.error('❌ 보안 에러: 허용되지 않은 명령어 또는 인자');
    } else if (error.message.includes('timeout')) {
      console.error('❌ 타임아웃: 서버 응답 없음');
    } else {
      console.error('❌ 예상치 못한 에러:', error.message);
    }
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
