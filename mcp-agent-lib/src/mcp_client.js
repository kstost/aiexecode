#!/usr/bin/env node

/**
 * MCP Agent Library - Unified Client Implementation
 * AI Agent Host를 위한 인간친화적 MCP 클라이언트 라이브러리
 * Based on @modelcontextprotocol/sdk
 *
 * @version 1.0.0
 * @author AI Agent Library Team
 */

import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

function consolelog() { }
/**
 * AI Agent를 위한 고도화된 MCP 클라이언트
 * SDK 기반 통합 구현체
 */
export class MCPAgentClient extends EventEmitter {
  constructor(options = {}) {
    super();

    // 통합된 설정 옵션 - Environment-driven configuration with safe parsing
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
      // Security configuration (no hardcoding)
      allowedCommands: ['node', 'python', 'python3', 'npx', 'deno'],
      dangerousChars: ['&', ';', '|', '`', '$', '>', '<', '*', '?'],
      responseIndicators: ['✅', '❌', 'Error:', 'Warning:', 'Info:'],
      // Security patterns (configurable)
      prototypePollutionPatterns: ['__proto__', 'constructor', 'prototype', '["__proto__"]', "['__proto__']", '["constructor"]', "['constructor']", 'Object.prototype', 'Function.prototype', 'Array.prototype'],
      // Standard client capabilities for all transports
      clientCapabilities: {
        roots: { listChanged: true },
        sampling: {},
        experimental: {}
      },
      // Standard client info
      clientInfo: {
        name: process.env.MCP_CLIENT_NAME || 'mcp-agent-lib',
        version: process.env.MCP_CLIENT_VERSION || '1.0.0'
      },
      // Internationalization
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

    // 서버 및 클라이언트 관리
    this.servers = new Map();
    this.clients = new Map();
    this.isInitialized = false;

    // 메모리 관리 - On-demand cleanup only (no dangerous intervals)
    this.memoryCleanupEnabled = options.memoryCleanupEnabled ?? true;
    this.lastCleanupTime = Date.now();
  }

  /**
   * Safe integer parsing with fallback
   */
  static _safeParseInt(value, fallback) {
    const parsed = parseInt(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  /**
   * Safe float parsing with fallback
   */
  static _safeParseFloat(value, fallback) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  /**
   * Safe JSON stringification with circular reference handling
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
      // Handle functions and undefined
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
   * Safe JSON parsing to prevent injection attacks and prototype pollution
   */
  safeJsonParse(text) {
    try {
      if (typeof text !== 'string') return text;

      // Enhanced prototype pollution detection
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

      if (text.length > this.options.maxResponseSize) {
        this.secureLog('warn', this.options.messages.responseSizeExceeds, { size: text.length, limit: this.options.maxResponseSize });
        return text;
      }

      const parsed = JSON.parse(text, (key, value) => {
        // Additional key validation during parsing
        if (typeof key === 'string' && this.options.prototypePollutionPatterns.includes(key)) {
          this.secureLog('warn', this.options.messages.dangerousKey, { key });
          return undefined; // Remove dangerous keys
        }
        return value;
      });

      if (parsed && typeof parsed === 'object') {
        // Recursively freeze objects to prevent mutation
        this.deepFreeze(parsed);
      }
      return parsed;
    } catch (error) {
      this.secureLog('error', this.options.messages.jsonParsingFailed, { error: error.message });
      return text;
    }
  }

  /**
   * Deep freeze objects recursively to prevent mutation
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
   * Create standardized MCP error
   */
  createMCPError(code, message, data = null) {
    const error = new Error(message);
    error.code = code;
    error.data = data;
    return error;
  }

  /**
   * Secure logging
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
   * Sanitize log data
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
   * Debug logging helper
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
   * 간단한 초기화 - JSON 설정 객체로 연결
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

      await this.connectFromConfig(configuration);
      this.isInitialized = true;

      // 서버 정보 수집
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
   * Validate server configuration for security
   */
  validateServerConfig(serverName, serverConfig) {
    if (!serverName || typeof serverName !== 'string') {
      throw new Error('Server name must be a non-empty string');
    }

    if (!serverConfig || typeof serverConfig !== 'object') {
      throw new Error('Server config must be an object');
    }

    // Validate command execution for any server that has a command
    if (serverConfig.command) {
      const allowedCommands = this.options.allowedCommands || ['node', 'python', 'python3', 'npx', 'deno'];

      if (!allowedCommands.includes(serverConfig.command)) {
        throw new Error(`Command '${serverConfig.command}' is not allowed. Allowed commands: ${allowedCommands.join(', ')}`);
      }

      // Validate arguments to prevent injection
      if (serverConfig.args && Array.isArray(serverConfig.args)) {
        const dangerousChars = this.options.dangerousChars || ['&', ';', '|', '`', '$', '>', '<', '*', '?'];
        for (const arg of serverConfig.args) {
          if (typeof arg !== 'string' || dangerousChars.some(char => arg.includes(char))) {
            throw new Error(`Argument '${arg}' contains potentially dangerous characters`);
          }
        }
      }

      // Validate environment variables
      if (serverConfig.env && typeof serverConfig.env === 'object') {
        for (const [key, value] of Object.entries(serverConfig.env)) {
          if (typeof key !== 'string' || typeof value !== 'string') {
            throw new Error('Environment variables must be string key-value pairs');
          }
        }
      }
    }

    // Validate HTTP URLs
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
   * Connect to all servers defined in configuration
   */
  async connectFromConfig(config) {
    if (!config || !config.mcpServers) {
      this._log('warn', '⚠️ No MCP servers defined in configuration');
      return [];
    }

    const results = [];

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        // Validate configuration before connecting - security validation should fail fast
        this.validateServerConfig(serverName, serverConfig);

        this._log('info', `🔗 Connecting to server: ${serverName}`);

        let server;

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
        // If this is a security validation error, re-throw immediately
        if (error.message.includes('not allowed') || error.message.includes('dangerous characters')) {
          throw error;
        }
        // For other connection errors, log and continue
        this._log('error', `❌ Failed to connect to ${serverName}: ${error.message}`);
        results.push({ name: serverName, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Connect to an MCP server using stdio transport
   */
  async connectToStdioServer(serverName, serverConfig) {
    try {
      this._log('info', `🔌 Connecting to STDIO server: ${serverName}`);

      // Create SDK transport with server parameters - SDK will handle spawning
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: serverConfig.env,
        cwd: serverConfig.cwd,
        stderr: 'pipe' // Capture stderr for logging
      });

      const client = new Client(
        this.options.clientInfo,
        {
          capabilities: this.options.clientCapabilities
        }
      );

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

      // Setup stderr logging if available
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

      // Setup transport event handlers
      transport.onerror = (error) => {
        this._log('error', `💥 Transport error for ${serverName}: ${error}`);
        this.emit('serverError', serverName, error);
      };

      transport.onclose = () => {
        this._log('info', `🔌 ${serverName} disconnected`);
        this._setServerStatus(serverName, 'disconnected');
        this.emit('serverDisconnected', serverName);
      };

      // Connect using SDK
      await client.connect(transport);

      // Get server capabilities and info
      server.capabilities = client.getServerCapabilities();
      this._setServerStatus(serverName, 'connected');

      // 서버 정보를 먼저 저장
      this.servers.set(serverName, server);
      this.clients.set(serverName, client);

      // Wait for server to be ready before querying capabilities
      await this._waitForServerReady(client, serverName);

      // List available capabilities - 이것이 server 객체를 업데이트함
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
   * 도구 실행 - 자동으로 적절한 서버 찾아서 실행
   */
  async executeTool(toolName, args = {}, options = {}) {
    this._ensureInitialized();

    const { timeout = this.options.timeout, retries = this.options.retries } = options;

    // 도구를 제공하는 서버 찾기
    const serverName = this._findServerForTool(toolName);
    if (!serverName) {
      throw new Error(this.options.messages.toolNotFound(toolName));
    }

    this._log('info', this.options.messages.toolExecuting(toolName, serverName));
    this._log('debug', `📝 인수: ${JSON.stringify(args)}`);

    let lastError;
    const maxAttempts = Math.max(1, retries);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.callTool(serverName, toolName, args);

        if (result.isError) {
          throw new Error(result.content[0]?.text || this.options.messages.unknownError);
        }

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

        // Check if server became disconnected
        const serverInfo = this.servers.get(serverName);
        if (serverInfo && !this._isServerConnected(serverInfo)) {
          this._log('error', `Server ${serverName} disconnected during tool execution`);
          throw new Error(`Server ${serverName} is no longer connected`);
        }

        if (attempt < maxAttempts) {
          // Robust exponential backoff with proper bounds
          const delay = this._calculateRetryDelay(attempt);
          await this._delay(delay);
        }
      }
    }

    this._log('error', this.options.messages.toolFinalFail(toolName));
    const errorMessage = lastError?.message || lastError?.toString() || this.options.messages.unknownError;
    throw new Error(this.options.messages.toolFailedWithRetries(toolName, maxAttempts, errorMessage));
  }

  /**
   * Call a tool on a specific server
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

  // Private helper methods

  _ensureInitialized() {
    if (!this.isInitialized) throw new Error('초기화가 필요합니다. initialize()를 먼저 호출하세요.');
  }

  _findServerForTool(toolName) {
    for (const [name, info] of this.servers) {
      if (this._isServerConnected(info) &&
          info.tools.some(tool => tool.name === toolName)) return name;
    }
    return null;
  }

  _cleanToolResult(result) {
    if (!result.content || !Array.isArray(result.content)) {
      return result;
    }

    // If result is marked as raw text, return text without JSON parsing
    if (result._isRawText) {
      if (result.content.length === 1 && result.content[0].type === 'text') {
        return result.content[0].text;
      }
      return result.content.map(item => item.type === 'text' ? item.text : item);
    }

    if (result.content.length === 1 && result.content[0].type === 'text') {
      const text = result.content[0].text;
      // Only try to parse as JSON if it looks like structured data
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
   * Centralized server state management
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
   * Check if server is connected (unified status check)
   */
  _isServerConnected(server) {
    if (!server) return false;
    return server.status === 'connected' || server.status === 'partially_connected';
  }

  /**
   * Get server status with fallback
   */
  _getServerStatus(serverName) {
    const server = this.servers.get(serverName);
    if (!server) return 'unknown';
    return server.status || (server.connected ? 'connected' : 'disconnected');
  }

  /**
   * Wait for server to be fully ready before querying capabilities
   */
  /**
   * Robust server readiness checking with exponential backoff
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
   * Get basic server info for readiness checking
   */
  async _getServerInfo(client) {
    try {
      // Try to get server capabilities/info without causing errors
      return await client.getServerCapabilities?.() || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate retry delay with proper exponential backoff and bounds
   */
  _calculateRetryDelay(attempt) {
    const baseDelay = this.options.retryDelay;
    const maxDelay = this.options.maxRetryDelay;

    // Exponential backoff: baseDelay * 2^(attempt-1)
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

    // Add jitter (configurable % of the delay) to prevent thundering herd
    const jitterPercent = MCPAgentClient._safeParseFloat(process.env.MCP_JITTER_PERCENT, 0.15); // Default 15%
    const jitter = exponentialDelay * jitterPercent * Math.random();

    // Cap at maximum delay
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  /**
   * Check if text looks like JSON that should be parsed
   */
  _looksLikeJson(text) {
    if (typeof text !== 'string' || text.length === 0) return false;

    // Skip if it's likely a base64 encoded string
    if (/^[A-Za-z0-9+/]*={0,2}$/.test(text.trim())) return false;

    // Skip if it starts with response indicators (configurable)
    const responseIndicators = this.options.responseIndicators || ['✅', '❌', 'Error:', 'Warning:', 'Info:'];
    if (responseIndicators.some(indicator => text.startsWith(indicator))) return false;

    // Only parse if it starts with { or [ (likely JSON)
    const trimmed = text.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
           (trimmed.startsWith('[') && trimmed.endsWith(']'));
  }

  /**
   * 메모리 정리 작업 수행
   */
  /**
   * Safe on-demand memory cleanup - only when needed
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

      this.secureLog('info', 'MCP Agent Client cleanup completed');
    } catch (error) {
      this.secureLog('error', 'Error during cleanup', { error: error.message });
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _categorizeTool(toolName) {
    return 'tool';
  }
}

/**
 * 팩토리 함수 - 간편한 인스턴스 생성
 */
export function createMCPAgent(options = {}) {
  return new MCPAgentClient(options);
}

/**
 * 빠른 시작 함수 - JSON 설정 객체로 즉시 초기화
 */
export async function quickStart(config = {}, options = {}) {
  const agent = new MCPAgentClient(options);
  await agent.initialize(config);
  return agent;
}

// 기본 export
export default MCPAgentClient;