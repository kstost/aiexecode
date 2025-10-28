/**
 * Syntax Highlighter - Syntax highlighting for code blocks
 */

import React from 'react';
import { Text, Box } from 'ink';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

/**
 * Theme color mapping for syntax highlighting
 */
const theme = {
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
    if (className.includes('keyword')) return theme.keyword;
    if (className.includes('string')) return theme.string;
    if (className.includes('number')) return theme.number;
    if (className.includes('comment')) return theme.comment;
    if (className.includes('function')) return theme.function;
    if (className.includes('variable')) return theme.variable;
    if (className.includes('operator')) return theme.operator;
    return theme.default;
}

/**
 * Render HAST node to React elements
 */
function renderHastNode(node, inheritedColor) {
    if (node.type === 'text') {
        const color = inheritedColor || theme.default;
        return React.createElement(Text, { color }, node.value);
    }

    if (node.type === 'element') {
        const nodeClasses = node.properties?.className || [];
        let elementColor = inheritedColor;

        // Find color for this element's class
        for (const className of nodeClasses) {
            const color = getColorForClass(className);
            if (color) {
                elementColor = color;
                break;
            }
        }

        // Recursively render children
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
 * Highlight and render a single line of code
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
 * Colorize code with syntax highlighting
 *
 * @param {string} code - The code to highlight
 * @param {string} language - Language identifier (e.g., 'python', 'javascript')
 * @param {boolean} showLineNumbers - Whether to show line numbers (default: true)
 * @returns {React.ReactNode}
 */
export function colorizeCode(code, language, showLineNumbers = true) {
    const codeToHighlight = code.replace(/\n$/, '');

    try {
        const lines = codeToHighlight.split('\n');
        const padWidth = String(lines.length).length;

        return React.createElement(Box, { flexDirection: 'column' },
            lines.map((line, index) => {
                const contentToRender = highlightLine(line, language);

                return React.createElement(Box, { key: index },
                    showLineNumbers && React.createElement(Text, { color: 'gray' },
                        `${String(index + 1).padStart(padWidth, ' ')} `
                    ),
                    React.createElement(Text, { color: theme.default, wrap: 'wrap' },
                        contentToRender
                    )
                );
            })
        );
    } catch (error) {
        // Error highlighting code - silently ignore

        // Fallback to plain text
        const lines = codeToHighlight.split('\n');
        const padWidth = String(lines.length).length;

        return React.createElement(Box, { flexDirection: 'column' },
            lines.map((line, index) =>
                React.createElement(Box, { key: index },
                    showLineNumbers && React.createElement(Text, { color: 'gray' },
                        `${String(index + 1).padStart(padWidth, ' ')} `
                    ),
                    React.createElement(Text, { color: theme.default }, line)
                )
            )
        );
    }
}
