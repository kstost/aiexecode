import { execPythonCode } from "../system/code_executer.js";
import { safeReadFile } from '../util/safe_fs.js';
import { join } from 'path';
import { theme } from '../frontend/design/themeColors.js';

// 이 파일은 웹 페이지를 가져와서 텍스트 형식으로 변환하는 도구를 제공합니다.
// 외부 참고 자료가 필요한 미션일 때 Orchestrator가 지식을 확보하고 Verifier가 근거를 남길 수 있게 보조합니다.

/**
 * 웹 페이지 가져오기 도구
 * 웹 페이지를 가져와서 읽기 쉬운 텍스트 형식으로 변환합니다.
 * MarkItDown 라이브러리를 활용하여 고품질의 변환을 제공합니다.
 */

/**
 * 웹 페이지를 가져와서 텍스트 형식으로 변환합니다
 * @param {Object} params - 매개변수 객체
 * @param {string} params.url - 가져올 웹 페이지 URL
 * @returns {Promise<{operation_successful: boolean, url: string, content: string, error_message: string|null}>} 결과 객체
 */
export async function fetch_web_page({ url }) {
    // Intentional delay for testing pending state
    await new Promise(resolve => setTimeout(resolve, 13));

    const timeout = 30;
    const user_agent = 'Mozilla/5.0 (compatible; WebFetcher/1.0)';
    const encoding = 'utf-8';
    const pythonCode = await safeReadFile(join(process.app_custom?.__dirname || process.cwd(), 'src', 'tools', 'web_download.py'), 'utf8');
    const result = await execPythonCode(pythonCode, [url, timeout, user_agent, encoding]);

    return {
        operation_successful: result.code === 0,
        url: url,
        content: result.code === 0 ? result.stdout : '',
        error_message: result.code === 0 ? null : result.stderr || 'Fetch operation failed'
    };
}

// 함수 스키마
export const fetchWebPageSchema = {
    "name": "fetch_web_page",
    "description": "Fetches a web page and converts it to readable text format for reference purposes. Returns the content directly.",
    "strict": true,
    "parameters": {
        "type": "object",
        "required": ["url"],
        "properties": {
            "url": {
                "type": "string",
                "description": "URL of the web page to fetch"
            }
        },
        "additionalProperties": false
    },
    "ui_display": {
        "show_tool_call": true,
        "show_tool_result": true,
        "display_name": "Fetch",
        "format_tool_call": (args) => {
            const url = args.url || '';
            const shortened = url.length > 50 ? url.substring(0, 47) + '...' : url;
            return `(${shortened})`;
        },
        "format_tool_result": (result) => {
            if (result.operation_successful) {
                const contentLength = result.content?.length || 0;
                return {
                    type: 'formatted',
                    parts: [
                        { text: 'Fetched ', style: {} },
                        { text: String(contentLength), style: { color: theme.brand.light, bold: true } },
                        { text: ' characters', style: {} }
                    ]
                };
            }
            return result.error_message || 'Fetch failed';
        }
    }
};

// 함수 맵 - 문자열로 함수 호출 가능
export const WEB_DOWNLOADER_FUNCTIONS = {
    'fetch_web_page': fetch_web_page
};

// 도구 메타데이터
