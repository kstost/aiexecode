// MCP 설정 관리 유틸리티 - Claude Code 스타일
import { safeReadFile, safeWriteFile, safeMkdir } from './safe_fs.js';
import { join } from 'path';
import { createHash } from 'crypto';
import { CONFIG_DIR } from './config.js';

/**
 * MCP 설정 파일 경로 반환 (전역 사용자 설정)
 * @returns {string} 설정 파일 경로
 */
export function getMcpConfigPath() {
    // 전역 사용자 설정: ~/.aiexe/mcp_config.json
    return join(CONFIG_DIR, 'mcp_config.json');
}

/**
 * 설정 로드 (전역 사용자 설정)
 * @returns {Promise<Object>} MCP 서버 설정
 */
export async function loadMergedMcpConfig() {
    try {
        const path = getMcpConfigPath();
        const data = await safeReadFile(path, 'utf8');
        const config = JSON.parse(data);

        // Loaded MCP config - silently
        return config.mcpServers || {};
    } catch (error) {
        // 파일이 없으면 빈 객체 반환
        if (error.message && error.message.includes('Failed to read file')) {
            return {};
        }
        // Failed to load MCP config - silently ignore
        return {};
    }
}

/**
 * 환경 변수 확장 (${VAR} 또는 ${VAR:-default} 지원)
 * @param {any} obj - 확장할 객체/문자열/배열
 * @returns {any} 환경 변수가 확장된 결과
 */
export function expandEnvVars(obj) {
    if (typeof obj === 'string') {
        return obj.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g, (match, varName, defaultValue) => {
            const envValue = process.env[varName];
            if (envValue !== undefined) return envValue;
            if (defaultValue !== undefined) return defaultValue;
            throw new Error(`Required environment variable ${varName} is not set`);
        });
    }

    if (Array.isArray(obj)) {
        return obj.map(expandEnvVars);
    }

    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = expandEnvVars(value);
        }
        return result;
    }

    return obj;
}

/**
 * 설정 저장
 * @param {Object} servers - MCP 서버 설정 객체
 * @returns {Promise<string>} 저장된 파일 경로
 */
export async function saveMcpConfig(servers) {
    const path = getMcpConfigPath();
    const dir = join(path, '..');

    await safeMkdir(dir, { recursive: true });

    const config = {
        mcpServers: servers
    };

    await safeWriteFile(path, JSON.stringify(config, null, 2), 'utf8');
    // Saved MCP config - silently
    return path;
}

/**
 * 서버 추가
 * @param {string} name - 서버 이름
 * @param {Object} serverConfig - 서버 설정
 * @returns {Promise<string>} 저장된 파일 경로
 */
export async function addServerToScope(name, serverConfig) {
    // 기존 설정 로드
    const existingServers = await loadMergedMcpConfig();

    // 서버 추가
    existingServers[name] = serverConfig;

    // 저장
    return await saveMcpConfig(existingServers);
}

/**
 * 서버 제거
 * @param {string} name - 서버 이름
 * @returns {Promise<Object>} 결과 객체 { success, message }
 */
export async function removeServerFromScope(name) {
    try {
        const servers = await loadMergedMcpConfig();

        if (!servers[name]) {
            return { success: false, message: `Server '${name}' not found` };
        }

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
 * 서버가 존재하는지 확인
 * @param {string} name - 서버 이름
 * @returns {Promise<boolean>} 서버 존재 여부
 */
export async function findServerScope(name) {
    const servers = await loadMergedMcpConfig();
    return servers[name] ? true : false;
}
