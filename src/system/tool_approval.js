/**
 * Tool Approval System - 위험한 도구 실행 전 사용자 승인
 */

import { uiEvents } from './ui_events.js';
import { getFileSnapshot } from './file_integrity.js';
import { resolve } from 'path';
import { promises as fs } from 'fs';

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
 * 도구 실행이 확실히 실패할지 미리 검증
 * 실패가 확실한 경우 {willFail: true, reason: string} 반환
 * 성공 가능한 경우 {willFail: false} 반환
 */
async function willDefinitelyFail(toolName, args) {
    // edit_file_replace: 파일이 읽히지 않았거나 old_string이 없는 경우
    if (toolName === 'edit_file_replace') {
        try {
            const absolutePath = resolve(args.file_path);

            // 실제 파일을 읽어서 검증 (스냅샷은 이전 tool call로 인해 outdated 될 수 있음)
            let content = '';
            try {
                content = await fs.readFile(absolutePath, 'utf8');
            } catch (readError) {
                // 파일 읽기 실패 시 에러 종류에 따라 처리
                // ENOENT (파일 없음): 스냅샷 확인 (이전에 읽었을 수 있음)
                // 기타 에러 (권한 없음 등): 확실히 실패할 것으로 판단
                if (readError.code !== 'ENOENT') {
                    return { willFail: true, reason: `File read error: ${readError.message}` };
                }

                // 파일이 없는 경우, 스냅샷 사용 시도
                const snapshot = getFileSnapshot(absolutePath);
                content = snapshot?.content || '';

                if (!content) {
                    return { willFail: true, reason: 'File not found and no snapshot available' };
                }
            }

            // old_string이 파일에 없는 경우
            const oldString = args.old_string || '';
            if (!content.includes(oldString)) {
                return { willFail: true, reason: 'old_string not found in file' };
            }
        } catch (error) {
            // 검증 중 에러 발생시 실패할 것으로 판단
            return { willFail: true, reason: `Validation error: ${error.message}` };
        }
    }

    // edit_file_range: 파일이 읽히지 않은 경우
    if (toolName === 'edit_file_range') {
        try {
            const absolutePath = resolve(args.file_path);

            // 실제 파일을 읽어서 검증
            let content = '';
            try {
                content = await fs.readFile(absolutePath, 'utf8');
            } catch (readError) {
                // 파일 읽기 실패 시 에러 종류에 따라 처리
                // ENOENT (파일 없음): 스냅샷 확인 (이전에 읽었을 수 있음)
                // 기타 에러 (권한 없음 등): 확실히 실패할 것으로 판단
                if (readError.code !== 'ENOENT') {
                    return { willFail: true, reason: `File read error: ${readError.message}` };
                }

                // 파일이 없는 경우, 스냅샷 사용 시도
                const snapshot = getFileSnapshot(absolutePath);
                content = snapshot?.content || '';

                if (!content) {
                    return { willFail: true, reason: 'File not found and no snapshot available' };
                }
            }
        } catch (error) {
            return { willFail: true, reason: `Validation error: ${error.message}` };
        }
    }

    return { willFail: false };
}

/**
 * 도구가 승인이 필요한지 확인
 * @returns {Promise<boolean|{skipApproval: true, reason: string}>} 승인 필요 여부 또는 스킵 정보
 */
export async function requiresApproval(toolName, args = {}) {
    if (alwaysAllowedTools.has(toolName)) {
        return false;
    }

    // 확실히 실패할 경우 승인 불필요 (바로 실행하여 에러 반환)
    const failCheck = await willDefinitelyFail(toolName, args);
    if (failCheck.willFail) {
        return { skipApproval: true, reason: failCheck.reason };
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
