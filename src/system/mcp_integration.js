import { createMCPAgent } from '../../mcp-agent-lib/index.js';
import chalk from 'chalk';
import { loadMergedMcpConfig, expandEnvVars } from '../util/mcp_config_manager.js';
import { registerMCPToolDisplay } from './tool_registry.js';
import { registerMCPTool } from './tool_approval.js';
import { createDebugLogger } from '../util/debug_log.js';

const debugLog = createDebugLogger('mcp_integration.log', 'mcp_integration');

/**
 * MCP Agent 통합 모듈
 *
 * 이 모듈은 기존 AI Agent 시스템에 MCP (Model Context Protocol) 서버 지원을 추가합니다.
 * mcp-agent-lib의 고수준 API를 활용하여 MCP 서버들과 연결하고 도구를 사용할 수 있게 합니다.
 */

export class MCPIntegration {
  constructor() {
    this.mcpAgent = null;
    this.isInitialized = false;
    this.mcpTools = new Map(); // toolName -> { server, schema, execute }
  }

  /**
   * MCP Agent 초기화 및 서버 연결
   */
  async initialize() {
    try {
      debugLog('[MCP] Integration initializing...');

      // MCP 서버 설정 파일(~/.aiexe/mcp_config.json)에서 전역 설정 로드
      debugLog('[MCP] Loading MCP config from ~/.aiexe/mcp_config.json');
      const mergedServers = await loadMergedMcpConfig();

      // MCP 서버가 설정되지 않은 경우 초기화 중단
      if (Object.keys(mergedServers).length === 0) {
        debugLog('[MCP] No MCP servers configured.');
        debugLog('[MCP]   Use "aiexecode mcp add" to configure servers.');
        return { success: false, reason: 'no_servers' };
      }

      debugLog(`[MCP] Found ${Object.keys(mergedServers).length} server(s) in config: ${Object.keys(mergedServers).join(', ')}`);

      // 각 서버 설정의 환경 변수 확장 (${VAR} 형식을 실제 값으로 치환)
      debugLog('[MCP] Expanding environment variables in server configs...');
      const servers = {};
      for (const [name, config] of Object.entries(mergedServers)) {
        try {
          debugLog(`[MCP]   Processing server '${name}' (type: ${config.type})`);
          servers[name] = expandEnvVars(config);
          debugLog(`[MCP]   ✓ Server '${name}' config ready`);
        } catch (error) {
          debugLog(`[MCP]   ✗ Error expanding env vars for server '${name}': ${error.message}`);
          debugLog(`[MCP]   Skipping server '${name}'`);
          continue;
        }
      }

      if (Object.keys(servers).length === 0) {
        debugLog('[MCP] No valid MCP servers after configuration processing.');
        return { success: false, reason: 'no_valid_servers' };
      }

      debugLog(`[MCP] ${Object.keys(servers).length} server(s) ready for connection`);

      // mcp-agent-lib에 전달할 설정 객체 생성
      const config = {
        mcpServers: servers
      };

      // mcp-agent-lib의 createMCPAgent()를 호출하여 MCP Agent 인스턴스 생성
      // MCP Agent는 여러 MCP 서버와의 연결 및 통신을 관리하는 핵심 객체
      debugLog('[MCP] Creating MCP Agent instance via mcp-agent-lib...');
      const logLevel = process.env.MCP_LOG_LEVEL || 'info';
      const consoleDebug = process.env.MCP_DEBUG === 'true';
      debugLog(`[MCP]   Log level: ${logLevel}, Console debug: ${consoleDebug}`);

      this.mcpAgent = await createMCPAgent({
        logLevel: logLevel,
        enableConsoleDebug: consoleDebug
      });
      debugLog('[MCP] MCP Agent instance created');

      // MCP Agent 초기화: 설정된 모든 MCP 서버에 연결 시도
      // stdio, http, sse 등 다양한 전송 방식을 지원
      debugLog('[MCP] Initializing MCP Agent and connecting to servers...');
      await this.mcpAgent.initialize(config);
      debugLog('[MCP] MCP Agent initialization complete');

      // 연결된 모든 MCP 서버로부터 사용 가능한 도구(tool) 목록 조회
      debugLog('[MCP] Fetching available tools from connected servers...');
      const availableTools = this.mcpAgent.getAvailableTools();

      debugLog(`[MCP] Found ${availableTools.length} tool(s) across all servers`);

      // 각 도구를 내부 맵에 저장하고 AI Agent 시스템에 등록
      debugLog('[MCP] Registering tools to AI Agent system...');
      for (const tool of availableTools) {
        debugLog(`[MCP]   Registering tool '${tool.name}' from server '${tool.server}'`);

        // AI가 도구의 출처 서버를 명확히 인식할 수 있도록 설명에 서버 이름 추가
        const enhancedDescription = tool.description
          ? `[${tool.server} MCP] - ${tool.description}`
          : `MCP tool from ${tool.server}`;

        // 도구 정보를 mcpTools Map에 저장 (toolName -> { server, schema, execute })
        this.mcpTools.set(tool.name, {
          server: tool.server,
          schema: {
            name: tool.name,
            description: enhancedDescription,
            inputSchema: tool.inputSchema || {
              type: 'object',
              properties: {},
              required: []
            }
          },
          // 도구 실행 함수: MCP Agent를 통해 실제 MCP 서버에 도구 실행 요청 전송
          execute: async (args) => {
            debugLog(`[MCP] Executing tool '${tool.name}' on server '${tool.server}'`);
            debugLog(`[MCP]   Args: ${JSON.stringify(args).substring(0, 200)}`);
            const result = await this.mcpAgent.executeTool(tool.name, args);
            debugLog(`[MCP]   Result: success=${result.success}`);
            return result;
          }
        });

        // UI 시스템에 MCP 도구 표시 정보 등록
        registerMCPToolDisplay(tool.name, tool.server);

        // 도구 승인 시스템에 MCP 도구 등록 (사용자 승인 필요 시 처리)
        registerMCPTool(tool.name, tool.server, tool.description || '');

        debugLog(`[MCP]   ✓ Tool '${tool.name}' registered`);
      }

      this.isInitialized = true;

      const serverList = Array.from(this.mcpAgent.servers.keys());
      debugLog(`[MCP] ========================================`);
      debugLog(`[MCP] Integration initialized successfully!`);
      debugLog(`[MCP]   Servers: ${serverList.join(', ')}`);
      debugLog(`[MCP]   Tools: ${availableTools.length}`);
      debugLog(`[MCP] ========================================`);

      return {
        success: true,
        toolCount: availableTools.length,
        servers: serverList
      };

    } catch (error) {
      debugLog(`[MCP] ========================================`);
      debugLog(`[MCP] Integration initialization FAILED`);
      debugLog(`[MCP]   Error: ${error.message}`);
      debugLog(`[MCP]   Stack: ${error.stack}`);
      debugLog(`[MCP]   Continuing without MCP functionality.`);
      debugLog(`[MCP] ========================================`);
      return { success: false, reason: 'initialization_error', error: error.message };
    }
  }

  /**
   * MCP 도구 목록을 실행 가능한 함수 형태로 반환
   * AI Agent의 기존 toolMap에 통합하기 위한 형식
   */
  getToolFunctions() {
    const toolFunctions = {};

    for (const [toolName, toolInfo] of this.mcpTools) {
      // 각 도구에 대한 실행 함수 생성
      toolFunctions[toolName] = async (args) => {
        try {
          // MCP Agent를 통해 도구 실행 (MCP 프로토콜로 서버와 통신)
          const result = await toolInfo.execute(args);

          // MCP 서버의 응답을 AI Agent 시스템의 표준 형식으로 변환
          if (result.success) {
            return {
              operation_successful: true,
              tool_name: toolName,
              server: toolInfo.server,
              data: result.data,
              executed_at: result.executedAt
            };
          } else {
            return {
              operation_successful: false,
              error_message: result.error || 'Unknown MCP error',
              tool_name: toolName,
              server: toolInfo.server
            };
          }
        } catch (error) {
          return {
            operation_successful: false,
            error_message: error.message,
            tool_name: toolName,
            server: toolInfo.server
          };
        }
      };
    }

    return toolFunctions;
  }

  /**
   * MCP 도구 스키마 목록을 OpenAI API 형식으로 반환
   * Orchestrator가 AI 모델에게 사용 가능한 도구 목록을 전달할 때 사용
   */
  getToolSchemas() {
    const schemas = [];

    for (const [toolName, toolInfo] of this.mcpTools) {
      // MCP 서버가 제공한 inputSchema를 OpenAI function calling 형식으로 변환
      const inputSchema = toolInfo.schema.inputSchema || {};
      const properties = inputSchema.properties || {};
      const originalRequired = inputSchema.required || [];

      // OpenAI API의 function calling 스키마 형식으로 변환
      // strict: true는 모든 properties가 required에 포함되어야 하는 제약이 있어
      // MCP 도구의 유연성을 위해 strict: false로 설정
      const cleanedSchema = {
        name: toolInfo.schema.name,
        description: toolInfo.schema.description,
        strict: false, // MCP 도구는 strict mode를 사용하지 않음
        parameters: {
          type: inputSchema.type || 'object',
          properties: properties,
          required: originalRequired,
          additionalProperties: false
        }
      };

      schemas.push(cleanedSchema);
    }

    return schemas;
  }

  /**
   * 특정 MCP 도구가 존재하는지 확인
   */
  hasTool(toolName) {
    return this.mcpTools.has(toolName);
  }

  /**
   * 연결된 MCP 서버 목록 반환
   */
  getConnectedServers() {
    if (!this.mcpAgent || !this.mcpAgent.servers) {
      return [];
    }

    return Array.from(this.mcpAgent.servers.entries()).map(([name, info]) => ({
      name,
      status: info.status || 'unknown',
      toolCount: info.tools ? info.tools.length : 0
    }));
  }

  /**
   * MCP Agent 정리 및 모든 서버 연결 종료
   * 프로그램 종료 시 호출되어 리소스를 정리
   */
  async cleanup() {
    if (this.mcpAgent) {
      try {
        debugLog('[MCP] Starting cleanup process...');
        // mcp-agent-lib 버전에 따라 cleanup() 또는 disconnect() 메서드 호출
        // 모든 MCP 서버와의 연결을 정상적으로 종료
        if (typeof this.mcpAgent.cleanup === 'function') {
          debugLog('[MCP] Calling mcpAgent.cleanup()...');
          await this.mcpAgent.cleanup();
        } else if (typeof this.mcpAgent.disconnect === 'function') {
          debugLog('[MCP] Calling mcpAgent.disconnect()...');
          await this.mcpAgent.disconnect();
        }
        debugLog('[MCP] All MCP server connections terminated successfully');
      } catch (error) {
        debugLog(`[MCP] Error during cleanup: ${error.message}`);
        debugLog(`[MCP]   Stack: ${error.stack}`);
      }
    } else {
      debugLog('[MCP] No MCP Agent to cleanup (never initialized)');
    }
  }
}

/**
 * 전역 MCP Integration 인스턴스 생성 헬퍼
 */
export async function initializeMCPIntegration() {
  debugLog('[MCP] initializeMCPIntegration() called');
  const integration = new MCPIntegration();
  const result = await integration.initialize();

  debugLog(`[MCP] initializeMCPIntegration() complete - success: ${result?.success}, reason: ${result?.reason || 'N/A'}`);

  // 서버가 없어도 객체는 반환 (빈 서버 목록으로 동작)
  return integration;
}
