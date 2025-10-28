// 이 파일은 OpenCode의 FileTime 추적 시스템을 AgentStudy에 맞게 구현합니다.
// 파일 편집 전 무결성을 검증하여 안전한 코드 편집을 보장합니다.

import { safeReadFile, safeMkdir, safeAppendFile } from '../util/safe_fs.js';
import crypto from 'crypto';
import { dirname, join } from 'path';
import { createDebugLogger } from '../util/debug_log.js';
import { DEBUG_LOG_DIR } from '../util/config.js';

const debugLog = createDebugLogger('file_integrity.log', 'file_integrity');

// LOG_FILE을 함수로 만들어 lazy initialization
function getLogFile() {
    return join(DEBUG_LOG_DIR, 'file_integrity_internal.log');
}
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
        debugLog(`========== SESSION CHANGED ==========`);
        debugLog(`New session ID: ${sessionID}`);
        debugLog(`[FileIntegrity] Current session set to: ${sessionID}`);
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
        const internalDebugLog = [];

        debugLog(`========== trackRead START ==========`);
        debugLog(`sessionID: ${sessionID}`);
        debugLog(`filePath: ${filePath}`);
        debugLog(`  - filePath type: ${typeof filePath}`);
        debugLog(`  - filePath length: ${filePath?.length || 0}`);
        debugLog(`  - filePath starts with '/': ${filePath?.startsWith('/') || false}`);
        debugLog(`  - filePath is absolute path: ${filePath?.startsWith('/') || false}`);
        debugLog(`  - Current Working Directory: ${process.cwd()}`);
        debugLog(`content size: ${typeof content === 'string' ? content.length : content?.length || 0} bytes`);

        internalDebugLog.push(`[${timestamp}] trackRead called`);
        internalDebugLog.push(`[${timestamp}] sessionID: ${sessionID}`);
        internalDebugLog.push(`[${timestamp}] filePath: ${filePath}`);
        internalDebugLog.push(`[${timestamp}] filePath type: ${typeof filePath}`);
        internalDebugLog.push(`[${timestamp}] filePath is absolute: ${filePath?.startsWith('/') || false}`);
        internalDebugLog.push(`[${timestamp}] content size: ${typeof content === 'string' ? content.length : content?.length || 0} bytes`);

        if (!this.contentHashes.has(sessionID)) {
            this.contentHashes.set(sessionID, new Map());
            debugLog(`Created new session map for session: ${sessionID}`);
            internalDebugLog.push(`[${timestamp}] Created new session map`);
        }

        const hash = crypto.createHash('sha256')
            .update(content, typeof content === 'string' ? 'utf8' : undefined)
            .digest('hex');

        debugLog(`Computed hash: ${hash.slice(0, 16)}...`);
        internalDebugLog.push(`[${timestamp}] Hash: ${hash.slice(0, 16)}...`);

        const sessionFiles = this.contentHashes.get(sessionID);
        sessionFiles.set(filePath, hash);

        debugLog(`Hash stored in session map`);
        debugLog(`Total files tracked in this session: ${sessionFiles.size}`);
        internalDebugLog.push(`[${timestamp}] Hash stored successfully`);
        const logFile = getLogFile();
        await safeMkdir(dirname(logFile), { recursive: true }).catch(() => {});
        await safeAppendFile(logFile, internalDebugLog.join('\n') + '\n').catch(() => {});

        debugLog(`========== trackRead END ==========`);
        debugLog(`[FileIntegrity] Tracked read: ${sessionID}:${filePath} (hash: ${hash.slice(0, 8)}...)`);
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
        const assertDebugLog = [];

        debugLog(`========== assertIntegrity START ==========`);
        debugLog(`sessionID: ${sessionID}`);
        debugLog(`filePath: ${filePath}`);
        debugLog(`  - filePath type: ${typeof filePath}`);
        debugLog(`  - filePath length: ${filePath?.length || 0}`);
        debugLog(`  - filePath starts with '/': ${filePath?.startsWith('/') || false}`);
        debugLog(`  - filePath is absolute path: ${filePath?.startsWith('/') || false}`);
        debugLog(`  - Current Working Directory: ${process.cwd()}`);

        assertDebugLog.push(`[${timestamp}] assertIntegrity called`);
        assertDebugLog.push(`[${timestamp}] sessionID: ${sessionID}`);
        assertDebugLog.push(`[${timestamp}] filePath: ${filePath}`);
        assertDebugLog.push(`[${timestamp}] filePath type: ${typeof filePath}`);
        assertDebugLog.push(`[${timestamp}] filePath is absolute: ${filePath?.startsWith('/') || false}`);

        const savedHash = this.getContentHash(sessionID, filePath);
        assertDebugLog.push(`[${timestamp}] savedHash: ${savedHash || 'null'}`);
        debugLog(`Saved hash lookup result: ${savedHash ? 'FOUND' : 'NOT FOUND'}`);
        if (savedHash) {
            debugLog(`  - Hash prefix: ${savedHash.slice(0, 16)}...`);
        }

        if (!savedHash) {
            assertDebugLog.push(`[${timestamp}] ERROR: No saved hash found`);
            debugLog(`ERROR: No saved hash found for this file in session ${sessionID}`);
            debugLog('========== assertIntegrity ERROR END ==========');
            const logFile = getLogFile();
            await safeMkdir(dirname(logFile), { recursive: true }).catch(() => {});
            await safeAppendFile(logFile, assertDebugLog.join('\n') + '\n').catch(() => {});

            throw new Error(
                `You must read the file ${filePath} before editing it. Use a file reading tool first.`
            );
        }

        const logFile = getLogFile();
        await safeMkdir(dirname(logFile), { recursive: true }).catch(() => {});
        await safeAppendFile(logFile, assertDebugLog.join('\n') + '\n').catch(() => {});

        debugLog(`Reading current file content for comparison...`);
        debugLog(`  - Reading from path: ${filePath}`);
        try {
            const currentContent = await safeReadFile(filePath, 'utf8');
            debugLog(`Current file read successful:`);
            debugLog(`  - Content length: ${currentContent.length} bytes`);

            const currentHash = crypto.createHash('sha256')
                .update(currentContent, 'utf8')
                .digest('hex');
            debugLog(`Current hash computed: ${currentHash.slice(0, 16)}...`);
            debugLog(`Hash comparison:`);
            debugLog(`  - Saved hash:   ${savedHash.slice(0, 16)}...`);
            debugLog(`  - Current hash: ${currentHash.slice(0, 16)}...`);
            debugLog(`  - Hashes match: ${savedHash === currentHash}`);

            if (savedHash !== currentHash) {
                debugLog(`ERROR: File has been modified since last read`);
                debugLog('========== assertIntegrity ERROR END ==========');
                throw new Error(
                    `File ${filePath} has been modified since it was last read.\n` +
                    `Saved hash: ${savedHash.slice(0, 16)}...\n` +
                    `Current hash: ${currentHash.slice(0, 16)}...\n\n` +
                    `Please read the file again before modifying it.`
                );
            }

            debugLog(`File integrity verified successfully`);
            debugLog('========== assertIntegrity SUCCESS END ==========');
        } catch (error) {
            if (error.message && (error.message.includes('ENOENT') || error.message.includes('no such file'))) {
                debugLog(`ERROR: File has been deleted since last read`);
                debugLog('========== assertIntegrity ERROR END ==========');
                throw new Error(
                    `File ${filePath} has been deleted since it was last read.\n` +
                    `Please verify the file exists before modifying it.`
                );
            }
            debugLog(`ERROR: Exception during integrity check: ${error.message}`);
            debugLog('========== assertIntegrity EXCEPTION END ==========');
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
        debugLog(`========== saveSnapshot START ==========`);
        debugLog(`sessionID: ${sessionID}`);
        debugLog(`filePath: ${filePath}`);
        debugLog(`  - filePath type: ${typeof filePath}`);
        debugLog(`  - filePath length: ${filePath?.length || 0}`);
        debugLog(`  - filePath starts with '/': ${filePath?.startsWith('/') || false}`);
        debugLog(`  - filePath is absolute path: ${filePath?.startsWith('/') || false}`);
        debugLog(`  - Current Working Directory: ${process.cwd()}`);
        debugLog(`content size: ${content.length} bytes`);

        if (!this.fileSnapshots.has(sessionID)) {
            this.fileSnapshots.set(sessionID, new Map());
            debugLog(`Created new snapshot map for session: ${sessionID}`);
        }

        const sessionSnapshots = this.fileSnapshots.get(sessionID);
        sessionSnapshots.set(filePath, {
            content,
            timestamp: Date.now()
        });

        debugLog(`Snapshot stored in session map`);
        debugLog(`Total snapshots in this session: ${sessionSnapshots.size}`);
        debugLog(`========== saveSnapshot END ==========`);

        debugLog(`[FileIntegrity] Snapshot saved: ${sessionID}:${filePath} (${content.length} bytes)`);
    }

    /**
     * 파일 스냅샷을 조회합니다
     * @param {string} sessionID - 세션 ID
     * @param {string} filePath - 파일 경로
     * @returns {{content: string, timestamp: number}|null} 저장된 스냅샷
     */
    getSnapshot(sessionID, filePath) {
        debugLog(`========== getSnapshot START ==========`);
        debugLog(`sessionID: ${sessionID}`);
        debugLog(`filePath: ${filePath}`);
        debugLog(`  - filePath type: ${typeof filePath}`);
        debugLog(`  - filePath length: ${filePath?.length || 0}`);
        debugLog(`  - filePath starts with '/': ${filePath?.startsWith('/') || false}`);
        debugLog(`  - filePath is absolute path: ${filePath?.startsWith('/') || false}`);
        debugLog(`  - Current Working Directory: ${process.cwd()}`);

        const sessionSnapshots = this.fileSnapshots.get(sessionID);
        if (!sessionSnapshots) {
            debugLog(`No snapshot map found for session: ${sessionID}`);
            debugLog(`========== getSnapshot END (NOT FOUND) ==========`);
            return null;
        }

        debugLog(`Snapshot map found, has ${sessionSnapshots.size} snapshots`);
        const snapshot = sessionSnapshots.get(filePath) || null;

        if (snapshot) {
            debugLog(`Snapshot FOUND for file`);
            debugLog(`  Content size: ${snapshot.content.length} bytes`);
            debugLog(`  Timestamp: ${new Date(snapshot.timestamp).toISOString()}`);
        } else {
            debugLog(`Snapshot NOT FOUND for file`);
            debugLog(`Available snapshots in session:`);
            for (const [path, snap] of sessionSnapshots.entries()) {
                debugLog(`  - ${path} (${snap.content.length} bytes)`);
            }
        }

        debugLog(`========== getSnapshot END ==========`);
        return snapshot;
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
    debugLog(`========== trackFileRead (export wrapper) START ==========`);
    debugLog(`filePath: ${filePath}`);

    const sessionID = fileIntegrityTracker.getCurrentSession();
    debugLog(`Current session ID: ${sessionID || 'NULL'}`);

    if (!sessionID) {
        debugLog(`ERROR: No current session set, cannot track file read`);
        debugLog('========== trackFileRead (export wrapper) END ==========');
        debugLog('[FileIntegrity] No current session set, skipping file read tracking');
        return;
    }

    await fileIntegrityTracker.trackRead(sessionID, filePath, content);
    debugLog('========== trackFileRead (export wrapper) END ==========');
}

/**
 * 파일 편집 전 무결성을 검증합니다 (현재 세션 기준)
 * @param {string} filePath - 파일 경로
 */
export async function assertFileIntegrity(filePath) {
    debugLog(`========== assertFileIntegrity (export wrapper) START ==========`);
    debugLog(`filePath: ${filePath}`);

    const sessionID = fileIntegrityTracker.getCurrentSession();
    debugLog(`Current session ID: ${sessionID || 'NULL'}`);

    if (!sessionID) {
        debugLog(`ERROR: No current session set`);
        debugLog('========== assertFileIntegrity (export wrapper) END ==========');
        throw new Error('[FileIntegrity] No current session set');
    }

    await fileIntegrityTracker.assertIntegrity(sessionID, filePath);
    debugLog('========== assertFileIntegrity (export wrapper) END ==========');
}

/**
 * 파일 스냅샷을 저장합니다 (현재 세션 기준)
 * @param {string} filePath - 파일 경로
 * @param {string} content - 파일 원본 내용
 */
export function saveFileSnapshot(filePath, content) {
    debugLog(`========== saveFileSnapshot (export wrapper) START ==========`);
    debugLog(`filePath: ${filePath}`);
    debugLog(`content size: ${content?.length || 0} bytes`);

    const sessionID = fileIntegrityTracker.getCurrentSession();
    debugLog(`Current session ID: ${sessionID || 'NULL'}`);

    if (!sessionID) {
        debugLog(`ERROR: No current session set, cannot save snapshot`);
        debugLog('========== saveFileSnapshot (export wrapper) END ==========');
        debugLog('[FileIntegrity] No current session set, skipping snapshot save');
        return;
    }

    fileIntegrityTracker.saveSnapshot(sessionID, filePath, content);
    debugLog('========== saveFileSnapshot (export wrapper) END ==========');
}

/**
 * 파일 스냅샷을 조회합니다 (현재 세션 기준)
 * @param {string} filePath - 파일 경로
 * @returns {{content: string, timestamp: number}|null} 저장된 스냅샷
 */
export function getFileSnapshot(filePath) {
    debugLog(`========== getFileSnapshot (export wrapper) START ==========`);
    debugLog(`filePath: ${filePath}`);

    const sessionID = fileIntegrityTracker.getCurrentSession();
    debugLog(`Current session ID: ${sessionID || 'NULL'}`);

    if (!sessionID) {
        debugLog(`ERROR: No current session set, returning null`);
        debugLog('========== getFileSnapshot (export wrapper) END ==========');
        return null;
    }

    const snapshot = fileIntegrityTracker.getSnapshot(sessionID, filePath);
    debugLog(`Snapshot result: ${snapshot ? 'FOUND' : 'NOT FOUND'}`);
    if (snapshot) {
        debugLog(`  Content size: ${snapshot.content.length} bytes`);
        debugLog(`  Timestamp: ${new Date(snapshot.timestamp).toISOString()}`);
    }
    debugLog('========== getFileSnapshot (export wrapper) END ==========');

    return snapshot;
}

export { fileIntegrityTracker };
