import { glob } from 'glob';
import { resolve, relative } from 'path';
import { safeStat } from '../util/safe_fs.js';
import { createDebugLogger } from '../util/debug_log.js';
import { theme } from '../frontend/design/themeColors.js';

const debugLog = createDebugLogger('glob.log', 'glob');

// 이 파일은 glob 패턴을 사용하여 파일을 검색하는 기능을 제공합니다.

/**
 * glob 패턴으로 파일을 검색합니다
 *
 * 사용 예시:
 * - globSearch({ pattern: "**\/*.js" })           // 모든 JS 파일
 * - globSearch({ pattern: "src/**\/*.ts" })       // src 하위 모든 TS 파일
 * - globSearch({ pattern: "*.json" })            // 현재 디렉토리의 JSON 파일
 * - globSearch({ pattern: "test/**\/*test.js" })  // test 디렉토리의 테스트 파일
 *
 * @param {Object} params - 매개변수 객체
 * @param {string} params.pattern - glob 패턴 (필수)
 * @param {string} params.path - 검색할 디렉토리 (선택, 기본값: 현재 작업 디렉토리)
 * @param {boolean} params.includeHidden - 숨김 파일 포함 여부 (선택, 기본값: false)
 * @param {number} params.maxResults - 최대 결과 수 (선택, 기본값: 1000)
 * @returns {Promise<Object>} 검색 결과
 */
export async function globSearch({
    pattern,
    path = null,
    includeHidden = false,
    maxResults = 1000
}) {
    debugLog('========== globSearch START ==========');
    debugLog(`Input parameters:`);
    debugLog(`  pattern: "${pattern}"`);
    debugLog(`  - pattern type: ${typeof pattern}`);
    debugLog(`  path: ${path === null ? 'null (using CWD)' : `"${path}"`}`);
    debugLog(`  - path type: ${typeof path}`);
    debugLog(`  includeHidden: ${includeHidden}`);
    debugLog(`  maxResults: ${maxResults}`);
    debugLog(`  - Current Working Directory: ${process.cwd()}`);

    try {
        if (typeof pattern !== 'string' || !pattern.trim()) {
            debugLog(`ERROR: Invalid pattern`);
            debugLog('========== globSearch ERROR END ==========');
            return {
                operation_successful: false,
                error_message: 'glob 패턴이 비어 있습니다.',
                results: []
            };
        }

        // 작업 디렉토리 설정 - path가 주어지면 사용, 없으면 CWD 사용
        const baseCwd = path || process.cwd();
        debugLog(`Base CWD decision:`);
        debugLog(`  - path parameter: ${path === null ? 'null' : `"${path}"`}`);
        debugLog(`  - process.cwd(): "${process.cwd()}"`);
        debugLog(`  - Selected baseCwd: "${baseCwd}"`);
        debugLog(`  - baseCwd starts with '/': ${baseCwd.startsWith('/')}`);

        const resolvedCwd = resolve(baseCwd);
        debugLog(`Path Resolution:`);
        debugLog(`  - Input baseCwd: "${baseCwd}"`);
        debugLog(`  - Resolved CWD: "${resolvedCwd}"`);
        debugLog(`  - Path changed: ${baseCwd !== resolvedCwd}`);
        debugLog(`  - Resolved CWD starts with '/': ${resolvedCwd.startsWith('/')}`);
        debugLog(`  - Resolved CWD length: ${resolvedCwd.length}`);

        // glob 옵션 설정
        const globOptions = {
            cwd: resolvedCwd,
            dot: includeHidden,                    // 숨김 파일 포함
            ignore: [                              // 기본 제외 패턴
                // 의존성 디렉토리
                '**/node_modules/**',              // JavaScript/TypeScript
                '**/vendor/**',                    // PHP, Go
                '**/Pods/**',                      // iOS CocoaPods
                '**/.bundle/**',                   // Ruby
                '**/bower_components/**',          // Bower
                '**/jspm_packages/**',             // JSPM

                // 빌드 출력 디렉토리
                '**/dist/**',
                '**/build/**',
                '**/out/**',
                '**/output/**',
                '**/target/**',                    // Rust, Java/Maven
                '**/bin/**',                       // C#, Go
                '**/obj/**',                       // C#
                '**/.next/**',                     // Next.js
                '**/.nuxt/**',                     // Nuxt.js
                '**/.svelte-kit/**',               // SvelteKit
                '**/public/build/**',

                // 캐시 및 임시 파일
                '**/.cache/**',
                '**/.temp/**',
                '**/.tmp/**',
                '**/__pycache__/**',               // Python
                '**/.pytest_cache/**',             // Python pytest
                '**/.ruff_cache/**',               // Python ruff
                '**/.mypy_cache/**',               // Python mypy
                '**/.tox/**',                      // Python tox
                '**/.nyc_output/**',               // Node.js nyc
                '**/coverage/**',                  // 테스트 커버리지
                '**/.turbo/**',                    // Turborepo
                '**/.parcel-cache/**',             // Parcel
                '**/.sass-cache/**',               // Sass

                // 버전 관리
                '**/.git/**',
                '**/.svn/**',
                '**/.hg/**',

                // IDE/에디터 설정
                '**/.idea/**',                     // IntelliJ IDEA
                '**/.vscode/**',                   // VS Code
                '**/.vs/**',                       // Visual Studio

                // 가상 환경
                '**/venv/**',                      // Python
                '**/.venv/**',                     // Python
                '**/env/**',                       // Python
                '**/.virtualenv/**',               // Python

                // 로그 및 시스템 파일
                '**/logs/**',
                '**/*.log',
                '**/.DS_Store',                    // macOS
                '**/Thumbs.db',                    // Windows
                '**/desktop.ini'                   // Windows
            ],
            nodir: true,                           // 디렉토리 제외, 파일만
            follow: true,                          // 심볼릭 링크 추적
            absolute: false,                       // 상대 경로 반환
            stat: true,                            // 파일 통계 정보 포함
            withFileTypes: false
        };

        // glob 검색 실행
        debugLog(`Executing glob search...`);
        debugLog(`  - Pattern: "${pattern.trim()}"`);
        debugLog(`  - CWD: "${resolvedCwd}"`);
        debugLog(`  - Include hidden: ${includeHidden}`);
        const matches = await glob(pattern.trim(), globOptions);
        debugLog(`Glob search completed:`);
        debugLog(`  - Total matches: ${matches.length}`);

        // 결과 제한
        const limitedMatches = matches.slice(0, maxResults);
        const truncated = matches.length > maxResults;
        debugLog(`Result limiting:`);
        debugLog(`  - Max results: ${maxResults}`);
        debugLog(`  - Actual matches: ${matches.length}`);
        debugLog(`  - Limited to: ${limitedMatches.length}`);
        debugLog(`  - Truncated: ${truncated}`);

        // 파일 정보 구성
        debugLog(`Processing file paths...`);
        const results = limitedMatches.map((filePath, index) => {
            if (index < 3) {  // 처음 3개만 상세 로깅
                debugLog(`  File #${index + 1}:`);
                debugLog(`    - Relative: "${filePath}"`);
                debugLog(`    - Base: "${resolvedCwd}"`);
            }
            return filePath;
        });
        if (results.length > 3) {
            debugLog(`  ... and ${results.length - 3} more files`);
        }

        // 수정 시간 순으로 정렬 (최신 파일 우선)
        // stat 정보를 이용한 정렬은 추가 fs.stat 호출이 필요하므로
        // 기본적으로는 알파벳 순으로 정렬
        debugLog(`Sorting results...`);
        results.sort((a, b) => a.localeCompare(b));
        debugLog(`Results sorted alphabetically`);

        debugLog('========== globSearch SUCCESS END ==========');

        return {
            operation_successful: true,
            pattern_used: pattern.trim(),
            search_directory: resolvedCwd,
            total_matches: matches.length,
            returned_matches: results.length,
            truncated: truncated,
            results: results
        };

    } catch (error) {
        debugLog(`========== globSearch EXCEPTION ==========`);
        debugLog(`Exception caught: ${error.message}`);
        debugLog(`Stack trace: ${error.stack}`);
        debugLog('========== globSearch EXCEPTION END ==========');
        return {
            operation_successful: false,
            error_message: error.message,
            pattern_used: pattern,
            results: []
        };
    }
}


// 스키마 정의
export const globSearchSchema = {
    name: 'glob_search',
    description: 'Fast file pattern matching tool that works with any codebase size. Supports glob patterns like "**/*.js" or "src/**/*.ts". Returns matching file paths sorted alphabetically. Use this tool when you need to find files by name patterns. Automatically excludes common directories like node_modules, .git, dist, build, venv.',
    parameters: {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: 'The glob pattern to match files against (e.g., "**/*.js", "src/**/*.ts", "*.json")'
            },
            path: {
                type: 'string',
                description: 'The directory to search in (optional). If not specified, the current working directory will be used.'
            },
            includeHidden: {
                type: 'boolean',
                description: 'Include hidden files (files starting with .) in results (optional, default: false)'
            },
            maxResults: {
                type: 'number',
                description: 'Maximum number of results to return (optional, default: 1000)'
            }
        },
        required: ['pattern'],
        additionalProperties: false
    },
    ui_display: {
        show_tool_call: true,
        show_tool_result: true,
        display_name: "Search",
        format_tool_call: (args) => {
            const pattern = args.pattern || '';
            return `(${pattern})`;
        },
        format_tool_result: (result) => {
            if (result.operation_successful) {
                const matches = result.total_matches || 0;
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


// 함수 맵 - 문자열로 함수 호출 가능
export const GLOB_FUNCTIONS = {
    'glob_search': globSearch
};
