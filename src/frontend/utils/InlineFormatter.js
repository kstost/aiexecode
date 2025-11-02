/**
 * Inline Formatter
 * 인라인 마크다운 요소를 파싱하여 Ink 컴포넌트로 변환
 */

import React from 'react';
import { Text } from 'ink';
import { theme } from '../design/themeColors.js';
import stringWidth from 'string-width';

// 마크다운 마커 길이 상수
const MARKER_LENGTHS = {
    BOLD: 2,           // "**"
    ITALIC: 1,         // "*" or "_"
    STRIKE: 2,         // "~~"
    CODE: 1,           // "`"
    UNDERLINE_START: 3, // "<u>"
    UNDERLINE_END: 4    // "</u>"
};

/**
 * 인라인 마크다운을 렌더링하는 컴포넌트
 */
const ProcessInlineTextInternal = ({ content }) => {
    // 마크다운이나 URL이 없으면 바로 반환
    if (!/[*_~`<[https?:]/.test(content)) {
        return React.createElement(Text, { color: theme.text.primary }, content);
    }

    const elements = [];
    let currentPosition = 0;
    const patternRegex = /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|https?:\/\/\S+)/g;
    let matchResult;

    while ((matchResult = patternRegex.exec(content)) !== null) {
        if (matchResult.index > currentPosition) {
            elements.push(
                React.createElement(Text, { key: `plain-${currentPosition}` },
                    content.slice(currentPosition, matchResult.index)
                )
            );
        }

        const matchedText = matchResult[0];
        let formattedElement = null;
        const elementKey = `fmt-${matchResult.index}`;

        try {
            // 볼드 처리
            if (matchedText.startsWith('**') &&
                matchedText.endsWith('**') &&
                matchedText.length > MARKER_LENGTHS.BOLD * 2) {
                formattedElement = React.createElement(Text, { key: elementKey, bold: true },
                    matchedText.slice(MARKER_LENGTHS.BOLD, -MARKER_LENGTHS.BOLD)
                );
            }
            // 이탤릭 처리
            else if (matchedText.length > MARKER_LENGTHS.ITALIC * 2 &&
                ((matchedText.startsWith('*') && matchedText.endsWith('*')) ||
                    (matchedText.startsWith('_') && matchedText.endsWith('_'))) &&
                !/\w/.test(content.substring(matchResult.index - 1, matchResult.index)) &&
                !/\w/.test(content.substring(patternRegex.lastIndex, patternRegex.lastIndex + 1)) &&
                !/\S[./\\]/.test(content.substring(matchResult.index - 2, matchResult.index)) &&
                !/[./\\]\S/.test(content.substring(patternRegex.lastIndex, patternRegex.lastIndex + 2))) {
                formattedElement = React.createElement(Text, { key: elementKey, italic: true },
                    matchedText.slice(MARKER_LENGTHS.ITALIC, -MARKER_LENGTHS.ITALIC)
                );
            }
            // 취소선 처리
            else if (matchedText.startsWith('~~') &&
                matchedText.endsWith('~~') &&
                matchedText.length > MARKER_LENGTHS.STRIKE * 2) {
                formattedElement = React.createElement(Text, { key: elementKey, strikethrough: true },
                    matchedText.slice(MARKER_LENGTHS.STRIKE, -MARKER_LENGTHS.STRIKE)
                );
            }
            // 인라인 코드 처리
            else if (matchedText.startsWith('`') &&
                matchedText.endsWith('`') &&
                matchedText.length > MARKER_LENGTHS.CODE) {
                const codePattern = matchedText.match(/^(`+)(.+?)\1$/s);
                if (codePattern && codePattern[2]) {
                    formattedElement = React.createElement(Text, {
                        key: elementKey,
                        color: theme.status.warning
                    }, codePattern[2]);
                }
            }
            // 링크 처리
            else if (matchedText.startsWith('[') &&
                matchedText.includes('](') &&
                matchedText.endsWith(')')) {
                const linkPattern = matchedText.match(/\[(.*?)\]\((.*?)\)/);
                if (linkPattern) {
                    const linkLabel = linkPattern[1];
                    const linkUrl = linkPattern[2];
                    formattedElement = React.createElement(Text, { key: elementKey },
                        linkLabel,
                        React.createElement(Text, { color: theme.text.link }, ` (${linkUrl})`)
                    );
                }
            }
            // 밑줄 처리
            else if (matchedText.startsWith('<u>') &&
                matchedText.endsWith('</u>') &&
                matchedText.length > MARKER_LENGTHS.UNDERLINE_START + MARKER_LENGTHS.UNDERLINE_END - 1) {
                formattedElement = React.createElement(Text, { key: elementKey, underline: true },
                    matchedText.slice(MARKER_LENGTHS.UNDERLINE_START, -MARKER_LENGTHS.UNDERLINE_END)
                );
            }
            // URL 처리
            else if (matchedText.match(/^https?:\/\//)) {
                formattedElement = React.createElement(Text, {
                    key: elementKey,
                    color: theme.text.link
                }, matchedText);
            }
        } catch (error) {
            // 파싱 오류 발생 시 무시
            formattedElement = null;
        }

        elements.push(
            formattedElement ?? React.createElement(Text, { key: elementKey }, matchedText)
        );
        currentPosition = patternRegex.lastIndex;
    }

    if (currentPosition < content.length) {
        elements.push(
            React.createElement(Text, { key: `plain-${currentPosition}` },
                content.slice(currentPosition)
            )
        );
    }

    return React.createElement(React.Fragment, null, elements.filter(el => el !== null));
};

export const ProcessInlineText = React.memo(ProcessInlineTextInternal);

/**
 * 마크다운 포맷팅을 제거하고 실제 텍스트 길이를 계산
 * 테이블의 컬럼 너비 계산 등에 사용
 */
export function calculateTextWidth(content) {
    const plainText = content
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/<u>(.*?)<\/u>/g, '$1')
        .replace(/.*\[(.*?)\]\(.*\)/g, '$1');
    return stringWidth(plainText);
}
