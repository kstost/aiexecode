/**
 * Grid Renderer
 * 마크다운 테이블을 렌더링하는 컴포넌트
 */

import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../design/themeColors.js';
import { ProcessInlineText, calculateTextWidth } from './InlineFormatter.js';

/**
 * 마크다운 테이블을 렌더링하는 컴포넌트
 * @param {Object} props
 * @param {string[]} props.columnHeaders - 테이블 헤더
 * @param {string[][]} props.dataRows - 테이블 데이터 행
 * @param {number} props.maxWidth - 터미널 최대 너비
 */
export const GridRenderer = ({ columnHeaders, dataRows, maxWidth }) => {
    // 컬럼 너비 계산 (마크다운 처리 후 실제 표시 너비 기준)
    const widthPerColumn = columnHeaders.map((headerText, columnIndex) => {
        const headerDisplayWidth = calculateTextWidth(headerText);
        const maxDataWidth = Math.max(
            ...dataRows.map((rowData) => calculateTextWidth(rowData[columnIndex] || ''))
        );
        return Math.max(headerDisplayWidth, maxDataWidth) + 2; // 패딩 추가
    });

    // 테이블이 터미널 너비를 초과하지 않도록 조정
    const totalRequiredWidth = widthPerColumn.reduce((sum, w) => sum + w + 1, 1);
    const shrinkRatio = totalRequiredWidth > maxWidth ? maxWidth / totalRequiredWidth : 1;
    const finalWidths = widthPerColumn.map((w) => Math.floor(w * shrinkRatio));

    /**
     * 셀 내용을 렌더링 (너비에 맞게 잘라내거나 패딩 추가)
     */
    const buildCell = (cellText, cellWidth, isHeaderCell = false) => {
        const availableWidth = Math.max(0, cellWidth - 2);
        const actualWidth = calculateTextWidth(cellText);

        let displayText = cellText;
        if (actualWidth > availableWidth) {
            if (availableWidth <= 3) {
                // 너비가 매우 작으면 단순 잘라내기
                displayText = cellText.substring(0, Math.min(cellText.length, availableWidth));
            } else {
                // 이진 탐색으로 마크다운을 보존하면서 최적 절단점 찾기
                let leftBound = 0;
                let rightBound = cellText.length;
                let bestFit = cellText;

                while (leftBound <= rightBound) {
                    const midPoint = Math.floor((leftBound + rightBound) / 2);
                    const testText = cellText.substring(0, midPoint);
                    const testWidth = calculateTextWidth(testText);

                    if (testWidth <= availableWidth - 3) {
                        bestFit = testText;
                        leftBound = midPoint + 1;
                    } else {
                        rightBound = midPoint - 1;
                    }
                }

                displayText = bestFit + '...';
            }
        }

        // 정확한 패딩 계산
        const finalDisplayWidth = calculateTextWidth(displayText);
        const paddingRequired = Math.max(0, availableWidth - finalDisplayWidth);

        return React.createElement(Text, null,
            isHeaderCell
                ? React.createElement(Text, { bold: true, color: theme.text.link },
                    React.createElement(ProcessInlineText, { content: displayText })
                )
                : React.createElement(ProcessInlineText, { content: displayText }),
            ' '.repeat(paddingRequired)
        );
    };

    /**
     * 테두리 렌더링
     */
    const buildBorderLine = (position) => {
        const borderStyles = {
            top: { leftCorner: '┌', junction: '┬', rightCorner: '┐', line: '─' },
            mid: { leftCorner: '├', junction: '┼', rightCorner: '┤', line: '─' },
            bottom: { leftCorner: '└', junction: '┴', rightCorner: '┘', line: '─' }
        };

        const style = borderStyles[position];
        const segments = finalWidths.map((width) => style.line.repeat(width));
        const borderText = style.leftCorner + segments.join(style.junction) + style.rightCorner;

        return React.createElement(Text, { color: theme.text.secondary }, borderText);
    };

    /**
     * 테이블 행 렌더링
     */
    const buildTableRow = (rowCells, isHeaderRow = false) => {
        const renderedCells = rowCells.map((cellContent, idx) => {
            const width = finalWidths[idx] || 0;
            return buildCell(cellContent || '', width, isHeaderRow);
        });

        return React.createElement(Text, { color: theme.text.primary },
            '│ ',
            ...renderedCells.map((cell, idx) =>
                React.createElement(React.Fragment, { key: idx },
                    cell,
                    idx < renderedCells.length - 1 ? ' │ ' : ''
                )
            ),
            ' │'
        );
    };

    return React.createElement(Box, { flexDirection: 'column', marginY: 1 },
        // 상단 테두리
        buildBorderLine('top'),

        // 헤더 행
        buildTableRow(columnHeaders, true),

        // 중간 테두리
        buildBorderLine('mid'),

        // 데이터 행
        ...dataRows.map((row, idx) =>
            React.createElement(React.Fragment, { key: idx },
                buildTableRow(row)
            )
        ),

        // 하단 테두리
        buildBorderLine('bottom')
    );
};
