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
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.mcpAgent = null;
    this.isInitialized = false;
    this.mcpTools = new Map(); // toolName -> { server, schema, execute }
  }

  /**
   * MCP Agent 초기화 및 서버 연결
   */
  async initialize() {
    try {
      debugLog('MCP Integration initializing...');

      // MCP 서버 설정 파일(~/.aiexe/mcp_config.json)에서 전역 설정 로드
      const mergedServers = await loadMergedMcpConfig();

      // MCP 서버가 설정되지 않은 경우 초기화 중단
      if (Object.keys(mergedServers).length === 0) {
        debugLog('No MCP servers configured.');
        debugLog('   Use "aiexecode mcp add" to configure servers.');
        return { success: false, reason: 'no_servers' };
      }

      // 각 서버 설정의 환경 변수 확장 (${VAR} 형식을 실제 값으로 치환)
      const servers = {};
      for (const [name, config] of Object.entries(mergedServers)) {
        try {
          servers[name] = expandEnvVars(config);
        } catch (error) {
          debugLog(`Error expanding env vars for server '${name}': ${error.message}`);
          debugLog(`   Skipping server '${name}'`);
          continue;
        }
      }

      if (Object.keys(servers).length === 0) {
        debugLog('No valid MCP servers after configuration processing.');
        return { success: false, reason: 'no_valid_servers' };
      }

      // mcp-agent-lib에 전달할 설정 객체 생성
      const config = {
        mcpServers: servers
      };

      // mcp-agent-lib의 createMCPAgent()를 호출하여 MCP Agent 인스턴스 생성
      // MCP Agent는 여러 MCP 서버와의 연결 및 통신을 관리하는 핵심 객체
      this.mcpAgent = await createMCPAgent({
        logLevel: process.env.MCP_LOG_LEVEL || 'info',
        enableConsoleDebug: process.env.MCP_DEBUG === 'true'
      });

      // MCP Agent 초기화: 설정된 모든 MCP 서버에 연결 시도
      // stdio, http, sse 등 다양한 전송 방식을 지원
      await this.mcpAgent.initialize(config);

      // 연결된 모든 MCP 서버로부터 사용 가능한 도구(tool) 목록 조회
      const availableTools = this.mcpAgent.getAvailableTools();

      debugLog(`MCP Agent initialization complete: ${availableTools.length} tool(s) available`);

      // 각 도구를 내부 맵에 저장하고 AI Agent 시스템에 등록
      for (const tool of availableTools) {
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
            return await this.mcpAgent.executeTool(tool.name, args);
          }
        });

        // UI 시스템에 MCP 도구 표시 정보 등록
        registerMCPToolDisplay(tool.name, tool.server);

        // 도구 승인 시스템에 MCP 도구 등록 (사용자 승인 필요 시 처리)
        registerMCPTool(tool.name, tool.server, tool.description || '');

        debugLog(`  - ${tool.name} (from ${tool.server})`);
      }

      this.isInitialized = true;
      return {
        success: true,
        toolCount: availableTools.length,
        servers: Array.from(this.mcpAgent.servers.keys())
      };

    } catch (error) {
      debugLog(`MCP Integration initialization failed: ${error.message}`);
      debugLog('   Continuing without MCP functionality.');
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
        // mcp-agent-lib 버전에 따라 cleanup() 또는 disconnect() 메서드 호출
        // 모든 MCP 서버와의 연결을 정상적으로 종료
        if (typeof this.mcpAgent.cleanup === 'function') {
          await this.mcpAgent.cleanup();
        } else if (typeof this.mcpAgent.disconnect === 'function') {
          await this.mcpAgent.disconnect();
        }
        debugLog('MCP Agent connection terminated');
      } catch (error) {
        debugLog(`Error during MCP Agent termination: ${error.message}`);
      }
    }
  }
}

/**
 * 전역 MCP Integration 인스턴스 생성 헬퍼
 */
export async function initializeMCPIntegration(projectRoot = process.cwd()) {
  const integration = new MCPIntegration(projectRoot);
  const result = await integration.initialize();

  // 서버가 없어도 객체는 반환 (빈 서버 목록으로 동작)
  return integration;
}
