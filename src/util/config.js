// 설정 파일 및 환경 관리 유틸리티
import { homedir } from 'os';
import { join, dirname } from 'path';
import { safeReadFile, safeWriteFile, safeMkdir, safeReaddir, safeStat, safeCopyFile } from './safe_fs.js';
import { fileURLToPath } from 'url';
import { DEFAULT_OPENAI_MODEL } from '../config/openai_models.js';

// Get project root directory (this file is in src/util/, so go up 2 levels)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

/**
 * 홈 디렉토리 경로를 반환
 * @returns {string} 홈 디렉토리 경로
 */
export function getHomeDirectory() {
    const envHome = process.env.HOME;
    const envUserProfile = process.env.USERPROFILE;

    if (envHome && envHome.trim()) {
        return envHome;
    }

    if (envUserProfile && envUserProfile.trim()) {
        return envUserProfile;
    }

    const resolved = homedir();
    if (resolved && resolved.trim()) {
        return resolved;
    }

    throw new Error('Unable to determine home directory for current environment.');
}

export const CONFIG_DIR = join(getHomeDirectory(), '.aiexe');
export const SETTINGS_FILE = join(CONFIG_DIR, 'settings.json');
export const MCP_CONFIG_FILE = join(CONFIG_DIR, 'mcp_config.json');
export const PAYLOAD_LOG_DIR = join(CONFIG_DIR, 'payload_log');
export const DEBUG_LOG_DIR = join(CONFIG_DIR, 'debuglog');
export const DEBUG_LOG_FILE = join(CONFIG_DIR, 'debug.txt'); // Deprecated: 호환성을 위해 유지
const DEFAULT_SETTINGS = {
    OPENAI_API_KEY: '',
    OPENAI_MODEL: DEFAULT_OPENAI_MODEL,
    OPENAI_REASONING_EFFORT: 'medium', // 'minimal', 'low', 'medium', 'high'
    // 도구 활성화 옵션
    TOOLS_ENABLED: {
        edit_file_range: false,  // 기본적으로 비활성화 (edit_file_replace 사용 권장)
        edit_file_replace: true,
        write_file: true,
        read_file: true,
        read_file_range: true,
        bash: true,
        run_python_code: false,  // 기본적으로 비활성화
        fetch_web_page: true,
        response_message: true,
        ripgrep: true,
        glob_search: true
    }
};

/**
 * 설정 디렉토리를 생성하고 템플릿 파일을 복사
 * @returns {Promise<void>}
 */
export async function ensureConfigDirectory() {
    try {
        const created = await safeMkdir(CONFIG_DIR, { recursive: true });
        if (!created) return;

        const templateDir = process.app_custom?.__dirname ? join(process.app_custom.__dirname, 'config_template') : null;
        if (!templateDir) return;

        const templateFiles = await safeReaddir(templateDir);
        await Promise.all(
            templateFiles.map(async (fileName) => {
                const sourcePath = join(templateDir, fileName);
                const stat = await safeStat(sourcePath);
                if (stat.isFile()) {
                    const destPath = join(CONFIG_DIR, fileName);
                    await safeCopyFile(sourcePath, destPath);
                }
            })
        );
    } catch (error) {
        // Failed to ensure config directory - silently ignore
        throw error;
    }
}

/**
 * 설정 파일을 로드하거나 생성
 * @returns {Promise<Object>} 설정 객체
 */
export async function loadSettings() {
    await ensureConfigDirectory();
    try {
        const data = await safeReadFile(SETTINGS_FILE, 'utf8');
        const parsed = JSON.parse(data);
        return {
            ...DEFAULT_SETTINGS,
            ...(parsed && typeof parsed === 'object' ? parsed : {})
        };
    } catch (error) {
        if (error.message && error.message.includes('Failed to read file')) {
            await safeWriteFile(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
            return { ...DEFAULT_SETTINGS };
        }
        // Failed to load settings - silently ignore
        return { ...DEFAULT_SETTINGS };
    }
}

/**
 * 설정 파일을 저장
 * @param {Object} settings - 저장할 설정 객체
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
    await ensureConfigDirectory();
    try {
        await safeWriteFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    } catch (error) {
        // Failed to save settings - silently ignore
        throw error;
    }
}
