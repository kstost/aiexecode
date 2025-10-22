import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import * as diff from 'diff';
import { assertFileIntegrity, trackFileRead } from '../system/file_integrity.js';
import { DEBUG_LOG_FILE } from '../util/config.js';

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
    const debugLog = [];
    const timestamp = new Date().toISOString();

    try {
        // 경로를 절대경로로 정규화
        const absolutePath = resolve(file_path);
        debugLog.push(`[${timestamp}] write_file called: ${absolutePath}`);

        // 디렉토리 경로 추출
        const dir = dirname(absolutePath);
        debugLog.push(`[${timestamp}] Directory: ${dir}`);

        // 디렉토리가 존재하지 않으면 생성
        try {
            await fs.access(dir);
            debugLog.push(`[${timestamp}] Directory exists`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.mkdir(dir, { recursive: true });
                debugLog.push(`[${timestamp}] Directory created`);
            } else {
                throw error;
            }
        }

        // 기존 파일 확인
        let originalContent = '';
        let fileExists = false;
        try {
            originalContent = await fs.readFile(absolutePath, 'utf8');
            fileExists = true;
            debugLog.push(`[${timestamp}] File EXISTS - size: ${originalContent.length} bytes`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            debugLog.push(`[${timestamp}] File DOES NOT EXIST`);
        }

        // 기존 파일이 있는 경우 무결성 검증 (절대경로 사용)
        if (fileExists) {
            debugLog.push(`[${timestamp}] Calling assertFileIntegrity`);
            try {
                await assertFileIntegrity(absolutePath);
                debugLog.push(`[${timestamp}] assertFileIntegrity passed`);
            } catch (integrityError) {
                debugLog.push(`[${timestamp}] assertFileIntegrity FAILED: ${integrityError.message}`);
                await fs.appendFile(DEBUG_LOG_FILE, debugLog.join('\n') + '\n');
                throw integrityError;
            }
        }

        // 파일 쓰기 (절대경로 사용)
        debugLog.push(`[${timestamp}] Writing file - content size: ${content.length} bytes`);
        await fs.writeFile(absolutePath, content, 'utf8');
        debugLog.push(`[${timestamp}] File written successfully`);

        // 파일 수정 후 해시 업데이트 (절대경로 사용)
        await trackFileRead(absolutePath, content);
        debugLog.push(`[${timestamp}] Hash tracked`);

        await fs.appendFile(DEBUG_LOG_FILE, debugLog.join('\n') + '\n');

        // diff 생성 (기존 파일이 있었을 경우에만, 절대경로 사용)
        let diffInfo = null;
        if (fileExists) {
            const patch = diff.createPatch(absolutePath, originalContent, content);
            const lineDiff = diff.diffLines(originalContent, content);
            diffInfo = {
                unified_diff_patch: patch,
                line_by_line_changes: lineDiff.filter(part => part.added || part.removed),
                modification_statistics: {
                    lines_added_count: lineDiff.filter(part => part.added).reduce((sum, part) => sum + part.count, 0),
                    lines_removed_count: lineDiff.filter(part => part.removed).reduce((sum, part) => sum + part.count, 0),
                    lines_unchanged_count: lineDiff.filter(part => !part.added && !part.removed).reduce((sum, part) => sum + part.count, 0)
                }
            };
        }

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
        debugLog.push(`[${timestamp}] ERROR: ${error.message}`);
        debugLog.push(`[${timestamp}] Stack: ${error.stack}`);
        await fs.appendFile(DEBUG_LOG_FILE, debugLog.join('\n') + '\n').catch(() => {});

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
            return `(${args.file_path || ''})`;
        },
        "format_tool_result": (result) => {
            if (result.operation_successful) {
                const lines = result.total_line_count || 0;
                const action = result.file_existed ? 'Overwrote' : 'Created';
                return `${action} ${lines} line${lines !== 1 ? 's' : ''}`;
            }
            return result.error_message || 'Error writing file';
        }
    }
};

/**
 * 파일에서 정확한 문자열 매칭을 통해 내용을 교체합니다 (Claude Code 스타일)
 *
 * @param {Object} params - 매개변수 객체
 * @param {string} params.file_path - 편집할 파일의 경로
 * @param {string} params.old_string - 교체할 기존 문자열 (파일 내에서 고유해야 함)
 * @param {string} params.new_string - 새로운 문자열
 * @param {boolean} params.replace_all - true일 경우 모든 발생을 교체 (기본값: false)
 * @returns {Promise<Object>} 편집 결과
 */
export async function edit_file_replace({ file_path, old_string, new_string, replace_all = false }) {
    try {
        // 경로를 절대경로로 정규화
        const absolutePath = resolve(file_path);

        // 파일 존재 확인
        try {
            await fs.access(absolutePath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    operation_successful: false,
                    error_message: `File not found: ${absolutePath}`,
                    target_file_path: absolutePath
                };
            }
            throw error;
        }

        // 파일 무결성 검증 (절대경로 사용)
        await assertFileIntegrity(absolutePath);

        // 원본 파일 읽기 (절대경로 사용)
        const originalContent = await fs.readFile(absolutePath, 'utf8');

        // old_string과 new_string이 동일한지 검증
        if (old_string === new_string) {
            return {
                operation_successful: false,
                error_message: "new_string must be different from old_string",
                target_file_path: absolutePath
            };
        }

        // old_string이 파일에 존재하는지 확인
        if (!originalContent.includes(old_string)) {
            return {
                operation_successful: false,
                error_message: `old_string not found in file`,
                target_file_path: absolutePath
            };
        }

        // replace_all이 false일 때 고유성 검증
        if (!replace_all) {
            const firstIndex = originalContent.indexOf(old_string);
            const lastIndex = originalContent.lastIndexOf(old_string);
            if (firstIndex !== lastIndex) {
                return {
                    operation_successful: false,
                    error_message: `old_string is not unique in the file. Use replace_all: true to replace all occurrences, or provide more context to make old_string unique.`,
                    target_file_path: absolutePath
                };
            }
        }

        // 문자열 교체
        let newContent;
        let replacementCount;
        if (replace_all) {
            // 모든 발생 교체
            const escapedOld = escapeRegExp(old_string);
            const regex = new RegExp(escapedOld, 'g');
            const matches = originalContent.match(regex);
            replacementCount = matches ? matches.length : 0;
            // new_string에 $ 특수문자가 있어도 안전하게 교체하기 위해 함수 사용
            newContent = originalContent.replace(regex, () => new_string);
        } else {
            // 첫 번째 발생만 교체
            replacementCount = 1;
            newContent = originalContent.replace(old_string, new_string);
        }

        // 파일 저장 (절대경로 사용)
        await fs.writeFile(absolutePath, newContent, 'utf8');

        // 파일 수정 후 해시 업데이트 (절대경로 사용)
        await trackFileRead(absolutePath, newContent);

        // diff 생성 (절대경로 사용)
        const patch = diff.createPatch(absolutePath, originalContent, newContent);
        const lineDiff = diff.diffLines(originalContent, newContent);

        return {
            operation_successful: true,
            target_file_path: absolutePath,
            absolute_file_path: absolutePath,
            replacement_count: replacementCount,
            replace_all_mode: replace_all,
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
    try {
        // 경로를 절대경로로 정규화
        const absolutePath = resolve(file_path);

        // 파일 존재 확인
        try {
            await fs.access(absolutePath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    operation_successful: false,
                    error_message: `File not found: ${absolutePath}`,
                    target_file_path: absolutePath
                };
            }
            throw error;
        }

        // 파일 무결성 검증 (절대경로 사용)
        await assertFileIntegrity(absolutePath);

        // 원본 파일 읽기 (절대경로 사용)
        const originalContent = await fs.readFile(absolutePath, 'utf8');
        const originalLines = originalContent.split('\n');

        // Handle files without trailing newline correctly
        const totalLines = originalContent === '' ? 0 :
            (originalContent.endsWith('\n') ? originalLines.length - 1 : originalLines.length);

        const actualLines = originalContent === '' ? [] :
            (originalContent.endsWith('\n') ? originalLines.slice(0, -1) : originalLines);

        // 간단한 검증: start_line은 1 이상, end_line은 start_line-1 이상
        if (start_line < 1) {
            return {
                operation_successful: false,
                error_message: "start_line must be >= 1",
                target_file_path: absolutePath
            };
        }

        if (end_line < start_line - 1) {
            return {
                operation_successful: false,
                error_message: `end_line must be >= start_line-1 (got start=${start_line}, end=${end_line})`,
                target_file_path: absolutePath
            };
        }

        if (start_line > totalLines + 1) {
            return {
                operation_successful: false,
                error_message: `start_line ${start_line} exceeds file length ${totalLines}`,
                target_file_path: absolutePath
            };
        }

        if (end_line > totalLines) {
            return {
                operation_successful: false,
                error_message: `end_line ${end_line} exceeds file length ${totalLines}`,
                target_file_path: absolutePath
            };
        }

        // 단일 통합 로직: start_line부터 end_line까지 삭제 후 new_content 삽입
        const newLines = new_content === '' ? [] : new_content.split('\n');

        const beforeLines = actualLines.slice(0, start_line - 1);  // start_line 이전
        const afterLines = actualLines.slice(end_line);             // end_line 이후 (start~end 삭제됨)
        const editedLines = [...beforeLines, ...newLines, ...afterLines];

        // 작업 타입 자동 감지
        const deletedCount = end_line - start_line + 1;
        const insertedCount = newLines.length;
        let operationType;
        if (deletedCount === 0) operationType = 'insert';
        else if (insertedCount === 0) operationType = 'delete';
        else operationType = 'replace';

        // 새로운 파일 내용 생성
        const newFileContent = editedLines.join('\n');

        // 파일 저장 (절대경로 사용)
        await fs.writeFile(absolutePath, newFileContent, 'utf8');

        // 파일 수정 후 해시 업데이트 (절대경로 사용)
        await trackFileRead(absolutePath, newFileContent);

        return {
            operation_successful: true,
            operation_type: operationType,
            target_file_path: absolutePath,
            absolute_file_path: absolutePath,
            file_stats: {
                updated_content: newFileContent  // 수정 후 전체 파일 내용
            }
        };

    } catch (error) {
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
    "description": "Performs exact string replacements in files (Claude Code style).\n\nUSAGE:\n- You must have read the file at least once before editing. This tool will error if you attempt an edit without reading the file.\n- When editing text from file reader output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. Never include any part of the line number prefix in the old_string or new_string.\n- The edit will FAIL if old_string is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use replace_all to change every instance of old_string.\n- Use replace_all for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.\n\nCONTENT PURITY - CRITICAL: old_string and new_string must be EXACT file content. Include ONLY the actual code - NO explanatory text, NO markdown blocks, NO instructions.\n\nWRONG: \"Here's the code:\\nfunction foo() {}\" or \"```javascript\\ncode\\n```\"\nCORRECT: \"function foo() {\\n  return true;\\n}\"",
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
                "description": "The exact text to replace (must be unique in file unless replace_all is true). Must match file content exactly including all whitespace and indentation."
            },
            "new_string": {
                "type": "string",
                "description": "The text to replace it with (must be different from old_string). PURE CODE ONLY - written directly to file."
            },
            "replace_all": {
                "type": "boolean",
                "description": "Replace all occurrences of old_string (default false). Use this for renaming variables across the file."
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
            return `(${args.file_path || ''})${args.replace_all ? ' [all]' : ''}`;
        },
        "format_tool_result": (result) => {
            if (result.operation_successful) {
                const count = result.replacement_count || 0;
                return `Replaced ${count} occurrence${count !== 1 ? 's' : ''}`;
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
            return `(${args.file_path || ''}, lines ${args.start_line}-${args.end_line})`;
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
