// MCP 설정 관리 유틸리티
// MCP 서버 설정의 저장, 로드, 수정을 담당
// 설정 파일 위치: ~/.aiexe/mcp_config.json
import { safeReadFile, safeWriteFile, safeMkdir } from './safe_fs.js';
import { join } from 'path';
import { createHash } from 'crypto';
import { CONFIG_DIR } from './config.js';

/**
 * MCP 설정 파일의 절대 경로 반환
 * 모든 MCP 서버 설정은 사용자 홈 디렉토리의 ~/.aiexe/mcp_config.json에 저장됨
 * @returns {string} 설정 파일 경로
 */
export function getMcpConfigPath() {
    // 전역 사용자 설정: ~/.aiexe/mcp_config.json
    return join(CONFIG_DIR, 'mcp_config.json');
}

/**
 * MCP 설정 파일에서 모든 서버 설정을 로드
 * 설정 파일이 없거나 읽기 실패 시 빈 객체 반환
 * @returns {Promise<Object>} MCP 서버 설정 객체 (서버이름 -> 설정)
 */
export async function loadMergedMcpConfig() {
    try {
        const path = getMcpConfigPath();
        const data = await safeReadFile(path, 'utf8');
        const config = JSON.parse(data);

        // mcpServers 필드에 서버 설정들이 저장되어 있음
        return config.mcpServers || {};
    } catch (error) {
        // 파일이 없으면 빈 객체 반환 (첫 실행 시 정상적인 상황)
        if (error.message && error.message.includes('Failed to read file')) {
            return {};
        }
        // 파일 읽기 실패 시에도 빈 객체 반환하여 프로그램이 계속 실행되도록 함
        return {};
    }
}

/**
 * 설정 객체 내의 환경 변수 참조를 실제 값으로 확장
 *
 * 지원 형식:
 *   ${VAR}           - 환경 변수 VAR의 값 (없으면 에러)
 *   ${VAR:-default}  - 환경 변수 VAR의 값 또는 기본값
 *
 * 예: { "token": "${GITHUB_TOKEN}" } -> { "token": "ghp_xxxx..." }
 *
 * @param {any} obj - 확장할 객체/문자열/배열
 * @returns {any} 환경 변수가 확장된 결과
 */
export function expandEnvVars(obj) {
    if (typeof obj === 'string') {
        // 정규식으로 ${VAR} 또는 ${VAR:-default} 패턴 찾아서 치환
        return obj.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g, (match, varName, defaultValue) => {
            const envValue = process.env[varName];
            if (envValue !== undefined) return envValue;
            if (defaultValue !== undefined) return defaultValue;
            throw new Error(`Required environment variable ${varName} is not set`);
        });
    }

    // 배열인 경우 각 원소에 대해 재귀적으로 확장
    if (Array.isArray(obj)) {
        return obj.map(expandEnvVars);
    }

    // 객체인 경우 모든 값에 대해 재귀적으로 확장
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = expandEnvVars(value);
        }
        return result;
    }

    // 기본 타입(숫자, 불린 등)은 그대로 반환
    return obj;
}

/**
 * MCP 서버 설정을 파일에 저장
 * 설정 디렉토리가 없으면 자동 생성
 * @param {Object} servers - MCP 서버 설정 객체 (서버이름 -> 설정)
 * @returns {Promise<string>} 저장된 파일 경로
 */
export async function saveMcpConfig(servers) {
    const path = getMcpConfigPath();
    const dir = join(path, '..');

    // 설정 디렉토리가 없으면 생성 (~/.aiexe)
    await safeMkdir(dir, { recursive: true });

    // JSON 형식으로 변환 (mcpServers 필드 안에 서버 설정들 저장)
    const config = {
        mcpServers: servers
    };

    // 파일에 저장 (들여쓰기 2칸으로 가독성 향상)
    await safeWriteFile(path, JSON.stringify(config, null, 2), 'utf8');
    return path;
}

/**
 * 새로운 MCP 서버를 설정에 추가
 * 기존 설정을 로드한 후 새 서버를 추가하고 저장
 * @param {string} name - 서버 이름 (고유 식별자)
 * @param {Object} serverConfig - 서버 설정 (type, command, url 등)
 * @returns {Promise<string>} 저장된 파일 경로
 */
export async function addServerToScope(name, serverConfig) {
    // 기존에 저장된 모든 서버 설정 로드
    const existingServers = await loadMergedMcpConfig();

    // 새 서버 추가 (같은 이름이 있으면 덮어씀)
    existingServers[name] = serverConfig;

    // 변경된 설정을 파일에 저장
    return await saveMcpConfig(existingServers);
}

/**
 * 설정에서 MCP 서버 제거
 * @param {string} name - 제거할 서버 이름
 * @returns {Promise<Object>} 결과 객체 { success: boolean, message: string }
 */
export async function removeServerFromScope(name) {
    try {
        const servers = await loadMergedMcpConfig();

        // 서버가 존재하지 않으면 실패 반환
        if (!servers[name]) {
            return { success: false, message: `Server '${name}' not found` };
        }

        // 서버 설정 삭제
        delete servers[name];
        await saveMcpConfig(servers);

        return { success: true, message: `Server '${name}' removed` };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { success: false, message: `No configuration file found` };
        }
        throw error;
    }
}

/**
 * 특정 이름의 MCP 서버가 설정에 존재하는지 확인
 * @param {string} name - 서버 이름
 * @returns {Promise<boolean>} 서버 존재 여부
 */
export async function findServerScope(name) {
    const servers = await loadMergedMcpConfig();
    return servers[name] ? true : false;
}
