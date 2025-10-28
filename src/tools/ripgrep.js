import { spawn } from 'child_process';
import { theme } from '../frontend/design/themeColors.js';

// 파일 내용 검색, 파일 경로 필터링, 다양한 출력 모드 등을 지원합니다.

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_COUNT = 500;

/**
 * ripgrep 인수를 구성합니다
 */
function buildRipgrepArgs({
    pattern,
    path = null,
    glob = null,
    type = null,
    caseInsensitive = false,
    outputMode = 'files_with_matches',
    contextBefore = 0,
    contextAfter = 0,
    context = 0,
    multiline = false,
    maxCount = DEFAULT_MAX_COUNT,
    includeHidden = false
}) {
    const args = [];

    // 출력 형식
    if (outputMode === 'files_with_matches') {
        args.push('--files-with-matches');
    } else if (outputMode === 'count') {
        args.push('--count');
    } else if (outputMode === 'content') {
        args.push('--json');
    } else {
        args.push('--json');
    }

    // 대소문자 구분
    if (caseInsensitive) {
        args.push('--ignore-case');
    }

    // 멀티라인 모드
    if (multiline) {
        args.push('--multiline');
        args.push('--multiline-dotall');
    }

    // 컨텍스트 라인
    if (context > 0) {
        args.push('--context', String(context));
    } else {
        if (contextBefore > 0) {
            args.push('--before-context', String(contextBefore));
        }
        if (contextAfter > 0) {
            args.push('--after-context', String(contextAfter));
        }
    }

    // 최대 매치 수
    args.push('--max-count', String(maxCount));

    // 숨김 파일 포함
    if (includeHidden) {
        args.push('--hidden');
    }

    // 파일 타입 필터
    if (type) {
        args.push('--type', type);
    }

    // Glob 패턴
    if (glob) {
        const globs = Array.isArray(glob) ? glob : [glob];
        globs.forEach(g => {
            args.push('--glob', g);
        });
    }

    // 기본 제외 패턴
    args.push('--glob', '!.git/*');
    args.push('--glob', '!node_modules/*');
    args.push('--glob', '!venv/*');
    args.push('--glob', '!.next/*');
    args.push('--glob', '!dist/*');
    args.push('--glob', '!build/*');
    args.push('--glob', '!.aiexe/*');

    // 심볼릭 링크 추적
    args.push('--follow');

    // 패턴
    args.push('--', pattern);

    // 검색 경로
    if (path) {
        args.push(path);
    }

    return args;
}

/**
 * ripgrep을 실행합니다
 */
function executeRipgrep(args, cwd, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let isTimedOut = false;
        let timeoutId;
        let settled = false;
        let rg;

        const settle = (result) => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            resolve(result);
        };

        // 시스템 정보에서 ripgrep 경로 가져오기
        const rgPath = process.app_custom?.systemInfo?.paths?.ripgrep || 'rg';

        try {
            rg = spawn(rgPath, args, {
                cwd,
                env: { ...process.env },
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: true,
                shell: false,
                windowsHide: true,
            });
        } catch (err) {
            settle({
                stdout: '',
                stderr: err.message,
                code: 1,
                timeout: false,
            });
            return;
        }

        timeoutId = setTimeout(() => {
            isTimedOut = true;
            try {
                process.kill(-rg.pid, 'SIGTERM');
                setTimeout(() => {
                    try {
                        process.kill(-rg.pid, 'SIGKILL');
                    } catch (_) {}
                }, 5000);
            } catch (_) {
                rg.kill('SIGTERM');
                setTimeout(() => {
                    try {
                        rg.kill('SIGKILL');
                    } catch (_) {}
                }, 5000);
            }
        }, timeoutMs);

        rg.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        rg.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        rg.on('close', (code) => {
            const trimmedStdout = stdout.trim();
            const trimmedStderr = stderr.trim();

            if (isTimedOut) {
                settle({
                    stdout: trimmedStdout,
                    stderr: `${trimmedStderr}\n[TIMEOUT] ripgrep terminated due to timeout`.trim(),
                    code: 1,
                    timeout: true,
                });
            } else {
                settle({
                    stdout: trimmedStdout,
                    stderr: trimmedStderr,
                    code,
                    timeout: false,
                });
            }
        });

        rg.on('error', (err) => {
            settle({
                stdout: stdout.trim(),
                stderr: isTimedOut ? `[TIMEOUT] ${err.message}` : err.message,
                code: 1,
                timeout: isTimedOut,
            });
        });
    });
}

/**
 * JSON 라인 출력을 파싱하여 파일별로 그룹화합니다
 */
function parseJsonOutput(buffer) {
    const lines = buffer.split('\n').filter(Boolean);
    const fileResults = {};

    lines.forEach((line) => {
        try {
            const parsed = JSON.parse(line);

            // match 타입만 처리
            if (parsed.type === 'match') {
                const data = parsed.data;
                if (!data || !data.path || !data.lines) return;

                const filePath = data.path.text;
                const lineContent = data.lines.text;

                // 파일별로 그룹화
                if (!fileResults[filePath]) {
                    fileResults[filePath] = [];
                }

                fileResults[filePath].push(lineContent);
            }
        } catch (_) {
            // JSON 파싱 실패 시 무시
        }
    });

    return fileResults;
}

/**
 * 파일 목록 출력을 파싱합니다
 */
function parseFileListOutput(buffer) {
    return buffer.split('\n').filter(Boolean);
}

/**
 * 카운트 출력을 파싱합니다
 */
function parseCountOutput(buffer) {
    const lines = buffer.split('\n').filter(Boolean);
    const counts = {};

    lines.forEach((line) => {
        const match = line.match(/^(.+):(\d+)$/);
        if (match) {
            const filePath = match[1];
            const count = parseInt(match[2], 10);
            counts[filePath] = count;
        }
    });

    return counts;
}

/**
 * ripgrep을 사용하여 파일 내용을 검색합니다
 */
export async function ripgrep({
    pattern,
    path = null,
    glob = null,
    type = null,
    caseInsensitive = false,
    outputMode = 'files_with_matches',
    contextBefore = 0,
    contextAfter = 0,
    context = 0,
    multiline = false,
    maxCount = DEFAULT_MAX_COUNT,
    includeHidden = false,
    headLimit = null
}) {

    if (typeof pattern !== 'string' || !pattern.trim()) {
        return {
            operation_successful: false,
            error_message: '검색 패턴이 비어 있습니다.',
            results: [],
        };
    }

    // 작업 디렉토리는 현재 작업 디렉토리(CWD)를 사용
    const resolvedCwd = process.cwd();

    // ripgrep에 전달할 검색 경로 (상대 경로 그대로 전달)
    const searchPath = path;

    const args = buildRipgrepArgs({
        pattern: pattern.trim(),
        path: searchPath,
        glob,
        type,
        caseInsensitive,
        outputMode,
        contextBefore,
        contextAfter,
        context,
        multiline,
        maxCount,
        includeHidden
    });

    const { stdout, stderr, code, timeout } = await executeRipgrep(args, resolvedCwd);

    let results = [];
    let totalMatches = 0;

    // 출력 모드에 따라 파싱
    if (outputMode === 'files_with_matches') {
        results = parseFileListOutput(stdout);
        totalMatches = results.length;
    } else if (outputMode === 'count') {
        results = parseCountOutput(stdout);
        totalMatches = Object.values(results).reduce((sum, count) => sum + count, 0);
    } else {
        results = parseJsonOutput(stdout);
        // 파일별 그룹화된 결과에서 총 매치 수 계산
        totalMatches = Object.values(results).reduce((sum, matches) => sum + matches.length, 0);
    }

    // headLimit 적용 (files_with_matches 모드에서만 적용)
    if (headLimit && headLimit > 0 && outputMode === 'files_with_matches') {
        results = results.slice(0, headLimit);
    }

    const noResult = !timeout && code === 1 && (
        outputMode === 'files_with_matches'
            ? results.length === 0
            : Object.keys(results).length === 0
    );
    const success = !timeout && (code === 0 || noResult);

    let errorMessage = '';
    if (timeout) {
        errorMessage = '검색 명령이 제한 시간을 초과했습니다.';
    } else if (!success) {
        errorMessage = stderr || 'ripgrep 실행 중 오류가 발생했습니다.';
    } else if (noResult) {
        errorMessage = '검색 결과가 없습니다.';
    }

    const response = {
        operation_successful: success,
        totalMatches: totalMatches,
        results,
        error_message: errorMessage,
        pattern_used: pattern.trim(),
    };

    // 에러가 있을 경우에만 raw_stderr 포함
    if (stderr) {
        response.raw_stderr = stderr;
    }

    return response;
}

export const ripgrepSchema = {
    name: 'ripgrep',
    description: 'ripgrep을 사용하여 프로젝트 전역에서 파일 내용을 검색합니다. 정규식 패턴, 파일 타입 필터링, 다양한 출력 모드를 지원합니다.',
    strict: false,
    parameters: {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: '검색할 정규식 패턴',
            },
            path: {
                type: 'string',
                description: '검색할 경로 (선택 사항, 생략 시 프로젝트 루트)',
            },
            glob: {
                type: 'string',
                description: 'Glob 패턴으로 파일 필터링 (선택 사항, 예: "*.js", "**/*.tsx")',
            },
            type: {
                type: 'string',
                description: '파일 타입 필터 (선택 사항, js, py, rust, go, java 등)',
            },
            caseInsensitive: {
                type: 'boolean',
                description: '대소문자를 구분하지 않고 검색 (선택 사항, 기본값: false)',
            },
            outputMode: {
                type: 'string',
                enum: ['content', 'files_with_matches', 'count'],
                description: '출력 모드 (선택 사항, 기본값: files_with_matches): content(매칭된 라인), files_with_matches(파일 경로만), count(매칭 횟수)',
            },
            contextBefore: {
                type: 'number',
                description: '매칭 전 N줄 표시 (선택 사항, content 모드에서만)',
            },
            contextAfter: {
                type: 'number',
                description: '매칭 후 N줄 표시 (선택 사항, content 모드에서만)',
            },
            context: {
                type: 'number',
                description: '매칭 전후 N줄 표시 (선택 사항, content 모드에서만)',
            },
            multiline: {
                type: 'boolean',
                description: '멀티라인 검색 활성화 (선택 사항, 여러 줄에 걸친 패턴 매칭)',
            },
            maxCount: {
                type: 'number',
                description: '파일당 최대 매칭 수 (선택 사항, 기본값: 500)',
            },
            includeHidden: {
                type: 'boolean',
                description: '숨김 파일 포함 여부 (선택 사항, 기본값: false)',
            },
            headLimit: {
                type: 'number',
                description: '출력 결과 수 제한 (선택 사항, 첫 N개만 반환)',
            },
        },
        required: ['pattern'],
        additionalProperties: false,
    },
    ui_display: {
        show_tool_call: true,
        show_tool_result: true,
        display_name: "Grep",
        format_tool_call: (args) => {
            const pattern = args.pattern || '';
            const shortened = pattern.length > 30 ? pattern.substring(0, 27) + '...' : pattern;
            return `(${shortened})`;
        },
        format_tool_result: (result) => {
            if (result.operation_successful) {
                const matches = result.totalMatches || 0;
                return {
                    type: 'formatted',
                    parts: [
                        { text: 'Found ', style: {} },
                        { text: String(matches), style: { color: theme.brand.light, bold: true } },
                        { text: ` match${matches !== 1 ? 'es' : ''}`, style: {} }
                    ]
                };
            }
            return result.error_message || 'Search failed';
        }
    }
};

export const RIPGREP_FUNCTIONS = {
    ripgrep,
};
