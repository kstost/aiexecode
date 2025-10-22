// 이 파일은 OpenCode의 FileTime 추적 시스템을 AgentStudy에 맞게 구현합니다.
// 파일 편집 전 무결성을 검증하여 안전한 코드 편집을 보장합니다.

import { promises as fs } from 'fs';
import crypto from 'crypto';
import { DEBUG_LOG_FILE } from '../util/config.js';

function consolelog() { }
/**
 * 파일 무결성 추적 시스템
 * 각 세션별로 파일 콘텐츠 해시를 추적하고, 편집 전 파일 변경 여부를 검증합니다.
 */
class FileIntegrityTracker {
    constructor() {
        // 세션별 파일 콘텐츠 해시 추적
        this.contentHashes = new Map(); // Map<sessionID, Map<filePath, string>>
        // 세션별 파일 스냅샷 저장 (edit_file_range용)
        this.fileSnapshots = new Map(); // Map<sessionID, Map<filePath, {content: string, timestamp: number}>>
        // 현재 활성 세션 ID
        this.currentSessionID = null;
    }

    /**
     * 현재 세션 ID를 설정합니다
     * @param {string} sessionID - 세션 ID
     */
    setCurrentSession(sessionID) {
        this.currentSessionID = sessionID;
        consolelog(`[FileIntegrity] Current session set to: ${sessionID}`);
    }

    /**
     * 현재 세션 ID를 가져옵니다
     * @returns {string|null} 현재 세션 ID
     */
    getCurrentSession() {
        return this.currentSessionID;
    }

    /**
     * 파일 읽기를 기록합니다 (콘텐츠 해시 저장)
     * @param {string} sessionID - 세션 ID
     * @param {string} filePath - 파일 경로
     * @param {string|Buffer} content - 파일 콘텐츠
     */
    async trackRead(sessionID, filePath, content) {
        const timestamp = new Date().toISOString();
        const debugLog = [];

        debugLog.push(`[${timestamp}] trackRead called`);
        debugLog.push(`[${timestamp}] sessionID: ${sessionID}`);
        debugLog.push(`[${timestamp}] filePath: ${filePath}`);
        debugLog.push(`[${timestamp}] content size: ${typeof content === 'string' ? content.length : content?.length || 0} bytes`);

        if (!this.contentHashes.has(sessionID)) {
            this.contentHashes.set(sessionID, new Map());
            debugLog.push(`[${timestamp}] Created new session map`);
        }

        const hash = crypto.createHash('sha256')
            .update(content, typeof content === 'string' ? 'utf8' : undefined)
            .digest('hex');

        debugLog.push(`[${timestamp}] Hash: ${hash.slice(0, 16)}...`);

        const sessionFiles = this.contentHashes.get(sessionID);
        sessionFiles.set(filePath, hash);

        debugLog.push(`[${timestamp}] Hash stored successfully`);
        await fs.appendFile(DEBUG_LOG_FILE, debugLog.join('\n') + '\n').catch(() => {});

        consolelog(`[FileIntegrity] Tracked read: ${sessionID}:${filePath} (hash: ${hash.slice(0, 8)}...)`);
    }

    /**
     * 파일 콘텐츠 해시를 조회합니다
     * @param {string} sessionID - 세션 ID
     * @param {string} filePath - 파일 경로
     * @returns {string|null} 저장된 콘텐츠 해시
     */
    getContentHash(sessionID, filePath) {
        const sessionFiles = this.contentHashes.get(sessionID);
        if (!sessionFiles) return null;
        return sessionFiles.get(filePath) || null;
    }

    /**
     * 파일 편집 전 무결성을 검증합니다
     * @param {string} sessionID - 세션 ID
     * @param {string} filePath - 파일 경로
     * @throws {Error} 파일을 읽지 않았거나 변경된 경우
     */
    async assertIntegrity(sessionID, filePath) {
        const timestamp = new Date().toISOString();
        const debugLog = [];

        debugLog.push(`[${timestamp}] assertIntegrity called`);
        debugLog.push(`[${timestamp}] sessionID: ${sessionID}`);
        debugLog.push(`[${timestamp}] filePath: ${filePath}`);

        const savedHash = this.getContentHash(sessionID, filePath);
        debugLog.push(`[${timestamp}] savedHash: ${savedHash || 'null'}`);

        if (!savedHash) {
            debugLog.push(`[${timestamp}] ERROR: No saved hash found`);
            await fs.appendFile(DEBUG_LOG_FILE, debugLog.join('\n') + '\n').catch(() => {});

            throw new Error(
                `You must read the file ${filePath} before editing it. Use a file reading tool first.`
            );
        }

        await fs.appendFile(DEBUG_LOG_FILE, debugLog.join('\n') + '\n').catch(() => {});

        try {
            const currentContent = await fs.readFile(filePath, 'utf8');
            const currentHash = crypto.createHash('sha256')
                .update(currentContent, 'utf8')
                .digest('hex');

            if (savedHash !== currentHash) {
                throw new Error(
                    `File ${filePath} has been modified since it was last read.\n` +
                    `Saved hash: ${savedHash.slice(0, 16)}...\n` +
                    `Current hash: ${currentHash.slice(0, 16)}...\n\n` +
                    `Please read the file again before modifying it.`
                );
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(
                    `File ${filePath} has been deleted since it was last read.\n` +
                    `Please verify the file exists before modifying it.`
                );
            }
            throw error;
        }
    }

    /**
     * 파일 스냅샷을 저장합니다 (edit_file_range 호출 시)
     * @param {string} sessionID - 세션 ID
     * @param {string} filePath - 파일 경로
     * @param {string} content - 파일 원본 내용
     */
    saveSnapshot(sessionID, filePath, content) {
        if (!this.fileSnapshots.has(sessionID)) {
            this.fileSnapshots.set(sessionID, new Map());
        }

        const sessionSnapshots = this.fileSnapshots.get(sessionID);
        sessionSnapshots.set(filePath, {
            content,
            timestamp: Date.now()
        });

        consolelog(`[FileIntegrity] Snapshot saved: ${sessionID}:${filePath} (${content.length} bytes)`);
    }

    /**
     * 파일 스냅샷을 조회합니다
     * @param {string} sessionID - 세션 ID
     * @param {string} filePath - 파일 경로
     * @returns {{content: string, timestamp: number}|null} 저장된 스냅샷
     */
    getSnapshot(sessionID, filePath) {
        const sessionSnapshots = this.fileSnapshots.get(sessionID);
        if (!sessionSnapshots) return null;
        return sessionSnapshots.get(filePath) || null;
    }

}

// 싱글톤 인스턴스
const fileIntegrityTracker = new FileIntegrityTracker();

/**
 * 현재 세션 ID를 설정합니다
 * @param {string} sessionID - 세션 ID
 */
export function setCurrentSession(sessionID) {
    fileIntegrityTracker.setCurrentSession(sessionID);
}

/**
 * 현재 세션 ID를 가져옵니다
 * @returns {string|null} 현재 세션 ID
 */
export function getCurrentSession() {
    return fileIntegrityTracker.getCurrentSession();
}

/**
 * 파일 읽기를 추적합니다 (현재 세션 기준)
 * @param {string} filePath - 파일 경로
 * @param {string|Buffer} content - 파일 콘텐츠
 */
export async function trackFileRead(filePath, content) {
    const sessionID = fileIntegrityTracker.getCurrentSession();
    if (!sessionID) {
        consolelog('[FileIntegrity] No current session set, skipping file read tracking');
        return;
    }
    await fileIntegrityTracker.trackRead(sessionID, filePath, content);
}

/**
 * 파일 편집 전 무결성을 검증합니다 (현재 세션 기준)
 * @param {string} filePath - 파일 경로
 */
export async function assertFileIntegrity(filePath) {
    const sessionID = fileIntegrityTracker.getCurrentSession();
    if (!sessionID) {
        throw new Error('[FileIntegrity] No current session set');
    }
    await fileIntegrityTracker.assertIntegrity(sessionID, filePath);
}

/**
 * 파일 스냅샷을 저장합니다 (현재 세션 기준)
 * @param {string} filePath - 파일 경로
 * @param {string} content - 파일 원본 내용
 */
export function saveFileSnapshot(filePath, content) {
    const sessionID = fileIntegrityTracker.getCurrentSession();
    if (!sessionID) {
        consolelog('[FileIntegrity] No current session set, skipping snapshot save');
        return;
    }
    fileIntegrityTracker.saveSnapshot(sessionID, filePath, content);
}

/**
 * 파일 스냅샷을 조회합니다 (현재 세션 기준)
 * @param {string} filePath - 파일 경로
 * @returns {{content: string, timestamp: number}|null} 저장된 스냅샷
 */
export function getFileSnapshot(filePath) {
    const sessionID = fileIntegrityTracker.getCurrentSession();
    if (!sessionID) {
        return null;
    }
    return fileIntegrityTracker.getSnapshot(sessionID, filePath);
}

export { fileIntegrityTracker };
