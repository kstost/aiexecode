/**
 * Safe File System Operations Wrapper
 *
 * 이 모듈은 파일 시스템의 파괴적 작업들을 안전하게 수행하기 위한 wrapper 함수들을 제공합니다.
 * 모든 파괴적 작업은 검증과 에러 핸들링을 포함합니다.
 */

import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';

// 허용된 디렉토리들
const ALLOWED_DIRECTORIES = [
    process.cwd(), // current working directory
    path.join(homedir(), '.aiexe') // ~/.aiexe
];

/**
 * 파일/디렉토리 존재 여부 확인 (비동기)
 * @param {string} filePath - 확인할 경로
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function debugLog(str) {
    const logDir = path.join(homedir(), '.aiexe', 'debuglog');
    const logFile = path.join(logDir, 'safe_fs.log');

    if (!(await exists(logDir))) {
        await fs.mkdir(logDir, { recursive: true }).catch(() => {});
    }

    await fs.appendFile(logFile, str).catch(() => {});
}


/**
 * 경로를 절대경로로 변환
 * @param {string} filePath - 변환할 파일 경로
 * @returns {string} 절대 경로
 */
function toAbsolutePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        return filePath;
    }

    // 이미 절대 경로이면 그대로 반환
    if (path.isAbsolute(filePath)) {
        return path.normalize(filePath);
    }

    // 상대 경로를 절대 경로로 변환
    return path.resolve(process.cwd(), filePath);
}

/**
 * 경로 유효성 검증
 * @param {string} filePath - 검증할 파일 경로
 * @returns {boolean} 유효한 경로인지 여부
 */
function validatePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        return false;
    }

    return true;
}

/**
 * 경로가 허용된 디렉토리 내부에 있는지 확인
 * @param {string} filePath - 확인할 파일 경로
 * @returns {boolean} 허용된 디렉토리 내부에 있는지 여부
 */
function isWithinAllowedDirectory(filePath) {
    const normalizedPath = path.normalize(path.resolve(filePath));

    return ALLOWED_DIRECTORIES.some(allowedDir => {
        const normalizedAllowedDir = path.normalize(path.resolve(allowedDir));
        return normalizedPath.startsWith(normalizedAllowedDir + path.sep) ||
            normalizedPath === normalizedAllowedDir;
    });
}

/**
 * 보호된 경로인지 확인 (deprecated - isWithinAllowedDirectory로 대체됨)
 * @param {string} filePath - 확인할 파일 경로
 * @returns {boolean} 보호된 경로인지 여부
 */
function isProtectedPath(filePath) {
    // 허용된 디렉토리가 아니면 보호된 경로로 간주
    return !isWithinAllowedDirectory(filePath);
}

/**
 * 안전한 파일 쓰기
 * @param {string} filePath - 쓸 파일 경로
 * @param {string|Buffer} content - 파일 내용
 * @param {string} encoding - 인코딩 (기본값: 'utf8')
 * @returns {Promise<void>}
 */
export async function safeWriteFile(filePath, content, encoding = 'utf8') {
    const absolutePath = toAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
        const error = `Invalid file path: ${filePath}`;
        await debugLog(`[ERROR] safeWriteFile: ${error}\n`);
        throw new Error(error);
    }

    if (isProtectedPath(absolutePath)) {
        const error = `Protected path cannot be modified: ${absolutePath}`;
        await debugLog(`[ERROR] safeWriteFile: ${error}\n`);
        throw new Error(error);
    }

    try {
        await fs.writeFile(absolutePath, content, encoding);
    } catch (error) {
        const errorMsg = `Failed to write file ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeWriteFile: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 안전한 파일 삭제
 * @param {string} filePath - 삭제할 파일 경로
 * @returns {Promise<void>}
 */
export async function safeUnlink(filePath) {
    const absolutePath = toAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
        const error = `Invalid file path: ${filePath}`;
        await debugLog(`[ERROR] safeUnlink: ${error}\n`);
        throw new Error(error);
    }

    if (isProtectedPath(absolutePath)) {
        const error = `Protected path cannot be deleted: ${absolutePath}`;
        await debugLog(`[ERROR] safeUnlink: ${error}\n`);
        throw new Error(error);
    }

    try {
        if (!(await exists(absolutePath))) {
            return; // 파일이 없으면 조용히 반환
        }

        await fs.unlink(absolutePath);
    } catch (error) {
        const errorMsg = `Failed to delete file ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeUnlink: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 안전한 파일 이름 변경
 * @param {string} oldPath - 기존 파일 경로
 * @param {string} newPath - 새 파일 경로
 * @returns {Promise<void>}
 */
export async function safeRename(oldPath, newPath) {
    const absoluteOldPath = toAbsolutePath(oldPath);
    const absoluteNewPath = toAbsolutePath(newPath);

    if (!validatePath(absoluteOldPath) || !validatePath(absoluteNewPath)) {
        const error = `Invalid file path: ${oldPath} -> ${newPath}`;
        await debugLog(`[ERROR] safeRename: ${error}\n`);
        throw new Error(error);
    }

    if (isProtectedPath(absoluteOldPath) || isProtectedPath(absoluteNewPath)) {
        const error = `Protected path cannot be modified`;
        await debugLog(`[ERROR] safeRename: ${error} (${absoluteOldPath} -> ${absoluteNewPath})\n`);
        throw new Error(error);
    }

    try {
        if (!(await exists(absoluteOldPath))) {
            const errorMsg = `Source file does not exist: ${absoluteOldPath}`;
            await debugLog(`[ERROR] safeRename: ${errorMsg}\n`);
            throw new Error(errorMsg);
        }

        await fs.rename(absoluteOldPath, absoluteNewPath);
    } catch (error) {
        const errorMsg = `Failed to rename file ${absoluteOldPath} -> ${absoluteNewPath}: ${error.message}`;
        await debugLog(`[ERROR] safeRename: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 안전한 파일 절삭 (내용 비우기)
 * @param {string} filePath - 절삭할 파일 경로
 * @param {number} length - 절삭할 길이 (기본값: 0 - 파일 비우기)
 * @returns {Promise<void>}
 */
export async function safeTruncate(filePath, length = 0) {
    const absolutePath = toAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
        const error = `Invalid file path: ${filePath}`;
        await debugLog(`[ERROR] safeTruncate: ${error}\n`);
        throw new Error(error);
    }

    if (isProtectedPath(absolutePath)) {
        const error = `Protected path cannot be modified: ${absolutePath}`;
        await debugLog(`[ERROR] safeTruncate: ${error}\n`);
        throw new Error(error);
    }

    try {
        if (!(await exists(absolutePath))) {
            const errorMsg = `File does not exist: ${absolutePath}`;
            await debugLog(`[ERROR] safeTruncate: ${errorMsg}\n`);
            throw new Error(errorMsg);
        }

        await fs.truncate(absolutePath, length);
    } catch (error) {
        const errorMsg = `Failed to truncate file ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeTruncate: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 안전한 디렉토리 삭제
 * @param {string} dirPath - 삭제할 디렉토리 경로
 * @param {Object} options - 추가 옵션
 * @param {boolean} options.recursive - 재귀적으로 삭제 여부
 * @returns {Promise<void>}
 */
export async function safeRmdir(dirPath, options = {}) {
    const absolutePath = toAbsolutePath(dirPath);

    if (!validatePath(absolutePath)) {
        const error = `Invalid directory path: ${dirPath}`;
        await debugLog(`[ERROR] safeRmdir: ${error}\n`);
        throw new Error(error);
    }

    if (isProtectedPath(absolutePath)) {
        const error = `Protected path cannot be deleted: ${absolutePath}`;
        await debugLog(`[ERROR] safeRmdir: ${error}\n`);
        throw new Error(error);
    }

    try {
        if (!(await exists(absolutePath))) {
            return; // 디렉토리가 없으면 조용히 반환
        }

        await fs.rmdir(absolutePath, options);
    } catch (error) {
        const errorMsg = `Failed to delete directory ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeRmdir: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 안전한 재귀적 삭제 (파일 또는 디렉토리)
 * @param {string} targetPath - 삭제할 경로
 * @param {Object} options - 추가 옵션
 * @returns {Promise<void>}
 */
export async function safeRm(targetPath, options = {}) {
    const absolutePath = toAbsolutePath(targetPath);

    if (!validatePath(absolutePath)) {
        const error = `Invalid path: ${targetPath}`;
        await debugLog(`[ERROR] safeRm: ${error}\n`);
        throw new Error(error);
    }

    if (isProtectedPath(absolutePath)) {
        const error = `Protected path cannot be deleted: ${absolutePath}`;
        await debugLog(`[ERROR] safeRm: ${error}\n`);
        throw new Error(error);
    }

    try {
        if (!(await exists(absolutePath))) {
            return; // 경로가 없으면 조용히 반환
        }

        await fs.rm(absolutePath, { ...options, recursive: true, force: true });
    } catch (error) {
        const errorMsg = `Failed to remove ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeRm: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

// ============================================================
// 읽기 전용 작업 (Read-only operations)
// ============================================================

/**
 * 파일 읽기
 * @param {string} filePath - 읽을 파일 경로
 * @param {string} encoding - 인코딩 (기본값: 'utf8')
 * @returns {Promise<string|Buffer>}
 */
export async function safeReadFile(filePath, encoding = 'utf8') {
    const absolutePath = toAbsolutePath(filePath);

    try {
        return await fs.readFile(absolutePath, encoding);
    } catch (error) {
        const errorMsg = `Failed to read file ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeReadFile: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 파일 존재 여부 확인 (비동기)
 * @param {string} filePath - 확인할 파일 경로
 * @returns {Promise<boolean>}
 */
export async function safeExists(filePath) {
    const absolutePath = toAbsolutePath(filePath);
    return await exists(absolutePath);
}

/**
 * 디렉토리 읽기
 * @param {string} dirPath - 읽을 디렉토리 경로
 * @param {Object} options - 추가 옵션
 * @returns {Promise<string[]>}
 */
export async function safeReaddir(dirPath, options = {}) {
    const absolutePath = toAbsolutePath(dirPath);

    try {
        return await fs.readdir(absolutePath, options);
    } catch (error) {
        const errorMsg = `Failed to read directory ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeReaddir: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 파일/디렉토리 상태 정보 가져오기
 * @param {string} targetPath - 확인할 경로
 * @returns {Promise<import('fs').Stats>}
 */
export async function safeStat(targetPath) {
    const absolutePath = toAbsolutePath(targetPath);

    try {
        return await fs.stat(absolutePath);
    } catch (error) {
        const errorMsg = `Failed to stat ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeStat: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 파일/디렉토리 상태 정보 가져오기 (심볼릭 링크를 따라가지 않음)
 * @param {string} targetPath - 확인할 경로
 * @returns {Promise<import('fs').Stats>}
 */
export async function safeLstat(targetPath) {
    const absolutePath = toAbsolutePath(targetPath);

    try {
        return await fs.lstat(absolutePath);
    } catch (error) {
        const errorMsg = `Failed to lstat ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeLstat: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 파일 접근 권한 확인
 * @param {string} filePath - 확인할 파일 경로
 * @param {number} mode - 접근 모드 (fs.constants.F_OK, R_OK, W_OK, X_OK)
 * @returns {Promise<void>}
 */
export async function safeAccess(filePath, mode) {
    const absolutePath = toAbsolutePath(filePath);

    try {
        return await fs.access(absolutePath, mode);
    } catch (error) {
        const errorMsg = `Failed to access ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeAccess: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 디렉토리 생성
 * @param {string} dirPath - 생성할 디렉토리 경로
 * @param {Object} options - 추가 옵션
 * @param {boolean} options.recursive - 재귀적으로 생성 여부
 * @returns {Promise<string|undefined>}
 */
export async function safeMkdir(dirPath, options = {}) {
    const absolutePath = toAbsolutePath(dirPath);

    if (!validatePath(absolutePath)) {
        const error = `Invalid directory path: ${dirPath}`;
        await debugLog(`[ERROR] safeMkdir: ${error}\n`);
        throw new Error(error);
    }

    if (isProtectedPath(absolutePath)) {
        const error = `Protected path cannot be modified: ${absolutePath}`;
        await debugLog(`[ERROR] safeMkdir: ${error}\n`);
        throw new Error(error);
    }

    try {
        return await fs.mkdir(absolutePath, options);
    } catch (error) {
        // recursive: true 일 때 이미 존재하는 디렉토리는 에러가 아님
        if (error.code === 'EEXIST' && options.recursive) {
            return;
        }
        const errorMsg = `Failed to create directory ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeMkdir: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 실제 경로 찾기 (심볼릭 링크 해석)
 * @param {string} targetPath - 확인할 경로
 * @returns {Promise<string>}
 */
export async function safeRealpath(targetPath) {
    const absolutePath = toAbsolutePath(targetPath);

    try {
        return await fs.realpath(absolutePath);
    } catch (error) {
        const errorMsg = `Failed to resolve realpath ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeRealpath: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 파일 복사
 * @param {string} src - 원본 파일 경로
 * @param {string} dest - 대상 파일 경로
 * @param {number} mode - 복사 모드
 * @returns {Promise<void>}
 */
export async function safeCopyFile(src, dest, mode) {
    const absoluteSrc = toAbsolutePath(src);
    const absoluteDest = toAbsolutePath(dest);

    if (!validatePath(absoluteSrc) || !validatePath(absoluteDest)) {
        const error = `Invalid path: ${src} -> ${dest}`;
        await debugLog(`[ERROR] safeCopyFile: ${error}\n`);
        throw new Error(error);
    }

    if (isProtectedPath(absoluteDest)) {
        const error = `Protected path cannot be modified: ${absoluteDest}`;
        await debugLog(`[ERROR] safeCopyFile: ${error}\n`);
        throw new Error(error);
    }

    try {
        return await fs.copyFile(absoluteSrc, absoluteDest, mode);
    } catch (error) {
        const errorMsg = `Failed to copy file ${absoluteSrc} -> ${absoluteDest}: ${error.message}`;
        await debugLog(`[ERROR] safeCopyFile: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

/**
 * 파일에 내용 추가
 * @param {string} filePath - 파일 경로
 * @param {string|Buffer} data - 추가할 데이터
 * @param {string} encoding - 인코딩 (기본값: 'utf8')
 * @returns {Promise<void>}
 */
export async function safeAppendFile(filePath, data, encoding = 'utf8') {
    const absolutePath = toAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
        const error = `Invalid file path: ${filePath}`;
        await debugLog(`[ERROR] safeAppendFile: ${error}\n`);
        throw new Error(error);
    }

    if (isProtectedPath(absolutePath)) {
        const error = `Protected path cannot be modified: ${absolutePath}`;
        await debugLog(`[ERROR] safeAppendFile: ${error}\n`);
        throw new Error(error);
    }

    try {
        return await fs.appendFile(absolutePath, data, encoding);
    } catch (error) {
        const errorMsg = `Failed to append to file ${absolutePath}: ${error.message}`;
        await debugLog(`[ERROR] safeAppendFile: ${errorMsg}\n`);
        throw new Error(errorMsg);
    }
}

// ============================================================
// 동기 작업 (Synchronous operations)
// ============================================================

import { mkdirSync, appendFileSync } from 'fs';

/**
 * 디렉토리 생성 (동기)
 * @param {string} dirPath - 생성할 디렉토리 경로
 * @param {Object} options - 추가 옵션
 * @param {boolean} options.recursive - 재귀적으로 생성 여부
 * @returns {string|undefined}
 */
export function safeMkdirSync(dirPath, options = {}) {
    const absolutePath = toAbsolutePath(dirPath);

    if (!validatePath(absolutePath)) {
        throw new Error(`Invalid directory path: ${dirPath}`);
    }

    if (isProtectedPath(absolutePath)) {
        throw new Error(`Protected path cannot be modified: ${absolutePath}`);
    }

    try {
        return mkdirSync(absolutePath, options);
    } catch (error) {
        // recursive: true 일 때 이미 존재하는 디렉토리는 에러가 아님
        if (error.code === 'EEXIST' && options.recursive) {
            return;
        }
        throw new Error(`Failed to create directory ${absolutePath}: ${error.message}`);
    }
}

/**
 * 파일에 내용 추가 (동기)
 * @param {string} filePath - 파일 경로
 * @param {string|Buffer} data - 추가할 데이터
 * @param {string} encoding - 인코딩 (기본값: 'utf8')
 * @returns {void}
 */
export function safeAppendFileSync(filePath, data, encoding = 'utf8') {
    const absolutePath = toAbsolutePath(filePath);

    if (!validatePath(absolutePath)) {
        throw new Error(`Invalid file path: ${filePath}`);
    }

    if (isProtectedPath(absolutePath)) {
        throw new Error(`Protected path cannot be modified: ${absolutePath}`);
    }

    try {
        return appendFileSync(absolutePath, data, encoding);
    } catch (error) {
        throw new Error(`Failed to append to file ${absolutePath}: ${error.message}`);
    }
}
