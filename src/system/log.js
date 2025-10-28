import { safeWriteFile, safeAccess, safeMkdir } from '../util/safe_fs.js';
import { join } from 'path';
import { PAYLOAD_LOG_DIR } from '../util/config.js';

// 이 파일은 AI 요청과 응답을 보기 쉬운 로그 파일로 저장합니다.
// Planner·Orchestrator·Verifier의 대화 흐름을 모두 같은 위치에 남겨 재현성과 디버깅을 확보합니다.
const LOG_DIR = PAYLOAD_LOG_DIR;

// 로그 폴더가 없으면 만들어서 나중에 파일을 쓸 수 있게 합니다.
async function ensureLogDirectory() {
    try {
        await safeAccess(LOG_DIR);
    } catch {
        await safeMkdir(LOG_DIR, { recursive: true });
    }
}

// 파일 이름에 쓸 수 없는 문자를 지워서 안전한 이름을 만듭니다.
function sanitizeTaskName(taskName) {
    return taskName
        .replace(/[^a-zA-Z0-9가-힣\s\-_]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
}

// 날짜와 시간을 조합해 유일한 로그 파일 이름을 만듭니다.
function generateLogFileName(taskName) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

    const safeName = sanitizeTaskName(taskName);
    return `${year}-${month}-${day}_${hours}${minutes}${seconds}${milliseconds}_${safeName}`;
}


/**
 * 로그 저장
 * @param {string} taskName - 태스크 이름
 * @param {Object} data - JSON 데이터
 * @param {string} provider - AI provider ('openai')
 * @returns {Promise<string>} 생성된 로그 파일 경로
 */
// 요청과 응답을 기록용 파일로 남기고 파일 경로를 되돌려줍니다.
export async function saveLog(taskName, data, provider = null) {
    try {
        await ensureLogDirectory();

        const fileName = generateLogFileName(taskName);
        const timestamp = new Date().toISOString();

        // JSON 로그 저장
        const jsonFilePath = join(LOG_DIR, fileName + '.json');
        const logEntry = {
            taskName,
            timestamp,
            data,
            ...(provider && { provider })
        };
        await safeWriteFile(jsonFilePath, JSON.stringify(logEntry, null, 2), 'utf8');

        return jsonFilePath;
    } catch (error) {
        // Failed to save log - silently ignore
        throw error;
    }
}

export const logger = saveLog;
