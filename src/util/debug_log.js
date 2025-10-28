/**
 * Debug logging utility
 * 프로젝트 전역에서 사용할 수 있는 디버그 로깅 함수를 제공합니다.
 */

import { DEBUG_LOG_DIR } from './config.js';
import { join, dirname } from 'path';
import { safeMkdirSync, safeAppendFileSync } from './safe_fs.js';

/**
 * 디버그 로그를 파일에 기록합니다.
 * 모든 환경에서 로그를 기록합니다.
 * @param {string} logFileName - 로그 파일 이름 (예: 'ui.log', 'session.log')
 * @param {string} context - 로그 컨텍스트 (예: 'MainContent', 'AppContext')
 * @param {string} message - 로그 메시지
 */
export function debugLog(logFileName, context, message) {
    try {
        const LOG_FILE = join(DEBUG_LOG_DIR, logFileName);
        const logDir = dirname(LOG_FILE);

        const timestamp = new Date().toISOString();
        const logMessage = context
            ? `[${timestamp}] [${context}] ${message}\n`
            : `[${timestamp}] ${message}\n`;

        // 디렉토리 생성 및 로그 쓰기를 동기로 처리
        safeMkdirSync(logDir, { recursive: true });
        safeAppendFileSync(LOG_FILE, logMessage);
    } catch (err) {
        // Ignore logging errors
    }
}

/**
 * 특정 로그 파일과 컨텍스트에 바인딩된 debugLog 함수를 생성합니다.
 * @param {string} logFileName - 로그 파일 이름
 * @param {string} context - 로그 컨텍스트
 * @returns {Function} 바인딩된 debugLog 함수
 */
export function createDebugLogger(logFileName, context = '') {
    return (message) => debugLog(logFileName, context, message);
}
