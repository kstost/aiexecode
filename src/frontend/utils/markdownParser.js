/**
 * Markdown Parser
 * 마크다운 텍스트를 파싱하여 터미널 스타일로 렌더링
 */

import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../design/themeColors.js';
import { colorizeCode } from './syntaxHighlighter.js';
import { GridRenderer } from './GridRenderer.js';
import { ProcessInlineText } from './InlineFormatter.js';

// 렌더링 상수
const SPACING = {
    EMPTY_LINE: 1,
    CODE_PADDING: 1,
    LIST_PREFIX_PAD: 1,
    LIST_TEXT_GROW: 1
};

/**
 * 마크다운 텍스트를 파싱하여 Ink 컴포넌트로 변환
 * @param {string} text - 마크다운 텍스트
 * @param {Object} options - 렌더링 옵션
 * @param {boolean} options.isPending - 스트리밍 중 여부
 * @param {number} options.availableHeight - 사용 가능한 터미널 높이
 * @param {number} options.terminalWidth - 터미널 너비 (기본값: 80)
 * @returns {React.ReactNode}
 */
export function renderMarkdown(text, options = {}) {
    if (!text) return null;

    const {
        isPending = false,
        availableHeight,
        terminalWidth = 80
    } = options;

    const lineArray = text.split(/\r?\n/);

    // 정규식 패턴
    const patterns = {
        header: /^ *(#{1,4}) +(.*)/,
        codeFence: /^ *(`{3,}|~{3,}) *(\w*?) *$/,
        unorderedList: /^([ \t]*)([-*+]) +(.*)/,
        orderedList: /^([ \t]*)(\d+)\. +(.*)/,
        horizontalRule: /^ *([-*_] *){3,} *$/,
        tableRow: /^\s*\|(.+)\|\s*$/,
        tableSeparator: /^\s*\|?\s*(:?-+:?)\s*(\|\s*(:?-+:?)\s*)+\|?\s*$/
    };

    const blocks = [];
    let previousLineWasEmpty = true;

    // 상태 변수
    let codeBlockActive = false;
    let codeBlockLines = [];
    let codeBlockLanguage = null;
    let codeBlockFence = '';

    let tableActive = false;
    let tableHeaderCells = [];
    let tableDataRows = [];

    function appendBlock(block) {
        if (block) {
            blocks.push(block);
            previousLineWasEmpty = false;
        }
    }

    lineArray.forEach((currentLine, lineIndex) => {
        const lineKey = `ln-${lineIndex}`;

        // 코드 블록 내부 처리
        if (codeBlockActive) {
            const fenceMatch = currentLine.match(patterns.codeFence);
            if (fenceMatch &&
                fenceMatch[1].startsWith(codeBlockFence[0]) &&
                fenceMatch[1].length >= codeBlockFence.length) {
                appendBlock(
                    React.createElement(BuildCodeBlock, {
                        key: lineKey,
                        lines: codeBlockLines,
                        language: codeBlockLanguage,
                        isPending,
                        availableHeight,
                        terminalWidth
                    })
                );
                codeBlockActive = false;
                codeBlockLines = [];
                codeBlockLanguage = null;
                codeBlockFence = '';
            } else {
                codeBlockLines.push(currentLine);
            }
            return;
        }

        // 패턴 매칭
        const fenceMatch = currentLine.match(patterns.codeFence);
        const headerMatch = currentLine.match(patterns.header);
        const ulMatch = currentLine.match(patterns.unorderedList);
        const olMatch = currentLine.match(patterns.orderedList);
        const hrMatch = currentLine.match(patterns.horizontalRule);
        const tableRowMatch = currentLine.match(patterns.tableRow);
        const tableSepMatch = currentLine.match(patterns.tableSeparator);

        // 코드 블록 시작
        if (fenceMatch) {
            codeBlockActive = true;
            codeBlockFence = fenceMatch[1];
            codeBlockLanguage = fenceMatch[2] || null;
        }
        // 테이블 시작 감지
        else if (tableRowMatch && !tableActive) {
            if (lineIndex + 1 < lineArray.length &&
                lineArray[lineIndex + 1].match(patterns.tableSeparator)) {
                tableActive = true;
                tableHeaderCells = tableRowMatch[1].split('|').map(cell => cell.trim());
                tableDataRows = [];
            } else {
                appendBlock(
                    React.createElement(Box, { key: lineKey },
                        React.createElement(Text, { wrap: 'wrap' },
                            React.createElement(ProcessInlineText, { content: currentLine })
                        )
                    )
                );
            }
        }
        // 테이블 구분선 스킵
        else if (tableActive && tableSepMatch) {
            // 구분선은 무시
        }
        // 테이블 데이터 행
        else if (tableActive && tableRowMatch) {
            const cells = tableRowMatch[1].split('|').map(cell => cell.trim());
            while (cells.length < tableHeaderCells.length) cells.push('');
            if (cells.length > tableHeaderCells.length) cells.length = tableHeaderCells.length;
            tableDataRows.push(cells);
        }
        // 테이블 종료
        else if (tableActive && !tableRowMatch) {
            if (tableHeaderCells.length > 0 && tableDataRows.length > 0) {
                appendBlock(
                    React.createElement(BuildTable, {
                        key: `table-${blocks.length}`,
                        columnHeaders: tableHeaderCells,
                        dataRows: tableDataRows,
                        maxWidth: terminalWidth
                    })
                );
            }
            tableActive = false;
            tableDataRows = [];
            tableHeaderCells = [];

            // 현재 줄 처리
            if (currentLine.trim().length > 0) {
                appendBlock(
                    React.createElement(Box, { key: lineKey },
                        React.createElement(Text, { wrap: 'wrap' },
                            React.createElement(ProcessInlineText, { content: currentLine })
                        )
                    )
                );
            }
        }
        // 수평선
        else if (hrMatch) {
            appendBlock(
                React.createElement(Box, { key: lineKey },
                    React.createElement(Text, { dimColor: true }, '---')
                )
            );
        }
        // 헤더
        else if (headerMatch) {
            const level = headerMatch[1].length;
            const headerText = headerMatch[2];
            let headerElement = null;

            switch (level) {
                case 1:
                    headerElement = React.createElement(Text, { bold: true, color: theme.text.link },
                        React.createElement(ProcessInlineText, { content: headerText })
                    );
                    break;
                case 2:
                    headerElement = React.createElement(Text, { bold: true, color: theme.text.link },
                        React.createElement(ProcessInlineText, { content: headerText })
                    );
                    break;
                case 3:
                    headerElement = React.createElement(Text, { bold: true, color: theme.text.primary },
                        React.createElement(ProcessInlineText, { content: headerText })
                    );
                    break;
                case 4:
                    headerElement = React.createElement(Text, { italic: true, color: theme.text.secondary },
                        React.createElement(ProcessInlineText, { content: headerText })
                    );
                    break;
                default:
                    headerElement = React.createElement(Text, { color: theme.text.primary },
                        React.createElement(ProcessInlineText, { content: headerText })
                    );
            }
            if (headerElement) {
                appendBlock(React.createElement(Box, { key: lineKey }, headerElement));
            }
        }
        // 순서 없는 리스트
        else if (ulMatch) {
            const [, indent, marker, content] = ulMatch;
            appendBlock(
                React.createElement(BuildListItem, {
                    key: lineKey,
                    itemText: content,
                    listType: 'ul',
                    marker: marker,
                    indentation: indent
                })
            );
        }
        // 순서 있는 리스트
        else if (olMatch) {
            const [, indent, marker, content] = olMatch;
            appendBlock(
                React.createElement(BuildListItem, {
                    key: lineKey,
                    itemText: content,
                    listType: 'ol',
                    marker: marker,
                    indentation: indent
                })
            );
        }
        // 빈 줄 또는 일반 텍스트
        else {
            if (currentLine.trim().length === 0 && !codeBlockActive) {
                if (!previousLineWasEmpty) {
                    blocks.push(
                        React.createElement(Box, {
                            key: `space-${lineIndex}`,
                            height: SPACING.EMPTY_LINE
                        })
                    );
                    previousLineWasEmpty = true;
                }
            } else {
                appendBlock(
                    React.createElement(Box, { key: lineKey },
                        React.createElement(Text, { wrap: 'wrap', color: theme.text.primary },
                            React.createElement(ProcessInlineText, { content: currentLine })
                        )
                    )
                );
            }
        }
    });

    // 닫히지 않은 코드 블록 처리
    if (codeBlockActive) {
        appendBlock(
            React.createElement(BuildCodeBlock, {
                key: 'eof-code',
                lines: codeBlockLines,
                language: codeBlockLanguage,
                isPending,
                availableHeight,
                terminalWidth
            })
        );
    }

    // 닫히지 않은 테이블 처리
    if (tableActive && tableHeaderCells.length > 0 && tableDataRows.length > 0) {
        appendBlock(
            React.createElement(BuildTable, {
                key: `table-${blocks.length}`,
                columnHeaders: tableHeaderCells,
                dataRows: tableDataRows,
                maxWidth: terminalWidth
            })
        );
    }

    return React.createElement(React.Fragment, null, blocks);
}

/**
 * 코드 블록 렌더링 컴포넌트
 */
const BuildCodeBlockInternal = ({ lines, language, isPending, availableHeight, terminalWidth }) => {
    const MIN_LINES_BEFORE_MSG = 1;
    const RESERVED_LINES = 2;

    if (isPending && availableHeight !== undefined) {
        const maxLines = Math.max(0, availableHeight - RESERVED_LINES);

        if (lines.length > maxLines) {
            if (maxLines < MIN_LINES_BEFORE_MSG) {
                return React.createElement(Box, { paddingLeft: SPACING.CODE_PADDING },
                    React.createElement(Text, { color: theme.text.secondary },
                        '... code is being written ...'
                    )
                );
            }

            const truncatedLines = lines.slice(0, maxLines);
            const truncatedCode = colorizeCode(truncatedLines.join('\n'), language, true);

            return React.createElement(Box, {
                paddingLeft: SPACING.CODE_PADDING,
                flexDirection: 'column'
            },
                truncatedCode,
                React.createElement(Text, { color: theme.text.secondary },
                    '... generating more ...'
                )
            );
        }
    }

    const fullCode = lines.join('\n');
    const highlightedCode = colorizeCode(fullCode, language, true);

    return React.createElement(Box, {
        paddingLeft: SPACING.CODE_PADDING,
        flexDirection: 'column',
        width: terminalWidth,
        flexShrink: 0
    }, highlightedCode);
};

const BuildCodeBlock = React.memo(BuildCodeBlockInternal);

/**
 * 리스트 항목 렌더링 컴포넌트
 */
const BuildListItemInternal = ({ itemText, listType, marker, indentation = '' }) => {
    const displayPrefix = listType === 'ol' ? `${marker}. ` : `${marker} `;
    const prefixLength = displayPrefix.length;
    const indentAmount = indentation.length;

    return React.createElement(Box, {
        paddingLeft: indentAmount + SPACING.LIST_PREFIX_PAD,
        flexDirection: 'row'
    },
        React.createElement(Box, { width: prefixLength },
            React.createElement(Text, { color: theme.text.primary }, displayPrefix)
        ),
        React.createElement(Box, { flexGrow: SPACING.LIST_TEXT_GROW },
            React.createElement(Text, { wrap: 'wrap', color: theme.text.primary },
                React.createElement(ProcessInlineText, { content: itemText })
            )
        )
    );
};

const BuildListItem = React.memo(BuildListItemInternal);

/**
 * 테이블 렌더링 컴포넌트
 */
const BuildTableInternal = ({ columnHeaders, dataRows, maxWidth }) => {
    return React.createElement(GridRenderer, {
        columnHeaders,
        dataRows,
        maxWidth
    });
};

const BuildTable = React.memo(BuildTableInternal);
