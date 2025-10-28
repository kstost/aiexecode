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

      // 전역 설정 로드
      const mergedServers = await loadMergedMcpConfig();

      // Skip if no MCP servers are configured
      if (Object.keys(mergedServers).length === 0) {
        debugLog('No MCP servers configured.');
        debugLog('   Use "aiexecode mcp add" to configure servers.');
        return { success: false, reason: 'no_servers' };
      }

      // 환경 변수 확장
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

      // MCP 설정 객체 생성
      const config = {
        mcpServers: servers
      };

      // mcp-agent-lib를 사용하여 MCP Agent 생성
      this.mcpAgent = await createMCPAgent({
        logLevel: process.env.MCP_LOG_LEVEL || 'info',
        enableConsoleDebug: process.env.MCP_DEBUG === 'true'
      });

      // MCP Agent 초기화 (서버 연결)
      await this.mcpAgent.initialize(config);

      // 사용 가능한 도구 목록 가져오기
      const availableTools = this.mcpAgent.getAvailableTools();

      debugLog(`MCP Agent initialization complete: ${availableTools.length} tool(s) available`);

      // 도구 정보를 맵에 저장
      for (const tool of availableTools) {
        // Description에 서버 정보를 명확하게 표시 (AI가 서버를 식별할 수 있도록)
        const enhancedDescription = tool.description
          ? `[${tool.server} MCP] - ${tool.description}`
          : `MCP tool from ${tool.server}`;

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
          execute: async (args) => {
            return await this.mcpAgent.executeTool(tool.name, args);
          }
        });

        // UI 표시 설정 등록
        registerMCPToolDisplay(tool.name, tool.server);

        // 승인 시스템에 MCP 도구 등록
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
   * MCP 도구 목록 반환 (기존 toolMap에 통합하기 위한 형식)
   */
  getToolFunctions() {
    const toolFunctions = {};

    for (const [toolName, toolInfo] of this.mcpTools) {
      toolFunctions[toolName] = async (args) => {
        try {
          const result = await toolInfo.execute(args);

          // MCP 결과를 기존 시스템 형식으로 변환
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
   * MCP 도구 스키마 목록 반환 (Orchestrator에 전달하기 위한 형식)
   */
  getToolSchemas() {
    const schemas = [];

    for (const [toolName, toolInfo] of this.mcpTools) {
      // OpenAI API strict mode 요구사항에 맞게 스키마 변환
      const inputSchema = toolInfo.schema.inputSchema || {};
      const properties = inputSchema.properties || {};
      const originalRequired = inputSchema.required || [];

      // strict: true일 때는 required에 모든 properties 키가 포함되어야 함
      // 하지만 이는 너무 엄격하므로, strict: false로 설정하거나
      // additionalProperties: false를 추가하되 required는 원본 유지
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
   * MCP Agent 정리 (프로그램 종료 시 호출)
   */
  async cleanup() {
    if (this.mcpAgent) {
      try {
        // mcp-agent-lib는 cleanup() 메서드를 사용
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
