import { safeReadFile, safeAccess } from "./safe_fs.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";

const moduleDirname = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = dirname(dirname(moduleDirname));

/**
 * 프로젝트 루트 경로를 반환합니다.
 * @returns {string} 프로젝트 루트 경로
 */
export function getProjectRoot() {
    return process.app_custom?.__dirname || defaultProjectRoot;
}

/**
 * 지정된 경로에서 시스템 프롬프트 파일을 로드합니다.
 * @param {string} promptPath - 프롬프트 파일의 경로
 * @returns {string} 프롬프트 파일의 내용 (실패 시 빈 문자열)
 */
async function loadSystemPrompt(promptPath) {
    try {
        const content = await safeReadFile(promptPath, "utf8");
        return content.trim();
    } catch (error) {
        // Failed to load system prompt - return empty
        return '';
    }
}

/**
 * 파일이 존재하는지 확인합니다.
 * @param {string} filePath - 확인할 파일 경로
 * @returns {Promise<boolean>} 파일 존재 여부
 */
async function fileExists(filePath) {
    try {
        await safeAccess(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * prompts 디렉토리에서 지정된 파일명의 프롬프트를 로드합니다.
 * 우선순위: CWD/.aiexe/prompts/ > 프로젝트루트/prompts/
 * @param {string} promptFileName - 프롬프트 파일명 (예: "verifier.txt")
 * @returns {string} 프롬프트 파일의 내용 (실패 시 빈 문자열)
 */
async function loadPromptFromPromptsDir(promptFileName) {
    // 우선순위 1: CWD/.aiexe/prompts/ (프로젝트별 커스텀 프롬프트)
    const cwdPromptPath = join(process.cwd(), ".aiexe", "prompts", promptFileName);
    if (await fileExists(cwdPromptPath)) {
        // Loading prompt from project-specific path
        return await loadSystemPrompt(cwdPromptPath);
    }

    // 우선순위 2: 프로젝트루트/prompts/ (기본 프롬프트)
    const defaultPromptPath = join(getProjectRoot(), "prompts", promptFileName);
    // Loading prompt from default path
    return await loadSystemPrompt(defaultPromptPath);
}

/**
 * 프롬프트를 로드하여 시스템 메시지 객체를 생성합니다.
 * @param {string} promptFileName - 프롬프트 파일명 (예: "verifier.txt")
 * @param {Object} [templateVars] - 템플릿 변수 객체 (예: { what_user_requests: "print hello world" })
 * @returns {Object} 시스템 메시지 객체 { role: "system", content: string }
 */
export async function createSystemMessage(promptFileName, templateVars = {}) {
    let content = await loadPromptFromPromptsDir(promptFileName);

    // EJS 템플릿 엔진을 사용하여 렌더링
    if (templateVars && typeof templateVars === 'object') {
        try {
            content = ejs.render(content, templateVars, {
                // EJS 옵션
                delimiter: '%',  // <% %> 구문 사용
                openDelimiter: '<',
                closeDelimiter: '>'
            });
        } catch (err) {
            // EJS 렌더링 실패 시 원본 content 유지
            console.error(`EJS rendering failed for ${promptFileName}:`, err.message);
        }
    }

    return {
        role: "system",
        content: content
    };
}