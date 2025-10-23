/**
 * Tool Registry - 도구 스키마와 UI 표시 규칙을 관리
 */

import { FILE_READER_FUNCTIONS, readFileSchema, readFileRangeSchema } from "../tools/file_reader.js";
import { RIPGREP_FUNCTIONS, ripgrepSchema } from "../tools/ripgrep.js";
import { GLOB_FUNCTIONS, globSearchSchema } from "../tools/glob.js";
import { CODE_EDITOR_FUNCTIONS, writeFileSchema, editFileRangeSchema, editFileReplaceSchema } from "../tools/code_editor.js";
import { WEB_DOWNLOADER_FUNCTIONS, fetchWebPageSchema } from "../tools/web_downloader.js";
import { RESPONSE_MESSAGE_FUNCTIONS, responseMessageSchema } from '../tools/response_message.js';
import { runPythonCodeSchema, bashSchema } from '../system/code_executer.js';

// 도구 스키마 레지스트리
const TOOL_SCHEMAS = {
    'response_message': responseMessageSchema,
    'glob_search': globSearchSchema,
    'read_file': readFileSchema,
    'read_file_range': readFileRangeSchema,
    'write_file': writeFileSchema,
    'edit_file_range': editFileRangeSchema,
    'edit_file_replace': editFileReplaceSchema,
    'fetch_web_page': fetchWebPageSchema,
    'ripgrep': ripgrepSchema,
    'run_python_code': runPythonCodeSchema,
    'bash': bashSchema
};

/**
 * MCP 도구용 UI 표시 설정을 동적으로 등록
 */
export function registerMCPToolDisplay(toolName, serverName) {
    if (!TOOL_SCHEMAS[toolName]) {
        TOOL_SCHEMAS[toolName] = {
            ui_display: {
                show_tool_call: true,
                show_tool_result: true,
                display_name: toolName,
                format_tool_call: (args) => {
                    return `(from ${serverName})`;
                },
                format_tool_result: (result) => {
                    // result는 { operation_successful, data, error_message, ... } 형태
                    if (result.operation_successful === false) {
                        // 실패 시: 에러 메시지 출력
                        return result.error_message || 'Error occurred';
                    } else if (result.operation_successful === true) {
                        // 성공 시: data의 일부만 표시
                        if (result.data) {
                            const dataStr = typeof result.data === 'string'
                                ? result.data
                                : JSON.stringify(result.data);

                            // 데이터가 너무 길면 앞부분만 표시
                            const maxLength = 100;
                            if (dataStr.length > maxLength) {
                                return dataStr.substring(0, maxLength) + '...';
                            }
                            return dataStr;
                        }
                        return 'Success';
                    }

                    // operation_successful이 없는 경우 (구형 형식)
                    return JSON.stringify(result).substring(0, 100);
                }
            }
        };
    }
}

/**
 * 도구의 UI 표시 규칙을 가져옴
 */
export function getToolDisplayConfig(toolName) {
    const schema = TOOL_SCHEMAS[toolName];
    if (!schema || !schema.ui_display) {
        return {
            show_tool_call: true,
            show_tool_result: true,
            extract_message_from: null,
            format_tool_call: null,
            format_tool_result: null,
            display_name: null
        };
    }
    return schema.ui_display;
}

/**
 * 도구의 표시 이름을 가져옴
 */
export function getToolDisplayName(toolName) {
    const config = getToolDisplayConfig(toolName);
    return config.display_name || toolName;
}

/**
 * 도구 호출을 포맷팅
 */
export function formatToolCall(toolName, args) {
    const config = getToolDisplayConfig(toolName);

    if (config.format_tool_call && typeof config.format_tool_call === 'function') {
        return config.format_tool_call(args);
    }

    return JSON.stringify(args);
}

/**
 * 도구 결과를 포맷팅
 */
export function formatToolResult(toolName, result) {
    const config = getToolDisplayConfig(toolName);

    // Extract the actual data to format
    const dataToFormat = result.originalResult || result.stdout || result;

    // Handle error results: if operation_successful is false, show error_message
    if (dataToFormat && typeof dataToFormat === 'object' && dataToFormat.operation_successful === false) {
        return dataToFormat.error_message || 'Operation failed';
    }

    if (config.format_tool_result && typeof config.format_tool_result === 'function') {
        try {
            return config.format_tool_result(dataToFormat);
        } catch (e) {
            return result.stdout || JSON.stringify(result);
        }
    }

    return result.stdout || (typeof result === 'string' ? result : JSON.stringify(result));
}

/**
 * 도구 호출 인자에서 메시지를 추출
 */
export function extractMessageFromArgs(args, path) {
    if (!path) return null;

    const parts = path.split('.');
    let value = args;

    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            return null;
        }
    }

    return typeof value === 'string' ? value : null;
}

/**
 * 모든 도구 함수 맵 반환
 */
export function getAllToolFunctions() {
    return {
        ...FILE_READER_FUNCTIONS,
        ...CODE_EDITOR_FUNCTIONS,
        ...RIPGREP_FUNCTIONS,
        ...GLOB_FUNCTIONS,
        ...WEB_DOWNLOADER_FUNCTIONS,
        ...RESPONSE_MESSAGE_FUNCTIONS
    };
}
