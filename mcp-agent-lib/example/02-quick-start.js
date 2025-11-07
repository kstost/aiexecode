#!/usr/bin/env node

/**
 * 빠른 시작 예제 - quickStart() 함수 사용
 *
 * quickStart() 함수를 사용하면 클라이언트 생성과 초기화를
 * 한 번에 수행할 수 있어 가장 간단하게 시작할 수 있습니다.
 */

import { quickStart } from '../index.js';

async function main() {
  // quickStart()는 클라이언트 생성 + 초기화를 한 번에 수행합니다
  const client = await quickStart(
    // 첫 번째 인자: 서버 설정
    {
      mcpServers: {
        'my-server': {
          type: 'stdio',
          command: 'node',
          args: ['server.js']
        }
      }
    },
    // 두 번째 인자: 클라이언트 옵션 (선택사항)
    {
      logLevel: 'info',
      enableConsoleDebug: true,
      timeout: 30000,      // 30초 타임아웃
      retries: 3           // 실패 시 3회 재시도
    }
  );

  try {
    console.log('✅ 클라이언트 준비 완료!');

    // 바로 도구를 사용할 수 있습니다
    const tools = client.getAvailableTools();
    console.log(`📋 ${tools.length}개의 도구를 사용할 수 있습니다.`);

    // 도구 실행
    if (tools.length > 0) {
      const result = await client.executeTool(tools[0].name);
      console.log('결과:', result);
    }

  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
