/**
 * ToolApprovalPrompt - 도구 실행 승인 UI
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../design/themeColors.js';
import { FileDiffViewer } from './FileDiffViewer.js';
import { common, createLowlight } from 'lowlight';
import { getToolDisplayName } from '../../system/tool_registry.js';
import { getFileSnapshot } from '../../system/file_integrity.js';
import { resolve } from 'path';
import { toDisplayPath } from '../../util/path_helper.js';
import { prepareEditReplaceDiff } from '../utils/diffUtils.js';

const lowlight = createLowlight(common);

export function ToolApprovalPrompt({ toolName, args, onDecision, mcpToolInfo = null }) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const choices = [
        { label: '✓ Allow (this time only)', value: 'allow' },
        { label: '⊚ Always Allow (for this session)', value: 'always' },
        { label: '✗ Deny', value: 'deny' }
    ];

    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex(prev => (prev - 1 + choices.length) % choices.length);
        } else if (key.downArrow) {
            setSelectedIndex(prev => (prev + 1) % choices.length);
        } else if (key.return) {
            onDecision(choices[selectedIndex].value);
        } else if (input === 'q' || key.escape) {
            // q 또는 ESC 누르면 도구만 거부 (세션은 계속)
            onDecision('deny');
        }
    });

    const displayName = getToolDisplayName(toolName);

    return React.createElement(Box, {
        flexDirection: 'column',
        borderStyle: 'round',
        borderColor: theme.brand.dark,
        paddingX: 1,
        flexGrow: 1
    },
        // Tool info
        React.createElement(Box, { flexDirection: 'column', marginBottom: 0, marginTop: 0 },
            React.createElement(Box, { marginBottom: 0 },
                React.createElement(Text, { bold: true, color: theme.brand.light }, 'Tool '),
                React.createElement(Text, { color: 'white' }, displayName)
            ),
            renderToolArgs(toolName, args, mcpToolInfo)
        ),

        // Choices
        React.createElement(Box, { flexDirection: 'column' },
            // React.createElement(Text, { dimColor: true }, 'Select an option:'),
            ...choices.map((choice, index) =>
                React.createElement(Box, { key: index, marginLeft: 1 },
                    React.createElement(Text, {
                        color: index === selectedIndex ? theme.brand.light : 'white',
                        bold: index === selectedIndex
                    }, index === selectedIndex ? '› ' : '  '),
                    React.createElement(Text, {
                        color: index === selectedIndex ? theme.brand.light : 'white'
                    }, choice.label)
                )
            )
        ),

        // Footer
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { dimColor: true }, '↑↓: Navigate  Enter: Confirm  q/Esc: Deny')
        )
    );
}

// Helper functions for syntax highlighting (copied from FileDiffViewer)
const syntaxTheme = {
    keyword: 'magenta',
    string: 'green',
    number: 'cyan',
    comment: 'gray',
    function: 'blue',
    variable: 'white',
    operator: 'yellow',
    default: 'white'
};

function getColorForClass(className) {
    if (className.includes('keyword')) return syntaxTheme.keyword;
    if (className.includes('string')) return syntaxTheme.string;
    if (className.includes('number')) return syntaxTheme.number;
    if (className.includes('comment')) return syntaxTheme.comment;
    if (className.includes('function')) return syntaxTheme.function;
    if (className.includes('variable')) return syntaxTheme.variable;
    if (className.includes('operator')) return syntaxTheme.operator;
    return syntaxTheme.default;
}

function renderHastNode(node, inheritedColor) {
    if (node.type === 'text') {
        const color = inheritedColor || syntaxTheme.default;
        return React.createElement(Text, { color }, node.value);
    }

    if (node.type === 'element') {
        const nodeClasses = node.properties?.className || [];
        let elementColor = inheritedColor;

        for (const className of nodeClasses) {
            const color = getColorForClass(className);
            if (color) {
                elementColor = color;
                break;
            }
        }

        const children = node.children?.map((child, index) =>
            React.createElement(React.Fragment, { key: index },
                renderHastNode(child, elementColor)
            )
        );

        return React.createElement(React.Fragment, null, children);
    }

    if (node.type === 'root') {
        if (!node.children || node.children.length === 0) {
            return null;
        }

        return node.children?.map((child, index) =>
            React.createElement(React.Fragment, { key: index },
                renderHastNode(child, inheritedColor)
            )
        );
    }

    return null;
}

function highlightCode(code, language) {
    try {
        const highlighted = !language || !lowlight.registered(language)
            ? lowlight.highlightAuto(code)
            : lowlight.highlight(language, code);

        const rendered = renderHastNode(highlighted, undefined);
        return rendered !== null ? rendered : code;
    } catch (error) {
        return code;
    }
}

function detectLanguage(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'h': 'c',
        'hpp': 'cpp',
        'css': 'css',
        'html': 'html',
        'json': 'json',
        'xml': 'xml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'sh': 'bash',
        'bash': 'bash',
        'md': 'markdown',
        'go': 'go',
        'rs': 'rust',
        'rb': 'ruby',
        'php': 'php',
        'sql': 'sql'
    };
    return langMap[ext] || null;
}

function renderToolArgs(toolName, args, mcpToolInfo = null) {
    // MCP Tool인 경우
    if (mcpToolInfo) {
        const jsonString = JSON.stringify(args, null, 2);
        const jsonLines = jsonString.split('\n');

        return React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
            // Server info
            React.createElement(Box, { marginBottom: 0 },
                React.createElement(Text, { bold: true, color: theme.brand.light }, 'Server '),
                React.createElement(Text, { color: 'white' }, mcpToolInfo.server)
            ),
            // Description (박스 안에 담기)
            mcpToolInfo.description && React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
                React.createElement(Text, { bold: true, color: theme.brand.light }, 'Description'),
                React.createElement(Box, {
                    borderStyle: 'single',
                    borderColor: '#444444',
                    paddingX: 1,
                    marginTop: 0
                },
                    React.createElement(Text, { color: 'white' }, mcpToolInfo.description)
                )
            ),
            // Arguments (JSON 하이라이팅)
            React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
                React.createElement(Text, { bold: true, color: theme.brand.light }, 'Arguments'),
                React.createElement(Box, {
                    borderStyle: 'single',
                    borderColor: '#444444',
                    paddingX: 1,
                    marginTop: 0,
                    flexDirection: 'column'
                },
                    ...jsonLines.map((line, index) =>
                        React.createElement(Box, { key: index },
                            React.createElement(Text, {},
                                highlightCode(line, 'json')
                            )
                        )
                    )
                )
            )
        );
    }

    if (toolName === 'bash') {
        const script = args.script || '';
        const lines = script.split('\n');

        return React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
            React.createElement(Box, {
                borderStyle: 'single',
                borderColor: '#444444',
                paddingX: 1,
                marginTop: 0,
                flexDirection: 'column'
            },
                ...lines.map((line, index) =>
                    React.createElement(Box, { key: index },
                        React.createElement(Text, { color: 'gray', dimColor: true },
                            String(index + 1).padStart(3, ' ') + ' '
                        ),
                        React.createElement(Text, {},
                            highlightCode(line, 'bash')
                        )
                    )
                )
            )
        );
    }

    if (toolName === 'run_python_code') {
        const code = args.code || '';
        const lines = code.split('\n');

        return React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
            React.createElement(Box, {
                borderStyle: 'single',
                borderColor: '#444444',
                paddingX: 1,
                marginTop: 0,
                flexDirection: 'column'
            },
                ...lines.map((line, index) =>
                    React.createElement(Box, { key: index },
                        React.createElement(Text, { color: 'gray', dimColor: true },
                            String(index + 1).padStart(3, ' ') + ' '
                        ),
                        React.createElement(Text, {},
                            highlightCode(line, 'python')
                        )
                    )
                )
            )
        );
    }

    if (toolName === 'write_file') {
        const content = args.content || '';
        const language = detectLanguage(args.file_path || '');
        const lines = content.split('\n');

        return React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
            React.createElement(Box, {},
                React.createElement(Text, { bold: true, color: theme.brand.light }, 'File '),
                React.createElement(Text, { color: 'white' }, toDisplayPath(args.file_path))
            ),
            React.createElement(Box, {
                borderStyle: 'single',
                borderColor: '#444444',
                paddingX: 1,
                marginTop: 0,
                flexDirection: 'column'
            },
                ...lines.map((line, index) =>
                    React.createElement(Box, { key: index },
                        React.createElement(Text, { color: 'gray', dimColor: true },
                            String(index + 1).padStart(3, ' ') + ' '
                        ),
                        React.createElement(Text, {},
                            highlightCode(line, language)
                        )
                    )
                )
            )
        );
    }

    if (toolName === 'edit_file_range') {
        const [oldContent, setOldContent] = useState(null);
        const [contextBefore, setContextBefore] = useState([]);
        const [contextAfter, setContextAfter] = useState([]);
        const [contextStartLine, setContextStartLine] = useState(null);

        useEffect(() => {
            function loadFileContent() {
                try {
                    // 스냅샷에서 파일 내용 조회 (절대 경로로 변환)
                    const absolutePath = resolve(args.file_path);
                    const snapshot = getFileSnapshot(absolutePath);
                    const content = snapshot?.content || '';

                    if (!content) {
                        setOldContent('');
                        setContextBefore([]);
                        setContextAfter([]);
                        setContextStartLine(args.start_line);
                        return;
                    }

                    const lines = content.split('\n');

                    // Handle files without trailing newline
                    const actualLines = content === '' ? [] :
                        (content.endsWith('\n') ? lines.slice(0, -1) : lines);

                    // Extract old content (the lines being edited)
                    const old = actualLines.slice(args.start_line - 1, args.end_line).join('\n');
                    setOldContent(old);

                    // Extract context (2 lines before and after)
                    const contextLines = 2;
                    const contextStartIdx = Math.max(0, args.start_line - 1 - contextLines);
                    const contextEndIdx = Math.min(actualLines.length, args.end_line + contextLines);

                    const ctxBefore = actualLines.slice(contextStartIdx, args.start_line - 1);
                    const ctxAfter = actualLines.slice(args.end_line, contextEndIdx);

                    setContextBefore(ctxBefore);
                    setContextAfter(ctxAfter);
                    setContextStartLine(contextStartIdx + 1);
                } catch (error) {
                    // File might not exist yet or other error
                    setOldContent('');
                    setContextBefore([]);
                    setContextAfter([]);
                }
            }

            loadFileContent();
        }, [args.file_path, args.start_line, args.end_line]);

        return React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
            React.createElement(Box, { marginBottom: 0 },
                React.createElement(Text, { bold: true, color: theme.brand.light }, 'File '),
                React.createElement(Text, { color: 'white' }, toDisplayPath(args.file_path))
            ),
            oldContent !== null ? React.createElement(FileDiffViewer, {
                filePath: args.file_path,
                startLine: args.start_line,
                endLine: args.end_line,
                oldContent: oldContent,
                newContent: args.new_content || '',
                contextBefore: contextBefore,
                contextAfter: contextAfter,
                contextStartLine: contextStartLine,
                showHeader: false
            }) : React.createElement(Text, { color: 'gray' }, 'Loading...')
        );
    }

    if (toolName === 'edit_file_replace') {
        const [diffData, setDiffData] = useState(null);

        useEffect(() => {
            function loadFileContent() {
                // 스냅샷에서 파일 내용 조회 (절대 경로로 변환)
                const absolutePath = resolve(args.file_path);
                const snapshot = getFileSnapshot(absolutePath);
                const content = snapshot?.content || '';

                // Use shared diff preparation logic
                const result = prepareEditReplaceDiff(
                    args.old_string || '',
                    args.new_string || '',
                    content,
                    false
                );

                setDiffData(result);
            }

            loadFileContent();
        }, [args.file_path, args.old_string, args.new_string]);

        return React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
            React.createElement(Box, { marginBottom: 0 },
                React.createElement(Text, { bold: true, color: theme.brand.light }, 'File '),
                React.createElement(Text, { color: 'white' }, toDisplayPath(args.file_path))
            ),
            diffData ? (
                diffData.error ?
                    React.createElement(Text, { color: 'red' }, `Error: ${diffData.error}`) :
                    React.createElement(FileDiffViewer, {
                        filePath: args.file_path,
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
            ) : React.createElement(Text, { color: 'gray' }, 'Loading...')
        );
    }

    // 기타 도구
    return React.createElement(Box, { flexDirection: 'column', marginTop: 0 },
        React.createElement(Text, { bold: true, color: theme.brand.light }, 'Arguments'),
        React.createElement(Box, {
            borderStyle: 'single',
            borderColor: 'gray',
            paddingX: 1,
            marginTop: 0
        },
            React.createElement(Text, { color: 'white' }, JSON.stringify(args, null, 2))
        )
    );
}
