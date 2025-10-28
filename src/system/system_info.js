import { exec } from "child_process";
import { promisify } from "util";
import { platform } from "os";

const execAsync = promisify(exec);

/**
 * 현재 운영체제 타입을 반환합니다.
 * @returns {string} 'macos' | 'linux' | 'windows' | 'unknown'
 */
function getOSType() {
    const platformType = platform();

    switch (platformType) {
        case 'darwin':
            return 'macos';
        case 'linux':
            return 'linux';
        case 'win32':
            return 'windows';
        default:
            return 'unknown';
    }
}

/**
 * 특정 명령어의 실행 파일 경로를 찾습니다.
 * @param {string} command - 찾을 명령어 이름
 * @returns {Promise<string|null>} 명령어의 절대 경로, 찾지 못한 경우 null
 */
async function getCommandPath(command) {
    try {
        const osType = getOSType();
        const whichCommand = osType === 'windows' ? 'where' : 'which';

        const { stdout } = await execAsync(`${whichCommand} ${command}`, {
            encoding: 'utf8'
        });

        const result = stdout.trim();

        // Windows의 경우 여러 경로가 반환될 수 있으므로 첫 번째 경로만 사용
        const firstPath = result.split('\n')[0].trim();
        return firstPath || null;
    } catch (error) {
        return null;
    }
}

/**
 * ripgrep(rg) 실행 파일 경로를 반환합니다.
 * @returns {Promise<string|null>} rg의 절대 경로, 찾지 못한 경우 null
 */
export async function getRipgrepPath() {
    return await getCommandPath('rg');
}

/**
 * Python 실행 파일 경로를 반환합니다.
 * python3를 우선으로, 없으면 python을 찾습니다.
 * @returns {Promise<string|null>} Python의 절대 경로, 찾지 못한 경우 null
 */
export async function getPythonPath() {
    // python3 우선 시도
    let pythonPath = await getCommandPath('python3');

    // python3가 없으면 python 시도
    if (!pythonPath) {
        pythonPath = await getCommandPath('python');
    }

    return pythonPath;
}

/**
 * Node.js 실행 파일 경로를 반환합니다.
 * @returns {Promise<string|null>} Node.js의 절대 경로, 찾지 못한 경우 null
 */
export async function getNodePath() {
    return await getCommandPath('node');
}

/**
 * bash 실행 파일 경로를 반환합니다.
 * @returns {Promise<string|null>} bash의 절대 경로, 찾지 못한 경우 null
 */
export async function getBashPath() {
    return await getCommandPath('bash');
}

/**
 * 특정 명령어가 시스템에 설치되어 있는지 확인합니다.
 * @param {string} command - 확인할 명령어 이름
 * @returns {Promise<boolean>} 명령어가 존재하면 true
 */
export async function hasCommand(command) {
    const path = await getCommandPath(command);
    return path !== null;
}

/**
 * 시스템의 전체 정보를 수집하여 반환합니다.
 * @param {Object} options - 옵션
 * @param {boolean} options.skipPython - Python 체크를 생략할지 여부
 * @returns {Promise<Object>} 시스템 정보 객체
 */
export async function getSystemInfo(options = {}) {
    const { skipPython = false } = options;
    const osType = getOSType();

    // Python 체크를 조건부로 실행
    const pathPromises = [
        getRipgrepPath(),
        skipPython ? Promise.resolve(null) : getPythonPath(),
        getNodePath(),
        getBashPath()
    ];

    const [ripgrepPath, pythonPath, nodePath, bashPath] = await Promise.all(pathPromises);

    const commandPromises = [
        hasCommand('rg'),
        skipPython ? Promise.resolve(false) : hasCommand('python3').then(async (result) => result || await hasCommand('python')),
        hasCommand('node'),
        hasCommand('bash')
    ];

    const [hasRipgrep, hasPython, hasNode, hasBash] = await Promise.all(commandPromises);

    return {
        os: osType,
        paths: {
            ripgrep: ripgrepPath,
            python: pythonPath,
            node: nodePath,
            bash: bashPath
        },
        commands: {
            hasRipgrep,
            hasPython,
            hasNode,
            hasBash
        }
    };
}

/**
 * 시스템 정보를 사람이 읽기 쉬운 문자열로 포맷팅합니다.
 * @param {Object} options - 옵션
 * @param {boolean} options.skipPython - Python 체크를 생략할지 여부
 * @returns {Promise<string>} 포맷팅된 시스템 정보
 */
export async function getSystemInfoString(options = {}) {
    const info = await getSystemInfo(options);

    const lines = [
        `Operating System: ${info.os}`,
        '',
        'Command Paths:',
        `  ripgrep (rg): ${info.paths.ripgrep || 'not found'}`,
        `  python: ${info.paths.python || 'not found'}`,
        `  node: ${info.paths.node || 'not found'}`,
        `  bash: ${info.paths.bash || 'not found'}`
    ];

    return lines.join('\n');
}

/**
 * 필수 의존성을 체크하고 문제가 있으면 설치 방법을 안내합니다.
 * @param {Object} options - 옵션
 * @param {boolean} options.skipPython - Python 체크를 생략할지 여부
 * @returns {Promise<Object>} { success: boolean, issues: Array, os: string }
 */
export async function checkDependencies(options = {}) {
    const { skipPython = false } = options;
    const info = await getSystemInfo({ skipPython });
    const issues = [];

    // Windows 체크
    if (info.os === 'windows') {
        return {
            success: false,
            os: 'windows',
            issues: [{
                type: 'unsupported_os',
                message: 'Windows is not supported',
                details: 'This application only supports macOS and Linux operating systems.'
            }],
            warnings: []
        };
    }

    // ripgrep 체크 (필수)
    if (!info.commands.hasRipgrep) {
        const installInstructions = info.os === 'macos'
            ? 'brew install ripgrep'
            : info.os === 'linux'
                ? 'apt install ripgrep  # or  brew install ripgrep  # or  cargo install ripgrep'
                : 'Visit https://github.com/BurntSushi/ripgrep#installation';

        issues.push({
            type: 'missing_command',
            command: 'ripgrep (rg)',
            message: 'ripgrep is not installed',
            install: installInstructions
        });
    }

    // node 체크 (필수)
    if (!info.commands.hasNode) {
        const installInstructions = info.os === 'macos'
            ? 'brew install node'
            : info.os === 'linux'
                ? 'Visit https://nodejs.org/ or use nvm: https://github.com/nvm-sh/nvm'
                : 'Visit https://nodejs.org/';

        issues.push({
            type: 'missing_command',
            command: 'node',
            message: 'Node.js is not installed',
            install: installInstructions
        });
    }

    // bash or sh 체크 (필수)
    if (!info.commands.hasBash) {
        const shellPath = await getCommandPath('sh');
        if (!shellPath) {
            const installInstructions = info.os === 'macos'
                ? 'bash is built-in on macOS. Please check your system.'
                : info.os === 'linux'
                    ? 'apt install bash  # or check your package manager'
                    : 'bash or sh shell is required';

            issues.push({
                type: 'missing_command',
                command: 'bash or sh',
                message: 'No compatible shell found',
                install: installInstructions
            });
        }
    }

    // python 체크 (선택사항 - 경고만 표시, skipPython이 true면 생략)
    const warnings = [];
    if (!skipPython && !info.commands.hasPython) {
        const installInstructions = info.os === 'macos'
            ? 'brew install python3'
            : info.os === 'linux'
                ? 'apt install python3  # or  yum install python3'
                : 'Visit https://www.python.org/downloads/';

        warnings.push({
            type: 'optional_command',
            command: 'python or python3',
            message: 'Python is not installed',
            install: installInstructions,
            impact: 'The following tools will be disabled: fetch_web_page, run_python_code'
        });
    }

    return {
        success: issues.length === 0,
        os: info.os,
        issues,
        warnings
    };
}
