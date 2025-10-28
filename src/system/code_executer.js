import { spawn } from 'child_process';
import { safeAccess, safeMkdir, safeWriteFile, safeUnlink } from '../util/safe_fs.js';
import { join, isAbsolute, normalize } from 'path';
import { homedir } from 'os';
import dotenv from "dotenv";
import { installRequiredPackages } from '../ai_based/pip_package_installer.js';
import { write_file } from '../tools/code_editor.js';
import { CONFIG_DIR, ensureConfigDirectory } from '../util/config.js';
import { createDebugLogger } from '../util/debug_log.js';

const debugLog = createDebugLogger('code_executer.log', 'code_executer');

// 이 파일은 파이썬과 쉘 코드를 실행하고 필요한 패키지를 설치하는 역할을 담당합니다.
// Orchestrator가 run_python_code와 bash 도구로 생산한 스크립트를 실제 환경에서 실행할 때 이 모듈을 직접 호출합니다.

dotenv.config({ quiet: true });

// 사용 가능한 파이썬 실행 파일 경로를 찾아 반환합니다.
export async function getPythonPath() {
    return await whichCommand("python3") || await whichCommand("python");
}

// 터미널에서 특정 명령어의 실제 경로를 찾습니다.
export async function whichCommand(command) {
    return new Promise((resolve) => {
        let commandPath = '';
        const which = spawn('which', [command]);

        which.stdout.on('data', (data) => {
            commandPath = data.toString().trim();
        });

        // stderr는 무시 (명령어가 없을 경우 stderr에 출력되지만 에러가 아님)
        which.stderr.on('data', () => {});

        which.on('close', (code) => {
            if (code === 0 && commandPath) {
                resolve(commandPath);
            } else {
                resolve(null);
            }
        });

        which.on('error', () => {
            resolve(null);
        });
    });
}


// 프로젝트 전용 파이썬 가상환경을 만들어 경로를 돌려줍니다.
export async function makePythonVirtualEnv(virtualEnvPath) {
    const pythonPath = await getPythonPath();
    if (!pythonPath) {
        return null;
    }

    if (!process.env.PYTHON_VENV_PATH) {
        await ensureConfigDirectory();
    }

    const basePath = process.env.PYTHON_VENV_PATH
        ? process.env.PYTHON_VENV_PATH
        : join(CONFIG_DIR, 'venv');

    const venvPath = isAbsolute(basePath)
        ? basePath
        : join(process.cwd(), basePath);

    const normalizedVenvPath = normalize(venvPath);
    try {
        await safeAccess(normalizedVenvPath);
        return normalizedVenvPath;
    } catch {
        // Path does not exist
    }

    return new Promise((resolve, reject) => {
        const python = spawn(pythonPath, ['-m', 'venv', normalizedVenvPath]);
        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        python.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        python.on('close', (code) => {
            if (code === 0) {
                resolve(normalizedVenvPath);
            } else {
                reject(new Error(`Failed to create virtualenv: ${stderr}`));
            }
        });

        python.on('error', (err) => {
            reject(err);
        });
    });
}

function getTempDirPath() {
    return join(homedir(), '.aiexe', '.runables');
}

/**
 * 공통 프로세스 실행 핸들러 (timeout과 stdin 차단 포함)
 */
function createProcessHandler(childProcess, tempFile, timeoutMs = 1200000) {
    debugLog(`[createProcessHandler] Started for ${tempFile}, pid: ${childProcess.pid}`);

    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let isTimedOut = false;

        // 타임아웃 설정
        const timeout = setTimeout(() => {
            isTimedOut = true;
            debugLog(`[createProcessHandler] Timeout after ${timeoutMs}ms`);
            debugLog(`\n⏰ Process timed out after ${timeoutMs}ms, terminating...`);

            try {
                // 프로세스 그룹 전체 종료 (음수 pid로)
                process.kill(-childProcess.pid, 'SIGTERM');

                // 5초 후에도 종료되지 않으면 강제 종료
                setTimeout(() => {
                    try {
                        process.kill(-childProcess.pid, 'SIGKILL');
                    } catch (killErr) {
                        // 이미 종료된 경우 무시
                    }
                }, 5000);
            } catch (killErr) {
                // 프로세스가 이미 종료된 경우
                childProcess.kill('SIGTERM');
                setTimeout(() => childProcess.kill('SIGKILL'), 5000);
            }
        }, timeoutMs);

        childProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            debugLog(`[createProcessHandler] stdout received: ${output.length} bytes`);
            // Don't write to stdout directly - it interferes with Ink rendering
            // The output will be displayed through UI events
        });

        childProcess.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            debugLog(`[createProcessHandler] stderr received: ${output.length} bytes, content: ${output.substring(0, 100)}`);
            // Don't write to stderr directly - it interferes with Ink rendering
            // The output will be displayed through UI events
        });

        childProcess.on('close', async (code) => {
            clearTimeout(timeout);
            debugLog(`[createProcessHandler] Process closed with code ${code}, stdout: ${stdout.length} bytes, stderr: ${stderr.length} bytes`);

            try {
                if (tempFile) await safeUnlink(tempFile);
            } catch (err) {
                debugLog('Failed to delete temp file:', err.message);
            }

            if (isTimedOut) {
                const result = {
                    stdout: stdout.trim(),
                    stderr: (stderr + '\n[TIMEOUT] Process execution terminated due to timeout').trim(),
                    code: 1, // 타임아웃 시 exit code 1
                    timeout: true
                };
                debugLog(`[createProcessHandler] Resolving with timeout result, stderr length: ${result.stderr.length}`);
                resolve(result);
            } else {
                const result = {
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    code: code,
                    timeout: false
                };
                debugLog(`[createProcessHandler] Resolving with normal result, stderr: "${result.stderr}"`);
                resolve(result);
            }
        });

        childProcess.on('error', async (err) => {
            clearTimeout(timeout);
            debugLog(`[createProcessHandler] Process error: ${err.message}`);

            try {
                if (tempFile) await safeUnlink(tempFile);
            } catch (unlinkErr) {
                debugLog('Failed to delete temp file:', unlinkErr.message);
            }

            if (isTimedOut) {
                resolve({
                    stdout: stdout.trim(),
                    stderr: `[TIMEOUT] ${err.message}`,
                    code: 1, // 타임아웃 시 exit code 1
                    timeout: true
                });
            } else {
                reject(err);
            }
        });
    });
}


// 파이썬 코드를 임시 파일에 저장하고 가상환경에서 실행합니다.
// 실행 결과는 Verifier와 RAG 저장소가 참고할 수 있도록 index.js에서 그대로 전달됩니다.
export async function execPythonCode(python_code, args = [], timeoutMs = 1200000) {
    debugLog('========================================');
    debugLog('====== execPythonCode START ============');
    debugLog('========================================');
    debugLog(`[execPythonCode] Code length: ${python_code.length} characters`);
    debugLog(`[execPythonCode] Code preview (first 200 chars): ${python_code.substring(0, 200)}${python_code.length > 200 ? '...' : ''}`);
    debugLog(`[execPythonCode] Args: ${JSON.stringify(args)}`);
    debugLog(`[execPythonCode] Timeout: ${timeoutMs}ms`);

    debugLog(`[execPythonCode] Creating/checking virtual environment...`);
    const venvPath = await makePythonVirtualEnv(process.env.PYTHON_VENV_PATH || "venv");

    // Python이 설치되지 않은 경우 처리
    if (!venvPath) {
        debugLog(`[execPythonCode] ERROR: Python not installed`);
        debugLog('========================================');
        debugLog('====== execPythonCode END (NO PYTHON) ==');
        debugLog('========================================');
        return {
            stdout: '',
            stderr: 'Python is not installed. Please install Python 3 to use this feature.',
            code: 1,
            timeout: false
        };
    }

    const pythonPath = join(venvPath, 'bin', 'python');
    debugLog(`[execPythonCode] Virtual environment path: ${venvPath}`);
    debugLog(`[execPythonCode] Python executable path: ${pythonPath}`);

    debugLog(`[execPythonCode] Ensuring temp directory exists...`);
    try {
        await safeAccess(getTempDirPath());
        debugLog(`[execPythonCode] Temp directory exists: ${getTempDirPath()}`);
    } catch {
        debugLog(`[execPythonCode] Creating temp directory: ${getTempDirPath()}`);
        await safeMkdir(getTempDirPath(), { recursive: true });
    }

    const tempFile = join(getTempDirPath(), `temp_${Date.now()}.py`);
    debugLog(`[execPythonCode] Writing code to temp file: ${tempFile}`);
    await safeWriteFile(tempFile, python_code, 'utf8');
    debugLog(`[execPythonCode] Code written successfully`);

    debugLog(`[execPythonCode] Installing required packages...`);
    await installRequiredPackages(tempFile);
    debugLog(`[execPythonCode] Package installation complete`);

    try {
        debugLog(`[execPythonCode] Spawning Python process...`);
        debugLog(`[execPythonCode] Command: ${pythonPath} -u ${tempFile} ${args.join(' ')}`);

        const python = spawn(pythonPath, ['-u', tempFile, ...args], {
            stdio: ['ignore', 'pipe', 'pipe'], // stdin을 ignore하여 입력 프롬프트 방지
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1',
                DEBIAN_FRONTEND: 'noninteractive', // 비대화형 모드
                CI: 'true', // CI 환경으로 인식시켜 프롬프트 방지
                BATCH: '1' // 배치 모드
            },
            detached: true // 프로세스 그룹 생성으로 자식 프로세스까지 제어
        });

        debugLog(`[execPythonCode] Process spawned - PID: ${python.pid}`);
        debugLog(`[execPythonCode] Waiting for process to complete...`);

        const result = await createProcessHandler(python, tempFile, timeoutMs);

        debugLog(`[execPythonCode] Execution complete`);
        debugLog(`[execPythonCode] Exit code: ${result.code}`);
        debugLog(`[execPythonCode] Stdout length: ${result.stdout.length} bytes`);
        debugLog(`[execPythonCode] Stderr length: ${result.stderr.length} bytes`);
        debugLog(`[execPythonCode] Timed out: ${result.timeout}`);
        if (result.stdout) {
            debugLog(`[execPythonCode] Stdout preview: ${result.stdout.substring(0, 500)}${result.stdout.length > 500 ? '...' : ''}`);
        }
        if (result.stderr) {
            debugLog(`[execPythonCode] Stderr content: ${result.stderr}`);
        }

        debugLog('========================================');
        debugLog('====== execPythonCode END ==============');
        debugLog('========================================');
        return result;

    } catch (err) {
        debugLog(`[execPythonCode] EXCEPTION: ${err.message}`);
        debugLog(`[execPythonCode] Exception stack: ${err.stack}`);
        try {
            await safeUnlink(tempFile);
            debugLog(`[execPythonCode] Cleaned up temp file after error`);
        } catch (unlinkErr) {
            debugLog(`[execPythonCode] Failed to delete temp file: ${unlinkErr.message}`);
        }

        debugLog('========================================');
        debugLog('====== execPythonCode END (ERROR) ======');
        debugLog('========================================');
        throw err;
    }
}

// 쉘 스크립트를 임시 파일로 만들어 안전하게 실행합니다.
// 파이썬 실행과 동일하게 Orchestrator의 지시에 따라 반복적으로 호출됩니다.
export async function execShellScript(script, timeoutMs = 1200000) {
    debugLog('========================================');
    debugLog('====== execShellScript START ===========');
    debugLog('========================================');
    debugLog(`[execShellScript] Script length: ${script.length} characters`);
    debugLog(`[execShellScript] Script preview (first 200 chars): ${script.substring(0, 200)}${script.length > 200 ? '...' : ''}`);
    debugLog(`[execShellScript] Timeout: ${timeoutMs}ms`);

    debugLog(`[execShellScript] Finding shell executable...`);
    let shellPath = await whichCommand("bash") || await whichCommand("sh");
    if (!shellPath) {
        debugLog(`[execShellScript] ERROR: No shell found (bash/sh)`);
        debugLog('========================================');
        debugLog('====== execShellScript END (NO SHELL) ==');
        debugLog('========================================');
        return null;
    }
    debugLog(`[execShellScript] Using shell: ${shellPath}`);

    const tempFile = join(getTempDirPath(), `temp_${Date.now()}.sh`);
    debugLog(`[execShellScript] Temp file path: ${tempFile}`);

    try {
        // 기존 임시 파일이 있다면 삭제
        try {
            await safeAccess(tempFile);
            debugLog(`[execShellScript] Temp file already exists, deleting...`);
            await safeUnlink(tempFile);
        } catch (err) {
            debugLog(`[execShellScript] Temp file does not exist (normal)`);
            // 파일이 없으면 무시
        }

        debugLog(`[execShellScript] Writing script to temp file...`);
        const result = await write_file({ file_path: tempFile, content: script });
        if (!result.operation_successful) {
            debugLog(`[execShellScript] ERROR: Failed to create temp file - ${result.error}`);
            throw new Error(`Failed to create temp file: ${result.error}`);
        }
        debugLog(`[execShellScript] Script written successfully`);
    } catch (err) {
        debugLog(`[execShellScript] EXCEPTION during file write: ${err.message}`);
        debugLog('========================================');
        debugLog('====== execShellScript END (WRITE ERR) =');
        debugLog('========================================');
        throw err;
    }

    try {
        debugLog(`[execShellScript] Spawning shell process...`);
        debugLog(`[execShellScript] Command: ${shellPath} ${tempFile}`);

        const shell = spawn(shellPath, [tempFile], {
            stdio: ['ignore', 'pipe', 'pipe'], // stdin을 ignore하여 입력 프롬프트 방지
            env: {
                ...process.env,
                DEBIAN_FRONTEND: 'noninteractive', // 비대화형 모드
                CI: 'true', // CI 환경으로 인식시켜 프롬프트 방지
                BATCH: '1' // 배치 모드
            },
            detached: true // 프로세스 그룹 생성으로 자식 프로세스까지 제어
        });

        debugLog(`[execShellScript] Process spawned - PID: ${shell.pid}`);
        debugLog(`[execShellScript] Waiting for process to complete...`);

        const result = await createProcessHandler(shell, tempFile, timeoutMs);

        debugLog(`[execShellScript] Execution complete`);
        debugLog(`[execShellScript] Exit code: ${result.code}`);
        debugLog(`[execShellScript] Stdout length: ${result.stdout.length} bytes`);
        debugLog(`[execShellScript] Stderr length: ${result.stderr.length} bytes`);
        debugLog(`[execShellScript] Timed out: ${result.timeout}`);
        if (result.stdout) {
            debugLog(`[execShellScript] Stdout preview: ${result.stdout.substring(0, 500)}${result.stdout.length > 500 ? '...' : ''}`);
        }
        if (result.stderr) {
            debugLog(`[execShellScript] Stderr content: ${result.stderr}`);
        }

        debugLog('========================================');
        debugLog('====== execShellScript END =============');
        debugLog('========================================');
        return result;

    } catch (err) {
        debugLog(`[execShellScript] EXCEPTION: ${err.message}`);
        debugLog(`[execShellScript] Exception stack: ${err.stack}`);
        try {
            await safeUnlink(tempFile);
            debugLog(`[execShellScript] Cleaned up temp file after error`);
        } catch (unlinkErr) {
            debugLog(`[execShellScript] Failed to delete temp file: ${unlinkErr.message}`);
        }

        debugLog('========================================');
        debugLog('====== execShellScript END (ERROR) =====');
        debugLog('========================================');
        throw err;
    }
}

// 가상환경에 파이썬 패키지가 설치되어 있는지 확인하고 없으면 설치합니다.
// 설치된 패키지는 이후 동일 미션의 다른 단계에서도 재사용되므로, 실행 흐름 전체의 안정성을 높입니다.
export async function installPythonPackage(packageName) {
    if (await isPackageInstalled(packageName)) return true;
    const venvPath = await makePythonVirtualEnv(process.env.PYTHON_VENV_PATH || "venv");
    const pipPath = join(venvPath, 'bin', 'pip');

    return new Promise((resolve, reject) => {
        const pip = spawn(pipPath, ['install', packageName], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        let stdout = '';
        let stderr = '';

        pip.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            // Don't write to stdout directly - it interferes with Ink rendering
        });

        pip.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            // Don't write to stderr directly - it interferes with Ink rendering
        });

        pip.on('close', (code) => {
            resolve(code === 0);
        });

        pip.on('error', (err) => {
            resolve(false);
        });
    });
}

// 특정 패키지가 이미 설치되어 있는지 빠르게 확인합니다.
// installRequiredPackages에서 호출되며, 불필요한 설치 시도를 줄여 실행 시간을 단축합니다.
export async function isPackageInstalled(packageName) {
    const venvPath = await makePythonVirtualEnv(process.env.PYTHON_VENV_PATH || "venv");
    const pipPath = join(venvPath, 'bin', 'pip');

    return new Promise((resolve) => {
        const pip = spawn(pipPath, ['show', packageName], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        pip.on('close', (code) => {
            resolve(code === 0);
        });

        pip.on('error', () => {
            resolve(false);
        });
    });
}

// 파이썬 파일을 분석해 어떤 외부 패키지를 임포트하는지 파악합니다.
// 분석 결과는 pip_package_installer가 어떤 패키지를 준비해야 하는지 판단하는 기반 정보로 사용됩니다.
export async function analyzeImports(filePath) {
    const venvPath = await makePythonVirtualEnv(process.env.PYTHON_VENV_PATH || "venv");
    const pythonPath = join(venvPath, 'bin', 'python');
    const analyzerPath = join(process.app_custom?.__dirname || process.cwd(), 'src', 'system', 'import_analyzer.py');

    const result = await new Promise((resolve, reject) => {
        try {
            const python = spawn(pythonPath, [analyzerPath, filePath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, PYTHONUNBUFFERED: '1' }
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            python.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout.trim());
                        resolve({
                            success: true,
                            data: result,
                            stdout: stdout.trim(),
                            stderr: stderr.trim(),
                            code: code
                        });
                    } catch (parseError) {
                        resolve({
                            success: false,
                            error: 'Failed to parse JSON response',
                            stdout: stdout.trim(),
                            stderr: stderr.trim(),
                            code: code
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        error: 'Process exited with non-zero code',
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                        code: code
                    });
                }
            });

            python.on('error', (err) => {
                reject(err);
            });

        } catch (err) {
            reject(err);
        }
    });
    // consolelog(result);
    return result.data.external_packages;
}

export const runPythonCodeSchema = {
    name: "run_python_code",
    description: "Executes Python code in a virtual environment. Automatically installs required packages. Use this for data processing, calculations, API calls, or any Python-based tasks.",
    parameters: {
        type: "object",
        required: ["code"],
        properties: {
            code: {
                type: "string",
                description: "Python code to execute. Will be saved to a temporary file and run in venv."
            }
        },
        additionalProperties: false
    },
    strict: true,
    ui_display: {
        show_tool_call: true,
        show_tool_result: true,
        display_name: "Python"
    }
};

export const bashSchema = {
    name: "bash",
    description: "Executes bash shell commands. Use -y or -f flags to avoid user prompts. Chain commands with && for sequential execution. This tool handles ALL file system operations (create/delete/move/copy files and directories, check file existence, list directory contents), system operations, git commands, package management, and running CLI tools.",
    parameters: {
        type: "object",
        required: ["script"],
        properties: {
            script: {
                type: "string",
                description: "Bash script to execute. Will be saved to a temporary file and run with bash. Use standard bash commands like: mkdir, rm, mv, cp, ls, test, find, chmod, chown, etc."
            }
        },
        additionalProperties: false
    },
    strict: true,
    ui_display: {
        show_tool_call: true,
        show_tool_result: true,
        display_name: "Bash"
    }
};
