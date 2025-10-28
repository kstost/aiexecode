#!/usr/bin/env node

/**
 * MCP Agent Library - Main Entry Point
 * AI Agent Host를 위한 인간친화적 MCP 클라이언트 라이브러리
 * 
 * @version 1.0.0
 * @author AI Agent Library Team
 */

// 통합된 메인 라이브러리 re-export
export {
  MCPAgentClient,
  createMCPAgent,
  quickStart
} from './src/mcp_client.js';

// 기본 export
export { MCPAgentClient as default } from './src/mcp_client.js';