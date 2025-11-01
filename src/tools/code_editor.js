import { safeReadFile, safeWriteFile, safeAccess, safeMkdir, safeAppendFile } from '../util/safe_fs.js';
import { dirname, resolve, join } from 'path';
import * as diff from 'diff';
import { assertFileIntegrity, trackFileRead, saveFileSnapshot } from '../system/file_integrity.js';
import { createDebugLogger } from '../util/debug_log.js';
import { DEBUG_LOG_DIR } from '../util/config.js';
import { toDisplayPath } from '../util/path_helper.js';
import { theme } from '../frontend/design/themeColors.js';

const debugLog = createDebugLogger('code_editor.log', 'code_editor');

// LOG_FILE을 함수로 만들어 lazy initialization
function getLogFile() {
    return join(DEBUG_LOG_DIR, 'code_editor_internal.log');
}

// 이 파일은 파일을 만들고 수정할 때 필요한 기본 동작들을 제공합니다.
// Orchestrator가 제안한 변경 사항을 실제 파일 시스템에 반영할 때 이 도구들을 호출합니다.

/**
 * 코드 편집 도구
 * diff 패키지를 활용한 파일 편집 및 변경사항 추적 기능을 제공합니다.
 */

/**
 * 파일을 생성하거나 덮어씁니다. 경로가 존재하지 않으면 자동으로 생성합니다.
 * @param {Object} params - 매개변수 객체
 * @param {string} params.file_path - 파일의 경로
 * @param {string} params.content - 파일 내용
 * @returns {Promise<Object>} 결과 객체
 */
export async function write_file({ file_path, content }) {
    debugLog('========== write_file START ==========');
    debugLog(`Input parameters:`);
    debugLog(`  file_path: "${file_path}"`);
    debugLog(`  - file_path type: ${typeof file_path}`);
    debugLog(`  - file_path length: ${file_path?.length || 0}`);
    debugLog(`  - file_path starts with '/': ${file_path?.startsWith('/') || false}`);
    debugLog(`  - file_path starts with './': ${file_path?.startsWith('./') || false}`);
    debugLog(`  - file_path starts with '../': ${file_path?.startsWith('../') || false}`);
    debugLog(`  content length: ${content?.length || 0} bytes`);
    debugLog(`  content first 100 chars: ${JSON.stringify(content?.substring(0, 100) || '')}`);
    debugLog(`  - Current Working Directory: ${process.cwd()}`);

    const internalDebugLog = [];
    const timestamp = new Date().toISOString();

    try {
        // 경로를 절대경로로 정규화
        const absolutePath = resolve(file_path);
        internalDebugLog.push(`[${timestamp}] write_file called: ${absolutePath}`);
        debugLog(`Path Resolution:`);
        debugLog(`  - Input path: "${file_path}"`);
        debugLog(`  - Resolved absolute path: "${absolutePath}"`);
        debugLog(`  - Path changed: ${file_path !== absolutePath}`);
        debugLog(`  - Absolute path starts with '/': ${absolutePath.startsWith('/')}`);
        debugLog(`  - Absolute path length: ${absolutePath.length}`);

        // 디렉토리 경로 추출
        const dir = dirname(absolutePath);
        internalDebugLog.push(`[${timestamp}] Directory: ${dir}`);
        debugLog(`Directory: "${dir}"`);

        // 디렉토리가 존재하지 않으면 생성
        try {
            await safeAccess(dir);
            internalDebugLog.push(`[${timestamp}] Directory exists`);
            debugLog(`Directory exists`);
        } catch (error) {
            if (error.message.includes('ENOENT') || error.message.includes('does not exist')) {
                await safeMkdir(dir, { recursive: true });
                internalDebugLog.push(`[${timestamp}] Directory created`);
                debugLog(`Directory created`);
            } else {
                throw error;
            }
        }

        // 기존 파일 확인
        let originalContent = '';
        let fileExists = false;
        debugLog(`Checking if file exists...`);
        try {
            originalContent = await safeReadFile(absolutePath, 'utf8');
            fileExists = true;
            internalDebugLog.push(`[${timestamp}] File EXISTS - size: ${originalContent.length} bytes`);
            debugLog(`File EXISTS - size: ${originalContent.length} bytes`);
            debugLog(`Original content first 100 chars: ${JSON.stringify(originalContent.substring(0, 100))}`);
        } catch (error) {
            if (!error.message.includes('ENOENT') && !error.message.includes('no such file')) {
                throw error;
            }
            internalDebugLog.push(`[${timestamp}] File DOES NOT EXIST`);
            debugLog(`File DOES NOT EXIST - will create new file`);
        }

        // 기존 파일이 있는 경우 무결성 검증 (절대경로 사용)
        if (fileExists) {
            internalDebugLog.push(`[${timestamp}] Calling assertFileIntegrity`);
            debugLog(`Calling assertFileIntegrity...`);
            try {
                await assertFileIntegrity(absolutePath);
                internalDebugLog.push(`[${timestamp}] assertFileIntegrity passed`);
                debugLog(`assertFileIntegrity passed`);
            } catch (integrityError) {
                internalDebugLog.push(`[${timestamp}] assertFileIntegrity FAILED: ${integrityError.message}`);
                debugLog(`ERROR: assertFileIntegrity FAILED: ${integrityError.message}`);
                const logFile = getLogFile();
                await safeMkdir(dirname(logFile), { recursive: true }).catch(() => {});
                await safeAppendFile(logFile, internalDebugLog.join('\n') + '\n');
                throw integrityError;
            }
        }

        // 파일 쓰기 (절대경로 사용)
        internalDebugLog.push(`[${timestamp}] Writing file - content size: ${content.length} bytes`);
        debugLog(`Writing file - content size: ${content.length} bytes`);
        await safeWriteFile(absolutePath, content, 'utf8');
        internalDebugLog.push(`[${timestamp}] File written successfully`);
        debugLog(`File written successfully`);

        // 파일 수정 후 해시 업데이트 (절대경로 사용)
        debugLog(`Tracking file read for hash...`);
        await trackFileRead(absolutePath, content);
        internalDebugLog.push(`[${timestamp}] Hash tracked`);
        debugLog(`Hash tracked`);

        // 파일 스냅샷 저장 (UI에서 diff 표시를 위해 필요)
        debugLog(`Saving file snapshot for UI...`);
        saveFileSnapshot(absolutePath, content);
        debugLog(`Snapshot saved`);

        const logFile = getLogFile();
        await safeMkdir(dirname(logFile), { recursive: true }).catch(() => {});
        await safeAppendFile(logFile, internalDebugLog.join('\n') + '\n');

        // diff 생성 (기존 파일이 있었을 경우에만, 절대경로 사용)
        let diffInfo = null;
        if (fileExists) {
            debugLog(`Generating diff...`);
            const patch = diff.createPatch(absolutePath, originalContent, content);
            const lineDiff = diff.diffLines(originalContent, content);

            const addedCount = lineDiff.filter(part => part.added).reduce((sum, part) => sum + part.count, 0);
            const removedCount = lineDiff.filter(part => part.removed).reduce((sum, part) => sum + part.count, 0);
            const unchangedCount = lineDiff.filter(part => !part.added && !part.removed).reduce((sum, part) => sum + part.count, 0);

            debugLog(`Diff generated: +${addedCount} -${removedCount} =${unchangedCount} lines`);

            diffInfo = {
                unified_diff_patch: patch,
                line_by_line_changes: lineDiff.filter(part => part.added || part.removed),
                modification_statistics: {
                    lines_added_count: addedCount,
                    lines_removed_count: removedCount,
                    lines_unchanged_count: unchangedCount
                }
            };
        }

        debugLog('========== write_file SUCCESS END ==========');

        return {
            operation_successful: true,
            target_file_path: absolutePath,
            file_existed: fileExists,
            parent_directory_created: dir !== '.',
            file_size_in_bytes: Buffer.byteLength(content, 'utf8'),
            total_line_count: content.split('\n').length,
            ...(diffInfo && diffInfo)
        };
    } catch (error) {
        internalDebugLog.push(`[${timestamp}] ERROR: ${error.message}`);
        internalDebugLog.push(`[${timestamp}] Stack: ${error.stack}`);
        debugLog(`========== write_file EXCEPTION ==========`);
        debugLog(`Exception caught: ${error.message}`);
        debugLog(`Stack trace: ${error.stack}`);
        debugLog('========== write_file EXCEPTION END ==========');
        const logFile = getLogFile();
        await safeMkdir(dirname(logFile), { recursive: true }).catch(() => {});
        await safeAppendFile(logFile, internalDebugLog.join('\n') + '\n').catch(() => {});

        // 에러 시에도 절대경로로 반환
        const absolutePath = resolve(file_path);
        return {
            operation_successful: false,
            error_message: error.message,
            target_file_path: absolutePath
        };
    }
}

/**
 * 정규식 특수문자를 이스케이프합니다
 * @param {string} string - 이스케이프할 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}



// 함수 스키마들
export const writeFileSchema = {
    "name": "write_file",
    "description": "Writes content to a file, creating it if it doesn't exist or overwriting if it does. Automatically creates directory path if needed. Returns diff information when overwriting existing files.\n\nCRITICAL: content parameter is written DIRECTLY to the file AS-IS. Include ONLY the actual file content - NO explanatory text, NO markdown blocks, NO instructions.\n\nWRONG: \"Here's the implementation:\\nfunction main() {}\" or \"```python\\nprint('hello')\\n```\"\nCORRECT: \"function main() {\\n  console.log('hello');\\n}\" or \"print('hello')\\n\"\n\nALWAYS prefer using edit_file_range for partial edits. Only use this for new files or complete file rewrites.",
    "strict": true,
    "parameters": {
        "type": "object",
        "required": ["file_path", "content"],
        "properties": {
            "file_path": {
                "type": "string",
                "description": "The absolute path to the file (must be absolute, not relative)"
            },
            "content": {
                "type": "string",
                "description": "PURE FILE CONTENT ONLY - written directly to file. NO explanations, NO markdown (```), NO instructions. Must be the exact content that should exist in the file."
            }
        },
        "additionalProperties": false
    },
    "ui_display": {
        "show_tool_call": true,
        "show_tool_result": true,
        "display_name": "Write",
        "format_tool_call": (args) => {
            return `(${toDisplayPath(args.file_path)})`;
        },
        "format_tool_result": (result) => {
            if (result.operation_successful) {
                const lines = result.total_line_count || 0;
                const action = result.file_existed ? 'Overwrote' : 'Created';
                return {
                    type: 'formatted',
                    parts: [
                        { text: `${action} `, style: {} },
                        { text: String(lines), style: { color: theme.brand.light, bold: true } },
                        { text: ` line${lines !== 1 ? 's' : ''}`, style: {} }
                    ]
                };
            }
            return result.error_message || 'Error writing file';
        }
    }
};

/**
 * 파일에서 정확한 문자열 매칭을 통해 내용을 교체합니다
 *
 * @param {Object} params - 매개변수 객체
 * @param {string} params.file_path - 편집할 파일의 경로
 * @param {string} params.old_string - 교체할 기존 문자열 (파일 내에서 고유해야 함)
 * @param {string} params.new_string - 새로운 문자열
 * @returns {Promise<Object>} 편집 결과
 */
export async function edit_file_replace({ file_path, old_string, new_string }) {
    try {
        debugLog('========== edit_file_replace START ==========');
        debugLog(`Input parameters:`);
        debugLog(`  file_path: "${file_path}"`);
        debugLog(`  - file_path type: ${typeof file_path}`);
        debugLog(`  - file_path length: ${file_path?.length || 0}`);
        debugLog(`  - file_path starts with '/': ${file_path?.startsWith('/') || false}`);
        debugLog(`  - file_path starts with './': ${file_path?.startsWith('./') || false}`);
        debugLog(`  - file_path starts with '../': ${file_path?.startsWith('../') || false}`);
        debugLog(`  old_string length: ${old_string?.length || 0} bytes`);
        debugLog(`  new_string length: ${new_string?.length || 0} bytes`);
        debugLog(`  - Current Working Directory: ${process.cwd()}`);

        // 경로를 절대경로로 정규화
        const absolutePath = resolve(file_path);
        debugLog(`Path Resolution:`);
        debugLog(`  - Input path: "${file_path}"`);
        debugLog(`  - Resolved absolute path: "${absolutePath}"`);
        debugLog(`  - Path changed: ${file_path !== absolutePath}`);
        debugLog(`  - Absolute path starts with '/': ${absolutePath.startsWith('/')}`);
        debugLog(`  - Absolute path length: ${absolutePath.length}`);

        // 파일 존재 확인
        try {
            await safeAccess(absolutePath);
            debugLog(`File access OK`);
        } catch (error) {
            if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
                debugLog(`ERROR: File not found`);
                return {
                    operation_successful: false,
                    error_message: `File not found: ${absolutePath}`,
                    target_file_path: absolutePath
                };
            }
            throw error;
        }

        // 파일 무결성 검증 (절대경로 사용)
        debugLog(`Calling assertFileIntegrity...`);
        await assertFileIntegrity(absolutePath);
        debugLog(`assertFileIntegrity passed`);

        // 원본 파일 읽기 (절대경로 사용)
        debugLog(`Reading file content...`);
        const originalContent = await safeReadFile(absolutePath, 'utf8');
        debugLog(`File read successful:`);
        debugLog(`  Content length: ${originalContent.length} bytes`);
        debugLog(`  Line count: ${originalContent.split('\n').length}`);
        debugLog(`  First 100 chars: ${JSON.stringify(originalContent.substring(0, 100))}`);
        debugLog(`  Last 100 chars: ${JSON.stringify(originalContent.substring(Math.max(0, originalContent.length - 100)))}`);

        // 파일 스냅샷 저장 (UI에서 diff 표시를 위해 필요)
        debugLog(`Saving file snapshot for UI...`);
        const fileSnapshot = {
            content: originalContent,
            timestamp: Date.now()
        };
        saveFileSnapshot(absolutePath, originalContent);
        debugLog(`Snapshot saved`);

        // old_string과 new_string이 동일한지 검증
        debugLog(`Checking if old_string === new_string...`);
        if (old_string === new_string) {
            debugLog(`ERROR: old_string and new_string are identical`);
            return {
                operation_successful: false,
                error_message: "new_string must be different from old_string",
                target_file_path: absolutePath
            };
        }
        debugLog(`old_string and new_string are different (OK)`);

        // old_string 상세 정보 로깅
        debugLog(`old_string details:`);
        debugLog(`  Length: ${old_string.length} bytes`);
        debugLog(`  First 100 chars: ${JSON.stringify(old_string.substring(0, 100))}`);
        debugLog(`  Last 100 chars: ${JSON.stringify(old_string.substring(Math.max(0, old_string.length - 100)))}`);
        debugLog(`  Has newlines: ${old_string.includes('\n')}`);
        debugLog(`  Has carriage returns: ${old_string.includes('\r')}`);
        debugLog(`  Has tabs: ${old_string.includes('\t')}`);

        // 특수 문자 분석
        const oldStringBytes = Buffer.from(old_string, 'utf8');
        debugLog(`  Byte representation (first 50): ${oldStringBytes.slice(0, 50).toString('hex')}`);

        // old_string이 파일에 존재하는지 확인
        debugLog(`Checking if old_string exists in file using includes()...`);
        const includesResult = originalContent.includes(old_string);
        debugLog(`includes() result: ${includesResult}`);

        if (!includesResult) {
            // 추가 디버깅 정보
            debugLog(`ERROR: old_string NOT FOUND in file`);
            debugLog(`Attempting to find similar strings...`);

            // indexOf로도 확인
            const indexOfResult = originalContent.indexOf(old_string);
            debugLog(`indexOf() result: ${indexOfResult}`);

            // 부분 문자열 검색
            if (old_string.length > 20) {
                const prefix = old_string.substring(0, 20);
                const prefixIndex = originalContent.indexOf(prefix);
                debugLog(`First 20 chars found at index: ${prefixIndex}`);

                if (prefixIndex !== -1) {
                    const contextStart = Math.max(0, prefixIndex - 50);
                    const contextEnd = Math.min(originalContent.length, prefixIndex + old_string.length + 50);
                    const context = originalContent.substring(contextStart, contextEnd);
                    debugLog(`Context around prefix match: ${JSON.stringify(context)}`);
                }
            }

            // 줄바꿈 차이 검사
            const normalizedOld = old_string.replace(/\r\n/g, '\n');
            const normalizedContent = originalContent.replace(/\r\n/g, '\n');
            const normalizedIncludes = normalizedContent.includes(normalizedOld);
            debugLog(`After normalizing line endings, includes: ${normalizedIncludes}`);

            debugLog('========== edit_file_replace ERROR END ==========');

            return {
                operation_successful: false,
                error_message: `old_string not found in file`,
                target_file_path: absolutePath
            };
        }

        debugLog(`old_string FOUND in file (OK)`);
        const firstOccurrenceIndex = originalContent.indexOf(old_string);
        debugLog(`First occurrence at index: ${firstOccurrenceIndex}`);

        // 컨텍스트 출력
        if (firstOccurrenceIndex !== -1) {
            const contextStart = Math.max(0, firstOccurrenceIndex - 50);
            const contextEnd = Math.min(originalContent.length, firstOccurrenceIndex + old_string.length + 50);
            const context = originalContent.substring(contextStart, contextEnd);
            debugLog(`Context around first match: ${JSON.stringify(context)}`);
        }

        // 고유성 검증
        debugLog(`Checking uniqueness...`);
        const firstIndex = originalContent.indexOf(old_string);
        const lastIndex = originalContent.lastIndexOf(old_string);
        debugLog(`  First occurrence index: ${firstIndex}`);
        debugLog(`  Last occurrence index: ${lastIndex}`);

        if (firstIndex !== lastIndex) {
            debugLog(`ERROR: old_string is NOT unique (found at multiple positions)`);
            debugLog('========== edit_file_replace ERROR END ==========');
            return {
                operation_successful: false,
                error_message: `old_string is not unique in the file. Provide more context to make old_string unique.`,
                target_file_path: absolutePath
            };
        }
        debugLog(`old_string is unique (OK)`);

        // 문자열 교체 (단일 교체)
        debugLog(`Performing string replacement...`);
        const newContent = originalContent.replace(old_string, new_string);
        const replacementCount = 1;
        debugLog(`Replacement complete. New content length: ${newContent.length} bytes`);

        // 파일 저장 (절대경로 사용)
        debugLog(`Writing file...`);
        await safeWriteFile(absolutePath, newContent, 'utf8');
        debugLog(`File written successfully`);

        // 파일 수정 후 해시 업데이트 (절대경로 사용)
        debugLog(`Updating file hash...`);
        await trackFileRead(absolutePath, newContent);
        debugLog(`Hash updated`);

        // diff 생성 (절대경로 사용)
        debugLog(`Generating diff...`);
        const patch = diff.createPatch(absolutePath, originalContent, newContent);
        const lineDiff = diff.diffLines(originalContent, newContent);
        debugLog(`Diff generated`);

        debugLog('========== edit_file_replace SUCCESS END ==========');

        return {
            operation_successful: true,
            target_file_path: absolutePath,
            replacement_count: replacementCount,
            fileSnapshot: fileSnapshot,  // UI 히스토리에서 정확한 diff 표시를 위해 편집 전 스냅샷 포함
            file_stats: {
                updated_content: newContent
            },
            diff_info: {
                unified_diff_patch: patch,
                line_by_line_changes: lineDiff.filter(part => part.added || part.removed),
                modification_statistics: {
                    lines_added_count: lineDiff.filter(part => part.added).reduce((sum, part) => sum + part.count, 0),
                    lines_removed_count: lineDiff.filter(part => part.removed).reduce((sum, part) => sum + part.count, 0),
                    lines_unchanged_count: lineDiff.filter(part => !part.added && !part.removed).reduce((sum, part) => sum + part.count, 0)
                }
            }
        };

    } catch (error) {
        // 에러 시에도 절대경로로 반환
        const absolutePath = resolve(file_path);
        debugLog(`========== edit_file_replace EXCEPTION ==========`);
        debugLog(`Exception caught: ${error.message}`);
        debugLog(`Stack trace: ${error.stack}`);
        debugLog('========== edit_file_replace EXCEPTION END ==========');
        return {
            operation_successful: false,
            error_message: error.message,
            target_file_path: absolutePath
        };
    }
}

/**
 * 파일의 특정 범위를 편집합니다 (삽입/삭제/교체 통합 도구)
 *
 * 사용법:
 * 1. 교체: edit_file_range(file, 10, 12, "new content") - 10-12번 라인을 새 내용으로 교체
 * 2. 삭제: edit_file_range(file, 10, 12, "") - 10-12번 라인 삭제
 * 3. 삽입: edit_file_range(file, 10, 9, "new content") - 10번 라인 앞에 삽입 (start > end)
 *
 * @param {Object} params - 매개변수 객체
 * @param {string} params.file_path - 편집할 파일의 경로
 * @param {number} params.start_line - 시작 라인 번호 (1부터 시작)
 * @param {number} params.end_line - 종료 라인 번호 (포함, 삽입 시에는 start_line-1)
 * @param {string} params.new_content - 새로운 내용 (삭제 시 빈 문자열)
 * @returns {Promise<Object>} 편집 결과
 */
export async function edit_file_range({ file_path, start_line, end_line, new_content }) {
    debugLog('========== edit_file_range START ==========');
    debugLog(`Input parameters:`);
    debugLog(`  file_path: "${file_path}"`);
    debugLog(`  - file_path type: ${typeof file_path}`);
    debugLog(`  - file_path length: ${file_path?.length || 0}`);
    debugLog(`  - file_path starts with '/': ${file_path?.startsWith('/') || false}`);
    debugLog(`  - file_path starts with './': ${file_path?.startsWith('./') || false}`);
    debugLog(`  - file_path starts with '../': ${file_path?.startsWith('../') || false}`);
    debugLog(`  start_line: ${start_line}`);
    debugLog(`  end_line: ${end_line}`);
    debugLog(`  new_content length: ${new_content?.length || 0} bytes`);
    debugLog(`  new_content first 100 chars: ${JSON.stringify(new_content?.substring(0, 100) || '')}`);
    debugLog(`  - Current Working Directory: ${process.cwd()}`);

    try {
        // 경로를 절대경로로 정규화
        const absolutePath = resolve(file_path);
        debugLog(`Path Resolution:`);
        debugLog(`  - Input path: "${file_path}"`);
        debugLog(`  - Resolved absolute path: "${absolutePath}"`);
        debugLog(`  - Path changed: ${file_path !== absolutePath}`);
        debugLog(`  - Absolute path starts with '/': ${absolutePath.startsWith('/')}`);
        debugLog(`  - Absolute path length: ${absolutePath.length}`);

        // 파일 존재 확인
        debugLog(`Checking if file exists...`);
        try {
            await safeAccess(absolutePath);
            debugLog(`File access OK`);
        } catch (error) {
            if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
                debugLog(`ERROR: File not found`);
                debugLog('========== edit_file_range ERROR END ==========');
                return {
                    operation_successful: false,
                    error_message: `File not found: ${absolutePath}`,
                    target_file_path: absolutePath
                };
            }
            throw error;
        }

        // 파일 무결성 검증 (절대경로 사용)
        debugLog(`Calling assertFileIntegrity...`);
        await assertFileIntegrity(absolutePath);
        debugLog(`assertFileIntegrity passed`);

        // 원본 파일 읽기 (절대경로 사용)
        debugLog(`Reading file content...`);
        const originalContent = await safeReadFile(absolutePath, 'utf8');
        debugLog(`File read successful:`);
        debugLog(`  Content length: ${originalContent.length} bytes`);
        debugLog(`  Line count: ${originalContent.split('\n').length}`);

        // 파일 스냅샷 저장 (UI에서 diff 표시를 위해 필요)
        debugLog(`Saving file snapshot for UI...`);
        const fileSnapshot = {
            content: originalContent,
            timestamp: Date.now()
        };
        saveFileSnapshot(absolutePath, originalContent);
        debugLog(`Snapshot saved`);

        const originalLines = originalContent.split('\n');

        // Handle files without trailing newline correctly
        const totalLines = originalContent === '' ? 0 :
            (originalContent.endsWith('\n') ? originalLines.length - 1 : originalLines.length);

        const actualLines = originalContent === '' ? [] :
            (originalContent.endsWith('\n') ? originalLines.slice(0, -1) : originalLines);

        debugLog(`File analysis:`);
        debugLog(`  Total lines: ${totalLines}`);
        debugLog(`  Actual lines array length: ${actualLines.length}`);

        // 간단한 검증: start_line은 1 이상, end_line은 start_line-1 이상
        debugLog(`Validating line numbers...`);
        if (start_line < 1) {
            debugLog(`ERROR: start_line < 1`);
            debugLog('========== edit_file_range ERROR END ==========');
            return {
                operation_successful: false,
                error_message: "start_line must be >= 1",
                target_file_path: absolutePath
            };
        }

        if (end_line < start_line - 1) {
            debugLog(`ERROR: end_line < start_line-1`);
            debugLog('========== edit_file_range ERROR END ==========');
            return {
                operation_successful: false,
                error_message: `end_line must be >= start_line-1 (got start=${start_line}, end=${end_line})`,
                target_file_path: absolutePath
            };
        }

        if (start_line > totalLines + 1) {
            debugLog(`ERROR: start_line > totalLines+1`);
            debugLog('========== edit_file_range ERROR END ==========');
            return {
                operation_successful: false,
                error_message: `start_line ${start_line} exceeds file length ${totalLines}`,
                target_file_path: absolutePath
            };
        }

        if (end_line > totalLines) {
            debugLog(`ERROR: end_line > totalLines`);
            debugLog('========== edit_file_range ERROR END ==========');
            return {
                operation_successful: false,
                error_message: `end_line ${end_line} exceeds file length ${totalLines}`,
                target_file_path: absolutePath
            };
        }

        debugLog(`Line number validation passed`);

        // 단일 통합 로직: start_line부터 end_line까지 삭제 후 new_content 삽입
        const newLines = new_content === '' ? [] : new_content.split('\n');
        debugLog(`new_content split into ${newLines.length} lines`);

        const beforeLines = actualLines.slice(0, start_line - 1);  // start_line 이전
        const afterLines = actualLines.slice(end_line);             // end_line 이후 (start~end 삭제됨)
        const editedLines = [...beforeLines, ...newLines, ...afterLines];

        debugLog(`Line editing:`);
        debugLog(`  Before lines: ${beforeLines.length}`);
        debugLog(`  New lines: ${newLines.length}`);
        debugLog(`  After lines: ${afterLines.length}`);
        debugLog(`  Total edited lines: ${editedLines.length}`);

        // 작업 타입 자동 감지
        const deletedCount = end_line - start_line + 1;
        const insertedCount = newLines.length;
        let operationType;
        if (deletedCount === 0) operationType = 'insert';
        else if (insertedCount === 0) operationType = 'delete';
        else operationType = 'replace';

        debugLog(`Operation type: ${operationType} (deleted: ${deletedCount}, inserted: ${insertedCount})`);

        // 새로운 파일 내용 생성
        const newFileContent = editedLines.join('\n');
        debugLog(`New file content length: ${newFileContent.length} bytes`);

        // 파일 저장 (절대경로 사용)
        debugLog(`Writing file...`);
        await safeWriteFile(absolutePath, newFileContent, 'utf8');
        debugLog(`File written successfully`);

        // 파일 수정 후 해시 업데이트 (절대경로 사용)
        debugLog(`Updating file hash...`);
        await trackFileRead(absolutePath, newFileContent);
        debugLog(`Hash updated`);

        debugLog('========== edit_file_range SUCCESS END ==========');

        return {
            operation_successful: true,
            operation_type: operationType,
            target_file_path: absolutePath,
            fileSnapshot: fileSnapshot,  // UI 히스토리에서 정확한 diff 표시를 위해 편집 전 스냅샷 포함
            file_stats: {
                updated_content: newFileContent  // 수정 후 전체 파일 내용
            }
        };

    } catch (error) {
        debugLog(`========== edit_file_range EXCEPTION ==========`);
        debugLog(`Exception caught: ${error.message}`);
        debugLog(`Stack trace: ${error.stack}`);
        debugLog('========== edit_file_range EXCEPTION END ==========');

        // 에러 시에도 절대경로로 반환
        const absolutePath = resolve(file_path);
        return {
            operation_successful: false,
            error_message: error.message,
            target_file_path: absolutePath
        };
    }
}


// edit_file_replace 스키마
export const editFileReplaceSchema = {
    "name": "edit_file_replace",
    "description": "Performs exact string replacements in files.\n\nUSAGE:\n- You must have read the file at least once before editing. This tool will error if you attempt an edit without reading the file.\n- When editing text from file reader output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. Never include any part of the line number prefix in the old_string or new_string.\n- The edit will FAIL if old_string is not unique in the file. Provide a larger string with more surrounding context to make it unique.\n\nTOKEN EFFICIENCY - CRITICAL: MINIMIZE old_string length.\n- Include ONLY the minimum code needed to uniquely identify the change location\n- Start with just the line(s) you want to modify\n- If rejected with 'not unique' error, incrementally add surrounding context\n- Strategy: (1) Try minimal old_string first (2) If rejected, add 1-2 lines context (3) Repeat until unique\n- Balance: Too short = not unique, Too long = wastes tokens\n- Example WASTEFUL: Including 30 lines when 1 line would be unique\n- Example EFFICIENT: \"const tax = 0.1;\" (if unique)\n- Example EFFICIENT: \"function calc() {\\n  const tax = 0.1;\\n}\" (when context needed)\n\nCONTENT PURITY - CRITICAL: old_string and new_string must be EXACT file content. Include ONLY the actual code - NO explanatory text, NO markdown blocks, NO instructions.\n\nWRONG: \"Here's the code:\\nfunction foo() {}\" or \"```javascript\\ncode\\n```\"\nCORRECT: \"function foo() {\\n  return true;\\n}\"",
    "strict": false,
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "The absolute path to the file to modify"
            },
            "old_string": {
                "type": "string",
                "description": "The exact text to replace (must be unique in file). Must match file content exactly including all whitespace and indentation. MINIMIZE length: start with just the line to change, add context only if rejected for not being unique."
            },
            "new_string": {
                "type": "string",
                "description": "The text to replace it with (must be different from old_string). PURE CODE ONLY - written directly to file."
            }
        },
        "required": ["file_path", "old_string", "new_string"],
        "additionalProperties": false
    },
    "ui_display": {
        "show_tool_call": true,
        "show_tool_result": true,
        "display_name": "Replace",
        "format_tool_call": (args) => {
            return `(${toDisplayPath(args.file_path)})`;
        },
        "format_tool_result": (result) => {
            if (result.operation_successful) {
                const count = result.replacement_count || 0;
                return {
                    type: 'formatted',
                    parts: [
                        { text: 'Replaced ', style: {} },
                        { text: String(count), style: { color: theme.brand.light, bold: true } },
                        { text: ` occurrence${count !== 1 ? 's' : ''}`, style: {} }
                    ]
                };
            }
            return result.error_message || 'Error replacing string';
        }
    }
};

// edit_file_range 및 write_file 함수의 JSON 스키마와 UI 표시 규칙은 아래에 정의되어 있습니다.
export const editFileRangeSchema = {
    "name": "edit_file_range",
    "description": "LOCAL file editing tool for modifying small, specific sections of a file. Supports replace, insert, and delete operations.\n\nLINE NUMBER REFERENCE - CRITICAL:\n- Line numbers are 1-based: first line is line 1 (NOT 0)\n- start_line and end_line are INCLUSIVE: both boundary lines are affected\n- Example: edit_file_range(file, 10, 15, 'new') affects lines 10, 11, 12, 13, 14, AND 15 (6 lines total)\n- Mental model: 'Replace/delete lines START through END, including both boundaries'\n\nEDITING STRATEGY - CRITICAL:\n- This tool is for LOCAL, TARGETED edits only (typically 1-20 lines)\n- NEVER attempt to rewrite entire files or large sections\n- Break large changes into MULTIPLE SMALL edits to different parts of the file\n- Each edit should target ONE specific function, block, or logical section\n- For whole-file rewrites, use write_file instead\n\nCONTENT PURITY - CRITICAL: new_content is written DIRECTLY to the file AS-IS. Include ONLY executable code - NO explanatory text, NO markdown blocks, NO instructions.\n\nWRONG: \"Here's the code:\\nfunction foo() {}\" or \"다음 코드:\\nconst x = 5\" or \"```javascript\\ncode\\n```\"\nCORRECT: \"function foo() {\\n  return true;\\n}\" or \"const x = 5;\\nconsole.log(x);\"\n\nThink: 'If I paste new_content into a code editor, will it run without syntax errors?'\n\nUSAGE:\n(1) Replace: edit_file_range(file, 10, 12, 'code') - Replaces lines 10, 11, AND 12 (3 lines) with new_content\n(2) Delete: edit_file_range(file, 10, 12, '') - Deletes lines 10, 11, AND 12 (3 lines)\n(3) Insert: edit_file_range(file, 10, 9, 'code') - Inserts before line 10 (start > end means insert mode)\n\nReturns line_offset to track line number changes.\n\nEXAMPLE - Modifying 3 functions in a 200-line file:\nCORRECT: Call edit_file_range 3 times in parallel (lines 10-15, lines 50-55, lines 120-125)\nWRONG: Call edit_file_range once with lines 1-200",
    "strict": true,
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to the file to edit"
            },
            "start_line": {
                "type": "integer",
                "description": "Starting line number (1-based, first line is 1). INCLUSIVE: this line WILL be affected. For insert mode, new content appears before this line. Example: start_line=10 means line 10 is included in the operation.",
                "minimum": 1
            },
            "end_line": {
                "type": "integer",
                "description": "Ending line number (1-based). INCLUSIVE: this line WILL be affected. For insert mode, must be start_line-1. For delete/replace, both start_line and end_line are removed/replaced. Example: start=10, end=15 affects lines 10,11,12,13,14,15 (6 lines total).",
                "minimum": 0
            },
            "new_content": {
                "type": "string",
                "description": "PURE CODE ONLY - written directly to file. NO explanations, NO markdown (```), NO instructions. Must be syntactically valid code that can execute as-is. Use empty string '' for deletion. Multiple lines separated by newlines."
            }
        },
        "required": ["file_path", "start_line", "end_line", "new_content"],
        "additionalProperties": false
    },
    "ui_display": {
        "show_tool_call": true,
        "show_tool_result": true,
        "display_name": "Edit",
        "format_tool_call": (args) => {
            return `(${toDisplayPath(args.file_path)}, lines ${args.start_line}-${args.end_line})`;
        },
        "format_tool_result": (result) => {
            if (result.operation_successful) {
                const op = result.operation_type;

                if (op === 'delete') {
                    return `Deleted lines`;
                } else if (op === 'insert') {
                    return `Inserted lines`;
                } else {
                    return `Replaced lines`;
                }
            }
            return result.error_message || 'Error editing file';
        }
    }
};

// 함수 맵 - 문자열로 함수 호출 가능
export const CODE_EDITOR_FUNCTIONS = {
    'write_file': write_file,
    'edit_file_range': edit_file_range,
    'edit_file_replace': edit_file_replace
};
