/**
 * FileDiffViewer - Unified diff viewer for file changes
 */

import React from 'react';
import { Box, Text } from 'ink';
import { common, createLowlight } from 'lowlight';
import { diffLines, diffWords, diffChars } from 'diff';
import { createDebugLogger } from '../../util/debug_log.js';
import { toDisplayPath } from '../../util/path_helper.js';

const lowlight = createLowlight(common);

const debugLog = createDebugLogger('ui_components.log', 'FileDiffViewer');

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
 * Normalize tabs to spaces for consistent terminal display
 * Terminal renders tabs at 8-char boundaries, but editors typically use 2 or 4 spaces
 * This ensures the diff displays the same as in the user's editor
 */
function normalizeTabs(text, tabWidth = 4) {
    if (!text) return text;
    // Replace each tab with the specified number of spaces
    return text.replace(/\t/g, ' '.repeat(tabWidth));
}

/**
 * Parse content lines - no file reading
 * Normalizes tabs to spaces for consistent terminal display
 */
function parseContentLines(oldContent, newContent, tabWidth = 4) {
    debugLog('[parseContentLines] START');
    debugLog(`[parseContentLines] oldContent type: ${typeof oldContent}, length: ${oldContent?.length}`);
    debugLog(`[parseContentLines] oldContent raw: ${JSON.stringify(oldContent)}`);
    debugLog(`[parseContentLines] newContent type: ${typeof newContent}, length: ${newContent?.length}`);
    debugLog(`[parseContentLines] newContent raw: ${JSON.stringify(newContent)}`);

    // Handle null, undefined, and empty string
    let beforeLines = [];
    let afterLines = [];

    if (oldContent !== null && oldContent !== undefined) {
        // Normalize tabs before splitting to ensure consistent display
        const normalized = normalizeTabs(oldContent, tabWidth);
        debugLog(`[parseContentLines] oldContent normalized: ${JSON.stringify(normalized)}`);
        // Split on newlines
        // Note: empty string becomes [''] which represents a single empty line
        beforeLines = normalized.split('\n');
        debugLog(`[parseContentLines] beforeLines count: ${beforeLines.length}`);
        beforeLines.forEach((line, idx) => {
            debugLog(`[parseContentLines] beforeLines[${idx}]: ${JSON.stringify(line)}`);
        });
    }

    if (newContent !== null && newContent !== undefined) {
        // Normalize tabs before splitting to ensure consistent display
        const normalized = normalizeTabs(newContent, tabWidth);
        debugLog(`[parseContentLines] newContent normalized: ${JSON.stringify(normalized)}`);
        // Split on newlines
        // Note: empty string becomes [''] which represents a single empty line
        // This is intentional: replacing content with "" should leave an empty line, not delete the line
        afterLines = normalized.split('\n');
        debugLog(`[parseContentLines] afterLines count: ${afterLines.length}`);
        afterLines.forEach((line, idx) => {
            debugLog(`[parseContentLines] afterLines[${idx}]: ${JSON.stringify(line)}`);
        });
    }

    debugLog('[parseContentLines] END');
    return {
        beforeLines,
        afterLines
    };
}

/**
 * Calculate diff between before and after content using diffLines algorithm
 * Simply delegates to diff library and returns the result without post-processing
 */
function calculateDiff(beforeLines, afterLines) {
    debugLog('[calculateDiff] START');
    debugLog(`[calculateDiff] beforeLines.length: ${beforeLines.length}`);
    debugLog(`[calculateDiff] afterLines.length: ${afterLines.length}`);

    // Handle edge case: both empty (both are [''])
    if (beforeLines.length === 1 && afterLines.length === 1 &&
        beforeLines[0] === '' && afterLines[0] === '') {
        debugLog('[calculateDiff] Both are single empty lines - no change');
        return [{
            type: 'unchanged',
            oldLine: '',
            newLine: '',
            isWordDiff: false
        }];
    }

    // Handle edge case: only before is empty (null/undefined) - all additions
    if (beforeLines.length === 0) {
        debugLog('[calculateDiff] Before empty - all additions');
        return afterLines.map(line => ({
            type: 'added',
            newLine: line,
            isWordDiff: false
        }));
    }

    // Handle edge case: only after is empty (null/undefined) - all deletions
    if (afterLines.length === 0) {
        debugLog('[calculateDiff] After empty - all deletions');
        return beforeLines.map(line => ({
            type: 'removed',
            oldLine: line,
            isWordDiff: false
        }));
    }

    const beforeText = beforeLines.join('\n');
    const afterText = afterLines.join('\n');
    debugLog(`[calculateDiff] beforeText: ${JSON.stringify(beforeText)}`);
    debugLog(`[calculateDiff] afterText: ${JSON.stringify(afterText)}`);

    // Special case: single line replaced with empty line
    // diffLines treats this as pure deletion, but we want to show it as replacement
    if (beforeLines.length === 1 && afterLines.length === 1 &&
        beforeLines[0] !== '' && afterLines[0] === '') {
        debugLog('[calculateDiff] Single line replaced with empty line - showing as replacement');
        return [
            { type: 'removed', oldLine: beforeLines[0], isWordDiff: false },
            { type: 'added', newLine: '', isWordDiff: false }
        ];
    }

    // Use diffLines from the library - let it decide what changed
    debugLog('[calculateDiff] Using line-based diff');
    const changes = diffLines(beforeText, afterText);
    debugLog(`[calculateDiff] diffLines changes count: ${changes.length}`);
    const result = [];

    for (let changeIdx = 0; changeIdx < changes.length; changeIdx++) {
        const change = changes[changeIdx];
        debugLog(`[calculateDiff] change[${changeIdx}]: added=${change.added}, removed=${change.removed}, count=${change.count}, value.length=${change.value.length}`);
        debugLog(`[calculateDiff] change[${changeIdx}] value: ${JSON.stringify(change.value)}`);

        const lines = change.value.split('\n');
        debugLog(`[calculateDiff] change[${changeIdx}] split into ${lines.length} lines`);

        // Remove trailing empty line only if it's the result of split on text ending with \n
        // This happens because "line1\nline2\n".split('\n') gives ["line1", "line2", ""]
        if (lines.length > 0 && lines[lines.length - 1] === '' && change.value.endsWith('\n')) {
            debugLog(`[calculateDiff] change[${changeIdx}] removing trailing empty line`);
            lines.pop();
        }

        // Handle empty changes (shouldn't happen, but defensive programming)
        if (lines.length === 0) {
            debugLog(`[calculateDiff] change[${changeIdx}] has no lines after processing - skipping`);
            continue;
        }

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            debugLog(`[calculateDiff] change[${changeIdx}] line[${lineIdx}]: ${JSON.stringify(line)}`);
            if (change.added) {
                result.push({ type: 'added', newLine: line, isWordDiff: false });
            } else if (change.removed) {
                result.push({ type: 'removed', oldLine: line, isWordDiff: false });
            } else {
                result.push({ type: 'unchanged', oldLine: line, newLine: line, isWordDiff: false });
            }
        }
    }

    debugLog(`[calculateDiff] Diff result items: ${result.length}`);
    result.forEach((item, idx) => {
        debugLog(`[calculateDiff] result[${idx}]: type=${item.type}, oldLine=${JSON.stringify(item.oldLine)}, newLine=${JSON.stringify(item.newLine)}`);
    });
    debugLog('[calculateDiff] END');
    return result;
}

/**
 * Render a line with inline word-level diff highlighting
 */
function InlineDiffLine({ lineNum, parts, prefix, lineType }) {
    debugLog(`[InlineDiffLine] lineNum=${lineNum}, prefix="${prefix}", lineType=${lineType}, parts.length=${parts.length}`);
    parts.forEach((part, idx) => {
        debugLog(`[InlineDiffLine] parts[${idx}]: type=${part.type}, text=${JSON.stringify(part.text)}`);
    });

    const lineNumStr = lineNum !== null ? `${String(lineNum).padStart(4, ' ')} ` : '     ';

    // Background color based on line type
    const bgColor = lineType === 'removed' ? '#692121ff' : lineType === 'added' ? '#216931ff' : undefined;
    const lineNumColor = lineType === 'removed' ? '#c0a6a6ff' : lineType === 'added' ? '#9fbca5ff' : '#898989ff';

    // Filter out parts with null or undefined text, but keep empty strings (they're valid)
    const validParts = parts.filter(part => part.text !== null && part.text !== undefined);
    debugLog(`[InlineDiffLine] validParts.length=${validParts.length}`);
    validParts.forEach((part, idx) => {
        debugLog(`[InlineDiffLine] validParts[${idx}]: type=${part.type}, text="${part.text}"`);
    });

    debugLog(`[InlineDiffLine] Creating React element with bgColor=${bgColor}, lineNumColor=${lineNumColor}`);

    return React.createElement(Box, { backgroundColor: bgColor },
        React.createElement(Text, { color: lineNumColor }, lineNumStr),
        React.createElement(Text, { color: '#ffffff' }, `${prefix} `),
        React.createElement(Box, { flexDirection: 'row' },
            ...validParts.map((part, idx) => {
                // Show changed parts without highlighting
                if (part.type === 'removed') {
                    debugLog(`[InlineDiffLine] Rendering validParts[${idx}] as REMOVED, text="${part.text}"`);
                    return React.createElement(Text, {
                        key: idx,
                        color: '#ffffff'
                    }, part.text || '');
                } else if (part.type === 'added') {
                    debugLog(`[InlineDiffLine] Rendering validParts[${idx}] as ADDED, text="${part.text}"`);
                    return React.createElement(Text, {
                        key: idx,
                        color: '#ffffff'
                    }, part.text || '');
                } else {
                    debugLog(`[InlineDiffLine] Rendering validParts[${idx}] as UNCHANGED, text="${part.text}"`);
                    return React.createElement(Text, {
                        key: idx,
                        color: '#ffffff'
                    }, part.text || '');
                }
            })
        )
    );
}

/**
 * Render a single line in unified diff view
 */
function UnifiedDiffLine({ oldLineNum, newLineNum, content, type, language }) {
    debugLog(`[UnifiedDiffLine] type=${type}, oldLineNum=${oldLineNum}, newLineNum=${newLineNum}, content=${JSON.stringify(content)}`);

    // In unified diff format, we show both old and new line numbers
    // Format: "old new" or just one if the other is null
    let lineNumStr;

    if (type === 'removed') {
        // Removed lines: show old line number only
        lineNumStr = oldLineNum !== null && oldLineNum !== undefined
            ? `${String(oldLineNum).padStart(4, ' ')} `
            : '     ';
    } else if (type === 'added') {
        // Added lines: show new line number only
        lineNumStr = newLineNum !== null && newLineNum !== undefined
            ? `${String(newLineNum).padStart(4, ' ')} `
            : '     ';
    } else {
        // Unchanged lines: show new line number (the line number in the result file)
        lineNumStr = newLineNum !== null && newLineNum !== undefined
            ? `${String(newLineNum).padStart(4, ' ')} `
            : '     ';
    }

    debugLog(`[UnifiedDiffLine] lineNumStr="${lineNumStr}"`);

    // Get prefix and content based on type
    // Handle null/undefined content gracefully
    const contentStr = (content !== null && content !== undefined) ? content : '';
    const prefix = type === 'removed' ? '-' : (type === 'added' ? '+' : ' ');
    debugLog(`[UnifiedDiffLine] prefix="${prefix}", contentStr="${contentStr}"`);

    // Determine colors based on line type
    // Keep line number and content separate to allow different colors
    if (type === 'removed') {
        return React.createElement(Box, { backgroundColor: '#692121ff' },
            React.createElement(Text, { color: '#c0a6a6ff' }, lineNumStr),
            React.createElement(Text, { color: '#ffffff' }, `${prefix} ${contentStr}`)
        );
    } else if (type === 'added') {
        return React.createElement(Box, { backgroundColor: '#216931ff' },
            React.createElement(Text, { color: '#9fbca5ff' }, lineNumStr),
            React.createElement(Text, { color: '#ffffff' }, `${prefix} ${contentStr}`)
        );
    } else {
        // Unchanged lines: gray text with dimming
        return React.createElement(Box, {},
            React.createElement(Text, { color: '#898989ff', dimColor: true }, lineNumStr),
            React.createElement(Text, { color: '#ffffff', dimColor: true }, `${prefix} ${contentStr}`)
        );
    }
}

/**
 * Main FileDiffViewer component - Unified diff format
 */
export function FileDiffViewer({ filePath, startLine, endLine, oldContent, newContent, contextBefore = [], contextAfter = [], contextStartLine = null, isReplaceMode = false, showHeader = true, showBorder = true }) {
    debugLog('========== FileDiffViewer RENDER START ==========');
    debugLog(`filePath: ${filePath}`);
    debugLog(`startLine: ${startLine}, endLine: ${endLine}`);
    debugLog(`oldContent length: ${oldContent?.length || 0} bytes`);
    debugLog(`newContent length: ${newContent?.length || 0} bytes`);
    debugLog(`contextBefore lines: ${contextBefore.length}`);
    debugLog(`contextAfter lines: ${contextAfter.length}`);
    debugLog(`contextStartLine: ${contextStartLine}`);
    debugLog(`isReplaceMode: ${isReplaceMode}`);

    try {
        // Tab width: default 4 spaces (most common in modern editors)
        // This ensures terminal display matches editor display
        const tabWidth = 4;
        
        debugLog(`Parsing content lines...`);
        const { beforeLines, afterLines } = parseContentLines(oldContent, newContent, tabWidth);
        debugLog(`beforeLines: ${beforeLines.length}, afterLines: ${afterLines.length}`);
        debugLog(`beforeLines preview: ${beforeLines.slice(0, 3).map(l => JSON.stringify(l.substring(0, 50))).join(', ')}`);
        debugLog(`afterLines preview: ${afterLines.slice(0, 3).map(l => JSON.stringify(l.substring(0, 50))).join(', ')}`);
        
        // Normalize tabs in context lines as well
        const normalizedContextBefore = contextBefore.map(line => normalizeTabs(line, tabWidth));
        const normalizedContextAfter = contextAfter.map(line => normalizeTabs(line, tabWidth));
        debugLog(`Normalized context lines`);

        const language = detectLanguage(filePath);
        debugLog(`Detected language: ${language || 'none'}`);

        // contextStartLine이 제공되지 않으면 startLine - contextBefore.length로 계산
        const actualContextStartLine = contextStartLine !== null ? contextStartLine : (startLine - contextBefore.length);
        debugLog(`actualContextStartLine: ${actualContextStartLine}`);

        debugLog(`Calculating diff...`);
        const diff = calculateDiff(beforeLines, afterLines);
        debugLog(`Diff items: ${diff.length}`);
        debugLog(`Diff item types: ${diff.map(d => d.type).join(', ')}`);
        const diffRemovedCount = diff.filter(d => d.type === 'removed').length;
        const diffAddedCount = diff.filter(d => d.type === 'added').length;
        const diffUnchangedCount = diff.filter(d => d.type === 'unchanged').length;
        debugLog(`Diff breakdown: removed=${diffRemovedCount}, added=${diffAddedCount}, unchanged=${diffUnchangedCount}`);

        // Log all diff items for detailed inspection
        diff.forEach((item, idx) => {
            debugLog(`[FileDiffViewer] diff[${idx}]: type=${item.type}, oldLine=${JSON.stringify(item.oldLine)}, newLine=${JSON.stringify(item.newLine)}, isWordDiff=${item.isWordDiff}`);
        });

        // Handle empty diff (no changes)
        if (diff.length === 0) {
            debugLog(`No diff detected - both contents are identical or empty`);
            return React.createElement(Box, { flexDirection: 'column' },
                React.createElement(Text, { color: 'yellow' }, `No changes detected in ${toDisplayPath(filePath)}`)
            );
        }

        // No longer doing character-level diff post-processing
        // Just render what diffLines library told us

        // Calculate line count changes for header
        const removedLineCount = beforeLines.length;
        const addedLineCount = afterLines.length;
        const unchangedCount = diff.filter(item => item.type === 'unchanged').length;
        
        // Calculate the end line in the new file
        // The new content spans from startLine to startLine + afterLines.length - 1
        // Special case: if adding lines is 0, we're deleting everything, so afterEndLine could be startLine - 1
        const afterEndLine = addedLineCount > 0 ? (startLine + addedLineCount - 1) : (startLine - 1);

        debugLog(`Diff statistics:`);
        debugLog(`  Removed lines: ${removedLineCount}`);
        debugLog(`  Added lines: ${addedLineCount}`);
        debugLog(`  Unchanged: ${unchangedCount}`);
        debugLog(`  afterEndLine: ${afterEndLine}`);

        // Format header display
        const oldRange = endLine === startLine ? `${startLine}` : `${startLine}-${endLine}`;
        const newRange = addedLineCount === 0 
            ? `deleted` 
            : (afterEndLine === startLine ? `${startLine}` : `${startLine}-${afterEndLine}`);
        const rangeInfo = addedLineCount === 0 
            ? `(Lines ${oldRange} deleted)` 
            : `(Lines ${oldRange} → ${newRange})`;

        const element = React.createElement(Box, { flexDirection: 'column', marginBottom: 0, width: '100%' },
            React.createElement(Box, {
                flexDirection: 'column',
                ...(showBorder && { borderStyle: 'single', borderColor: '#3a3a3a' }),
                width: '100%'
            },
                // Header (optional)
                showHeader && React.createElement(Box, { marginBottom: 1 },
                    React.createElement(Text, { bold: true, color: 'cyan' }, ` ${toDisplayPath(filePath)} `),
                    React.createElement(Text, { color: '#545454' }, rangeInfo)
                ),

                // Context before (with normalized tabs)
                ...normalizedContextBefore.map((line, idx) => {
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

                // Changed lines - simply render what diffLines told us
                (() => {
                    const rows = [];
                    let oldLineNum = startLine;
                    let newLineNum = startLine;

                    debugLog(`[DIFF RENDERING] Starting with oldLineNum=${oldLineNum}, newLineNum=${newLineNum}`);
                    debugLog(`[DIFF RENDERING] diff.length=${diff.length}`);

                    for (let i = 0; i < diff.length; i++) {
                        const item = diff[i];
                        debugLog(`[DIFF #${i}] type=${item.type}, oldLine="${item.oldLine}", newLine="${item.newLine}"`);

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

                    debugLog(`[DIFF RENDERING] Finished rendering, rows.length=${rows.length}`);
                    debugLog(`[DIFF RENDERING] Final oldLineNum=${oldLineNum}, newLineNum=${newLineNum}`);

                    return rows;
                })(),

                // Context after (with normalized tabs)
                // Use the final line number after all changes
                // If all lines were deleted (afterEndLine < startLine), context starts at startLine
                ...normalizedContextAfter.map((line, idx) => {
                    const contextAfterStartLine = afterEndLine >= startLine ? (afterEndLine + 1) : startLine;
                    const lineNum = contextAfterStartLine + idx;
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
