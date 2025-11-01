import { safeReadFile } from '../util/safe_fs.js';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { trackFileRead, saveFileSnapshot } from '../system/file_integrity.js';
import { createDebugLogger } from '../util/debug_log.js';
import { toDisplayPath } from '../util/path_helper.js';
import { theme } from '../frontend/design/themeColors.js';

const debugLog = createDebugLogger('file_reader.log', 'file_reader');

// 이 파일은 파일을 읽고 검색하는 모든 보조 기능을 모아 둡니다.
// Orchestrator가 코드 구조를 파악하고 Verifier가 증거를 수집할 때 공통적으로 사용됩니다.

/**
 * 파일 읽기 도구
 * 파일을 읽고 라인 범위 지정, 키워드 검색 기능을 제공합니다.
 */

/**
 * 파일의 전체 내용을 읽어옵니다
 * @param {Object} params - 매개변수 객체
 * @param {string} params.filePath - 읽을 파일의 경로
 * @returns {Promise<Object>} 결과 객체
 */
export async function read_file({ filePath }) {
    debugLog('========== read_file START ==========');
    debugLog(`Input filePath: "${filePath}"`);
    debugLog(`  - filePath type: ${typeof filePath}`);
    debugLog(`  - filePath length: ${filePath?.length || 0}`);
    debugLog(`  - filePath starts with '/': ${filePath?.startsWith('/') || false}`);
    debugLog(`  - filePath starts with './': ${filePath?.startsWith('./') || false}`);
    debugLog(`  - filePath starts with '../': ${filePath?.startsWith('../') || false}`);
    debugLog(`  - Current Working Directory: ${process.cwd()}`);

    try {
        // 경로를 절대경로로 정규화
        const absolutePath = resolve(filePath);
        debugLog(`Path Resolution:`);
        debugLog(`  - Input path: "${filePath}"`);
        debugLog(`  - Resolved absolute path: "${absolutePath}"`);
        debugLog(`  - Path changed: ${filePath !== absolutePath}`);
        debugLog(`  - Absolute path starts with '/': ${absolutePath.startsWith('/')}`);
        debugLog(`  - Absolute path length: ${absolutePath.length}`);

        debugLog(`Reading file...`);
        const content = await safeReadFile(absolutePath, 'utf8');
        debugLog(`File read successful: ${content.length} bytes`);

        const lines = content.split('\n');

        // Handle files without trailing newline correctly
        const totalLines = content === '' ? 0 :
            (content.endsWith('\n') ? lines.length - 1 : lines.length);
        debugLog(`Total lines: ${totalLines}`);

        // 2000줄 제한 체크
        const MAX_LINES = 2000;
        if (totalLines > MAX_LINES) {
            debugLog(`ERROR: File exceeds ${MAX_LINES} lines limit`);
            debugLog('========== read_file ERROR END ==========');
            return {
                operation_successful: false,
                error_message: `File exceeds ${MAX_LINES} lines (actual: ${totalLines} lines). Use read_file_range to read specific sections of this large file.`,
                target_file_path: absolutePath,
                total_line_count: totalLines,
                suggested_tool: 'read_file_range',
                suggested_usage: `Example: read_file_range({ filePath: "${absolutePath}", startLine: 1, endLine: 1000 })`
            };
        }

        // 파일 읽기 추적 (절대경로 사용)
        debugLog(`Tracking file read...`);
        await trackFileRead(absolutePath, content);
        debugLog(`File read tracked`);

        // 스냅샷 저장 (UI 미리보기용)
        debugLog(`Saving file snapshot...`);
        saveFileSnapshot(absolutePath, content);
        debugLog(`Snapshot saved`);

        // MD5 해시 계산
        debugLog(`Calculating MD5 hash...`);
        const md5Hash = createHash('md5').update(content).digest('hex');
        debugLog(`MD5 hash: ${md5Hash}`);

        debugLog('========== read_file SUCCESS END ==========');

        return {
            operation_successful: true,
            target_file_path: absolutePath,
            total_line_count: totalLines,
            file_content: content,
            md5_hash: md5Hash
        };
    } catch (error) {
        debugLog(`========== read_file EXCEPTION ==========`);
        debugLog(`Exception caught: ${error.message}`);
        debugLog(`Stack trace: ${error.stack}`);
        debugLog('========== read_file EXCEPTION END ==========');

        // 에러 시에도 절대경로로 반환
        const absolutePath = resolve(filePath);
        return {
            operation_successful: false,
            error_message: error.message,
            target_file_path: absolutePath
        };
    }
}
export const readFileSchema = {
    "name": "read_file",
    "description": "Read the entire contents of a file and return its details. Files exceeding 2000 lines will fail with a suggestion to use read_file_range instead. It's recommended to read the whole file by using this tool for normal-sized files.",
    "strict": true,
    "parameters": {
        "type": "object",
        "properties": {
            "filePath": {
                "type": "string",
                "description": "The path to the file to be read."
            }
        },
        "required": [
            "filePath"
        ],
        "additionalProperties": false
    },
    "ui_display": {
        "show_tool_call": true,
        "show_tool_result": true,
        "display_name": "Read",
        "format_tool_call": (args) => {
            return `(${toDisplayPath(args.filePath)})`;
        },
        "format_tool_result": (result) => {
            if (result.operation_successful) {
                const lines = result.total_line_count || 0;
                return {
                    type: 'formatted',
                    parts: [
                        { text: 'Read ', style: {} },
                        { text: String(lines), style: { color: theme.brand.light, bold: true } },
                        { text: ` line${lines !== 1 ? 's' : ''}`, style: {} }
                    ]
                };
            }
            return result.error_message || 'Error reading file';
        }
    }
};

/**
 * 파일의 특정 라인 범위를 읽어옵니다
 * @param {Object} params - 매개변수 객체
 * @param {string} params.filePath - 읽을 파일의 경로
 * @param {number} params.startLine - 시작 라인 (1부터 시작)
 * @param {number} params.endLine - 끝 라인 (포함)
 * @returns {Promise<Object>} 결과 객체
 */
export async function read_file_range({ filePath, startLine, endLine }) {
    debugLog('========== read_file_range START ==========');
    debugLog(`Input parameters:`);
    debugLog(`  filePath: "${filePath}"`);
    debugLog(`  - filePath type: ${typeof filePath}`);
    debugLog(`  - filePath length: ${filePath?.length || 0}`);
    debugLog(`  - filePath starts with '/': ${filePath?.startsWith('/') || false}`);
    debugLog(`  - filePath starts with './': ${filePath?.startsWith('./') || false}`);
    debugLog(`  - filePath starts with '../': ${filePath?.startsWith('../') || false}`);
    debugLog(`  startLine: ${startLine}`);
    debugLog(`  endLine: ${endLine}`);
    debugLog(`  - Current Working Directory: ${process.cwd()}`);

    try {
        // 경로를 절대경로로 정규화
        const absolutePath = resolve(filePath);
        debugLog(`Path Resolution:`);
        debugLog(`  - Input path: "${filePath}"`);
        debugLog(`  - Resolved absolute path: "${absolutePath}"`);
        debugLog(`  - Path changed: ${filePath !== absolutePath}`);
        debugLog(`  - Absolute path starts with '/': ${absolutePath.startsWith('/')}`);
        debugLog(`  - Absolute path length: ${absolutePath.length}`);

        // 파일 전체를 읽고 범위만 추출
        debugLog(`Reading file...`);
        const content = await safeReadFile(absolutePath, 'utf8');
        debugLog(`File read successful: ${content.length} bytes`);

        const lines = content.split('\n');

        // Handle files without trailing newline correctly
        const totalLines = content === '' ? 0 :
            (content.endsWith('\n') ? lines.length - 1 : lines.length);

        debugLog(`Total lines: ${totalLines}`);

        const actualLines = content === '' ? [] :
            (content.endsWith('\n') ? lines.slice(0, -1) : lines);

        // 파일 읽기 추적 (절대경로 사용)
        debugLog(`Tracking file read...`);
        await trackFileRead(absolutePath, content);
        debugLog(`File read tracked`);

        // 스냅샷 저장 (UI 미리보기용)
        debugLog(`Saving file snapshot...`);
        saveFileSnapshot(absolutePath, content);
        debugLog(`Snapshot saved`);

        // MD5 해시 계산 (전체 파일 내용에 대해)
        debugLog(`Calculating MD5 hash...`);
        const md5Hash = createHash('md5').update(content).digest('hex');
        debugLog(`MD5 hash: ${md5Hash}`);

        // 라인 번호 유효성 검사 (1부터 시작)
        debugLog(`Validating line range...`);
        if (startLine < 1) {
            debugLog(`Adjusted startLine from ${startLine} to 1`);
            startLine = 1;
        }
        if (endLine > totalLines) {
            debugLog(`Adjusted endLine from ${endLine} to ${totalLines}`);
            endLine = totalLines;
        }
        if (startLine > endLine) {
            debugLog(`ERROR: Invalid line range`);
            debugLog('========== read_file_range ERROR END ==========');
            return {
                operation_successful: false,
                error_message: `Invalid line range: startLine(${startLine}) > endLine(${endLine})`,
                target_file_path: absolutePath
            };
        }

        debugLog(`Extracting lines ${startLine}-${endLine}...`);
        // 배열 인덱스는 0부터 시작하므로 -1
        const selectedLines = actualLines.slice(startLine - 1, endLine);
        debugLog(`Extracted ${selectedLines.length} lines`);

        debugLog('========== read_file_range SUCCESS END ==========');

        return {
            operation_successful: true,
            target_file_path: absolutePath,
            total_line_count: totalLines,
            requested_range: { start_line: startLine, end_line: endLine },
            actual_range: {
                start_line: startLine,
                end_line: Math.min(endLine, totalLines)
            },
            file_content: selectedLines.join('\n'),
            md5_hash: md5Hash
        };
    } catch (error) {
        debugLog(`========== read_file_range EXCEPTION ==========`);
        debugLog(`Exception caught: ${error.message}`);
        debugLog(`Stack trace: ${error.stack}`);
        debugLog('========== read_file_range EXCEPTION END ==========');

        // 에러 시에도 절대경로로 반환
        const absolutePath = resolve(filePath);
        return {
            operation_successful: false,
            error_message: error.message,
            target_file_path: absolutePath
        };
    }
}
export const readFileRangeSchema = {
    "name": "read_file_range",
    "description": "Read a specific range of lines from a file. Useful for previewing large files or examining specific sections.",
    "strict": true,
    "parameters": {
        "type": "object",
        "required": [
            "filePath",
            "startLine",
            "endLine"
        ],
        "properties": {
            "filePath": {
                "type": "string",
                "description": "Path to the file to be read"
            },
            "startLine": {
                "type": "integer",
                "description": "The starting line number (1-based)"
            },
            "endLine": {
                "type": "integer",
                "description": "The ending line number (inclusive)"
            }
        },
        "additionalProperties": false
    },
    "ui_display": {
        "show_tool_call": true,
        "show_tool_result": true,
        "display_name": "Read",
        "format_tool_call": (args) => {
            return `(${toDisplayPath(args.filePath)}, lines ${args.startLine}-${args.endLine})`;
        },
        "format_tool_result": (result) => {
            if (result.operation_successful) {
                const lineCount = result.file_content ? result.file_content.split('\n').length : 0;
                return {
                    type: 'formatted',
                    parts: [
                        { text: 'Read ', style: {} },
                        { text: String(lineCount), style: { color: theme.brand.light, bold: true } },
                        { text: ` line${lineCount !== 1 ? 's' : ''}`, style: {} }
                    ]
                };
            }
            return result.error_message || 'Error reading file';
        }
    }
}

// 함수 맵 - 문자열로 함수 호출 가능
export const FILE_READER_FUNCTIONS = {
    'read_file': read_file,
    'read_file_range': read_file_range
};
