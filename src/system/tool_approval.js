/**
 * Tool Approval System - 위험한 도구 실행 전 사용자 승인
 */

import { uiEvents } from './ui_events.js';
import { getFileSnapshot } from './file_integrity.js';
import { resolve } from 'path';

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
    // edit_file_replace: 스냅샷이 없거나 old_string이 없는 경우
    if (toolName === 'edit_file_replace') {
        try {
            const absolutePath = resolve(args.file_path);

            // 스냅샷 확인 (파일을 먼저 read_file로 읽었는지 확인)
            const snapshot = getFileSnapshot(absolutePath);
            const content = snapshot?.content;

            // 스냅샷이 없으면 확실히 실패 (파일을 먼저 읽지 않았음)
            if (content === undefined || content === null) {
                return { willFail: true, reason: 'File not read yet or empty' };
            }

            // old_string이 스냅샷에 없는 경우
            const oldString = args.old_string || '';
            if (!content.includes(oldString)) {
                return { willFail: true, reason: 'old_string not found in file' };
            }
        } catch (error) {
            // 검증 중 에러 발생시 실패할 것으로 판단
            return { willFail: true, reason: `Validation error: ${error.message}` };
        }
    }

    // edit_file_range: 스냅샷이 없거나 라인 범위가 잘못된 경우
    if (toolName === 'edit_file_range') {
        try {
            const absolutePath = resolve(args.file_path);

            // 스냅샷 확인 (파일을 먼저 read_file로 읽었는지 확인)
            const snapshot = getFileSnapshot(absolutePath);
            const content = snapshot?.content;

            // 스냅샷이 없으면 확실히 실패 (파일을 먼저 읽지 않았음)
            if (content === undefined || content === null) {
                return { willFail: true, reason: 'File not read yet or empty' };
            }

            // 라인 범위 검증
            const lines = content.split('\n');
            const totalLines = content === '' ? 0 :
                (content.endsWith('\n') ? lines.length - 1 : lines.length);

            if (args.start_line < 1 || args.end_line < args.start_line - 1) {
                return { willFail: true, reason: 'Invalid line range' };
            }

            if (args.start_line > totalLines + 1 || args.end_line > totalLines) {
                return { willFail: true, reason: `Line range exceeds file length (${totalLines} lines)` };
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
