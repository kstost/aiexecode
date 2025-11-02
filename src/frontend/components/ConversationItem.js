/**
 * ConversationItem - Renders individual conversation items
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';
import { colorizeCode } from '../utils/syntaxHighlighter.js';
import { renderMarkdown } from '../utils/markdownParser.js';
import { FileDiffViewer } from './FileDiffViewer.js';
import { getToolDisplayName, formatToolCall } from '../../system/tool_registry.js';
import { getFileSnapshot } from '../../system/file_integrity.js';
import { safeMkdir, safeAppendFile } from '../../util/safe_fs.js';
import { resolve, join, dirname } from 'path';
import { DEBUG_LOG_DIR } from '../../util/config.js';
import { createHash } from 'crypto';
import { createDebugLogger } from '../../util/debug_log.js';
import { prepareEditReplaceDiff } from '../utils/diffUtils.js';

const debugLog = createDebugLogger('ui_components.log', 'ConversationItem');
const OLDSTRING_LOG_FILE = join(DEBUG_LOG_DIR, 'oldstring.txt');

// Evidence logging for old_string NOT FOUND issues
function logOldStringEvidence(evidence) {
    try {
        const dir = dirname(OLDSTRING_LOG_FILE);
        const timestamp = new Date().toISOString();
        const separator = '\n' + '='.repeat(80) + '\n';

        let logEntry = `${separator}[${timestamp}] OLD_STRING NOT FOUND EVIDENCE\n${separator}`;
        logEntry += `File Path: ${evidence.filePath}\n`;
        logEntry += `Snapshot Source: ${evidence.snapshotSource}\n`;
        logEntry += `Snapshot Timestamp: ${evidence.snapshotTimestamp || 'N/A'}\n`;
        logEntry += `\nSnapshot Content Hash: ${evidence.snapshotHash}\n`;
        logEntry += `Snapshot Content Length: ${evidence.snapshotLength} bytes\n`;
        logEntry += `\nOld String Hash: ${evidence.oldStringHash}\n`;
        logEntry += `Old String Length: ${evidence.oldStringLength} bytes\n`;
        logEntry += `\nSearch Result: ${evidence.searchResult}\n`;

        if (evidence.prefixMatch !== undefined) {
            logEntry += `Prefix (20 chars) Match: ${evidence.prefixMatch}\n`;
        }

        if (evidence.normalizedMatch !== undefined) {
            logEntry += `Normalized (CRLF->LF) Match: ${evidence.normalizedMatch}\n`;
        }

        logEntry += `\n--- Snapshot Content (first 500 chars) ---\n`;
        logEntry += evidence.snapshotPreview + '\n';
        logEntry += `\n--- Old String (first 500 chars) ---\n`;
        logEntry += evidence.oldStringPreview + '\n';

        if (evidence.contextAroundPrefix) {
            logEntry += `\n--- Context Around Prefix Match ---\n`;
            logEntry += evidence.contextAroundPrefix + '\n';
        }

        logEntry += `\n--- Result Args ---\n`;
        logEntry += JSON.stringify(evidence.resultArgs, null, 2) + '\n';

        // Convert sync operations to async (non-blocking)
        setImmediate(async () => {
            try {
                // 디렉토리가 없으면 생성 (recursive: true 이므로 이미 존재해도 에러 없음)
                await safeMkdir(dir, { recursive: true });
                await safeAppendFile(OLDSTRING_LOG_FILE, logEntry);
            } catch (err) {
                // Ignore logging errors
            }
        });
    } catch (err) {
        // Ignore logging errors
    }
}

const TYPE_CONFIG = {
    user: { icon: '> ', color: theme.text.accent, bold: true },
    assistant: { icon: '< ', color: theme.status.warning, bold: true },
    assistant_progress: { icon: '  ', color: theme.text.secondary, bold: false },  // 중간 안내 메시지
    system: { icon: '* ', color: theme.text.secondary, bold: false },
    error: { icon: '✗ ', color: theme.status.error, bold: true },
    tool: { icon: '⚙ ', color: theme.status.success, bold: false },
    tool_start: { icon: '⚙ ', color: theme.status.success, bold: true },
    tool_result: { icon: '  ㄴ', color: theme.text.secondary, bold: false },
    thinking: { icon: '◇ ', color: theme.text.link, bold: false },
    code_execution: { icon: '▶ ', color: theme.status.warning, bold: false },
    code_result: { icon: '◀ ', color: theme.status.success, bold: false },
    default: { icon: '• ', color: theme.text.primary, bold: false }
};

function getTypeConfig(type) {
    return TYPE_CONFIG[type] || TYPE_CONFIG.default;
}

function CodeExecutionDisplay({ item, hasFollowingResult, nextItem }) {
    const config = getTypeConfig(item.type);

    const languageName = item.language.charAt(0).toUpperCase() + item.language.slice(1);

    // Check if code execution was denied by user
    const resultStderr = item.result?.stderr || nextItem?.stderr;
    const isDenied = resultStderr?.includes('User denied code execution');

    /**
     * 간격: marginBottom 항상 0
     * 빈 줄은 BlankLine 컴포넌트로 관리됨
     * - code_execution + code_result는 pair로 붙여서 표시 (빈 줄 없음)
     * - code_result가 없으면 빈 줄로 구분
     */
    const marginBottom = 0;

    if (isDenied) {
        return React.createElement(Box, { flexDirection: "column", marginBottom, marginLeft: 2 },
            React.createElement(Box, { flexDirection: "row", marginBottom: 0 },
                React.createElement(Text, { color: config.color, bold: true }, config.icon),
                React.createElement(Text, { color: theme.text.primary }, 'Executing '),
                React.createElement(Text, { color: theme.status.warning, bold: true }, languageName)
            ),
            React.createElement(Box, { marginLeft: 2, marginTop: 0 },
                React.createElement(Text, { color: 'yellow' }, '✗ User denied this action')
            )
        );
    }

    return React.createElement(Box, { flexDirection: "column", marginBottom, marginLeft: 2 },
        React.createElement(Box, { flexDirection: "row", marginBottom: 0 },
            React.createElement(Text, { color: config.color, bold: true }, config.icon),
            React.createElement(Text, { color: theme.text.primary }, 'Executing '),
            React.createElement(Text, { color: theme.status.warning, bold: true }, languageName),
            // React.createElement(Text, { color: theme.text.primary }, ' code:')
        ),
        React.createElement(Box, { marginLeft: 2 },
            colorizeCode(item.code, item.language, true)
        )
    );
}

function CodeResultDisplay({ item }) {
    const hasStdout = item.stdout && item.stdout.trim();
    const hasStderr = item.stderr && item.stderr.trim();

    // Check if code execution was denied
    const isDenied = hasStderr && item.stderr.includes('User denied code execution');

    if (isDenied) {
        // Don't display code_result when denied (already shown in code_execution)
        return null;
    }

    /**
     * 간격: marginBottom 항상 0
     * 빈 줄은 BlankLine 컴포넌트로 관리됨
     * - code_result 뒤에는 항상 빈 줄 추가 (App.js에서 처리)
     */
    return React.createElement(Box, { marginBottom: 0, marginTop: 0, marginLeft: 4, flexGrow: 1 },
        React.createElement(Box, {
            flexDirection: "column",
            borderStyle: "round",
            borderColor: theme.border.default,
            paddingX: 1,
            flexGrow: 1
        },
            hasStdout && React.createElement(Box, { marginBottom: 0 },
                React.createElement(Text, { color: theme.text.primary }, item.stdout)
            ),
            hasStderr && React.createElement(Box, { marginBottom: 0 },
                React.createElement(Text, { color: theme.status.error }, item.stderr)
            ),
            !hasStdout && !hasStderr && React.createElement(Box, { marginBottom: 0 },
                React.createElement(Text, { color: theme.text.secondary, dimColor: true }, '(no output)')
            )
        )
    );
}

function StandardDisplay({ item, isPending, hasFollowingResult, nextItem, isLastInBatch = false, terminalWidth }) {
    const { type, text, operations = [], toolName, toolInput, args } = item;
    const config = getTypeConfig(type);

    debugLog('---------- StandardDisplay START ----------');
    debugLog(`type: ${type}, toolName: ${toolName || 'N/A'}`);
    debugLog(`text: ${typeof text === 'string' ? text?.substring(0, 100) : JSON.stringify(text)?.substring(0, 100) || 'N/A'}...`);
    debugLog(`hasFollowingResult: ${hasFollowingResult}, isLastInBatch: ${isLastInBatch}`);

    // tool_start는 args를, tool_result는 toolInput을 사용
    const effectiveArgs = toolInput || args;

    // edit_file_range와 edit_file_replace의 diff 데이터를 동기적으로 로드 (tool_start에서만)
    let diffData = null;
    if (type === 'tool_start' && toolName === 'edit_file_range' && effectiveArgs) {
        // 파일 경로를 절대 경로로 정규화 (스냅샷은 절대 경로로 저장됨)
        const absolutePath = resolve(effectiveArgs.file_path);

        // tool_start에는 result가 없으므로 nextItem(tool_result)에서 가져옴
        const originalResult = item.result?.originalResult || nextItem?.result?.originalResult;
        
        // Check if the tool was denied by the user
        const isDenied = originalResult?.operation_successful === false && 
                        originalResult?.error_message === 'User denied tool execution';
        
        if (originalResult?.operation_successful === false) {
            diffData = { loaded: true, hasContent: false, isDenied };
        } else {
            try {
                // 우선 메모리의 getFileSnapshot 시도 (절대 경로 사용), 없으면 히스토리 아이템에 저장된 스냅샷 사용
                let snapshot = getFileSnapshot(absolutePath);

                // 히스토리 복원 시: item.args 또는 effectiveArgs에 fileSnapshot이 있을 수 있음
                if (!snapshot && item.args?.fileSnapshot) {
                    snapshot = item.args.fileSnapshot;
                } else if (!snapshot && effectiveArgs?.fileSnapshot) {
                    snapshot = effectiveArgs.fileSnapshot;
                }

                const content = snapshot?.content || '';

                if (!content) {
                    diffData = {
                        loaded: true,
                        hasContent: false,
                        oldContent: '',
                        contextBefore: [],
                        contextAfter: [],
                        contextStartLine: effectiveArgs.start_line
                    };
                } else {
                    const lines = content.split('\n');

                    // Handle files without trailing newline
                    const actualLines = content === '' ? [] :
                        (content.endsWith('\n') ? lines.slice(0, -1) : lines);

                    // Extract old content (the lines being edited)
                    const old = actualLines.slice(effectiveArgs.start_line - 1, effectiveArgs.end_line).join('\n');

                    // Extract context (2 lines before and after)
                    const contextLines = 2;
                    const contextStartIdx = Math.max(0, effectiveArgs.start_line - 1 - contextLines);
                    const contextEndIdx = Math.min(actualLines.length, effectiveArgs.end_line + contextLines);

                    const ctxBefore = actualLines.slice(contextStartIdx, effectiveArgs.start_line - 1);
                    const ctxAfter = actualLines.slice(effectiveArgs.end_line, contextEndIdx);

                    diffData = {
                        loaded: true,
                        hasContent: true,
                        oldContent: old,
                        newContent: effectiveArgs.new_content,
                        contextBefore: ctxBefore,
                        contextAfter: ctxAfter,
                        contextStartLine: contextStartIdx + 1,
                        startLine: effectiveArgs.start_line,
                        endLine: effectiveArgs.end_line
                    };
                }
            } catch (error) {
                diffData = {
                    loaded: true,
                    hasContent: false,
                    oldContent: '',
                    contextBefore: [],
                    contextAfter: [],
                    contextStartLine: effectiveArgs?.start_line || 1
                };
            }
        }
    }

    // edit_file_replace의 diff 데이터 로드
    if (type === 'tool_start' && toolName === 'edit_file_replace' && effectiveArgs) {
        debugLog('========== edit_file_replace DIFF LOADING START ==========');
        debugLog(`file_path (original): "${effectiveArgs.file_path}"`);

        // 파일 경로를 절대 경로로 정규화 (스냅샷은 절대 경로로 저장됨)
        const absolutePath = resolve(effectiveArgs.file_path);
        debugLog(`file_path (absolute): "${absolutePath}"`);
        debugLog(`old_string length: ${effectiveArgs.old_string?.length || 0}`);
        debugLog(`new_string length: ${effectiveArgs.new_string?.length || 0}`);

        // tool_start에는 result가 없으므로 nextItem(tool_result)에서 가져옴
        const originalResult = item.result?.originalResult || nextItem?.result?.originalResult;
        debugLog(`originalResult exists: ${!!originalResult}`);
        debugLog(`operation_successful: ${originalResult?.operation_successful}`);
        debugLog(`originalResult source: ${item.result?.originalResult ? 'item.result' : nextItem?.result?.originalResult ? 'nextItem.result' : 'none'}`);

        // Check if the tool was denied by the user
        const isDenied = originalResult?.operation_successful === false && 
                        originalResult?.error_message === 'User denied tool execution';

        if (originalResult?.operation_successful === false) {
            debugLog('Operation was NOT successful, skipping diff display');
            diffData = { loaded: true, hasContent: false, isDenied };
        } else {
            try {
                // 스냅샷 우선순위: 히스토리 저장 스냅샷 > 메모리 스냅샷
                // (히스토리 스냅샷이 편집 당시의 정확한 파일 상태를 보존)
                debugLog('Attempting to get file snapshot...');
                let snapshot = null;
                let snapshotSource = 'none';

                // 1순위: result에 저장된 fileSnapshot (가장 정확함)
                if (originalResult?.fileSnapshot) {
                    snapshot = originalResult.fileSnapshot;
                    snapshotSource = 'result.fileSnapshot';
                    debugLog('Using fileSnapshot from result.fileSnapshot');
                }
                // 2순위: item.args의 fileSnapshot
                else if (item.args?.fileSnapshot) {
                    snapshot = item.args.fileSnapshot;
                    snapshotSource = 'item.args.fileSnapshot';
                    debugLog('Using fileSnapshot from item.args');
                }
                // 3순위: effectiveArgs의 fileSnapshot
                else if (effectiveArgs?.fileSnapshot) {
                    snapshot = effectiveArgs.fileSnapshot;
                    snapshotSource = 'effectiveArgs.fileSnapshot';
                    debugLog('Using fileSnapshot from effectiveArgs');
                }
                // 4순위: 메모리의 현재 스냅샷 (최신 파일 상태, 정확하지 않을 수 있음)
                else {
                    snapshot = getFileSnapshot(absolutePath);
                    if (snapshot) {
                        snapshotSource = 'memory (current)';
                        debugLog('WARNING: Using current memory snapshot - may not match edit time');
                    }
                }

                debugLog(`Snapshot source: ${snapshotSource}`);
                debugLog(`Snapshot found: ${snapshot ? 'YES' : 'NO'}`);

                const content = snapshot?.content || '';
                debugLog(`Content length: ${content.length} bytes`);
                debugLog(`Content exists: ${!!content}`);
                debugLog(`old_string exists: ${!!effectiveArgs.old_string}`);

                if (!content || !effectiveArgs.old_string) {
                    debugLog('ERROR: Missing content or old_string');
                    diffData = {
                        loaded: true,
                        hasContent: false
                    };
                } else {
                    // old_string이 있는 위치 찾기
                    debugLog('Searching for old_string in snapshot content...');
                    const oldStringIndex = content.indexOf(effectiveArgs.old_string);
                    debugLog(`old_string index in snapshot: ${oldStringIndex}`);

                    if (oldStringIndex === -1) {
                        debugLog('ERROR: old_string NOT FOUND in snapshot');
                        debugLog(`Snapshot first 200 chars: ${JSON.stringify(content.substring(0, 200))}`);
                        debugLog(`old_string first 100 chars: ${JSON.stringify(effectiveArgs.old_string.substring(0, 100))}`);

                        // 증거 수집을 위한 상세 분석
                        const snapshotHash = createHash('sha256').update(content).digest('hex');
                        const oldStringHash = createHash('sha256').update(effectiveArgs.old_string).digest('hex');

                        // 부분 문자열 검색
                        let prefixIndex = -1;
                        let contextAroundPrefix = null;
                        if (effectiveArgs.old_string.length > 20) {
                            const prefix = effectiveArgs.old_string.substring(0, 20);
                            prefixIndex = content.indexOf(prefix);
                            debugLog(`First 20 chars of old_string found at: ${prefixIndex}`);

                            if (prefixIndex !== -1) {
                                const contextStart = Math.max(0, prefixIndex - 100);
                                const contextEnd = Math.min(content.length, prefixIndex + 200);
                                contextAroundPrefix = content.substring(contextStart, contextEnd);
                            }
                        }

                        // 줄바꿈 정규화 후 재검색
                        const normalizedContent = content.replace(/\r\n/g, '\n');
                        const normalizedOldString = effectiveArgs.old_string.replace(/\r\n/g, '\n');
                        const normalizedMatch = normalizedContent.indexOf(normalizedOldString) !== -1;

                        // 증거 로그 수집
                        const evidence = {
                            filePath: absolutePath,
                            snapshotSource: snapshotSource,
                            snapshotTimestamp: snapshot?.timestamp,
                            snapshotHash: snapshotHash.substring(0, 16) + '...',
                            snapshotLength: content.length,
                            oldStringHash: oldStringHash.substring(0, 16) + '...',
                            oldStringLength: effectiveArgs.old_string.length,
                            searchResult: 'NOT FOUND',
                            prefixMatch: prefixIndex !== -1 ? `Yes (at index ${prefixIndex})` : 'No',
                            normalizedMatch: normalizedMatch ? 'Yes' : 'No',
                            snapshotPreview: content.substring(0, 500),
                            oldStringPreview: effectiveArgs.old_string.substring(0, 500),
                            contextAroundPrefix: contextAroundPrefix,
                            resultArgs: {
                                operation_successful: originalResult?.operation_successful,
                                hasFileSnapshot: !!originalResult?.fileSnapshot
                            }
                        };

                        // oldstring.txt에 증거 기록
                        logOldStringEvidence(evidence);

                        diffData = {
                            loaded: true,
                            hasContent: false
                        };
                    } else {
                        debugLog('old_string FOUND in snapshot');

                        // Use shared diff preparation logic
                        const result = prepareEditReplaceDiff(
                            effectiveArgs.old_string || '',
                            effectiveArgs.new_string || '',
                            content,
                            false
                        );

                        if (result.error) {
                            debugLog(`[EDIT_FILE_REPLACE] prepareEditReplaceDiff returned error: ${result.error}`);
                            diffData = {
                                loaded: true,
                                hasContent: false,
                                error: result.error
                            };
                        } else {
                            debugLog(`[EDIT_FILE_REPLACE] Content for diff:`);
                            debugLog(`  - fullOldContent length: ${result.oldContent.length} bytes`);
                            debugLog(`  - fullOldContent lines: ${result.oldContent.split('\n').length}`);
                            debugLog(`  - fullNewContent length: ${result.newContent.length} bytes`);
                            debugLog(`  - fullNewContent lines: ${result.newContent.split('\n').length}`);
                            debugLog(`Full old content preview: ${result.oldContent.substring(0, 100)}...`);
                            debugLog(`Full new content preview: ${result.newContent.substring(0, 100)}...`);
                            debugLog(`Context before lines: ${result.contextBefore.length}, after lines: ${result.contextAfter.length}`);

                            diffData = {
                                loaded: true,
                                hasContent: true,
                                oldContent: result.oldContent,
                                newContent: result.newContent,
                                contextBefore: result.contextBefore,
                                contextAfter: result.contextAfter,
                                contextStartLine: result.contextStartLine,
                                startLine: result.startLine,
                                endLine: result.endLine
                            };

                            debugLog('[EDIT_FILE_REPLACE] diffData created:');
                            debugLog(`  - startLine: ${result.startLine}, endLine: ${result.endLine}`);
                            debugLog(`  - contextStartLine: ${result.contextStartLine}`);
                            debugLog(`  - contextBefore: ${result.contextBefore.length} lines`);
                            debugLog(`  - contextAfter: ${result.contextAfter.length} lines`);
                            debugLog('diffData created successfully with hasContent: true');
                        }
                    }
                }
            } catch (error) {
                debugLog(`EXCEPTION during diff loading: ${error.message}`);
                debugLog(`Stack: ${error.stack}`);
                diffData = {
                    loaded: true,
                    hasContent: false
                };
            }
        }

        debugLog(`Final diffData state: loaded=${diffData?.loaded}, hasContent=${diffData?.hasContent}`);
        debugLog('========== edit_file_replace DIFF LOADING END ==========');
    }

    /**
     * 간격 규칙 설명
     *
     * ## 기본 원칙: marginBottom = 0
     *
     * 모든 히스토리 아이템은 marginBottom=0으로 렌더링됩니다.
     * 빈 줄은 BlankLine 컴포넌트로 명시적으로 추가됩니다.
     *
     * ### 왜 이렇게 했는가?
     *
     * **기존 방식의 문제 (marginBottom으로 간격 제어)**:
     * 1. Static 불변성 문제:
     *    - user 입력이 추가될 때는 nextItem=null (아직 tool_start가 없음)
     *    - user의 marginBottom이 1로 설정됨
     *    - 나중에 tool_start가 추가되어도 이미 렌더링된 user는 업데이트 안됨
     *    - 결과: user와 tool_start 사이에 불필요한 빈 줄 발생
     *
     * 2. 복잡한 조건부 로직:
     *    - 각 요소가 "다음 요소가 무엇인지"를 보고 margin을 결정
     *    - 코드 가독성이 떨어지고 버그가 발생하기 쉬움
     *
     * **새로운 방식 (BlankLine 컴포넌트)**:
     * 1. 명시성: 빈 줄이 필요한 곳에 BlankLine 컴포넌트를 명시적으로 추가
     * 2. 독립성: 각 히스토리 아이템은 독립적으로 렌더링 (margin=0)
     * 3. 불변성 호환: Static의 불변 특성과 충돌하지 않음
     *    - user + BlankLine이 함께 추가됨
     *    - 나중에 tool_start가 추가되어도 영향 없음
     * 4. 디버깅 용이: 로그에서 빈 줄 추가를 명시적으로 추적 가능
     *
     * ### 간격 규칙 (App.js의 shouldAddBlankLineAfter 함수 참조)
     *
     * - user, assistant, tool_result, code_result 뒤: 항상 빈 줄
     * - tool_start 뒤: 다음이 tool_result가 아니면 빈 줄
     * - code_execution 뒤: 다음이 code_result가 아니면 빈 줄
     * - system, error 등 기타 뒤: 항상 빈 줄
     *
     * 상세한 규칙은 BlankLine.js와 App.js의 shouldAddBlankLineAfter 주석 참조
     */
    const marginBottom = 0;
    const marginTop = 0;

    // originalResult는 여러 곳에서 사용되므로 정의 유지
    const originalResult = item.result?.originalResult || nextItem?.result?.originalResult;

    if (false) {
        return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop },
            React.createElement(Text, {
                color: config.color,
                bold: config.bold
            }, config.icon),
            React.createElement(Text, { color: theme.text.primary },
                JSON.stringify(item, null, 2)
            )
        );
    }

    // 중간 안내 메시지 (assistant_progress) - dimColor로 표시
    if (type === 'assistant_progress') {
        return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop, marginLeft: 2 },
            React.createElement(Text, {
                color: theme.text.secondary,
                dimColor: true
            }, '  ⋯ '),
            React.createElement(Box, { flexDirection: "column", flexGrow: 1 },
                React.createElement(Text, { color: theme.text.secondary, dimColor: true }, text)
            )
        );
    }

    // 시스템 메시지는 마크다운 렌더링 적용
    if (type === 'system') {
        return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop, marginLeft: 2 },
            React.createElement(Text, {
                color: config.color,
                bold: config.bold
            }, config.icon),
            React.createElement(Box, { flexDirection: "column", flexGrow: 1 },
                renderMarkdown(text, { terminalWidth: terminalWidth || 80 })
            )
        );
    }

    // 에러 메시지는 빨간색으로 강조하고 마크다운 없이 표시
    if (type === 'error') {
        return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop, marginLeft: 2 },
            React.createElement(Text, {
                color: config.color,
                bold: config.bold
            }, config.icon),
            React.createElement(Box, { flexDirection: "column", flexGrow: 1 },
                React.createElement(Text, { color: theme.status.error }, text)
            )
        );
    }

    // edit_file_range와 edit_file_replace: 성공한 경우와 denied된 경우 tool_result를 숨김
    if (type === 'tool_result' && (toolName === 'edit_file_range' || toolName === 'edit_file_replace')) {
        const originalResult = item.result?.originalResult;
        const isEditDenied = originalResult?.operation_successful === false && 
                             originalResult?.error_message === 'User denied tool execution';
        
        // 성공한 경우나 denied된 경우 tool_result를 숨김
        if (originalResult?.operation_successful !== false || isEditDenied) {
            return null;
        }
        // 실패했지만 denied가 아닌 경우는 계속 진행하여 tool_result 표시
    }

    // tool_start이고 edit_file_range인 경우 FileDiffViewer 표시
    if (type === 'tool_start' && toolName === 'edit_file_range' && effectiveArgs) {
        if (diffData?.loaded && diffData.hasContent) {
            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});
            
            const result = React.createElement(Box, { flexDirection: "column", marginBottom, marginTop, marginLeft: 2, width: '100%' },
                React.createElement(Box, { flexDirection: "row" },
                    React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                    React.createElement(Text, { color: 'white', bold: true }, displayName),
                    React.createElement(Text, { color: theme.text.secondary }, ` ${formattedArgs}`)
                ),
                React.createElement(Box, { marginLeft: 2, width: '100%' },
                    React.createElement(FileDiffViewer, {
                        filePath: effectiveArgs.file_path,
                        startLine: effectiveArgs.start_line,
                        endLine: effectiveArgs.end_line,
                        oldContent: diffData.oldContent,
                        newContent: effectiveArgs.new_content,
                        contextBefore: diffData.contextBefore,
                        contextAfter: diffData.contextAfter,
                        contextStartLine: diffData.contextStartLine,
                        showHeader: false
                    })
                )
            );

            return result;
        } else if (diffData?.loaded && !diffData.hasContent) {
            // Check if the tool was denied by user
            if (diffData.isDenied) {
                const displayName = getToolDisplayName(toolName);
                
                return React.createElement(Box, { flexDirection: "column", marginBottom, marginTop, marginLeft: 2 },
                    React.createElement(Box, { flexDirection: "row" },
                        React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                        React.createElement(Text, { color: 'white', bold: true }, displayName)
                    ),
                    React.createElement(Box, { marginLeft: 2, marginTop: 0 },
                        React.createElement(Text, { color: 'yellow' }, '✗ User denied this action')
                    )
                );
            }
            
            // fallback: 기본 tool 표시 (실패했지만 deny는 아닌 경우)
            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});

            return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop, marginLeft: 2 },
                React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                React.createElement(Text, { color: 'white', bold: true }, displayName),
                React.createElement(Text, { color: theme.text.secondary }, ` ${formattedArgs}`)
            );
        } else {
            // loading 상태: 기본 tool 표시
            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});

            return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop, marginLeft: 2 },
                React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                React.createElement(Text, { color: 'white', bold: true }, displayName),
                React.createElement(Text, { color: theme.text.secondary }, ` ${formattedArgs}`)
            );
        }
    }

    // tool_start이고 edit_file_replace인 경우 FileDiffViewer 표시
    if (type === 'tool_start' && toolName === 'edit_file_replace' && effectiveArgs) {
        debugLog('========== RENDERING edit_file_replace ==========');
        debugLog(`diffData state: loaded=${diffData?.loaded}, hasContent=${diffData?.hasContent}`);

        if (diffData?.loaded && diffData.hasContent) {
            debugLog('Rendering FileDiffViewer for edit_file_replace');
            debugLog(`  filePath: ${effectiveArgs.file_path}`);
            debugLog(`  startLine: ${diffData.startLine}, endLine: ${diffData.endLine}`);
            debugLog(`  oldContent length: ${diffData.oldContent?.length || 0}`);
            debugLog(`  newContent length: ${diffData.newContent?.length || 0}`);

            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});
            
            const result = React.createElement(Box, { flexDirection: "column", marginBottom, marginTop, marginLeft: 2, width: '100%' },
                React.createElement(Box, { flexDirection: "row" },
                    React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                    React.createElement(Text, { color: 'white', bold: true }, displayName),
                    React.createElement(Text, { color: theme.text.secondary }, ` ${formattedArgs}`)
                ),
                React.createElement(Box, { marginLeft: 2, width: '100%' },
                    React.createElement(FileDiffViewer, {
                        filePath: effectiveArgs.file_path,
                        startLine: diffData.startLine,
                        endLine: diffData.endLine,
                        oldContent: diffData.oldContent,
                        newContent: diffData.newContent,
                        contextBefore: diffData.contextBefore,
                        contextAfter: diffData.contextAfter,
                        contextStartLine: diffData.contextStartLine,
                        isReplaceMode: true,
                        showHeader: false
                    })
                )
            );

            debugLog('FileDiffViewer component created');
            return result;
        } else if (diffData?.loaded && !diffData.hasContent) {
            debugLog('Rendering FALLBACK (no content) for edit_file_replace');
            
            // Check if the tool was denied by user
            if (diffData.isDenied) {
                debugLog('Tool was DENIED by user');
                const displayName = getToolDisplayName(toolName);
                
                return React.createElement(Box, { flexDirection: "column", marginBottom, marginTop, marginLeft: 2 },
                    React.createElement(Box, { flexDirection: "row" },
                        React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                        React.createElement(Text, { color: 'white', bold: true }, displayName)
                    ),
                    React.createElement(Box, { marginLeft: 2, marginTop: 0 },
                        React.createElement(Text, { color: 'yellow' }, '✗ User denied this action')
                    )
                );
            }
            
            // fallback: 기본 tool 표시 (실패했지만 deny는 아닌 경우)
            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});

            return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop, marginLeft: 2 },
                React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                React.createElement(Text, { color: 'white', bold: true }, displayName),
                React.createElement(Text, { color: theme.text.secondary }, ` ${formattedArgs}`)
            );
        } else {
            debugLog('Rendering LOADING state for edit_file_replace');
            // loading 상태: 기본 tool 표시
            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});

            return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop, marginLeft: 2 },
                React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                React.createElement(Text, { color: 'white', bold: true }, displayName),
                React.createElement(Text, { color: theme.text.secondary }, ` ${formattedArgs}`)
            );
        }
    }

    // tool_start는 도구 이름을 흰색 굵게 표시 (edit_file_range와 edit_file_replace는 위에서 처리됨)
    if (type === 'tool_start' && toolName && toolName !== 'edit_file_range' && toolName !== 'edit_file_replace') {
        const displayName = getToolDisplayName(toolName);
        const formattedArgs = formatToolCall(toolName, item.args || {});

        // Check if this tool was denied by user
        const originalResult = item.result?.originalResult || nextItem?.result?.originalResult;
        const isDenied = originalResult?.operation_successful === false && 
                        originalResult?.error_message === 'User denied tool execution';

        if (isDenied) {
            return React.createElement(Box, { flexDirection: "column", marginBottom, marginTop, marginLeft: 2 },
                React.createElement(Box, { flexDirection: "row" },
                    React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                    React.createElement(Text, { color: 'white', bold: true }, displayName)
                ),
                React.createElement(Box, { marginLeft: 2, marginTop: 0 },
                    React.createElement(Text, { color: 'yellow' }, '✗ User denied this action')
                )
            );
        }

        return React.createElement(Box, { flexDirection: "column", marginBottom, marginTop, marginLeft: 2 },
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                React.createElement(Text, {
                    color: 'white',
                    bold: true
                }, displayName),
                React.createElement(Text, {
                    color: theme.text.secondary
                }, ` ${formattedArgs}`)
            )
        );
    }

    debugLog(`Rendering default display: icon="${config.icon}", text="${typeof text === 'string' ? text?.substring(0, 50) : JSON.stringify(text)?.substring(0, 50) || 'N/A'}..."`);
    debugLog(`marginBottom: ${marginBottom}, marginTop: ${marginTop}`);
    debugLog(`operations count: ${operations.length}`);
    debugLog('---------- StandardDisplay END ----------');

    // Check if this is a denied tool result
    // Don't display tool_result when denied (already shown in tool_start)
    const textStr = typeof text === 'string' ? text : '';
    const isDeniedResult = type === 'tool_result' &&
                          (textStr.includes('User denied tool execution') ||
                           textStr.includes('User denied code execution'));

    if (isDeniedResult) {
        // Don't display tool_result when denied (already shown in tool_start)
        return null;
    }

    // tool_result에서 실패 메시지인 경우 빨간색으로 표시
    const isErrorResult = type === 'tool_result' && originalResult?.operation_successful === false;
    const textColor = isErrorResult ? theme.status.error : theme.text.primary;

    // text가 구조화된 포맷인지 확인 (format_tool_result에서 반환)
    let textContent;
    if (text && typeof text === 'object' && text.type === 'formatted' && Array.isArray(text.parts)) {
        // 구조화된 parts를 렌더링
        debugLog(`Rendering formatted text with ${text.parts.length} parts`);
        textContent = React.createElement(Box, { flexDirection: "row" },
            ...text.parts.map((part, idx) =>
                React.createElement(Text, {
                    key: idx,
                    color: part.style?.color || textColor,
                    bold: part.style?.bold || false
                }, part.text)
            )
        );
    } else if (type === 'assistant' && typeof text === 'string') {
        // assistant 응답은 마크다운 렌더링 적용
        debugLog(`Rendering assistant response with Markdown, text length: ${text.length}, terminalWidth: ${terminalWidth || 80}`);
        textContent = renderMarkdown(text, { terminalWidth: terminalWidth || 80 });
    } else {
        // 일반 문자열
        debugLog(`Rendering plain text, type: ${type}, text length: ${typeof text === 'string' ? text.length : 'N/A'}`);
        textContent = React.createElement(Text, {
            color: textColor
        }, text);
    }

    return React.createElement(Box, { flexDirection: "column", marginBottom, marginTop, marginLeft: 2 },
        React.createElement(Box, { flexDirection: "row" },
            React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
            React.createElement(Box, { flexDirection: "column", flexGrow: 1 },
                textContent
            )
        )
    );
}

export function ConversationItem({ item, isPending = false, terminalWidth, nextItem, isLastInBatch = false }) {
    debugLog('========== ConversationItem RENDER ==========');
    debugLog(`Item type: ${item.type}`);
    debugLog(`Item toolName: ${item.toolName || 'N/A'}`);
    debugLog(`Item text: ${typeof item.text === 'string' ? item.text?.substring(0, 100) : JSON.stringify(item.text)?.substring(0, 100) || 'N/A'}...`);
    debugLog(`isPending: ${isPending}, isLastInBatch: ${isLastInBatch}`);
    debugLog(`nextItem: ${nextItem ? nextItem.type : 'null'}`);

    if (item.type === 'code_execution' && item.code && item.language) {
        const hasFollowingResult = nextItem && nextItem.type === 'code_result';
        debugLog('Rendering CodeExecutionDisplay');
        return React.createElement(CodeExecutionDisplay, { item, hasFollowingResult, nextItem });
    }

    if (item.type === 'code_result') {
        debugLog('Rendering CodeResultDisplay');
        return React.createElement(CodeResultDisplay, { item });
    }

    // tool_start 다음에 tool_result가 오는지 확인
    const hasFollowingResult = item.type === 'tool_start' && nextItem && nextItem.type === 'tool_result';
    debugLog(`hasFollowingResult: ${hasFollowingResult}`);
    debugLog('Rendering StandardDisplay');

    const result = React.createElement(StandardDisplay, { item, isPending, hasFollowingResult, nextItem, isLastInBatch, terminalWidth });

    return result;
}
