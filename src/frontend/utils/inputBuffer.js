/**
 * Input Buffer - Advanced text buffer for multi-line input with cursor management
 */

import stringWidth from 'string-width';

/**
 * Convert string to code points array
 */
function toCodePoints(str) {
    return Array.from(str);
}

/**
 * Get length in code points
 */
export function cpLen(str) {
    return toCodePoints(str).length;
}

/**
 * Slice string by code points
 */
export function cpSlice(str, start, end) {
    const cps = toCodePoints(str);
    return cps.slice(start, end).join('');
}

/**
 * Hook to create and manage text buffer using useReducer
 */
import { useReducer, useMemo, useCallback, useState, useEffect, useRef } from 'react';

function textBufferReducer(state, action) {
    switch (action.type) {
        case 'set_text': {
            const newLines = action.payload ? action.payload.split('\n') : [''];
            return {
                ...state,
                lines: newLines,
                cursor: [0, 0]
            };
        }
        case 'insert_text': {
            const { text } = action.payload;
            const [row, col] = state.cursor;
            const newLines = [...state.lines];
            const line = newLines[row] || '';
            const before = cpSlice(line, 0, col);
            const after = cpSlice(line, col);
            newLines[row] = before + text + after;
            return {
                ...state,
                lines: newLines,
                cursor: [row, col + cpLen(text)]
            };
        }
        case 'move_cursor': {
            const { direction } = action.payload;
            const [row, col] = state.cursor;
            const line = state.lines[row] || '';
            let newCursor = [row, col];

            switch (direction) {
                case 'left':
                    if (col > 0) {
                        newCursor = [row, col - 1];
                    } else if (row > 0) {
                        newCursor = [row - 1, cpLen(state.lines[row - 1] || '')];
                    }
                    break;
                case 'right':
                    if (col < cpLen(line)) {
                        newCursor = [row, col + 1];
                    } else if (row < state.lines.length - 1) {
                        newCursor = [row + 1, 0];
                    }
                    break;
                case 'up':
                    if (row > 0) {
                        const prevLineLen = cpLen(state.lines[row - 1] || '');
                        newCursor = [row - 1, Math.min(col, prevLineLen)];
                    }
                    break;
                case 'down':
                    if (row < state.lines.length - 1) {
                        const nextLineLen = cpLen(state.lines[row + 1] || '');
                        newCursor = [row + 1, Math.min(col, nextLineLen)];
                    }
                    break;
                case 'home':
                    newCursor = [row, 0];
                    break;
                case 'end':
                    newCursor = [row, cpLen(line)];
                    break;
            }

            return {
                ...state,
                cursor: newCursor
            };
        }
        case 'backspace': {
            const [row, col] = state.cursor;
            if (col === 0 && row === 0) return state;

            const newLines = [...state.lines];
            let newCursor = [row, col];

            if (col > 0) {
                const line = newLines[row] || '';
                newLines[row] = cpSlice(line, 0, col - 1) + cpSlice(line, col);
                newCursor = [row, col - 1];
            } else if (row > 0) {
                const currentLine = newLines[row] || '';
                const prevLine = newLines[row - 1] || '';
                const prevLineLen = cpLen(prevLine);
                newLines[row - 1] = prevLine + currentLine;
                newLines.splice(row, 1);
                newCursor = [row - 1, prevLineLen];
            }

            return {
                ...state,
                lines: newLines,
                cursor: newCursor
            };
        }
        case 'delete': {
            const [row, col] = state.cursor;
            const newLines = [...state.lines];
            const line = newLines[row] || '';
            const lineLen = cpLen(line);

            if (col < lineLen) {
                newLines[row] = cpSlice(line, 0, col) + cpSlice(line, col + 1);
            } else if (row < state.lines.length - 1) {
                const nextLine = newLines[row + 1] || '';
                newLines[row] = line + nextLine;
                newLines.splice(row + 1, 1);
            } else {
                return state;
            }

            return {
                ...state,
                lines: newLines
            };
        }
        case 'newline': {
            const [row, col] = state.cursor;
            const newLines = [...state.lines];
            const line = newLines[row] || '';
            const before = cpSlice(line, 0, col);
            const after = cpSlice(line, col);
            newLines[row] = before;
            newLines.splice(row + 1, 0, after);

            return {
                ...state,
                lines: newLines,
                cursor: [row + 1, 0]
            };
        }
        case 'kill_line_right': {
            const [row, col] = state.cursor;
            const newLines = [...state.lines];
            const line = newLines[row] || '';
            newLines[row] = cpSlice(line, 0, col);
            return {
                ...state,
                lines: newLines
            };
        }
        case 'kill_line_left': {
            const [row, col] = state.cursor;
            const newLines = [...state.lines];
            const line = newLines[row] || '';
            newLines[row] = cpSlice(line, col);
            return {
                ...state,
                lines: newLines,
                cursor: [row, 0]
            };
        }
        case 'delete_word_left': {
            const [row, col] = state.cursor;
            if (col === 0) return state;

            const newLines = [...state.lines];
            const line = newLines[row] || '';
            const before = cpSlice(line, 0, col);
            const after = cpSlice(line, col);

            const trimmed = before.trimEnd();
            const lastSpace = trimmed.lastIndexOf(' ');
            const newCol = lastSpace >= 0 ? lastSpace + 1 : 0;

            newLines[row] = cpSlice(line, 0, newCol) + after;

            return {
                ...state,
                lines: newLines,
                cursor: [row, newCol]
            };
        }
        case 'set_viewport': {
            return {
                ...state,
                viewport: action.payload
            };
        }
        default:
            return state;
    }
}

export function useTextBuffer(options) {
    const { initialText = '', viewport } = options;

    const initialState = useMemo(() => ({
        lines: initialText ? initialText.split('\n') : [''],
        cursor: [0, 0],
        viewport: viewport || { width: 80, height: 10 }
    }), [initialText, viewport]);

    const [state, dispatch] = useReducer(textBufferReducer, initialState);

    // Update viewport when it changes
    useEffect(() => {
        if (viewport && (viewport.width !== state.viewport.width || viewport.height !== state.viewport.height)) {
            dispatch({ type: 'set_viewport', payload: viewport });
        }
    }, [viewport, state.viewport]);

    // Calculate visual layout
    const visualLayout = useMemo(() => {
        const allVisualLines = [];
        const visualToLogicalMap = [];
        const viewportWidth = state.viewport.width;

        state.lines.forEach((line, logicalRow) => {
            if (!line) {
                allVisualLines.push('');
                visualToLogicalMap.push([logicalRow, 0]);
            } else {
                const wrapped = wrapLine(line, viewportWidth);
                wrapped.forEach((segment, i) => {
                    allVisualLines.push(segment);
                    visualToLogicalMap.push([logicalRow, i * viewportWidth]);
                });
            }
        });

        return { allVisualLines, visualToLogicalMap };
    }, [state.lines, state.viewport.width]);

    // Calculate visual cursor
    const visualCursor = useMemo(() => {
        const [row, col] = state.cursor;
        const line = state.lines[row] || '';
        const wrappedLines = wrapLine(line, state.viewport.width);

        let remainingCol = col;
        let visualRow = 0;

        for (let i = 0; i < row; i++) {
            visualRow += wrapLine(state.lines[i], state.viewport.width).length;
        }

        for (let i = 0; i < wrappedLines.length; i++) {
            const lineLen = cpLen(wrappedLines[i]);
            if (remainingCol <= lineLen) {
                return [visualRow + i, remainingCol];
            }
            remainingCol -= lineLen;
        }

        return [visualRow + wrappedLines.length - 1, cpLen(wrappedLines[wrappedLines.length - 1])];
    }, [state.cursor, state.lines, state.viewport.width]);

    const [visualScrollRow, setVisualScrollRow] = useState(0);

    // Update scroll position - memoize the calculation to avoid unnecessary state updates
    const computedScrollRow = useMemo(() => {
        const { height } = state.viewport;
        const totalVisualLines = visualLayout.allVisualLines.length;
        const maxScrollStart = Math.max(0, totalVisualLines - height);
        let newVisualScrollRow = visualScrollRow;

        // Only adjust scroll if cursor is out of viewport
        if (visualCursor[0] < visualScrollRow) {
            newVisualScrollRow = visualCursor[0];
        } else if (visualCursor[0] >= visualScrollRow + height) {
            newVisualScrollRow = visualCursor[0] - height + 1;
        }

        newVisualScrollRow = Math.min(Math.max(newVisualScrollRow, 0), maxScrollStart);
        return newVisualScrollRow;
    }, [visualCursor, visualScrollRow, state.viewport.height, visualLayout.allVisualLines.length]);

    // Only update state when scroll actually changes
    useEffect(() => {
        if (computedScrollRow !== visualScrollRow) {
            setVisualScrollRow(computedScrollRow);
        }
    }, [computedScrollRow, visualScrollRow]);

    // Create stable callbacks with useCallback
    const setText = useCallback((text) => {
        dispatch({ type: 'set_text', payload: text });
    }, []);

    const insertText = useCallback((text) => {
        dispatch({ type: 'insert_text', payload: { text } });
    }, []);

    const move = useCallback((direction) => {
        dispatch({ type: 'move_cursor', payload: { direction } });
    }, []);

    const backspace = useCallback(() => {
        dispatch({ type: 'backspace' });
    }, []);

    const deleteChar = useCallback(() => {
        dispatch({ type: 'delete' });
    }, []);

    const newline = useCallback(() => {
        dispatch({ type: 'newline' });
    }, []);

    const killLineRight = useCallback(() => {
        dispatch({ type: 'kill_line_right' });
    }, []);

    const killLineLeft = useCallback(() => {
        dispatch({ type: 'kill_line_left' });
    }, []);

    const deleteWordLeft = useCallback(() => {
        dispatch({ type: 'delete_word_left' });
    }, []);

    const handleInput = useCallback((key) => {
        if (key.sequence && key.sequence.length > 0 && !key.ctrl && !key.meta) {
            if (key.sequence.includes('\n') || key.sequence.includes('\r')) {
                const normalized = key.sequence.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const parts = normalized.split('\n');
                parts.forEach((part, i) => {
                    if (part) dispatch({ type: 'insert_text', payload: { text: part } });
                    if (i < parts.length - 1) dispatch({ type: 'newline' });
                });
                return;
            }

            const isPrintable = key.sequence.split('').every(char => {
                const code = char.charCodeAt(0);
                return (code >= 32 && code <= 126) || code >= 128;
            });

            if (isPrintable) {
                dispatch({ type: 'insert_text', payload: { text: key.sequence } });
            }
        }
    }, []);

    const text = useMemo(() => state.lines.join('\n'), [state.lines]);

    const viewportVisualLines = useMemo(() => {
        return visualLayout.allVisualLines.slice(visualScrollRow, visualScrollRow + state.viewport.height);
    }, [visualLayout.allVisualLines, visualScrollRow, state.viewport.height]);

    // Return stable buffer object using useRef to maintain reference identity
    const bufferRef = useRef(null);

    if (!bufferRef.current) {
        bufferRef.current = {
            get lines() { return state.lines; },
            get cursor() { return state.cursor; },
            get text() { return text; },
            get allVisualLines() { return visualLayout.allVisualLines; },
            get viewportVisualLines() { return viewportVisualLines; },
            get visualCursor() { return visualCursor; },
            get visualScrollRow() { return visualScrollRow; },
            get visualToLogicalMap() { return visualLayout.visualToLogicalMap; },
            get viewport() { return state.viewport; },
            setText,
            insertText,
            move,
            backspace,
            delete: deleteChar,
            newline,
            killLineRight,
            killLineLeft,
            deleteWordLeft,
            handleInput
        };
    } else {
        // Update getters to return current values without changing object reference
        Object.defineProperties(bufferRef.current, {
            lines: { get: () => state.lines, enumerable: true, configurable: true },
            cursor: { get: () => state.cursor, enumerable: true, configurable: true },
            text: { get: () => text, enumerable: true, configurable: true },
            allVisualLines: { get: () => visualLayout.allVisualLines, enumerable: true, configurable: true },
            viewportVisualLines: { get: () => viewportVisualLines, enumerable: true, configurable: true },
            visualCursor: { get: () => visualCursor, enumerable: true, configurable: true },
            visualScrollRow: { get: () => visualScrollRow, enumerable: true, configurable: true },
            visualToLogicalMap: { get: () => visualLayout.visualToLogicalMap, enumerable: true, configurable: true },
            viewport: { get: () => state.viewport, enumerable: true, configurable: true }
        });
    }

    return bufferRef.current;
}

function wrapLine(line, viewportWidth) {
    if (!line) return [''];

    const result = [];
    const cps = toCodePoints(line);
    let currentLine = '';
    let currentWidth = 0;

    for (const cp of cps) {
        const cpWidth = stringWidth(cp);
        if (currentWidth + cpWidth > viewportWidth) {
            result.push(currentLine);
            currentLine = cp;
            currentWidth = cpWidth;
        } else {
            currentLine += cp;
            currentWidth += cpWidth;
        }
    }

    result.push(currentLine);
    return result.length > 0 ? result : [''];
}
