#!/usr/bin/env node

/**
 * MCP Message Logger - RAW 메시지 로깅 유틸리티
 *
 * MCP 프로토콜 통신 시 주고받는 실제 JSON-RPC 메시지를 로깅하는 기능 제공
 * Transport 레이어의 메시지를 intercept하여 송수신 데이터를 기록
 *
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';

/**
 * 타임스탬프를 파일명 형식으로 포맷
 * YYYY-MM-DD_HH-MM-SS-millisecond
 */
function formatTimestampForFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-${milliseconds}`;
}

/**
 * MCP 메시지 로거 클래스
 *
 * 주요 기능:
 * - 송수신 메시지의 RAW JSON 로깅
 * - 파일 또는 콘솔 출력
 * - 메시지 크기 제한 및 truncation
 * - 타임스탬프 및 메타데이터 포함
 * - 환경변수로 ON/OFF 제어
 */
export class MCPMessageLogger {
  constructor(options = {}) {
    this.options = {
      // 로깅 활성화 여부 (기본값: false)
      enabled: options.enabled ?? false,

      // 로그 출력 방식: 'console' | 'file' | 'both'
      output: options.output || 'console',

      // 로그 디렉토리 경로 (지정하지 않으면 파일 로깅 비활성화)
      logDir: options.logDir || null,

      // 메시지 최대 크기 (이보다 크면 truncate)
      maxMessageSize: options.maxMessageSize || 10000,

      // 로그 레벨: 'debug' | 'info' | 'warn' | 'error'
      logLevel: options.logLevel || 'debug',

      // Pretty print JSON 여부
      prettyPrint: options.prettyPrint ?? true,

      // 로그에 포함할 정보
      includeTimestamp: options.includeTimestamp ?? true,
      includeDirection: options.includeDirection ?? true,
      includeServerName: options.includeServerName ?? true,
      includeMessageType: options.includeMessageType ?? true,

      ...options
    };

    // 로그 디렉토리 초기화 (디렉토리 경로가 지정된 경우만)
    if (this.options.enabled &&
        this.options.logDir &&
        (this.options.output === 'file' || this.options.output === 'both')) {
      this._initializeLogDir();
    }

    // 메시지 카운터 (통계용)
    this.stats = {
      sent: 0,
      received: 0,
      errors: 0,
      totalSentBytes: 0,
      totalReceivedBytes: 0
    };
  }

  /**
   * 로그 디렉토리 초기화
   */
  _initializeLogDir() {
    try {
      // 로그 디렉토리 생성
      if (!fs.existsSync(this.options.logDir)) {
        fs.mkdirSync(this.options.logDir, { recursive: true });
      }
    } catch (error) {
      console.error(`Failed to initialize log directory: ${error.message}`);
      this.options.enabled = false;
    }
  }

  /**
   * 개별 메시지를 JSON 파일로 저장
   */
  _writeMessageToFile(direction, serverName, message, metadata) {
    try {
      const timestamp = formatTimestampForFilename();
      const filename = `${timestamp}_${direction}.json`;
      const filepath = path.join(this.options.logDir, filename);

      const logEntry = {
        timestamp: new Date().toISOString(),
        direction,
        serverName,
        message,
        metadata
      };

      const content = this.options.prettyPrint
        ? JSON.stringify(logEntry, null, 2)
        : JSON.stringify(logEntry);

      fs.writeFileSync(filepath, content, 'utf-8');
    } catch (error) {
      console.error(`Failed to write message file: ${error.message}`);
    }
  }

  /**
   * 송신 메시지 로깅
   *
   * @param {string} serverName - 서버 이름
   * @param {object} message - JSON-RPC 메시지
   * @param {object} metadata - 추가 메타데이터
   */
  logSentMessage(serverName, message, metadata = {}) {
    if (!this.options.enabled) return;

    this.stats.sent++;

    // 파일로 저장
    if (this.options.logDir && (this.options.output === 'file' || this.options.output === 'both')) {
      this._writeMessageToFile('SEND', serverName, message, metadata);
    }

    // 콘솔 출력
    if (this.options.output === 'console' || this.options.output === 'both') {
      const logEntry = this._formatLogEntry({
        direction: 'SEND',
        serverName,
        message,
        metadata
      });
      console.log(logEntry);
    }

    // 통계 업데이트
    try {
      const messageStr = JSON.stringify(message);
      this.stats.totalSentBytes += messageStr.length;
    } catch (error) {
      // JSON 직렬화 실패 무시
    }
  }

  /**
   * 수신 메시지 로깅
   *
   * @param {string} serverName - 서버 이름
   * @param {object} message - JSON-RPC 메시지
   * @param {object} metadata - 추가 메타데이터
   */
  logReceivedMessage(serverName, message, metadata = {}) {
    if (!this.options.enabled) return;

    this.stats.received++;

    // 파일로 저장
    if (this.options.logDir && (this.options.output === 'file' || this.options.output === 'both')) {
      this._writeMessageToFile('RECV', serverName, message, metadata);
    }

    // 콘솔 출력
    if (this.options.output === 'console' || this.options.output === 'both') {
      const logEntry = this._formatLogEntry({
        direction: 'RECV',
        serverName,
        message,
        metadata
      });
      console.log(logEntry);
    }

    // 통계 업데이트
    try {
      const messageStr = JSON.stringify(message);
      this.stats.totalReceivedBytes += messageStr.length;
    } catch (error) {
      // JSON 직렬화 실패 무시
    }
  }

  /**
   * 에러 로깅
   *
   * @param {string} serverName - 서버 이름
   * @param {Error} error - 에러 객체
   * @param {object} metadata - 추가 메타데이터
   */
  logError(serverName, error, metadata = {}) {
    if (!this.options.enabled) return;

    this.stats.errors++;

    const errorMessage = {
      error: error.message,
      stack: error.stack,
      code: error.code
    };

    // 파일로 저장
    if (this.options.logDir && (this.options.output === 'file' || this.options.output === 'both')) {
      this._writeMessageToFile('ERROR', serverName, errorMessage, metadata);
    }

    // 콘솔 출력
    if (this.options.output === 'console' || this.options.output === 'both') {
      const logEntry = this._formatLogEntry({
        direction: 'ERROR',
        serverName,
        message: errorMessage,
        metadata
      });
      console.log(logEntry);
    }
  }

  /**
   * 로그 엔트리 포맷팅
   */
  _formatLogEntry({ direction, serverName, message, metadata }) {
    const parts = [];

    // 타임스탬프
    if (this.options.includeTimestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    // 방향 (SEND/RECV/ERROR)
    if (this.options.includeDirection) {
      const directionIcon = {
        'SEND': '📤',
        'RECV': '📥',
        'ERROR': '❌'
      }[direction] || '';
      parts.push(`${directionIcon} ${direction}`);
    }

    // 서버 이름
    if (this.options.includeServerName && serverName) {
      parts.push(`[${serverName}]`);
    }

    // 메시지 타입 추출 (method 또는 result/error)
    if (this.options.includeMessageType && message) {
      const messageType = this._extractMessageType(message);
      if (messageType) {
        parts.push(`(${messageType})`);
      }
    }

    const header = parts.join(' ');

    // 메시지 본문
    let messageBody;
    try {
      let messageStr = JSON.stringify(message);

      // 크기 제한
      if (messageStr.length > this.options.maxMessageSize) {
        const truncated = messageStr.substring(0, this.options.maxMessageSize);
        messageStr = truncated + `... [TRUNCATED ${messageStr.length - this.options.maxMessageSize} bytes]`;
      }

      // Pretty print
      if (this.options.prettyPrint) {
        try {
          const parsed = JSON.parse(messageStr);
          messageBody = JSON.stringify(parsed, null, 2);
        } catch (e) {
          messageBody = messageStr;
        }
      } else {
        messageBody = messageStr;
      }
    } catch (error) {
      messageBody = `[Unable to serialize message: ${error.message}]`;
    }

    // 메타데이터
    let metadataStr = '';
    if (metadata && Object.keys(metadata).length > 0) {
      try {
        metadataStr = `\nMetadata: ${JSON.stringify(metadata)}`;
      } catch (error) {
        metadataStr = `\nMetadata: [Unable to serialize]`;
      }
    }

    return `${header}\n${messageBody}${metadataStr}\n${'-'.repeat(80)}\n`;
  }

  /**
   * 메시지에서 타입 추출
   */
  _extractMessageType(message) {
    if (!message || typeof message !== 'object') return null;

    // JSON-RPC 요청
    if (message.method) {
      return `${message.method}`;
    }

    // JSON-RPC 응답 (성공)
    if ('result' in message) {
      return 'result';
    }

    // JSON-RPC 응답 (에러)
    if ('error' in message) {
      return `error:${message.error?.code || 'unknown'}`;
    }

    return 'unknown';
  }


  /**
   * 통계 정보 조회
   */
  getStats() {
    return {
      ...this.stats,
      avgSentMessageSize: this.stats.sent > 0
        ? Math.round(this.stats.totalSentBytes / this.stats.sent)
        : 0,
      avgReceivedMessageSize: this.stats.received > 0
        ? Math.round(this.stats.totalReceivedBytes / this.stats.received)
        : 0,
      totalMessages: this.stats.sent + this.stats.received
    };
  }

  /**
   * 통계 정보 출력
   */
  printStats() {
    const stats = this.getStats();
    const statsReport = `
${'='.repeat(80)}
MCP Message Logger Statistics
${'='.repeat(80)}
Messages Sent:     ${stats.sent} (${this._formatBytes(stats.totalSentBytes)})
Messages Received: ${stats.received} (${this._formatBytes(stats.totalReceivedBytes)})
Errors:            ${stats.errors}
Total Messages:    ${stats.totalMessages}
Avg Sent Size:     ${this._formatBytes(stats.avgSentMessageSize)}
Avg Recv Size:     ${this._formatBytes(stats.avgReceivedMessageSize)}
${'='.repeat(80)}
`;

    console.log(statsReport);
  }

  /**
   * 바이트 크기를 읽기 쉬운 형식으로 변환
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * 로거 종료
   */
  close() {
    // 통계 출력
    if (this.options.enabled) {
      this.printStats();
    }
  }
}

/**
 * Transport에 메시지 로거 연결
 *
 * @param {object} transport - MCP Transport 객체
 * @param {string} serverName - 서버 이름
 * @param {MCPMessageLogger} logger - 로거 인스턴스
 * @returns {object} - 원본 핸들러들을 저장한 객체
 */
export function attachLoggerToTransport(transport, serverName, logger) {
  if (!logger || !logger.options.enabled) {
    return null;
  }

  // 원본 핸들러 보존
  const originalHandlers = {
    onmessage: transport.onmessage,
    onerror: transport.onerror
  };

  // onmessage 핸들러 래핑
  const originalOnMessage = transport.onmessage;
  transport.onmessage = (message) => {
    // 메시지 로깅
    logger.logReceivedMessage(serverName, message, {
      timestamp: Date.now(),
      transportType: transport.constructor.name
    });

    // 원본 핸들러 호출
    if (originalOnMessage) {
      originalOnMessage.call(transport, message);
    }
  };

  // onerror 핸들러 래핑
  const originalOnError = transport.onerror;
  transport.onerror = (error) => {
    // 에러 로깅
    logger.logError(serverName, error, {
      timestamp: Date.now(),
      transportType: transport.constructor.name
    });

    // 원본 핸들러 호출
    if (originalOnError) {
      originalOnError.call(transport, error);
    }
  };

  // Transport의 send 메서드 래핑 (송신 메시지 로깅)
  if (transport.send) {
    const originalSend = transport.send.bind(transport);
    transport.send = function(message) {
      // 메시지 로깅
      logger.logSentMessage(serverName, message, {
        timestamp: Date.now(),
        transportType: transport.constructor.name
      });

      // 원본 send 호출
      return originalSend(message);
    };
  }

  return originalHandlers;
}

/**
 * 싱글톤 인스턴스 (편의용)
 */
let defaultLogger = null;

/**
 * 기본 로거 인스턴스 가져오기
 */
export function getDefaultLogger(options = {}) {
  if (!defaultLogger) {
    defaultLogger = new MCPMessageLogger(options);
  }
  return defaultLogger;
}

/**
 * 기본 로거 인스턴스 닫기
 */
export function closeDefaultLogger() {
  if (defaultLogger) {
    defaultLogger.close();
    defaultLogger = null;
  }
}

export default MCPMessageLogger;
