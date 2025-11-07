#!/usr/bin/env node

/**
 * 고급 설정 예제
 *
 * MCP Agent Client의 다양한 설정 옵션을 활용하는 방법입니다.
 * - 환경변수를 통한 설정
 * - 보안 설정
 * - 성능 튜닝
 * - 로깅 설정
 */

import { MCPAgentClient } from '../index.js';

async function main() {
  // ========================================
  // 1. 전체 설정 옵션 예시
  // ========================================

  const client = new MCPAgentClient({
    // === 기본 설정 ===
    autoConnect: true,              // 초기화 시 자동 연결 (기본값: true)
    logLevel: 'debug',              // 로그 레벨: debug, info, warn, error, silent
    enableConsoleDebug: true,       // 콘솔 출력 활성화
    enableLogging: true,            // 로깅 활성화

    // === 타임아웃 설정 ===
    timeout: 30000,                 // 기본 타임아웃 (30초)
    serverReadyTimeout: 10000,      // 서버 준비 대기 타임아웃 (10초)
    processKillTimeout: 5000,       // 프로세스 종료 대기 시간 (5초)

    // === 재시도 설정 ===
    retries: 3,                     // 도구 실행 실패 시 재시도 횟수
    retryDelay: 1000,               // 첫 재시도 지연 (1초)
    maxRetryDelay: 30000,           // 최대 재시도 지연 (30초)
    serverReadyRetries: 5,          // 서버 준비 확인 재시도 횟수

    // === 보안 설정 ===
    allowedCommands: ['node', 'python', 'python3', 'npx', 'deno'],
    dangerousChars: ['&', ';', '|', '`', '$', '>', '<', '*', '?'],

    // === 메모리 및 크기 제한 ===
    maxResponseSize: 1024 * 1024,   // 최대 응답 크기 (1MB)
    maxJsonSize: 10 * 1024 * 1024,  // 최대 JSON 크기 (10MB)
    maxLogLength: 100,              // 로그 문자열 최대 길이
    maxRequestIds: 10000,           // 최대 요청 ID 수

    // === HTTP 전송 설정 ===
    httpMaxRetries: 3,              // HTTP 연결 최대 재시도
    httpInitialDelay: 1000,         // HTTP 첫 재시도 지연
    httpMaxDelay: 10000,            // HTTP 최대 재시도 지연
    httpGrowthFactor: 1.5,          // HTTP 재시도 지연 증가율

    // === 메모리 관리 ===
    memoryCleanupEnabled: true,     // 메모리 자동 정리 활성화

    // === MCP 프로토콜 설정 ===
    clientInfo: {
      name: 'my-custom-client',
      version: '1.0.0'
    },
    clientCapabilities: {
      roots: { listChanged: true },
      sampling: {},
      experimental: {}
    }
  });

  try {
    // ========================================
    // 2. 환경변수를 통한 설정
    // ========================================

    // 환경변수 설정 예시 (실제로는 shell에서 설정)
    // export MCP_LOG_LEVEL=debug
    // export MCP_TIMEOUT=60000
    // export MCP_RETRIES=5
    // export MCP_MAX_RESPONSE_SIZE=2097152

    console.log('📋 현재 설정:');
    console.log(`  로그 레벨: ${client.options.logLevel}`);
    console.log(`  타임아웃: ${client.options.timeout}ms`);
    console.log(`  재시도: ${client.options.retries}회`);
    console.log(`  최대 응답 크기: ${client.options.maxResponseSize} bytes`);

    // ========================================
    // 3. 보안 강화 설정
    // ========================================

    await client.initialize({
      mcpServers: {
        'secure-server': {
          type: 'stdio',
          command: 'node',  // allowedCommands에 있는 명령어만 허용
          args: ['server.js'], // dangerousChars가 없는 안전한 인자
          env: {
            // 환경변수는 문자열 key-value만 허용
            NODE_ENV: 'production',
            SAFE_MODE: 'true'
          }
        }
      }
    });

    // ========================================
    // 4. 커스텀 로깅
    // ========================================

    // 클라이언트의 보안 로그 시스템 사용
    client.secureLog('info', '커스텀 정보 로그', {
      customData: 'value',
      sensitiveToken: 'will-be-redacted'  // 자동으로 [REDACTED] 처리됨
    });

    client.secureLog('warn', '경고 메시지', {
      issue: 'something to check'
    });

    client.secureLog('error', '에러 발생', {
      errorCode: 500,
      errorMessage: 'Something went wrong'
    });

    // ========================================
    // 5. 메모리 관리
    // ========================================

    console.log('\n🧹 메모리 정리 실행...');
    client.performMemoryCleanup();
    console.log('✅ 정리 완료');

    // ========================================
    // 6. 서버 기능(Capabilities) 조회
    // ========================================

    console.log('\n📋 서버 기능 조회...');

    // 모든 서버의 기능
    const allCapabilities = client.getServerCapabilities();
    console.log('모든 서버의 기능:', allCapabilities);

    // 특정 서버의 기능
    const serverCaps = client.getServerCapabilities('secure-server');
    console.log('secure-server의 기능:', serverCaps);

    // ========================================
    // 7. 이벤트 모니터링
    // ========================================

    // 서버 상태 변경 모니터링
    client.on('serverStatusChange', ({ serverName, status, previousStatus }) => {
      console.log(`\n📡 [이벤트] ${serverName}:`);
      console.log(`   ${previousStatus} → ${status}`);
    });

    // 서버 에러 모니터링
    client.on('serverError', (serverName, error) => {
      console.error(`\n⚠️ [이벤트] 서버 에러 [${serverName}]:`, error);
    });

    // 서버 연결 해제 모니터링
    client.on('serverDisconnected', (serverName) => {
      console.warn(`\n🔌 [이벤트] 서버 연결 해제: ${serverName}`);
    });

    // ========================================
    // 8. 안전한 JSON 처리
    // ========================================

    // 순환 참조가 있는 객체도 안전하게 직렬화
    const circularObj = { name: 'test' };
    circularObj.self = circularObj;

    const safeJson = client.safeJsonStringify(circularObj);
    console.log('\n🔒 안전한 JSON 직렬화:', safeJson);

    // 보안 위협이 있는 JSON도 안전하게 파싱
    const dangerousJson = '{"__proto__": {"polluted": true}}';
    const safeParsed = client.safeJsonParse(dangerousJson);
    console.log('🔒 안전한 JSON 파싱:', safeParsed);

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    // cleanup()은 disconnect()와 메모리 정리를 모두 수행
    await client.cleanup();
    console.log('\n✅ 모든 리소스 정리 완료');
  }
}

main().catch(console.error);
