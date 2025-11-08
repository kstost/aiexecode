#!/usr/bin/env node

/**
 * MCP Agent Library - Unified Client Implementation
 * AI Agent Host를 위한 인간친화적 MCP 클라이언트 라이브러리
 * Based on @modelcontextprotocol/sdk
 *
 * @version 1.0.0
 * @author AI Agent Library Team
 */

// Node.js 이벤트 시스템 - 서버 연결/해제 등의 이벤트를 외부로 발행하기 위해 사용
import { EventEmitter } from 'events';
// MCP SDK의 핵심 클라이언트 - 실제 MCP 프로토콜 통신 담당
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// Stdio 전송: 로컬 프로세스를 spawn하여 stdin/stdout으로 통신
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// SSE 전송: Server-Sent Events 기반 HTTP 스트리밍 통신
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
// HTTP 전송: 일반 HTTP/HTTPS 요청-응답 기반 통신
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// RAW 메시지 로거
import { MCPMessageLogger, attachLoggerToTransport } from './mcp_message_logger.js';

// 내부 디버그용 로그 함수 - 실제로는 아무 작업도 하지 않음 (성능 최적화)
function consolelog() { }

/**
 * MCPAgentClient - MCP 서버들과 통신하는 메인 클라이언트 클래스
 *
 * 주요 기능:
 * - 여러 MCP 서버에 동시 연결 (stdio/HTTP/SSE 방식 지원)
 * - Tool 실행, Resource 읽기, Prompt 가져오기 등 MCP 기능 제공
 * - 자동 재시도, 에러 핸들링, 보안 검증 내장
 * - 이벤트 기반 상태 알림 (연결/해제/에러)
 */
export class MCPAgentClient extends EventEmitter {
  constructor(options = {}) {
    super();

    // 클라이언트 설정 초기화
    // 환경변수(process.env.MCP_*)와 options 매개변수를 병합하여 우선순위 적용
    // 타임아웃, 재시도, 로깅, 보안 정책 등 모든 동작 방식을 제어
    this.options = {
      autoConnect: options.autoConnect ?? true,
      logLevel: options.logLevel || process.env.MCP_LOG_LEVEL || 'info',
      timeout: MCPAgentClient._safeParseInt(process.env.MCP_TIMEOUT || options.timeout, 30000),
      retries: MCPAgentClient._safeParseInt(process.env.MCP_RETRIES || options.retries, 3),
      maxResponseSize: MCPAgentClient._safeParseInt(process.env.MCP_MAX_RESPONSE_SIZE || options.maxResponseSize, 1024 * 1024),
      maxRequestIds: MCPAgentClient._safeParseInt(process.env.MCP_MAX_REQUEST_IDS || options.maxRequestIds, 10000),
      processKillTimeout: MCPAgentClient._safeParseInt(process.env.MCP_PROCESS_KILL_TIMEOUT || options.processKillTimeout, 5000),
      retryDelay: MCPAgentClient._safeParseInt(process.env.MCP_RETRY_DELAY || options.retryDelay, 1000),
      maxRetryDelay: MCPAgentClient._safeParseInt(process.env.MCP_MAX_RETRY_DELAY || options.maxRetryDelay, 30000),
      maxLogLength: MCPAgentClient._safeParseInt(process.env.MCP_MAX_LOG_LENGTH || options.maxLogLength, 100),
      enableConsoleDebug: options.enableConsoleDebug ?? (process.env.MCP_DEBUG === 'true'),
      enableLogging: options.enableLogging ?? true,
      maxJsonSize: MCPAgentClient._safeParseInt(process.env.MCP_MAX_JSON_SIZE || options.maxJsonSize, 10 * 1024 * 1024),
      serverReadyTimeout: MCPAgentClient._safeParseInt(process.env.MCP_SERVER_READY_TIMEOUT || options.serverReadyTimeout, 10000),
      serverReadyRetries: MCPAgentClient._safeParseInt(process.env.MCP_SERVER_READY_RETRIES || options.serverReadyRetries, 5),

      // 보안 설정: stdio 서버에서 실행 가능한 명령어 화이트리스트
      allowedCommands: ['node', 'python', 'python3', 'npx', 'deno'],

      // 보안 설정: 명령 인자에서 금지되는 셸 특수문자 (command injection 방지)
      dangerousChars: ['&', ';', '|', '`', '$', '>', '<', '*', '?'],

      // 응답 파싱: JSON으로 파싱하지 않을 응답의 시작 패턴들
      responseIndicators: ['✅', '❌', 'Error:', 'Warning:', 'Info:'],

      // 보안 설정: 프로토타입 오염 공격 탐지 패턴 (prototype pollution 방지)
      prototypePollutionPatterns: ['__proto__', 'constructor', 'prototype', '["__proto__"]', "['__proto__']", '["constructor"]', "['constructor']", 'Object.prototype', 'Function.prototype', 'Array.prototype'],

      // MCP 프로토콜: 이 클라이언트가 지원하는 기능들을 서버에 알림
      clientCapabilities: {
        roots: { listChanged: true },
        sampling: {},
        experimental: {}
      },

      // MCP 프로토콜: 클라이언트 식별 정보
      clientInfo: {
        name: process.env.MCP_CLIENT_NAME || 'mcp-agent-lib',
        version: process.env.MCP_CLIENT_VERSION || '1.0.0'
      },

      // 사용자 메시지 템플릿 (다국어 지원용)
      messages: {
        initStart: '🚀 MCP Agent Client 초기화 중...',
        emptyConfig: '⚠️ 빈 설정으로 초기화합니다. 서버를 연결하려면 mcpServers 설정을 제공하세요.',
        connectSuccess: (count) => `✅ ${count}개 서버에 성공적으로 연결됨`,
        initFailed: (error) => `❌ 초기화 실패: ${error}`,
        initFailedPrefix: 'MCP Agent Client 초기화 실패',
        serverNotConnected: (name) => `서버 '${name}'이 연결되지 않았습니다.`,
        toolNotFound: (name) => `도구 '${name}'을 제공하는 서버를 찾을 수 없습니다.`,
        toolExecuting: (tool, server) => `🔧 도구 실행: ${tool} (서버: ${server})`,
        toolSuccess: (tool) => `✅ 도구 실행 완료: ${tool}`,
        toolRetry: (attempt, max, error) => `⚠️ 도구 실행 시도 ${attempt}/${max} 실패: ${error}`,
        toolFinalFail: (tool) => `❌ 도구 실행 최종 실패: ${tool}`,
        toolFailedWithRetries: (tool, retries, error) => `도구 '${tool}' 실행 실패 (${retries}회 시도): ${error}`,
        prototypePollution: 'Potential prototype pollution attempt detected',
        dangerousKey: 'Dangerous key detected during JSON parsing',
        responseSizeExceeds: 'Response size exceeds limit',
        jsonParsingFailed: 'JSON parsing failed',
        unknownError: 'Unknown error',
        onlyHttpsAllowed: 'Only HTTP and HTTPS protocols are allowed',
        unknownServerType: (type, name) => `❌ Unknown server type: ${type} for ${name}`
      },
      ...options
    };

    // 연결된 서버들의 정보 저장소
    // servers: 서버 메타데이터(이름, 타입, tools, resources, prompts 등)
    // clients: 실제 MCP SDK Client 인스턴스들
    this.servers = new Map();
    this.clients = new Map();
    this.isInitialized = false;

    // 메모리 관리 설정
    // 연결 해제된 서버 정보를 주기적으로 정리 (interval 대신 on-demand 방식)
    this.memoryCleanupEnabled = options.memoryCleanupEnabled ?? true;
    this.lastCleanupTime = Date.now();

    // RAW 메시지 로거 초기화
    this.messageLogger = options.messageLogger || new MCPMessageLogger({
      enabled: options.enableRawMessageLogging ?? false,
      ...options.messageLoggerOptions
    });
  }

  /**
   * 정수 파싱 유틸리티
   *
   * 환경변수나 설정값을 안전하게 숫자로 변환
   * 파싱 실패 시 기본값(fallback) 반환
   */
  static _safeParseInt(value, fallback) {
    const parsed = parseInt(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  /**
   * 실수 파싱 유틸리티
   *
   * _safeParseInt와 동일하지만 소수점 숫자 처리
   */
  static _safeParseFloat(value, fallback) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  /**
   * 안전한 JSON 직렬화
   *
   * 문제점:
   * - 순환 참조가 있는 객체는 JSON.stringify 시 에러 발생
   * - 함수나 undefined는 JSON으로 변환 불가
   *
   * 해결책:
   * - WeakSet으로 이미 방문한 객체 추적하여 순환 참조 탐지
   * - 함수와 undefined를 문자열로 표현
   */
  safeJsonStringify(obj, space = null) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      if (typeof value === 'function') {
        return '[Function]';
      }
      if (value === undefined) {
        return '[Undefined]';
      }
      return value;
    }, space);
  }

  /**
   * 안전한 JSON 파싱
   *
   * 보안 위협:
   * 1. Prototype Pollution: __proto__, constructor 등을 이용한 공격
   * 2. JSON Injection: 악의적인 JSON 데이터 삽입
   *
   * 보안 대책:
   * 1. 위험한 패턴 사전 검사 (prototypePollutionPatterns)
   * 2. 응답 크기 제한 (maxResponseSize)
   * 3. 파싱 중 위험한 키 제거
   * 4. 파싱 후 객체를 freeze하여 변경 불가능하게 만듦
   */
  safeJsonParse(text) {
    try {
      if (typeof text !== 'string') return text;

      // 1단계: 프로토타입 오염 패턴 사전 검사
      const dangerousPatterns = this.options.prototypePollutionPatterns;

      const lowerText = text.toLowerCase();
      for (const pattern of dangerousPatterns) {
        if (lowerText.includes(pattern.toLowerCase())) {
          const logLimit = MCPAgentClient._safeParseInt(process.env.MCP_LOG_TEXT_LIMIT, 100);
          this.secureLog('warn', this.options.messages.prototypePollution, {
            text: text.substring(0, logLimit)
          });
          return text;
        }
      }

      // 2단계: 응답 크기 검사 (DoS 공격 방지)
      if (text.length > this.options.maxResponseSize) {
        this.secureLog('warn', this.options.messages.responseSizeExceeds, { size: text.length, limit: this.options.maxResponseSize });
        return text;
      }

      // 3단계: JSON 파싱 with reviver 함수
      // reviver: 각 key-value 파싱 시 호출되어 위험한 키 필터링
      const parsed = JSON.parse(text, (key, value) => {
        if (typeof key === 'string' && this.options.prototypePollutionPatterns.includes(key)) {
          this.secureLog('warn', this.options.messages.dangerousKey, { key });
          return undefined;
        }
        return value;
      });

      // 4단계: 파싱된 객체를 재귀적으로 freeze (불변성 보장)
      if (parsed && typeof parsed === 'object') {
        this.deepFreeze(parsed);
      }
      return parsed;
    } catch (error) {
      this.secureLog('error', this.options.messages.jsonParsingFailed, { error: error.message });
      return text;
    }
  }

  /**
   * 객체 재귀적 동결
   *
   * Object.freeze()는 얕은 동결만 수행
   * 이 메서드는 중첩된 모든 객체를 재귀적으로 동결하여
   * 파싱된 JSON 데이터의 완전한 불변성 보장
   */
  deepFreeze(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    Object.getOwnPropertyNames(obj).forEach(name => {
      const prop = obj[name];
      if (prop && typeof prop === 'object') {
        this.deepFreeze(prop);
      }
    });

    return Object.freeze(obj);
  }

  /**
   * MCP 표준 에러 생성
   *
   * MCP 프로토콜은 JSON-RPC 기반이므로 에러에 code와 data 필드 포함
   * code: JSON-RPC 에러 코드 (예: -32602 = Invalid params)
   */
  createMCPError(code, message, data = null) {
    const error = new Error(message);
    error.code = code;
    error.data = data;
    return error;
  }

  /**
   * 보안 로깅 시스템
   *
   * 기능:
   * 1. 로그 레벨 필터링 (debug < info < warn < error < silent)
   * 2. 민감 정보 자동 제거 (sanitizeLogData 호출)
   * 3. 타임스탬프 자동 추가
   */
  secureLog(level, message, data = {}) {
    if (!this.options.enableLogging) return;

    const levels = ['debug', 'info', 'warn', 'error', 'silent'];
    const currentLevelIndex = levels.indexOf(this.options.logLevel);
    const messageLevelIndex = levels.indexOf(level);

    if (currentLevelIndex === -1 || messageLevelIndex === -1 ||
        messageLevelIndex < currentLevelIndex || this.options.logLevel === 'silent') {
      return;
    }

    const sanitizedData = this.sanitizeLogData(data);
    const timestamp = new Date().toISOString();

    if (this.options.enableConsoleDebug) {
      console[level](`[${timestamp}] MCP ${level.toUpperCase()}: ${message}`, sanitizedData);
    }
  }

  /**
   * 로그 데이터 민감정보 제거
   *
   * 보안을 위해 로그에 출력되는 데이터에서 민감 정보 제거:
   * - auth, token, key, secret, password 등이 포함된 필드는 [REDACTED]로 대체
   * - 너무 긴 문자열은 잘라내고 [TRUNCATED] 표시
   */
  sanitizeLogData(data) {
    if (!data || typeof data !== 'object') return data;

    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes('auth') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('key') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('password')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > this.options.maxLogLength) {
        sanitized[key] = value.substring(0, this.options.maxLogLength) + '...[TRUNCATED]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * 간단한 로깅 헬퍼
   *
   * secureLog와 유사하지만 더 간단한 버전
   * 이모지 아이콘과 함께 로그 출력
   */
  _log(level, message) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
    const currentLevel = levels[this.options.logLevel] || 1;
    const messageLevel = levels[level] || 1;

    if (messageLevel >= currentLevel) {
      const timestamp = new Date().toISOString();
      const prefix = {
        debug: '🐛',
        info: '📋',
        warn: '⚠️',
        error: '❌'
      }[level] || '📋';

      if (this.options.enableConsoleDebug) {
        consolelog(`${prefix} [${timestamp}] ${message}`);
      }
    }
  }

  /**
   * 클라이언트 초기화
   *
   * 설정 객체(config)를 받아서 여러 MCP 서버에 연결
   *
   * config 형식:
   * {
   *   mcpServers: {
   *     "서버이름": {
   *       type: "stdio" | "http" | "sse",
   *       command: "node",  // stdio만
   *       args: [...],      // stdio만
   *       url: "https://...", // http/sse만
   *       headers: {...}    // http/sse만
   *     }
   *   }
   * }
   */
  async initialize(config = {}) {
    try {
      this._log('info', this.options.messages.initStart);

      let configuration;
      if (typeof config === 'string') {
        throw new Error('파일 경로는 더 이상 지원되지 않습니다. JSON 설정 객체를 직접 전달하세요.');
      } else if (Object.keys(config).length === 0) {
        this._log('warn', this.options.messages.emptyConfig);
        configuration = { mcpServers: {} };
      } else {
        configuration = config;
      }

      // 설정에 정의된 모든 서버에 연결 시도
      await this.connectFromConfig(configuration);
      this.isInitialized = true;

      // 연결 성공한 서버들의 정보 정리
      for (const [serverName, serverInfo] of this.servers) {
        if (serverInfo.connected) {
          this.servers.set(serverName, {
            name: serverName,
            type: serverInfo.type,
            tools: serverInfo.tools || [],
            capabilities: serverInfo.capabilities || {},
            status: 'connected'
          });
        }
      }

      this._log('info', this.options.messages.connectSuccess(this.servers.size));
      return true;
    } catch (error) {
      this._log('error', this.options.messages.initFailed(error?.message || error));
      throw new Error(`${this.options.messages.initFailedPrefix}: ${error?.message || error}`);
    }
  }

  /**
   * 서버 설정 보안 검증
   *
   * 연결 전에 서버 설정이 안전한지 검사:
   * 1. stdio 서버: 허용된 명령어만 실행 가능한지 확인
   * 2. stdio 서버: 인자에 위험한 셸 문자가 없는지 확인
   * 3. http 서버: URL이 http/https 프로토콜인지 확인
   * 4. 환경변수가 문자열 key-value인지 확인
   */
  validateServerConfig(serverName, serverConfig) {
    if (!serverName || typeof serverName !== 'string') {
      throw new Error('Server name must be a non-empty string');
    }

    if (!serverConfig || typeof serverConfig !== 'object') {
      throw new Error('Server config must be an object');
    }

    // stdio 서버 보안 검증
    if (serverConfig.command) {
      const allowedCommands = this.options.allowedCommands || ['node', 'python', 'python3', 'npx', 'deno'];

      // 화이트리스트에 없는 명령어는 실행 불가
      if (!allowedCommands.includes(serverConfig.command)) {
        throw new Error(`Command '${serverConfig.command}' is not allowed. Allowed commands: ${allowedCommands.join(', ')}`);
      }

      // 명령 인자에 셸 특수문자 포함 여부 검사 (command injection 방지)
      if (serverConfig.args && Array.isArray(serverConfig.args)) {
        const dangerousChars = this.options.dangerousChars || ['&', ';', '|', '`', '$', '>', '<', '*', '?'];
        for (const arg of serverConfig.args) {
          if (typeof arg !== 'string' || dangerousChars.some(char => arg.includes(char))) {
            throw new Error(`Argument '${arg}' contains potentially dangerous characters`);
          }
        }
      }

      // 환경변수 형식 검증 (문자열 key-value만 허용)
      if (serverConfig.env && typeof serverConfig.env === 'object') {
        for (const [key, value] of Object.entries(serverConfig.env)) {
          if (typeof key !== 'string' || typeof value !== 'string') {
            throw new Error('Environment variables must be string key-value pairs');
          }
        }
      }
    }

    // HTTP/SSE 서버 URL 검증
    if (serverConfig.type === 'http' && serverConfig.url) {
      try {
        const url = new URL(serverConfig.url);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error(this.options.messages.onlyHttpsAllowed);
        }
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          this.secureLog('warn', 'Connecting to localhost server', { url: serverConfig.url });
        }
      } catch (error) {
        throw new Error(`Invalid URL: ${error.message}`);
      }
    }
  }

  /**
   * 설정 파일의 모든 서버에 연결
   *
   * 각 서버 설정을 순회하며:
   * 1. 보안 검증 수행
   * 2. 서버 타입에 맞는 연결 메서드 호출
   * 3. 연결 실패 시 다른 서버 연결 계속 진행
   */
  async connectFromConfig(config) {
    if (!config || !config.mcpServers) {
      this._log('warn', '⚠️ No MCP servers defined in configuration');
      return [];
    }

    const results = [];

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        // 보안 검증 먼저 수행 (fail-fast)
        this.validateServerConfig(serverName, serverConfig);

        this._log('info', `🔗 Connecting to server: ${serverName}`);

        let server;

        // 서버 타입에 따라 적절한 연결 메서드 선택
        if (serverConfig.type === 'http') {
          server = await this.connectToHttpServer(serverName, serverConfig);
        } else if (serverConfig.type === 'sse') {
          server = await this.connectToSSEServer(serverName, serverConfig);
        } else if (serverConfig.type === 'stdio' || (!serverConfig.type && serverConfig.command)) {
          server = await this.connectToStdioServer(serverName, serverConfig);
        } else {
          this._log('error', this.options.messages.unknownServerType(serverConfig.type, serverName));
          continue;
        }

        results.push({ name: serverName, success: true, server });

      } catch (error) {
        // 보안 에러는 즉시 전파 (다른 서버 연결 중단)
        if (error.message.includes('not allowed') || error.message.includes('dangerous characters')) {
          throw error;
        }
        // 일반 연결 에러는 로그만 남기고 다음 서버 계속 진행
        this._log('error', `❌ Failed to connect to ${serverName}: ${error.message}`);
        results.push({ name: serverName, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Stdio 전송 방식으로 MCP 서버 연결
   *
   * 동작 방식:
   * 1. 로컬 프로세스 spawn (예: node server.js)
   * 2. stdin/stdout을 통해 JSON-RPC 통신
   * 3. stderr은 에러 로깅용으로 사용
   *
   * 주요 단계:
   * 1. SDK Transport 객체 생성
   * 2. SDK Client 생성 및 연결
   * 3. 서버 준비 대기 (_waitForServerReady)
   * 4. 사용 가능한 tools/resources/prompts 목록 조회
   */
  async connectToStdioServer(serverName, serverConfig) {
    try {
      this._log('info', `🔌 Connecting to STDIO server: ${serverName}`);

      // SDK Transport 생성 - SDK가 자동으로 프로세스 spawn
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: serverConfig.env,
        cwd: serverConfig.cwd,
        stderr: 'pipe'
      });

      // MCP SDK Client 생성
      const client = new Client(
        this.options.clientInfo,
        {
          capabilities: this.options.clientCapabilities
        }
      );

      // 서버 메타데이터 객체 생성
      const server = {
        name: serverName,
        type: 'stdio',
        transport: transport,
        capabilities: null,
        tools: [],
        resources: [],
        prompts: [],
        connected: false,
        config: serverConfig
      };

      // stderr 스트림 모니터링 설정 (서버 에러 로깅)
      const stderrStream = transport.stderr;
      if (stderrStream) {
        stderrStream.on('data', (data) => {
          const errorMsg = data.toString().trim();
          if (errorMsg.includes('tool.uv.dev-dependencies') && errorMsg.includes('deprecated')) {
            this._log('warn', `⚠️ ${serverName} Warning: ${errorMsg}`);
          } else {
            this._log('error', `❌ ${serverName} Error: ${errorMsg}`);
          }
        });
      }

      // Transport 이벤트 핸들러 설정 (연결 상태 추적)
      transport.onerror = (error) => {
        this._log('error', `💥 Transport error for ${serverName}: ${error}`);
        this.emit('serverError', serverName, error);
      };

      transport.onclose = () => {
        this._log('info', `🔌 ${serverName} disconnected`);
        this._setServerStatus(serverName, 'disconnected');
        this.emit('serverDisconnected', serverName);
      };

      // RAW 메시지 로거 연결
      attachLoggerToTransport(transport, serverName, this.messageLogger);

      // MCP 프로토콜 핸드셰이크 수행
      await client.connect(transport);

      // 서버가 제공하는 기능 정보 가져오기
      server.capabilities = client.getServerCapabilities();
      this._setServerStatus(serverName, 'connected');

      // Map에 저장 (이후 조회 가능하도록)
      this.servers.set(serverName, server);
      this.clients.set(serverName, client);

      // 서버가 완전히 준비될 때까지 대기 (재시도 로직 포함)
      await this._waitForServerReady(client, serverName);

      // 사용 가능한 tools/resources/prompts 목록 조회 및 저장
      await this.listServerCapabilities(serverName);

      // Log final server statistics without duplicate status setting
      const updatedServer = this.servers.get(serverName);
      if (updatedServer) {
        this._log('debug', `📊 Final server info - Tools: ${updatedServer.tools?.length || 0}, Resources: ${updatedServer.resources?.length || 0}, Prompts: ${updatedServer.prompts?.length || 0}`, {
          status: updatedServer.status,
          lastUpdate: updatedServer.lastStatusUpdate
        });
      }

      this._log('info', `✅ Successfully connected to ${serverName}`);
      return server;

    } catch (error) {
      this._log('error', `💥 Failed to connect to server ${serverName}: ${error}`);
      throw error;
    }
  }

  /**
   * Connect to an MCP server using HTTP transport
   */
  async connectToHttpServer(serverName, serverConfig) {
    try {
      this._log('info', `🔌 Connecting to HTTP server: ${serverName}`);
      this._log('debug', `📋 Server URL: ${serverConfig.url}`);

      const serverUrl = new URL(serverConfig.url);

      // Create SDK HTTP transport with proper headers
      const transportOptions = {};

      // Set headers via requestInit for proper HTTP request configuration
      if (serverConfig.headers) {
        this._log('debug', `🔑 Headers: ${JSON.stringify(Object.keys(serverConfig.headers))}`);
        transportOptions.requestInit = {
          headers: serverConfig.headers
        };
      }

      // Add reconnection options for better reliability
      transportOptions.reconnectionOptions = {
        maxRetries: MCPAgentClient._safeParseInt(process.env.MCP_HTTP_MAX_RETRIES || this.options.httpMaxRetries, 3),
        initialReconnectionDelay: MCPAgentClient._safeParseInt(process.env.MCP_HTTP_INITIAL_DELAY || this.options.httpInitialDelay, 1000),
        maxReconnectionDelay: MCPAgentClient._safeParseInt(process.env.MCP_HTTP_MAX_DELAY || this.options.httpMaxDelay, 10000),
        reconnectionDelayGrowFactor: MCPAgentClient._safeParseFloat(process.env.MCP_HTTP_GROWTH_FACTOR || this.options.httpGrowthFactor, 1.5)
      };

      const transport = new StreamableHTTPClientTransport(serverUrl, transportOptions);

      const client = new Client(
        this.options.clientInfo,
        {
          capabilities: this.options.clientCapabilities
        }
      );

      const server = {
        name: serverName,
        type: 'http',
        transport: transport,
        capabilities: null,
        tools: [],
        resources: [],
        prompts: [],
        connected: false,
        config: serverConfig
      };

      // Setup transport event handlers
      transport.onerror = (error) => {
        this._log('error', `💥 HTTP transport error for ${serverName}: ${error}`);
        this.emit('serverError', serverName, error);
      };

      transport.onclose = () => {
        this._log('info', `🔌 HTTP ${serverName} disconnected`);
        this._setServerStatus(serverName, 'disconnected');
        this.emit('serverDisconnected', serverName);
      };

      // RAW 메시지 로거 연결
      attachLoggerToTransport(transport, serverName, this.messageLogger);

      // Connect using SDK
      await client.connect(transport);

      // Get server capabilities and info
      server.capabilities = client.getServerCapabilities();
      this._setServerStatus(serverName, 'connected');

      this.servers.set(serverName, server);
      this.clients.set(serverName, client);

      // Wait for server to be ready before querying capabilities
      await this._waitForServerReady(client, serverName);

      // List available capabilities
      await this.listServerCapabilities(serverName);

      this._log('info', `✅ Successfully connected to HTTP server ${serverName}`);
      return server;

    } catch (error) {
      // Enhanced error handling for HTTP transport
      if (error.message && error.message.includes('401')) {
        this._log('error', `🔐 HTTP Authentication failed for ${serverName}`);
        this._log('error', `💡 Check Bearer token in configuration`);

        // Try to extract OAuth info from error
        try {
          const errorMatch = error.message.match(/\{.*\}/);
          if (errorMatch) {
            const errorData = JSON.parse(errorMatch[0]);
            if (errorData.error && errorData.error.data) {
              const authData = errorData.error.data;
              this._log('info', `🔑 OAuth endpoints available:`);
              if (authData.authorization_uri) {
                this._log('info', `   Authorization: ${authData.authorization_uri}`);
              }
              if (authData.token_uri) {
                this._log('info', `   Token: ${authData.token_uri}`);
              }
              if (authData.scope) {
                this._log('info', `   Scope: ${authData.scope}`);
              }
            }
          }
        } catch (parseError) {
          // Ignore JSON parsing errors
        }
      } else if (error.message && error.message.includes('502')) {
        this._log('error', `🌐 HTTP server unavailable for ${serverName} (502 Bad Gateway)`);
      } else if (error.message && error.message.includes('timeout')) {
        this._log('error', `⏱️ HTTP connection timeout for ${serverName}`);
      }

      this._log('error', `💥 Failed to connect to HTTP server ${serverName}: ${error}`);
      throw error;
    }
  }

  /**
   * Connect to an MCP server using SSE transport
   */
  async connectToSSEServer(name, config) {
    const transport = new SSEClientTransport(new URL(config.url), { headers: config.headers || {} });
    const client = new Client(
      this.options.clientInfo,
      {
        capabilities: this.options.clientCapabilities
      }
    );
    const server = { name, type: 'sse', transport, connected: false, tools: [], resources: [], prompts: [] };

    transport.onerror = (e) => this.emit('serverError', name, e);
    transport.onclose = () => {
      server.status = 'disconnected';
      server.connected = false; // Keep for backward compatibility
      this.emit('serverDisconnected', name);
    };

    // RAW 메시지 로거 연결
    attachLoggerToTransport(transport, name, this.messageLogger);

    await client.connect(transport);
    server.capabilities = client.getServerCapabilities();
    this._setServerStatus(name, 'connected');

    this.servers.set(name, server);
    this.clients.set(name, client);

    // Wait for server to be ready before querying capabilities
    await this._waitForServerReady(client, name);

    await this.listServerCapabilities(name);

    this._log('info', `✅ ${name} SSE 연결됨`);
    return server;
  }

  /**
   * List all capabilities of the connected server
   */
  async listServerCapabilities(serverName) {
    const server = this.servers.get(serverName);
    if (!server) return;

    try {
      this._log('debug', `🔍 Server capabilities for ${serverName}:`, server.capabilities);

      const client = this.clients.get(serverName);
      if (!client) {
        this._log('warn', `⚠️ No client found for ${serverName}`);
        return;
      }

      // Always try to list tools (even if capability is not explicitly declared)
      try {
        const toolsResponse = await client.listTools();
        server.tools = toolsResponse.tools || [];
        this._log('info', `🔧 Available tools from ${serverName}:`);
        server.tools.forEach((tool, index) => {
          this._log('info', `  ${index + 1}. ${tool.name}`);
          if (tool.description) this._log('info', `     설명: ${tool.description}`);
        });
      } catch (toolsError) {
        this._log('warn', `⚠️ Tools/list failed: ${toolsError.message}`);
        server.tools = [];
        // Mark server as partially connected if critical capabilities fail
        if (toolsError.message.includes('timeout') || toolsError.message.includes('connection')) {
          this._setServerStatus(serverName, 'partially_connected');
        }
      }

      // Always try to list resources
      let resources = [];
      try {
        const resourcesResponse = await client.listResources();
        resources = resourcesResponse.resources || [];
        this._log('info', `📄 Available resources from ${serverName}: ${resources.length} found`);
        if (resources.length > 0) {
          resources.forEach((resource, index) => {
            this._log('info', `  ${index + 1}. ${resource.name} (${resource.uri})`);
          });
        }
      } catch (resourcesError) {
        this._log('debug', `ℹ️ Resources not available from ${serverName}: ${resourcesError.message}`);
        resources = [];
        // Don't mark as partially connected for resources as they're optional
      }

      // Always try to list prompts
      let prompts = [];
      try {
        const promptsResponse = await client.listPrompts();
        prompts = promptsResponse.prompts || [];
        this._log('info', `💬 Available prompts from ${serverName}: ${prompts.length} found`);
        if (prompts.length > 0) {
          prompts.forEach((prompt, index) => {
            this._log('info', `  ${index + 1}. ${prompt.name}: ${prompt.description || 'No description'}`);
          });
        }
      } catch (promptsError) {
        this._log('debug', `ℹ️ Prompts not available from ${serverName}: ${promptsError.message}`);
        prompts = [];
        // Don't mark as partially connected for prompts as they're optional
      }

      // 새로운 서버 객체 생성하여 확실히 업데이트
      const updatedServer = {
        ...server,
        resources: resources,
        prompts: prompts,
        connected: true
      };

      // 업데이트된 서버 정보를 Map에 저장
      this.servers.set(serverName, updatedServer);

      this._log('debug', `🔄 Server ${serverName} updated: Tools=${updatedServer.tools?.length || 0}, Resources=${updatedServer.resources?.length || 0}, Prompts=${updatedServer.prompts?.length || 0}`);

    } catch (error) {
      this._log('error', `⚠️ Failed to list capabilities for ${serverName}: ${error}`);
    }
  }

  /**
   * 사용 가능한 모든 도구 목록 조회
   */
  getAvailableTools() {
    this._ensureInitialized();

    const allTools = [];
    for (const [serverName, serverInfo] of this.servers) {
      if (this._isServerConnected(serverInfo)) {
        serverInfo.tools.forEach(tool => {
          allTools.push({
            name: tool.name,
            server: serverName,
            serverName: serverName, // Add for compatibility
            description: tool.description || '',
            inputSchema: tool.inputSchema || {},
            category: this._categorizeTool(tool.name)
          });
        });
      }
    }

    return allTools;
  }

  /**
   * 서버별 도구 목록 조회
   */
  getServerTools(serverName) {
    this._ensureInitialized();

    const serverInfo = this.servers.get(serverName);
    if (!serverInfo || (serverInfo.status !== 'connected' && !serverInfo.connected)) {
      throw new Error(this.options.messages.serverNotConnected(serverName));
    }

    return serverInfo.tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || {},
      category: this._categorizeTool(tool.name)
    }));
  }

  /**
   * Tool 실행 (고수준 API)
   *
   * Tool 이름만으로 자동 실행:
   * 1. Tool을 제공하는 서버 자동 검색
   * 2. 해당 서버에서 Tool 실행
   * 3. 실패 시 자동 재시도 (exponential backoff)
   * 4. 결과 정제 및 반환
   *
   * @param toolName - 실행할 Tool 이름
   * @param args - Tool에 전달할 인자 (JSON 객체)
   * @param options - timeout, retries 등 실행 옵션
   * @returns 정제된 실행 결과
   */
  async executeTool(toolName, args = {}, options = {}) {
    this._ensureInitialized();

    const { timeout = this.options.timeout, retries = this.options.retries } = options;

    // Tool을 제공하는 서버 찾기
    const serverName = this._findServerForTool(toolName);
    if (!serverName) {
      throw new Error(this.options.messages.toolNotFound(toolName));
    }

    this._log('info', this.options.messages.toolExecuting(toolName, serverName));
    this._log('debug', `📝 인수: ${JSON.stringify(args)}`);

    // 재시도 로직
    let lastError;
    const maxAttempts = Math.max(1, retries);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.callTool(serverName, toolName, args);

        // MCP 프로토콜에서 에러 응답 처리
        if (result.isError) {
          throw new Error(result.content[0]?.text || this.options.messages.unknownError);
        }

        // 성공 시 정제된 결과 반환
        const cleanResult = {
          success: true,
          data: this._cleanToolResult(result),
          server: serverName,
          tool: toolName,
          executedAt: new Date().toISOString()
        };

        this._log('info', this.options.messages.toolSuccess(toolName));
        return cleanResult;

      } catch (error) {
        lastError = error;
        this._log('warn', this.options.messages.toolRetry(attempt, maxAttempts, error?.message || error));

        // 서버 연결 끊김 감지 시 즉시 중단
        const serverInfo = this.servers.get(serverName);
        if (serverInfo && !this._isServerConnected(serverInfo)) {
          this._log('error', `Server ${serverName} disconnected during tool execution`);
          throw new Error(`Server ${serverName} is no longer connected`);
        }

        // Exponential backoff로 재시도 지연
        if (attempt < maxAttempts) {
          const delay = this._calculateRetryDelay(attempt);
          await this._delay(delay);
        }
      }
    }

    // 모든 재시도 실패 시 최종 에러
    this._log('error', this.options.messages.toolFinalFail(toolName));
    const errorMessage = lastError?.message || lastError?.toString() || this.options.messages.unknownError;
    throw new Error(this.options.messages.toolFailedWithRetries(toolName, maxAttempts, errorMessage));
  }

  /**
   * Tool 실행 (저수준 API)
   *
   * 특정 서버의 Tool을 직접 호출
   * executeTool과 달리 서버 이름을 직접 지정해야 함
   */
  async callTool(serverName, toolName, arguments_ = {}) {
    this._log('info', `🔧 Calling tool '${toolName}' on ${serverName}`);

    const client = this.clients.get(serverName);
    if (!client) {
      throw this.createMCPError(-32602, `Server ${serverName} not found`);
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: arguments_
      });

      // Safe logging with proper error handling
      const logLimit = MCPAgentClient._safeParseInt(process.env.MCP_RESULT_LOG_LIMIT, 200);
      try {
        const resultStr = this.safeJsonStringify(result);
        this._log('info', `✅ Tool '${toolName}' result: ${resultStr.substring(0, logLimit)}`);
      } catch (error) {
        this._log('info', `✅ Tool '${toolName}' completed (result not serializable: ${error.message})`);
      }
      return result;
    } catch (error) {
      this._log('error', `❌ Tool '${toolName}' failed: ${error}`);
      throw error;
    }
  }

  /**
   * Read a resource from a specific server
   */
  async readResource(serverName, uri) {
    this._log('info', `📄 Reading resource '${uri}' from ${serverName}`);

    const client = this.clients.get(serverName);
    if (!client) {
      throw this.createMCPError(-32602, `Server ${serverName} not found`);
    }

    try {
      const result = await client.readResource({ uri });
      this._log('info', `✅ Resource '${uri}' contents retrieved`);
      return result;
    } catch (error) {
      this._log('error', `❌ Failed to read resource '${uri}': ${error}`);
      throw error;
    }
  }

  /**
   * Get a prompt from a specific server
   */
  async getPrompt(serverName, promptName, arguments_ = {}) {
    this._log('info', `💬 Getting prompt '${promptName}' from ${serverName}`);

    const client = this.clients.get(serverName);
    if (!client) {
      throw this.createMCPError(-32602, `Server ${serverName} not found`);
    }

    try {
      const result = await client.getPrompt({
        name: promptName,
        arguments: arguments_
      });

      this._log('info', `✅ Prompt '${promptName}' retrieved`);
      return result;
    } catch (error) {
      this._log('error', `❌ Failed to get prompt '${promptName}': ${error}`);
      throw error;
    }
  }

  /**
   * 서버 상태 확인
   */
  getStatus() {
    const status = {
      initialized: this.isInitialized,
      totalServers: this.servers.size,
      connectedServers: 0,
      totalTools: 0,
      servers: {}
    };

    for (const [serverName, serverInfo] of this.servers) {
      if (this._isServerConnected(serverInfo)) {
        status.connectedServers++;
        status.totalTools += serverInfo.tools.length;
      }

      status.servers[serverName] = {
        status: serverInfo.status || (serverInfo.connected ? 'connected' : 'disconnected'),
        type: serverInfo.type,
        toolCount: serverInfo.tools.length,
        tools: serverInfo.tools.map(t => t.name)
      };
    }

    return status;
  }

  /**
   * Get all available resources from all servers
   */
  async listAllResources() {
    this._ensureInitialized();
    const allResources = [];

    for (const [serverName, server] of this.servers) {
      if (this._isServerConnected(server) && server.resources) {
        for (const resource of server.resources) {
          allResources.push({ ...resource, serverName });
        }
      }
    }

    return allResources;
  }

  /**
   * Get all available prompts from all servers
   */
  async listAllPrompts() {
    this._ensureInitialized();
    const allPrompts = [];

    for (const [serverName, server] of this.servers) {
      if (this._isServerConnected(server) && server.prompts) {
        for (const prompt of server.prompts) {
          allPrompts.push({ ...prompt, serverName });
        }
      }
    }

    return allPrompts;
  }

  /**
   * Execute resource read by URI (automatically find server)
   */
  async readResource(uri) {
    this._ensureInitialized();

    for (const [serverName, server] of this.servers) {
      if (this._isServerConnected(server) && server.resources) {
        const hasResource = server.resources.some(r => r.uri === uri);
        if (hasResource) {
          return await this.readResourceFromServer(serverName, uri);
        }
      }
    }

    throw new Error(`Resource '${uri}' not found in any connected server`);
  }

  /**
   * Read resource from a specific server
   */
  async readResourceFromServer(serverName, uri) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server '${serverName}' not found or not connected`);
    }

    try {
      this._log('debug', `📖 Reading resource '${uri}' from ${serverName}`);

      const response = await client.readResource({ uri });

      if (response.contents && response.contents.length > 0) {
        // Return the first content item
        const content = response.contents[0];
        return {
          data: content.text || content.blob,
          mimeType: content.mimeType,
          uri: content.uri || uri
        };
      }

      throw new Error(`No content returned for resource '${uri}'`);
    } catch (error) {
      this._log('error', `❌ Failed to read resource '${uri}' from ${serverName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute prompt by name (automatically find server)
   */
  async executePrompt(promptName, arguments_ = {}) {
    this._ensureInitialized();

    for (const [serverName, server] of this.servers) {
      if (this._isServerConnected(server) && server.prompts) {
        const hasPrompt = server.prompts.some(p => p.name === promptName);
        if (hasPrompt) {
          return await this.getPrompt(serverName, promptName, arguments_);
        }
      }
    }

    throw new Error(`Prompt '${promptName}' not found in any connected server`);
  }

  /**
   * Get all available resources from all connected servers
   */
  getAvailableResources() {
    const allResources = [];

    this._log('debug', `🔍 Getting available resources from ${this.servers.size} servers`);

    for (const [serverName, serverInfo] of this.servers) {
      const client = this.clients.get(serverName);

      this._log('debug', `🔍 Server ${serverName}: client=${!!client}, resources=${serverInfo.resources?.length || 'none'}, isArray=${Array.isArray(serverInfo.resources)}`);

      // serverInfo.connected가 undefined일 수 있으므로 클라이언트 존재 여부로 확인
      if (client && serverInfo.resources && Array.isArray(serverInfo.resources)) {
        this._log('debug', `📄 Adding ${serverInfo.resources.length} resources from ${serverName}`);
        for (const resource of serverInfo.resources) {
          allResources.push({
            ...resource,
            serverName: serverName
          });
        }
      }
    }

    this._log('debug', `📄 Total resources collected: ${allResources.length}`);
    return allResources;
  }

  /**
   * Get all available prompts from all connected servers
   */
  getAvailablePrompts() {
    const allPrompts = [];

    for (const [serverName, serverInfo] of this.servers) {
      // serverInfo.connected가 undefined일 수 있으므로 클라이언트 존재 여부로 확인
      const client = this.clients.get(serverName);
      if (client && serverInfo.prompts && Array.isArray(serverInfo.prompts)) {
        for (const prompt of serverInfo.prompts) {
          allPrompts.push({
            ...prompt,
            serverName: serverName
          });
        }
      }
    }

    return allPrompts;
  }

  /**
   * Get server capabilities for a specific server
   */
  getServerCapabilities(serverName) {
    if (!serverName) {
      // Return capabilities from all servers
      const allCapabilities = {};
      for (const [name, server] of this.servers) {
        if (this._isServerConnected(server) && server.capabilities) {
          allCapabilities[name] = server.capabilities;
        }
      }
      return allCapabilities;
    }

    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    if (!this._isServerConnected(server)) {
      throw new Error(`Server ${serverName} is not connected`);
    }

    return server.capabilities || null;
  }

  /**
   * Disconnect from a specific server
   */
  async disconnectServer(serverName) {
    const server = this.servers.get(serverName);
    const client = this.clients.get(serverName);

    if (server) {
      this._log('info', `🔌 Disconnecting from ${serverName}`);

      // Clean up transport event handlers to prevent memory leaks
      if (server.transport) {
        try {
          // Remove event handlers
          server.transport.onerror = null;
          server.transport.onclose = null;
          server.transport.onmessage = null;

          // Close transport if it has close method
          if (typeof server.transport.close === 'function') {
            server.transport.close();
          }
        } catch (error) {
          this._log('warn', `⚠️ Transport cleanup error: ${error.message}`);
        }
      }

      // Close SDK client - this will handle additional transport cleanup
      if (client) {
        try {
          await client.close();
        } catch (error) {
          this._log('warn', `⚠️ SDK client close error: ${error.message}`);
        }
      }

      // Close transport if available - SDK handles process management
      if (server.transport && typeof server.transport.close === 'function') {
        try {
          server.transport.close();
        } catch (error) {
          this._log('warn', `⚠️ Transport close error: ${error.message}`);
        }
      }

      this.servers.delete(serverName);
      this.clients.delete(serverName);
    }
  }

  /**
   * 연결 해제
   */
  async disconnect() {
    this._log('info', '🔌 연결 해제 중...');

    try {
      // 모든 서버 연결 해제
      for (const [serverName] of this.servers) {
        await this.disconnectServer(serverName);
      }

      this.servers.clear();
      this.clients.clear();
      this.isInitialized = false;

      this._log('info', '✅ 연결 해제 완료');
    } catch (error) {
      this._log('error', `❌ 연결 해제 중 오류: ${error?.message || error}`);
    }
  }

  // ========================================
  // Private 헬퍼 메서드들
  // ========================================

  /**
   * 초기화 여부 확인
   *
   * 대부분의 메서드 시작 시 호출하여
   * initialize()가 먼저 호출되었는지 확인
   */
  _ensureInitialized() {
    if (!this.isInitialized) throw new Error('초기화가 필요합니다. initialize()를 먼저 호출하세요.');
  }

  /**
   * Tool 이름으로 서버 찾기
   *
   * 연결된 모든 서버를 순회하며 해당 Tool을 제공하는 서버 검색
   * 여러 서버가 같은 이름의 Tool을 제공할 경우 먼저 발견된 서버 반환
   */
  _findServerForTool(toolName) {
    for (const [name, info] of this.servers) {
      if (this._isServerConnected(info) &&
          info.tools.some(tool => tool.name === toolName)) return name;
    }
    return null;
  }

  /**
   * Tool 실행 결과 정제
   *
   * MCP 프로토콜 응답 형식:
   * {
   *   content: [
   *     { type: 'text', text: '...' },
   *     { type: 'image', data: '...' },
   *     ...
   *   ]
   * }
   *
   * 정제 작업:
   * 1. text 타입만 있으면 문자열로 추출
   * 2. JSON 형태면 파싱 시도
   * 3. 배열이면 각 항목 개별 처리
   */
  _cleanToolResult(result) {
    if (!result.content || !Array.isArray(result.content)) {
      return result;
    }

    // Raw text 모드: JSON 파싱 없이 그대로 반환
    if (result._isRawText) {
      if (result.content.length === 1 && result.content[0].type === 'text') {
        return result.content[0].text;
      }
      return result.content.map(item => item.type === 'text' ? item.text : item);
    }

    // 단일 text 항목: JSON 파싱 시도
    if (result.content.length === 1 && result.content[0].type === 'text') {
      const text = result.content[0].text;
      if (this._looksLikeJson(text)) {
        try {
          return this.safeJsonParse(text);
        } catch (parseError) {
          this.secureLog('debug', 'JSON parsing failed in result processing', {
            error: parseError.message,
            text: text.substring(0, 50)
          });
          return text;
        }
      }
      return text;
    }

    // 다중 항목: 각각 처리
    return result.content.map(item => {
      if (item.type === 'text') {
        if (this._looksLikeJson(item.text)) {
          try {
            return this.safeJsonParse(item.text);
          } catch (parseError) {
            this.secureLog('debug', 'JSON parsing failed for array item', {
              error: parseError.message,
              text: item.text?.substring(0, 50)
            });
            return item.text;
          }
        }
        return item.text;
      }
      return item;
    });
  }

  /**
   * 서버 상태 중앙 관리
   *
   * 서버 상태를 일관되게 업데이트하고 이벤트 발행:
   * - status와 connected 필드 동시 업데이트
   * - 상태 변경 시 'serverStatusChange' 이벤트 발행
   * - disconnected 시 메모리 정리 트리거
   *
   * 가능한 상태: connecting, connected, disconnected, partially_connected, error
   */
  _setServerStatus(serverName, status, additionalInfo = {}) {
    const server = this.servers.get(serverName);
    if (!server) return false;

    const validStatuses = ['connecting', 'connected', 'disconnected', 'partially_connected', 'error'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid server status: ${status}. Valid statuses: ${validStatuses.join(', ')}`);
    }

    // Store previous state for comparison
    const previousStatus = server.status;

    // Update both status fields consistently
    server.status = status;
    server.connected = (status === 'connected' || status === 'partially_connected');
    server.lastStatusUpdate = Date.now();

    // Add any additional info
    Object.assign(server, additionalInfo);

    if (previousStatus !== status) {
      this.secureLog('debug', `Server ${serverName} status: ${previousStatus || 'unknown'} → ${status}`, {
        ...additionalInfo
      });

      // Emit status change event
      this.emit('serverStatusChange', { serverName, status, previousStatus, server });
    }

    // Trigger cleanup if needed
    if (status === 'disconnected' && this.memoryCleanupEnabled) {
      // Defer cleanup to avoid affecting current operations
      process.nextTick(() => this.performMemoryCleanup());
    }

    return true;
  }

  /**
   * 서버 연결 상태 확인
   *
   * connected 또는 partially_connected 상태만 "연결됨"으로 간주
   */
  _isServerConnected(server) {
    if (!server) return false;
    return server.status === 'connected' || server.status === 'partially_connected';
  }

  /**
   * 서버 상태 조회 (폴백 포함)
   *
   * status 필드 우선, 없으면 connected 필드로 판단
   */
  _getServerStatus(serverName) {
    const server = this.servers.get(serverName);
    if (!server) return 'unknown';
    return server.status || (server.connected ? 'connected' : 'disconnected');
  }

  /**
   * 서버 준비 상태 대기
   *
   * 문제: 서버가 connect 직후 바로 listTools() 등을 호출하면 실패할 수 있음
   * 해결: 서버가 완전히 준비될 때까지 재시도하며 대기
   *
   * 동작:
   * 1. listTools()와 getServerCapabilities() 동시 호출
   * 2. 둘 중 하나라도 성공하면 준비된 것으로 판단
   * 3. 실패 시 exponential backoff로 재시도
   * 4. 타임아웃 또는 최대 재시도 횟수 도달 시 포기
   */
  async _waitForServerReady(client, serverName) {
    const maxRetries = this.options.serverReadyRetries;
    const timeout = this.options.serverReadyTimeout;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(`Server ${serverName} readiness timeout after ${timeout}ms`);
      }

      try {
        // Multiple readiness checks to ensure server is fully operational
        const [toolsResponse, serverInfo] = await Promise.allSettled([
          client.listTools(),
          this._getServerInfo(client)
        ]);

        const actualToolsResponse = toolsResponse.status === 'fulfilled' ? toolsResponse.value : null;
        const actualServerInfo = serverInfo.status === 'fulfilled' ? serverInfo.value : null;

        // Log any failures for debugging
        if (toolsResponse.status === 'rejected') {
          this.secureLog('debug', `Tools check failed for ${serverName}`, {
            error: toolsResponse.reason?.message || 'Unknown error'
          });
        }
        if (serverInfo.status === 'rejected') {
          this.secureLog('debug', `Server info check failed for ${serverName}`, {
            error: serverInfo.reason?.message || 'Unknown error'
          });
        }

        // Server is ready if we can actually get meaningful response
        const hasValidTools = actualToolsResponse && (
          (actualToolsResponse.tools && Array.isArray(actualToolsResponse.tools)) ||
          Array.isArray(actualToolsResponse) ||
          typeof actualToolsResponse === 'object'
        );
        const hasValidServerInfo = actualServerInfo && typeof actualServerInfo === 'object';

        // Be more lenient for server readiness - if either call succeeded, server is likely ready
        const serverReady = toolsResponse.status === 'fulfilled' || serverInfo.status === 'fulfilled';

        if (serverReady) {
          this.secureLog('debug', `Server ${serverName} is ready`, {
            attempt,
            toolsCount: actualToolsResponse?.tools?.length || 0,
            hasServerInfo: hasValidServerInfo,
            responseType: hasValidTools ? 'tools' : hasValidServerInfo ? 'serverInfo' : 'basic',
            toolsStatus: toolsResponse.status,
            serverInfoStatus: serverInfo.status
          });
          return true;
        }

      } catch (error) {
        // Don't treat expected startup errors as failures
        const isStartupError = error.message?.includes('ECONNREFUSED') ||
                              error.message?.includes('socket hang up') ||
                              error.message?.includes('not ready');

        if (attempt === maxRetries && !isStartupError) {
          throw new Error(`Server ${serverName} failed readiness check: ${error.message}`);
        }
      }

      if (attempt < maxRetries) {
        // Exponential backoff with jitter (properly bounded)
        const baseDelay = Math.min(
          MCPAgentClient._safeParseInt(process.env.MCP_MIN_RETRY_DELAY, 500),
          this.options.retryDelay
        );
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt - 1) + Math.random() * 200,
          MCPAgentClient._safeParseInt(process.env.MCP_MAX_SINGLE_RETRY_DELAY, 5000) // Configurable max single retry delay
        );

        this.secureLog('debug', `Server ${serverName} not ready, retrying...`, {
          attempt,
          nextDelay: Math.round(delay)
        });

        await this._delay(delay);
      }
    }

    // If we get here, server may be partially ready - don't fail completely
    this.secureLog('warn', `Server ${serverName} may not be fully ready, continuing anyway`);
    return false;
  }

  /**
   * 서버 정보 조회 (에러 무시)
   *
   * 준비 상태 확인용으로 서버 capabilities 조회
   * 실패해도 에러를 던지지 않고 null 반환
   */
  async _getServerInfo(client) {
    try {
      return await client.getServerCapabilities?.() || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 재시도 지연시간 계산
   *
   * Exponential backoff + jitter:
   * - 기본 지연 * 2^(attempt-1) 로 지수적 증가
   * - 랜덤 jitter 추가로 thundering herd 방지
   * - 최대 지연시간 제한
   *
   * 예: baseDelay=1000, attempt=3
   * → 1000 * 2^2 = 4000ms + jitter
   */
  _calculateRetryDelay(attempt) {
    const baseDelay = this.options.retryDelay;
    const maxDelay = this.options.maxRetryDelay;

    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

    const jitterPercent = MCPAgentClient._safeParseFloat(process.env.MCP_JITTER_PERCENT, 0.15);
    const jitter = exponentialDelay * jitterPercent * Math.random();

    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  /**
   * 텍스트가 JSON인지 판단
   *
   * 파싱 시도 여부를 결정하기 위한 휴리스틱:
   * - { } 또는 [ ]로 감싸져 있어야 함
   * - base64 문자열 제외
   * - 이모지나 'Error:' 등으로 시작하는 일반 메시지 제외
   */
  _looksLikeJson(text) {
    if (typeof text !== 'string' || text.length === 0) return false;

    if (/^[A-Za-z0-9+/]*={0,2}$/.test(text.trim())) return false;

    const responseIndicators = this.options.responseIndicators || ['✅', '❌', 'Error:', 'Warning:', 'Info:'];
    if (responseIndicators.some(indicator => text.startsWith(indicator))) return false;

    const trimmed = text.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
           (trimmed.startsWith('[') && trimmed.endsWith(']'));
  }

  /**
   * 메모리 정리
   *
   * 연결 해제된 서버 정보를 정리하여 메모리 누수 방지
   * interval 대신 on-demand 방식으로 필요시에만 실행
   * (disconnected 이벤트 발생 시 또는 명시적 호출 시)
   */
  performMemoryCleanup() {
    if (!this.memoryCleanupEnabled) return;

    const now = Date.now();
    const cleanupThresholdMs = MCPAgentClient._safeParseInt(process.env.MCP_CLEANUP_THRESHOLD_MS, 60000); // Configurable cleanup interval

    if (now - this.lastCleanupTime < cleanupThresholdMs) {
      return; // Skip if cleanup was recently performed
    }

    this.lastCleanupTime = now;

    // Clear disconnected servers that no longer have clients
    let cleanedCount = 0;
    for (const [serverName, server] of this.servers.entries()) {
      if (!this._isServerConnected(server) && !this.clients.has(serverName)) {
        this.servers.delete(serverName);
        this.secureLog('debug', 'Cleaned up disconnected server', { serverName });
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.secureLog('debug', `Memory cleanup completed: ${cleanedCount} servers removed`);
    }
  }

  /**
   * 리소스 정리
   */
  async cleanup() {
    try {
      // Final memory cleanup
      if (this.memoryCleanupEnabled) {
        this.performMemoryCleanup();
      }

      // 모든 서버 연결 해제
      await this.disconnect();

      // No additional cleanup needed (SDK handles everything)
      this.servers.clear();
      this.clients.clear();

      // RAW 메시지 로거 종료
      if (this.messageLogger) {
        this.messageLogger.close();
      }

      this.secureLog('info', 'MCP Agent Client cleanup completed');
    } catch (error) {
      this.secureLog('error', 'Error during cleanup', { error: error.message });
    }
  }

  /**
   * 지연 유틸리티
   *
   * Promise 기반 setTimeout으로 async/await에서 사용 가능
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Tool 카테고리 분류
   *
   * 향후 Tool을 카테고리별로 분류할 수 있도록 확장 가능
   * 현재는 모두 'tool'로 반환
   */
  _categorizeTool(toolName) {
    return 'tool';
  }

  /**
   * RAW 메시지 로거 통계 조회
   */
  getMessageLoggerStats() {
    if (!this.messageLogger) {
      return null;
    }
    return this.messageLogger.getStats();
  }

  /**
   * RAW 메시지 로거 통계 출력
   */
  printMessageLoggerStats() {
    if (this.messageLogger) {
      this.messageLogger.printStats();
    }
  }
}

// ========================================
// 팩토리 함수들
// ========================================

/**
 * MCPAgentClient 인스턴스 생성 헬퍼
 *
 * new MCPAgentClient(options)의 간편 버전
 *
 * @param options - 클라이언트 설정 옵션
 * @returns MCPAgentClient 인스턴스 (초기화 전 상태)
 */
export function createMCPAgent(options = {}) {
  return new MCPAgentClient(options);
}

/**
 * 빠른 시작 함수
 *
 * 클라이언트 생성 + 초기화를 한 번에 수행
 * 가장 간단하게 사용할 수 있는 방법
 *
 * 사용 예:
 * const client = await quickStart({
 *   mcpServers: {
 *     "myserver": {
 *       command: "node",
 *       args: ["server.js"]
 *     }
 *   }
 * });
 *
 * @param config - 서버 설정 (mcpServers 객체 포함)
 * @param options - 클라이언트 옵션
 * @returns 초기화 완료된 MCPAgentClient 인스턴스
 */
export async function quickStart(config = {}, options = {}) {
  const agent = new MCPAgentClient(options);
  await agent.initialize(config);
  return agent;
}

// RAW 메시지 로거도 export
export { MCPMessageLogger, attachLoggerToTransport } from './mcp_message_logger.js';

// 기본 export
export default MCPAgentClient;