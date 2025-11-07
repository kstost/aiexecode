import { spawn } from 'child_process';
import { theme } from '../frontend/design/themeColors.js';

// 파일 내용 검색, 파일 경로 필터링, 다양한 출력 모드 등을 지원합니다.

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_COUNT = 500;
const MAX_OUTPUT_SIZE = 30000; // 30KB 출력 크기 제한

/**
 * ripgrep 인수를 구성합니다
 */
function buildRipgrepArgs({
    pattern,
    path = null,
    glob = null,
    type = null,
    '-i': caseInsensitive = false,
    output_mode: outputMode = 'files_with_matches',
    '-B': contextBefore = 0,
    '-A': contextAfter = 0,
    '-C': context = 0,
    '-n': showLineNumbers = false,
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

    // 최대 매치 수 (파일당)
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
        let isSizeLimitExceeded = false;
        let outputSize = 0;
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
            const dataStr = data.toString();
            outputSize += dataStr.length;

            // 출력 크기 제한 체크
            if (outputSize > MAX_OUTPUT_SIZE && !isSizeLimitExceeded) {
                isSizeLimitExceeded = true;
                stdout += dataStr;
                stdout += '\n[OUTPUT TRUNCATED: exceeded 30KB limit]';

                // 프로세스 종료
                try {
                    process.kill(-rg.pid, 'SIGTERM');
                    setTimeout(() => {
                        try {
                            process.kill(-rg.pid, 'SIGKILL');
                        } catch (_) {}
                    }, 1000);
                } catch (_) {
                    rg.kill('SIGTERM');
                    setTimeout(() => {
                        try {
                            rg.kill('SIGKILL');
                        } catch (_) {}
                    }, 1000);
                }
                return;
            }

            if (!isSizeLimitExceeded) {
                stdout += dataStr;
            }
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
                    sizeLimitExceeded: isSizeLimitExceeded,
                });
            } else if (isSizeLimitExceeded) {
                settle({
                    stdout: trimmedStdout,
                    stderr: trimmedStderr,
                    code: 0, // 정상 종료로 처리
                    timeout: false,
                    sizeLimitExceeded: true,
                });
            } else {
                settle({
                    stdout: trimmedStdout,
                    stderr: trimmedStderr,
                    code,
                    timeout: false,
                    sizeLimitExceeded: false,
                });
            }
        });

        rg.on('error', (err) => {
            settle({
                stdout: stdout.trim(),
                stderr: isTimedOut ? `[TIMEOUT] ${err.message}` : err.message,
                code: 1,
                timeout: isTimedOut,
                sizeLimitExceeded: isSizeLimitExceeded,
            });
        });
    });
}

/**
 * JSON 라인 출력을 파싱하여 파일별로 그룹화합니다
 */
function parseJsonOutput(buffer, showLineNumbers = false) {
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
                const lineNumber = data.line_number;

                // 파일별로 그룹화
                if (!fileResults[filePath]) {
                    fileResults[filePath] = [];
                }

                // 라인 번호 표시 옵션
                if (showLineNumbers && lineNumber !== undefined) {
                    fileResults[filePath].push(`${lineNumber}:${lineContent}`);
                } else {
                    fileResults[filePath].push(lineContent);
                }
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
    '-i': caseInsensitive = false,
    output_mode: outputMode = 'files_with_matches',
    '-B': contextBefore = 0,
    '-A': contextAfter = 0,
    '-C': context = 0,
    '-n': showLineNumbers = false,
    multiline = false,
    head_limit: headLimit = null,
    includeHidden = false
}) {
    // Intentional delay for testing pending state
    await new Promise(resolve => setTimeout(resolve, 13));

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

    // maxCount 결정 (output_mode와 head_limit 기반)
    let maxCount = DEFAULT_MAX_COUNT;
    if (outputMode === 'content') {
        maxCount = 100; // content 모드는 기본 100
    }
    if (headLimit && headLimit > 0 && headLimit < maxCount) {
        maxCount = headLimit; // head_limit이 더 작으면 사용
    }

    const args = buildRipgrepArgs({
        pattern: pattern.trim(),
        path: searchPath,
        glob,
        type,
        '-i': caseInsensitive,
        output_mode: outputMode,
        '-B': contextBefore,
        '-A': contextAfter,
        '-C': context,
        '-n': showLineNumbers,
        multiline,
        maxCount,
        includeHidden
    });

    const { stdout, stderr, code, timeout, sizeLimitExceeded } = await executeRipgrep(args, resolvedCwd);

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
        results = parseJsonOutput(stdout, showLineNumbers);
        // 파일별 그룹화된 결과에서 총 매치 수 계산
        totalMatches = Object.values(results).reduce((sum, matches) => sum + matches.length, 0);
    }

    // headLimit 적용 (모든 출력 모드)
    if (headLimit && headLimit > 0) {
        if (outputMode === 'files_with_matches') {
            // 파일 목록 제한
            results = results.slice(0, headLimit);
        } else if (outputMode === 'count') {
            // count 모드: 상위 N개 파일만
            const entries = Object.entries(results).slice(0, headLimit);
            results = Object.fromEntries(entries);
        } else if (outputMode === 'content') {
            // content 모드: 전체 매칭 라인을 headLimit까지만
            const limitedResults = {};
            let lineCount = 0;

            for (const [file, matches] of Object.entries(results)) {
                if (lineCount >= headLimit) break;

                limitedResults[file] = [];
                for (const match of matches) {
                    if (lineCount >= headLimit) break;
                    limitedResults[file].push(match);
                    lineCount++;
                }
            }
            results = limitedResults;
        }
    }

    const noResult = !timeout && code === 1 && (
        outputMode === 'files_with_matches'
            ? results.length === 0
            : Object.keys(results).length === 0
    );
    const success = !timeout && (code === 0 || noResult);

    let errorMessage = '';
    let warningMessage = '';

    if (timeout) {
        errorMessage = '검색 명령이 제한 시간을 초과했습니다.';
    } else if (sizeLimitExceeded) {
        warningMessage = '출력 크기가 30KB를 초과하여 결과가 잘렸습니다. 더 구체적인 검색어나 필터를 사용하세요.';
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

    // 경고 메시지 추가
    if (warningMessage) {
        response.warning_message = warningMessage;
    }

    // 에러가 있을 경우에만 raw_stderr 포함
    if (stderr) {
        response.raw_stderr = stderr;
    }

    return response;
}

export const ripgrepSchema = {
    name: 'ripgrep',
    description: 'A powerful search tool built on ripgrep. Supports full regex syntax, file filtering with glob/type parameters, and multiple output modes.',
    strict: false,
    parameters: {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: 'The regular expression pattern to search for in file contents',
            },
            path: {
                type: 'string',
                description: 'File or directory to search in (rg PATH). Defaults to current working directory.',
            },
            glob: {
                type: 'string',
                description: 'Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob',
            },
            type: {
                type: 'string',
                description: 'File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types.',
            },
            '-i': {
                type: 'boolean',
                description: 'Case insensitive search (rg -i)',
            },
            output_mode: {
                type: 'string',
                enum: ['content', 'files_with_matches', 'count'],
                description: 'Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".',
            },
            '-B': {
                type: 'number',
                description: 'Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.',
            },
            '-A': {
                type: 'number',
                description: 'Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.',
            },
            '-C': {
                type: 'number',
                description: 'Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.',
            },
            '-n': {
                type: 'boolean',
                description: 'Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise.',
            },
            multiline: {
                type: 'boolean',
                description: 'Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.',
            },
            head_limit: {
                type: 'number',
                description: 'Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). When unspecified, shows all results from ripgrep.',
            },
            includeHidden: {
                type: 'boolean',
                description: 'Include hidden files and directories in the search (rg --hidden). Default: false.',
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
