/**
 * FileDiffViewer - Unified diff viewer for file changes
 */

import React from 'react';
import { Box, Text } from 'ink';
import { common, createLowlight } from 'lowlight';
import { diffLines } from 'diff';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { DEBUG_LOG_DIR } from '../../util/config.js';

const lowlight = createLowlight(common);

// Debug logging configuration
const ENABLE_DEBUG_LOG = true;
const LOG_FILE = join(DEBUG_LOG_DIR, 'ui_file_diff_viewer.log');

// Debug logging helper
async function debugLog(message) {
    if (!ENABLE_DEBUG_LOG) return;
    try {
        // 디렉토리가 없으면 생성
        await fs.mkdir(dirname(LOG_FILE), { recursive: true }).catch(() => {});
        const timestamp = new Date().toISOString();
        await fs.appendFile(LOG_FILE, `[${timestamp}] ${message}\n`).catch(() => {});
    } catch (err) {
        // Ignore logging errors
    }
}

/**
 * Theme color mapping for syntax highlighting
 */
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

/**
 * Get color for syntax token class
 */
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

/**
 * Render HAST node to React elements
 */
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

/**
 * Highlight a single line of code
 */
function highlightLine(line, language) {
    try {
        const highlighted = !language || !lowlight.registered(language)
            ? lowlight.highlightAuto(line)
            : lowlight.highlight(language, line);

        const rendered = renderHastNode(highlighted, undefined);
        return rendered !== null ? rendered : line;
    } catch (error) {
        return line;
    }
}

/**
 * Detect language from file extension
 */
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

/**
 * Parse content lines - no file reading
 */
function parseContentLines(oldContent, newContent) {
    const beforeLines = oldContent ? oldContent.split('\n') : [];
    const afterLines = newContent ? newContent.split('\n') : [];

    return {
        beforeLines,
        afterLines
    };
}

/**
 * Calculate diff between before and after content using diffLines algorithm
 */
function calculateDiff(beforeLines, afterLines) {
    const beforeText = beforeLines.join('\n');
    const afterText = afterLines.join('\n');

    const changes = diffLines(beforeText, afterText);
    const result = [];

    for (const change of changes) {
        const lines = change.value.split('\n');
        // Remove trailing empty line if exists
        if (lines[lines.length - 1] === '') {
            lines.pop();
        }

        for (const line of lines) {
            if (change.added) {
                result.push({ type: 'added', newLine: line });
            } else if (change.removed) {
                result.push({ type: 'removed', oldLine: line });
            } else {
                result.push({ type: 'unchanged', oldLine: line, newLine: line });
            }
        }
    }

    return result;
}

/**
 * Render a single line in unified diff view
 */
function UnifiedDiffLine({ oldLineNum, newLineNum, content, type, language }) {
    // In unified diff format, we show both old and new line numbers
    // Format: "old new" or just one if the other is null
    let lineNumStr;

    if (type === 'removed') {
        // Removed lines: show old line number only
        lineNumStr = oldLineNum !== null ? `${String(oldLineNum).padStart(4, ' ')} ` : '     ';
    } else if (type === 'added') {
        // Added lines: show new line number only
        lineNumStr = newLineNum !== null ? `${String(newLineNum).padStart(4, ' ')} ` : '     ';
    } else {
        // Unchanged lines: show new line number (the line number in the result file)
        lineNumStr = newLineNum !== null ? `${String(newLineNum).padStart(4, ' ')} ` : '     ';
    }

    // Get prefix and content based on type
    let prefix = ' ';
    let contentStr = '';

    if (type === 'removed') {
        prefix = '-';
        contentStr = content || '';
    } else if (type === 'added') {
        prefix = '+';
        contentStr = content || '';
    } else {
        prefix = ' ';
        contentStr = content || '';
    }

    // Determine colors based on line type
    if (type === 'removed') {
        return React.createElement(Box, { backgroundColor: '#692121ff', width: '100%' },
            React.createElement(Text, { color: '#c0a6a6ff' }, lineNumStr),
            React.createElement(Text, { color: '#ffffff' }, `${prefix} ${contentStr}`)
        );
    } else if (type === 'added') {
        return React.createElement(Box, { backgroundColor: '#216931ff', width: '100%' },
            React.createElement(Text, { color: '#9fbca5ff' }, lineNumStr),
            React.createElement(Text, { color: '#ffffff' }, `${prefix} ${contentStr}`)
        );
    } else {
        // Unchanged lines: gray text with dimming
        return React.createElement(Box, { width: '100%' },
            React.createElement(Text, { color: '#898989ff', dimColor: true }, lineNumStr),
            React.createElement(Text, { color: '#ffffff', dimColor: true }, `${prefix} ${contentStr}`)
        );
    }
}

/**
 * Main FileDiffViewer component - Unified diff format
 */
export function FileDiffViewer({ filePath, startLine, endLine, oldContent, newContent, contextBefore = [], contextAfter = [], contextStartLine = null }) {
    debugLog('========== FileDiffViewer RENDER START ==========');
    debugLog(`filePath: ${filePath}`);
    debugLog(`startLine: ${startLine}, endLine: ${endLine}`);
    debugLog(`oldContent length: ${oldContent?.length || 0} bytes`);
    debugLog(`newContent length: ${newContent?.length || 0} bytes`);
    debugLog(`contextBefore lines: ${contextBefore.length}`);
    debugLog(`contextAfter lines: ${contextAfter.length}`);
    debugLog(`contextStartLine: ${contextStartLine}`);

    try {
        debugLog(`Parsing content lines...`);
        const { beforeLines, afterLines } = parseContentLines(oldContent, newContent);
        debugLog(`beforeLines: ${beforeLines.length}, afterLines: ${afterLines.length}`);

        const language = detectLanguage(filePath);
        debugLog(`Detected language: ${language || 'none'}`);

        // contextStartLine이 제공되지 않으면 startLine - contextBefore.length로 계산
        const actualContextStartLine = contextStartLine !== null ? contextStartLine : (startLine - contextBefore.length);
        debugLog(`actualContextStartLine: ${actualContextStartLine}`);

        debugLog(`Calculating diff...`);
        const diff = calculateDiff(beforeLines, afterLines);
        debugLog(`Diff items: ${diff.length}`);

        // Calculate line count changes for header
        const removedCount = diff.filter(item => item.type === 'removed').length;
        const addedCount = diff.filter(item => item.type === 'added').length;
        const unchangedCount = diff.filter(item => item.type === 'unchanged').length;
        const afterEndLine = endLine + (addedCount - removedCount);

        debugLog(`Diff statistics:`);
        debugLog(`  Removed: ${removedCount}`);
        debugLog(`  Added: ${addedCount}`);
        debugLog(`  Unchanged: ${unchangedCount}`);
        debugLog(`  afterEndLine: ${afterEndLine}`);

        const element = React.createElement(Box, { flexDirection: 'column', width: '95%', marginBottom: 2 },
            React.createElement(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: '#4a4a4a' },
                // Header
                React.createElement(Box, { marginBottom: 1 },
                    React.createElement(Text, { bold: true, color: 'cyan' }, ` ${filePath} `),
                    React.createElement(Text, { color: '#545454' },
                        `(Lines ${startLine}-${endLine} → ${startLine}-${afterEndLine})`
                    )
                ),

                // Context before
                ...contextBefore.map((line, idx) => {
                    const lineNum = actualContextStartLine + idx;
                    return React.createElement(UnifiedDiffLine, {
                        key: `ctx-before-${idx}`,
                        oldLineNum: lineNum,
                        newLineNum: lineNum,
                        content: line,
                        type: 'unchanged',
                        language
                    });
                }),

                // Changed lines - show all (unchanged, removed, added)
                (() => {
                    const rows = [];
                    let oldLineNum = startLine;
                    let newLineNum = startLine;

                    for (let i = 0; i < diff.length; i++) {
                        const item = diff[i];

                        if (item.type === 'removed') {
                            rows.push(
                                React.createElement(UnifiedDiffLine, {
                                    key: `diff-removed-${oldLineNum}-${i}`,
                                    oldLineNum: oldLineNum,
                                    newLineNum: null,
                                    content: item.oldLine,
                                    type: 'removed',
                                    language
                                })
                            );
                            oldLineNum++;
                        } else if (item.type === 'added') {
                            rows.push(
                                React.createElement(UnifiedDiffLine, {
                                    key: `diff-added-${newLineNum}-${i}`,
                                    oldLineNum: null,
                                    newLineNum: newLineNum,
                                    content: item.newLine,
                                    type: 'added',
                                    language
                                })
                            );
                            newLineNum++;
                        } else if (item.type === 'unchanged') {
                            // Unchanged lines in the edited range
                            rows.push(
                                React.createElement(UnifiedDiffLine, {
                                    key: `diff-unchanged-${oldLineNum}-${i}`,
                                    oldLineNum: oldLineNum,
                                    newLineNum: newLineNum,
                                    content: item.oldLine,
                                    type: 'unchanged',
                                    language
                                })
                            );
                            oldLineNum++;
                            newLineNum++;
                        }
                    }

                    return rows;
                })(),

                // Context after - use the final line number after all changes
                ...contextAfter.map((line, idx) => {
                    const lineNum = afterEndLine + 1 + idx;
                    return React.createElement(UnifiedDiffLine, {
                        key: `ctx-after-${idx}`,
                        oldLineNum: lineNum,
                        newLineNum: lineNum,
                        content: line,
                        type: 'unchanged',
                        language
                    });
                })
            )
        );

        debugLog(`React element created successfully`);
        debugLog('========== FileDiffViewer RENDER END (SUCCESS) ==========');
        return element;
    } catch (error) {
        debugLog(`========== FileDiffViewer RENDER ERROR ==========`);
        debugLog(`Error: ${error.message}`);
        debugLog(`Stack: ${error.stack}`);
        debugLog('========== FileDiffViewer RENDER END (ERROR) ==========');

        return React.createElement(Box, { flexDirection: 'column' },
            React.createElement(Text, { color: 'red' }, `Diff error: ${error.message}`)
        );
    }
}
