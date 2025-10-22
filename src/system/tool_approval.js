/**
 * Tool Approval System - 위험한 도구 실행 전 사용자 승인
 */

import { uiEvents } from './ui_events.js';

// 승인이 필요한 도구 목록
const APPROVAL_REQUIRED_TOOLS = new Set([
    'bash',
    'run_python_code',
    'write_file',
    'edit_file_range',
    'edit_file_replace'
]);

// MCP 도구 목록 (동적으로 추가됨)
const MCP_TOOLS = new Set();

// 항상 허용된 도구들을 저장
const alwaysAllowedTools = new Set();

// MCP 도구 정보 저장 (toolName -> { server, description })
const mcpToolInfoMap = new Map();

/**
 * MCP 도구 등록
 */
export function registerMCPTool(toolName, server, description) {
    MCP_TOOLS.add(toolName);
    mcpToolInfoMap.set(toolName, { server, description });
}

/**
 * 도구가 승인이 필요한지 확인
 */
export function requiresApproval(toolName) {
    if (alwaysAllowedTools.has(toolName)) {
        return false;
    }
    // MCP 도구는 항상 승인이 필요
    if (MCP_TOOLS.has(toolName)) {
        return true;
    }
    return APPROVAL_REQUIRED_TOOLS.has(toolName);
}

/**
 * 사용자에게 도구 실행 승인 요청
 */
export async function requestApproval(toolName, args) {
    // 항상 허용된 도구는 즉시 승인
    if (alwaysAllowedTools.has(toolName)) {
        return true;
    }

    // MCP 도구인 경우 상세 정보 전달
    const mcpToolInfo = mcpToolInfoMap.get(toolName) || null;
    const decision = await uiEvents.requestToolApproval(toolName, args, mcpToolInfo);

    if (decision === 'always') {
        alwaysAllowedTools.add(toolName);
        return true;
    } else if (decision === 'allow') {
        return true;
    } else {
        return false;
    }
}

/**
 * 세션 초기화 시 항상 허용 목록 초기화
 */
export function resetAlwaysAllowed() {
    alwaysAllowedTools.clear();
}
