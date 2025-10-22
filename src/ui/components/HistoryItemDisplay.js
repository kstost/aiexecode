/**
 * HistoryItemDisplay - Renders individual history items
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/semantic-tokens.js';
import { StreamingIndicator } from './StreamingIndicator.js';
import { colorizeCode } from '../utils/codeColorizer.js';
import { renderMarkdown } from '../utils/markdownRenderer.js';
import { FileDiffViewer } from './FileDiffViewer.js';
import { getToolDisplayName, formatToolCall } from '../../system/tool_registry.js';
import { getFileSnapshot } from '../../system/file_integrity.js';
import { promises as fs } from 'fs';
import { resolve, join, dirname } from 'path';
import { DEBUG_LOG_DIR } from '../../util/config.js';

// Debug logging configuration
const ENABLE_DEBUG_LOG = true;
const LOG_FILE = join(DEBUG_LOG_DIR, 'ui_history_display.log');

// Debug logging helper
async function debugLog(message) {
    if (!ENABLE_DEBUG_LOG) return;
    try {
        // 디렉토리가 없으면 생성
        await fs.mkdir(dirname(LOG_FILE), { recursive: true }).catch(() => { });
        const timestamp = new Date().toISOString();
        await fs.appendFile(LOG_FILE, `[${timestamp}] ${message}\n`).catch(() => { });
    } catch (err) {
        // Ignore logging errors
    }
}

const TYPE_CONFIG = {
    user: { icon: '> ', color: theme.text.accent, bold: true },
    assistant: { icon: '< ', color: theme.status.warning, bold: true },
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

function CodeExecutionDisplay({ item, hasFollowingResult }) {
    const config = getTypeConfig(item.type);

    const languageName = item.language.charAt(0).toUpperCase() + item.language.slice(1);

    // code_execution 다음에 code_result가 오면 marginBottom 0
    const marginBottom = 0;//hasFollowingResult ? 0 : 1;

    return React.createElement(Box, { flexDirection: "column", marginBottom },
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

    return React.createElement(Box, { marginBottom: 1, marginTop: 0, marginLeft: 2, flexGrow: 1 },
        React.createElement(Box, {
            flexDirection: "column",
            borderStyle: "round",
            borderColor: theme.border.default,
            paddingX: 1,
            width: "100%"
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

function StandardDisplay({ item, isPending, hasFollowingResult }) {
    const { type, text, operations = [], toolName, toolInput, args } = item;
    const config = getTypeConfig(type);

    // tool_start는 args를, tool_result는 toolInput을 사용
    const effectiveArgs = toolInput || args;

    // edit_file_range와 edit_file_replace의 diff 데이터를 동기적으로 로드 (tool_start에서만)
    let diffData = null;
    if (type === 'tool_start' && toolName === 'edit_file_range' && effectiveArgs) {
        // 파일 경로를 절대 경로로 정규화 (스냅샷은 절대 경로로 저장됨)
        const absolutePath = resolve(effectiveArgs.file_path);

        const originalResult = item.result?.originalResult;
        if (originalResult?.operation_successful === false) {
            diffData = { loaded: true, hasContent: false };
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

        const originalResult = item.result?.originalResult;
        debugLog(`originalResult exists: ${!!originalResult}`);
        debugLog(`operation_successful: ${originalResult?.operation_successful}`);

        if (originalResult?.operation_successful === false) {
            debugLog('Operation was NOT successful, skipping diff display');
            diffData = { loaded: true, hasContent: false };
        } else {
            try {
                // 우선 메모리의 getFileSnapshot 시도 (절대 경로 사용), 없으면 히스토리 아이템에 저장된 스냅샷 사용
                debugLog('Attempting to get file snapshot...');
                let snapshot = getFileSnapshot(absolutePath);
                debugLog(`Snapshot from getFileSnapshot: ${snapshot ? 'FOUND' : 'NOT FOUND'}`);

                // 히스토리 복원 시: item.args 또는 effectiveArgs에 fileSnapshot이 있을 수 있음
                if (!snapshot && item.args?.fileSnapshot) {
                    debugLog('Using fileSnapshot from item.args');
                    snapshot = item.args.fileSnapshot;
                } else if (!snapshot && effectiveArgs?.fileSnapshot) {
                    debugLog('Using fileSnapshot from effectiveArgs');
                    snapshot = effectiveArgs.fileSnapshot;
                }

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

                        // 부분 문자열 검색
                        if (effectiveArgs.old_string.length > 20) {
                            const prefix = effectiveArgs.old_string.substring(0, 20);
                            const prefixIndex = content.indexOf(prefix);
                            debugLog(`First 20 chars of old_string found at: ${prefixIndex}`);
                        }

                        diffData = {
                            loaded: true,
                            hasContent: false
                        };
                    } else {
                        debugLog('old_string FOUND in snapshot');
                        // 라인 번호 계산
                        const beforeOldString = content.substring(0, oldStringIndex);
                        const startLine = beforeOldString.split('\n').length;

                        const oldStringLines = effectiveArgs.old_string.split('\n').length;
                        const endLine = startLine + oldStringLines - 1;

                        debugLog(`Calculated startLine: ${startLine}, endLine: ${endLine}`);

                        const lines = content.split('\n');
                        const actualLines = content === '' ? [] :
                            (content.endsWith('\n') ? lines.slice(0, -1) : lines);

                        // Extract context (2 lines before and after)
                        const contextLines = 2;
                        const contextStartIdx = Math.max(0, startLine - 1 - contextLines);
                        const contextEndIdx = Math.min(actualLines.length, endLine + contextLines);

                        const ctxBefore = actualLines.slice(contextStartIdx, startLine - 1);
                        const ctxAfter = actualLines.slice(endLine, contextEndIdx);

                        debugLog(`Context before lines: ${ctxBefore.length}, after lines: ${ctxAfter.length}`);

                        diffData = {
                            loaded: true,
                            hasContent: true,
                            oldContent: effectiveArgs.old_string,
                            newContent: effectiveArgs.new_string,
                            contextBefore: ctxBefore,
                            contextAfter: ctxAfter,
                            contextStartLine: contextStartIdx + 1,
                            startLine: startLine,
                            endLine: endLine
                        };

                        debugLog('diffData created successfully with hasContent: true');
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

    // tool_start는 다음에 tool_result가 있으면 marginBottom 0, 없으면 1
    // tool_result는 marginTop 0
    // const marginBottom = (type === 'tool_start' && hasFollowingResult) ? 0 : 1;
    const marginBottom = 1;//(type === 'tool_start' && hasFollowingResult) ? 0 : 1;
    const marginTop = 0;//type === 'tool_result' ? 0 : undefined;

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

    // 시스템 메시지는 마크다운 렌더링 적용
    if (type === 'system') {
        return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop },
            React.createElement(Text, {
                color: config.color,
                bold: config.bold
            }, config.icon),
            React.createElement(Box, { flexDirection: "column", flexGrow: 1 },
                renderMarkdown(text)
            )
        );
    }

    // 에러 메시지는 빨간색으로 강조하고 마크다운 없이 표시
    if (type === 'error') {
        return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop },
            React.createElement(Text, {
                color: config.color,
                bold: config.bold
            }, config.icon),
            React.createElement(Box, { flexDirection: "column", flexGrow: 1 },
                React.createElement(Text, { color: theme.status.error }, text)
            )
        );
    }

    // edit_file_range와 edit_file_replace: tool_result는 완전히 숨기고 tool_start만 표시
    if (type === 'tool_result' && (toolName === 'edit_file_range' || toolName === 'edit_file_replace')) {
        return null;
    }

    // tool_start이고 edit_file_range인 경우 FileDiffViewer 표시
    if (type === 'tool_start' && toolName === 'edit_file_range' && effectiveArgs) {
        if (diffData?.loaded && diffData.hasContent) {
            const result = React.createElement(Box, { flexDirection: "column", marginBottom, marginTop, width: "100%" },
                React.createElement(Box, { flexDirection: "row" },
                    React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                    React.createElement(Text, {
                        color: theme.text.primary
                    }, text)
                ),
                React.createElement(Box, { marginLeft: 2, width: "100%" },
                    React.createElement(FileDiffViewer, {
                        filePath: effectiveArgs.file_path,
                        startLine: effectiveArgs.start_line,
                        endLine: effectiveArgs.end_line,
                        oldContent: diffData.oldContent,
                        newContent: effectiveArgs.new_content,
                        contextBefore: diffData.contextBefore,
                        contextAfter: diffData.contextAfter,
                        contextStartLine: diffData.contextStartLine
                    })
                )
            );

            return result;
        } else if (diffData?.loaded && !diffData.hasContent) {
            // fallback: 기본 tool 표시
            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});

            return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop },
                React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                React.createElement(Text, { color: 'white', bold: true }, displayName),
                React.createElement(Text, { color: theme.text.secondary }, ` ${formattedArgs}`)
            );
        } else {
            // loading 상태: 기본 tool 표시
            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});

            return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop },
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
            debugLog(`  newContent length: ${effectiveArgs.new_string?.length || 0}`);

            const result = React.createElement(Box, { flexDirection: "column", marginBottom, marginTop, width: "100%" },
                React.createElement(Box, { flexDirection: "row" },
                    React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                    React.createElement(Text, {
                        color: theme.text.primary
                    }, text)
                ),
                React.createElement(Box, { marginLeft: 2, width: "100%" },
                    React.createElement(FileDiffViewer, {
                        filePath: effectiveArgs.file_path,
                        startLine: diffData.startLine,
                        endLine: diffData.endLine,
                        oldContent: diffData.oldContent,
                        newContent: effectiveArgs.new_string,
                        contextBefore: diffData.contextBefore,
                        contextAfter: diffData.contextAfter,
                        contextStartLine: diffData.contextStartLine
                    })
                )
            );

            debugLog('FileDiffViewer component created');
            return result;
        } else if (diffData?.loaded && !diffData.hasContent) {
            debugLog('Rendering FALLBACK (no content) for edit_file_replace');
            // fallback: 기본 tool 표시
            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});

            return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop },
                React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                React.createElement(Text, { color: 'white', bold: true }, displayName),
                React.createElement(Text, { color: theme.text.secondary }, ` ${formattedArgs}`)
            );
        } else {
            debugLog('Rendering LOADING state for edit_file_replace');
            // loading 상태: 기본 tool 표시
            const displayName = getToolDisplayName(toolName);
            const formattedArgs = formatToolCall(toolName, effectiveArgs || {});

            return React.createElement(Box, { flexDirection: "row", marginBottom, marginTop },
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

        return React.createElement(Box, { flexDirection: "column", marginBottom, marginTop },
            React.createElement(Box, { flexDirection: "row" },
                React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
                React.createElement(Text, {
                    color: 'white',
                    bold: true
                }, displayName),
                React.createElement(Text, {
                    color: theme.text.secondary
                }, ` ${formattedArgs}`)
            ),

            operations.length > 0 && React.createElement(Box, {
                flexDirection: "column",
                marginLeft: 2,
                marginTop: 1
            },
                operations.map((op, index) =>
                    React.createElement(OperationDisplay, {
                        key: op.id || index,
                        operation: op,
                        isPending
                    })
                )
            ),

            isPending && item.isStreaming && React.createElement(StreamingIndicator, {
                message: item.streamingMessage || 'Processing...'
            })
        );
    }

    return React.createElement(Box, { flexDirection: "column", marginBottom, marginTop },
        React.createElement(Box, { flexDirection: "row" },
            React.createElement(Text, { color: config.color, bold: config.bold }, config.icon),
            React.createElement(Text, {
                color: theme.text.primary
            }, text)
        ),

        operations.length > 0 && React.createElement(Box, {
            flexDirection: "column",
            marginLeft: 2,
            marginTop: 1
        },
            operations.map((op, index) =>
                React.createElement(OperationDisplay, {
                    key: op.id || index,
                    operation: op,
                    isPending
                })
            )
        ),

        isPending && item.isStreaming && React.createElement(StreamingIndicator, {
            message: item.streamingMessage || 'Processing...'
        })
    );
}

export function HistoryItemDisplay({ item, isPending = false, terminalWidth, nextItem }) {
    if (item.type === 'code_execution' && item.code && item.language) {
        const hasFollowingResult = nextItem && nextItem.type === 'code_result';
        return React.createElement(CodeExecutionDisplay, { item, hasFollowingResult });
    }

    if (item.type === 'code_result') {
        return React.createElement(CodeResultDisplay, { item });
    }

    // tool_start 다음에 tool_result가 오는지 확인
    const hasFollowingResult = item.type === 'tool_start' && nextItem && nextItem.type === 'tool_result';

    const result = React.createElement(StandardDisplay, { item, isPending, hasFollowingResult });

    return result;
}

const OPERATION_STATUS = {
    running: { icon: '⟳', color: theme.status.info },
    completed: { icon: '✓', color: theme.status.success },
    error: { icon: '✗', color: theme.status.error },
    pending: { icon: '○', color: theme.text.secondary },
    default: { icon: '•', color: theme.text.secondary }
};

function getOperationStatus(status) {
    return OPERATION_STATUS[status] || OPERATION_STATUS.default;
}

function OperationDisplay({ operation, isPending }) {
    const { name, status, description, progress } = operation;
    const statusConfig = getOperationStatus(status);

    return React.createElement(Box, { flexDirection: "column", marginBottom: 0 },
        React.createElement(Box, { flexDirection: "row" },
            React.createElement(Text, { color: statusConfig.color }, `${statusConfig.icon} `),
            React.createElement(Text, { color: theme.text.primary }, name),
            description && React.createElement(Text, {
                color: theme.text.secondary,
                dimColor: true
            }, ` - ${description}`)
        ),
        progress && React.createElement(Box, { marginLeft: 2 },
            React.createElement(Text, { color: theme.text.secondary }, progress)
        )
    );
}
