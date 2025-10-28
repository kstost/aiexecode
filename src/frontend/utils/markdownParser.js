/**
 * Markdown Parser
 * 마크다운 텍스트를 파싱하여 터미널 스타일로 렌더링
 */

import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../design/themeColors.js';

/**
 * 마크다운 텍스트를 파싱하여 Ink 컴포넌트로 변환
 */
export function renderMarkdown(text) {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeLines = [];
    let codeLanguage = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code block 처리
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                // Code block 끝
                if (codeLines.length > 0) {
                    elements.push(
                        React.createElement(Box, {
                            key: `code-${i}`,
                            flexDirection: 'column',
                            borderStyle: 'round',
                            borderColor: theme.text.secondary,
                            paddingX: 1,
                            marginY: 0
                        },
                            React.createElement(Text, { color: theme.text.secondary }, codeLines.join('\n'))
                        )
                    );
                }
                codeLines = [];
                codeLanguage = '';
                inCodeBlock = false;
            } else {
                // Code block 시작
                codeLanguage = line.trim().slice(3).trim();
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        // 빈 줄
        if (line.trim() === '') {
            elements.push(React.createElement(Text, { key: `empty-${i}` }, ''));
            continue;
        }

        // Heading 처리 (### 먼저 검사 - 긴 것부터)
        if (line.startsWith('### ')) {
            elements.push(
                React.createElement(Box, {
                    key: `h3-${i}`,
                    flexDirection: 'row'
                },
                    React.createElement(Text, {
                        color: theme.text.accent,
                        bold: true
                    }, renderInlineMarkdown(line.slice(4)))
                )
            );
            continue;
        }
        if (line.startsWith('## ')) {
            elements.push(
                React.createElement(Box, {
                    key: `h2-${i}`,
                    flexDirection: 'row'
                },
                    React.createElement(Text, {
                        color: theme.text.accent,
                        bold: true
                    }, renderInlineMarkdown(line.slice(3)))
                )
            );
            continue;
        }
        if (line.startsWith('# ')) {
            elements.push(
                React.createElement(Box, {
                    key: `h1-${i}`,
                    flexDirection: 'row'
                },
                    React.createElement(Text, {
                        color: theme.text.accent,
                        bold: true
                    }, renderInlineMarkdown(line.slice(2)))
                )
            );
            continue;
        }

        // 리스트 항목 처리
        const listMatch = line.match(/^(\s*)([-*•])\s+(.+)$/);
        if (listMatch) {
            const [, indent, bullet, content] = listMatch;
            elements.push(
                React.createElement(Box, {
                    key: `list-${i}`,
                    flexDirection: 'row',
                    marginLeft: indent.length
                },
                    React.createElement(Text, { color: theme.text.accent }, bullet + ' '),
                    React.createElement(Text, null, renderInlineMarkdown(content))
                )
            );
            continue;
        }

        // 일반 텍스트 (인라인 마크다운 처리)
        elements.push(
            React.createElement(Box, {
                key: `line-${i}`,
                flexDirection: 'row'
            },
                React.createElement(Text, null, renderInlineMarkdown(line))
            )
        );
    }

    return React.createElement(Box, { flexDirection: 'column' }, elements);
}

/**
 * 인라인 마크다운 처리 (**, `, 등)
 */
function renderInlineMarkdown(text) {
    const parts = [];
    let currentIndex = 0;
    let partKey = 0;

    // 모든 마크다운 패턴 찾기 (정규식 재생성하여 lastIndex 문제 방지)
    const patterns = [];

    // **bold** 패턴 찾기
    let boldRegex = /\*\*([^*]+)\*\*/g;
    let match;
    while ((match = boldRegex.exec(text)) !== null) {
        patterns.push({
            type: 'bold',
            start: match.index,
            end: match.index + match[0].length,
            content: match[1]
        });
    }

    // `code` 패턴 찾기
    let codeRegex = /`([^`]+)`/g;
    while ((match = codeRegex.exec(text)) !== null) {
        patterns.push({
            type: 'code',
            start: match.index,
            end: match.index + match[0].length,
            content: match[1]
        });
    }

    // 시작 위치로 정렬
    patterns.sort((a, b) => a.start - b.start);

    // 겹치는 패턴 제거 (먼저 나온 패턴 우선)
    const filteredPatterns = [];
    let lastEnd = 0;
    for (const pattern of patterns) {
        if (pattern.start >= lastEnd) {
            filteredPatterns.push(pattern);
            lastEnd = pattern.end;
        }
    }

    // 패턴 적용
    for (const pattern of filteredPatterns) {
        // 이전 텍스트 추가
        if (currentIndex < pattern.start) {
            const plainText = text.slice(currentIndex, pattern.start);
            if (plainText) {
                parts.push(
                    React.createElement(Text, { key: `text-${partKey++}` }, plainText)
                );
            }
        }

        // 패턴 적용된 텍스트 추가
        if (pattern.type === 'bold') {
            parts.push(
                React.createElement(Text, {
                    key: `bold-${partKey++}`,
                    bold: true,
                    color: theme.text.primary
                }, pattern.content)
            );
        } else if (pattern.type === 'code') {
            parts.push(
                React.createElement(Text, {
                    key: `code-${partKey++}`,
                    color: theme.status.warning
                }, pattern.content)
            );
        }

        currentIndex = pattern.end;
    }

    // 남은 텍스트 추가
    if (currentIndex < text.length) {
        const remainingText = text.slice(currentIndex);
        if (remainingText) {
            parts.push(
                React.createElement(Text, { key: `text-${partKey++}` }, remainingText)
            );
        }
    }

    return parts.length > 0 ? parts : text;
}
