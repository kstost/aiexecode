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
    const marginBottom = hasFollowingResult ? 0 : 1;

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
        const originalResult = item.result?.originalResult;
        if (originalResult?.operation_successful === false) {
            diffData = { loaded: true, hasContent: false };
        } else {
            try {
                // 우선 메모리의 getFileSnapshot 시도, 없으면 히스토리 아이템에 저장된 스냅샷 사용
                let snapshot = getFileSnapshot(effectiveArgs.file_path);

                // 히스토리 복원 시: item.args에 fileSnapshot이 있을 수 있음
                if (!snapshot && item.args?.fileSnapshot) {
                    snapshot = item.args.fileSnapshot;
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
        const originalResult = item.result?.originalResult;
        if (originalResult?.operation_successful === false) {
            diffData = { loaded: true, hasContent: false };
        } else {
            try {
                // 우선 메모리의 getFileSnapshot 시도, 없으면 히스토리 아이템에 저장된 스냅샷 사용
                let snapshot = getFileSnapshot(effectiveArgs.file_path);

                // 히스토리 복원 시: item.args에 fileSnapshot이 있을 수 있음
                if (!snapshot && item.args?.fileSnapshot) {
                    snapshot = item.args.fileSnapshot;
                }

                const content = snapshot?.content || '';

                if (!content || !effectiveArgs.old_string) {
                    diffData = {
                        loaded: true,
                        hasContent: false
                    };
                } else {
                    // old_string이 있는 위치 찾기
                    const oldStringIndex = content.indexOf(effectiveArgs.old_string);
                    if (oldStringIndex === -1) {
                        diffData = {
                            loaded: true,
                            hasContent: false
                        };
                    } else {
                        // 라인 번호 계산
                        const beforeOldString = content.substring(0, oldStringIndex);
                        const startLine = beforeOldString.split('\n').length;

                        const oldStringLines = effectiveArgs.old_string.split('\n').length;
                        const endLine = startLine + oldStringLines - 1;

                        const lines = content.split('\n');
                        const actualLines = content === '' ? [] :
                            (content.endsWith('\n') ? lines.slice(0, -1) : lines);

                        // Extract context (2 lines before and after)
                        const contextLines = 2;
                        const contextStartIdx = Math.max(0, startLine - 1 - contextLines);
                        const contextEndIdx = Math.min(actualLines.length, endLine + contextLines);

                        const ctxBefore = actualLines.slice(contextStartIdx, startLine - 1);
                        const ctxAfter = actualLines.slice(endLine, contextEndIdx);

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
                    }
                }
            } catch (error) {
                diffData = {
                    loaded: true,
                    hasContent: false
                };
            }
        }
    }

    // tool_start는 다음에 tool_result가 있으면 marginBottom 0, 없으면 1
    // tool_result는 marginTop 0
    const marginBottom = (type === 'tool_start' && hasFollowingResult) ? 0 : 1;
    const marginTop = type === 'tool_result' ? 0 : undefined;

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
