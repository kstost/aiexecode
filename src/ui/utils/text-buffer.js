/**
 * Advanced Text Buffer for multi-line input with cursor management
 */

import stringWidth from 'string-width';

function consolelog() { }
/**
 * Convert string to code points array
 */
export function toCodePoints(str) {
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
 * Convert logical position (row, col) to offset
 */
export function logicalPosToOffset(lines, row, col) {
    let offset = 0;
    for (let i = 0; i < row && i < lines.length; i++) {
        offset += cpLen(lines[i]) + 1; // +1 for newline
    }
    offset += Math.min(col, cpLen(lines[row] || ''));
    return offset;
}

/**
 * Convert offset to logical position
 */
export function offsetToLogicalPos(lines, offset) {
    let currentOffset = 0;
    for (let row = 0; row < lines.length; row++) {
        const lineLen = cpLen(lines[row]);
        if (currentOffset + lineLen >= offset) {
            return [row, offset - currentOffset];
        }
        currentOffset += lineLen + 1; // +1 for newline
    }
    const lastRow = Math.max(0, lines.length - 1);
    return [lastRow, cpLen(lines[lastRow] || '')];
}

/**
 * TextBuffer class for managing multi-line text input
 */
export class TextBuffer {
    constructor(options = {}) {
        const {
            initialText = '',
            viewport = { width: 80, height: 10 },
            stdin = process.stdin,
            setRawMode = null,
            onChange = null,
        } = options;

        this.lines = initialText ? initialText.split('\n') : [''];
        this.cursor = [0, 0]; // [row, col] in logical coordinates
        this.viewport = viewport;
        this.stdin = stdin;
        this.setRawMode = setRawMode;
        this.visualScrollRow = 0;
        this.onChange = onChange;

        // Visual line mapping
        this.visualToLogicalMap = [];
        this.allVisualLines = [];

        // Cache for visual cursor to avoid creating new arrays
        this._cachedVisualCursor = [0, 0];
        this._cachedCursorKey = '0,0';

        // Cache for viewport visual lines
        this._cachedViewportLines = [];
        this._cachedViewportKey = '';

        // Track previous text for change detection
        this._previousText = this.text;

        this.updateVisualLines();
    }

    notifyChange() {
        if (this.onChange) {
            // Only notify if text actually changed, not just cursor position
            const currentText = this.text;
            if (currentText !== this._previousText) {
                this._previousText = currentText;
                this.onChange();
            }
        }
    }

    get text() {
        return this.lines.join('\n');
    }

    get viewportVisualLines() {
        const start = this.visualScrollRow;
        const end = start + this.viewport.height;
        const viewportKey = `${start},${end},${this.allVisualLines.length}`;

        if (viewportKey !== this._cachedViewportKey) {
            this._cachedViewportLines = this.allVisualLines.slice(start, end);
            this._cachedViewportKey = viewportKey;
        }

        return this._cachedViewportLines;
    }

    get visualCursor() {
        const cursorKey = `${this.cursor[0]},${this.cursor[1]}`;
        if (cursorKey !== this._cachedCursorKey) {
            this._cachedVisualCursor = this.logicalToVisual(this.cursor);
            this._cachedCursorKey = cursorKey;
        }
        return this._cachedVisualCursor;
    }

    /**
     * Update visual line wrapping
     */
    updateVisualLines() {
        const newVisualLines = [];
        const newVisualToLogicalMap = [];

        for (let logicalRow = 0; logicalRow < this.lines.length; logicalRow++) {
            const line = this.lines[logicalRow];
            const wrapped = this.wrapLine(line);

            for (let i = 0; i < wrapped.length; i++) {
                newVisualLines.push(wrapped[i]);
                newVisualToLogicalMap.push([logicalRow, i * this.viewport.width]);
            }
        }

        // Only update if something changed
        let changed = false;
        if (newVisualLines.length !== this.allVisualLines.length) {
            changed = true;
        } else {
            for (let i = 0; i < newVisualLines.length; i++) {
                if (newVisualLines[i] !== this.allVisualLines[i]) {
                    changed = true;
                    break;
                }
            }
        }

        if (changed) {
            this.allVisualLines = newVisualLines;
            this.visualToLogicalMap = newVisualToLogicalMap;
            // Invalidate viewport cache when visual lines change
            this._cachedViewportKey = '';
            this._cachedCursorKey = '';
        }

        // Ensure cursor is visible
        const [visualRow] = this.visualCursor;
        if (visualRow < this.visualScrollRow) {
            this.visualScrollRow = visualRow;
        } else if (visualRow >= this.visualScrollRow + this.viewport.height) {
            this.visualScrollRow = visualRow - this.viewport.height + 1;
        }
    }


    /**
     * Wrap a line to viewport width
     */
    wrapLine(line) {
        if (!line) return [''];

        const result = [];
        const cps = toCodePoints(line);
        let currentLine = '';
        let currentWidth = 0;

        for (const cp of cps) {
            const cpWidth = stringWidth(cp);
            if (currentWidth + cpWidth > this.viewport.width) {
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

    /**
     * Convert logical cursor to visual cursor
     */
    logicalToVisual(logicalCursor) {
        const [row, col] = logicalCursor;
        const line = this.lines[row] || '';
        const wrappedLines = this.wrapLine(line);

        let remainingCol = col;
        let visualRow = 0;

        // Count visual rows before this logical row
        for (let i = 0; i < row; i++) {
            visualRow += this.wrapLine(this.lines[i]).length;
        }

        // Find position within wrapped lines
        for (let i = 0; i < wrappedLines.length; i++) {
            const lineLen = cpLen(wrappedLines[i]);
            if (remainingCol <= lineLen) {
                return [visualRow + i, remainingCol];
            }
            remainingCol -= lineLen;
        }

        return [visualRow + wrappedLines.length - 1, cpLen(wrappedLines[wrappedLines.length - 1])];
    }

    /**
     * Set text content
     */
    setText(newText) {
        this.lines = newText ? newText.split('\n') : [''];
        this.cursor = [0, 0];
        this.updateVisualLines();
        this.notifyChange();
    }

    /**
     * Handle keyboard input
     * Only handles regular character input, not special keys
     */
    handleInput(key) {
        // Only handle regular text input (not control characters)
        if (key.sequence && key.sequence.length > 0 && !key.ctrl && !key.meta) {
            // Handle paste with newlines (check for \n, \r\n, or \r)
            if (key.sequence.includes('\n') || key.sequence.includes('\r')) {
                // Normalize line endings to \n
                const normalized = key.sequence.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                this.insertMultilineText(normalized);
                return;
            }

            // Filter out control characters
            const isPrintable = key.sequence.split('').every(char => {
                const code = char.charCodeAt(0);
                // Allow printable ASCII (32-126) and extended characters (>= 128)
                return (code >= 32 && code <= 126) || code >= 128;
            });

            if (isPrintable) {
                this.insertText(key.sequence);
            }
        }
    }

    /**
     * Insert text at cursor position
     */
    insertText(text) {
        const [row, col] = this.cursor;
        const line = this.lines[row] || '';
        const before = cpSlice(line, 0, col);
        const after = cpSlice(line, col);

        this.lines[row] = before + text + after;
        this.cursor = [row, col + cpLen(text)];
        this.updateVisualLines();
        this.notifyChange();
    }

    /**
     * Insert multiline text at cursor position
     */
    insertMultilineText(text) {
        const [row, col] = this.cursor;
        const currentLine = this.lines[row] || '';
        const before = cpSlice(currentLine, 0, col);
        const after = cpSlice(currentLine, col);

        const newLines = text.split('\n');

        if (newLines.length === 1) {
            // Single line, use regular insert
            this.insertText(text);
            return;
        }

        // First line: append to current line before cursor
        this.lines[row] = before + newLines[0];

        // Middle lines: insert as new lines
        for (let i = 1; i < newLines.length - 1; i++) {
            this.lines.splice(row + i, 0, newLines[i]);
        }

        // Last line: prepend to text after cursor
        const lastLine = newLines[newLines.length - 1];
        this.lines.splice(row + newLines.length - 1, 0, lastLine + after);

        // Update cursor to end of pasted text
        this.cursor = [row + newLines.length - 1, cpLen(lastLine)];
        this.updateVisualLines();
        this.notifyChange();
    }

    /**
     * Insert newline
     */
    newline() {
        const [row, col] = this.cursor;
        const line = this.lines[row] || '';
        const before = cpSlice(line, 0, col);
        const after = cpSlice(line, col);

        this.lines[row] = before;
        this.lines.splice(row + 1, 0, after);
        this.cursor = [row + 1, 0];
        this.updateVisualLines();
        this.notifyChange();
    }

    /**
     * Backspace
     * Safely handles edge cases and ensures proper cursor positioning
     */
    backspace() {
        const [row, col] = this.cursor;

        // Ensure we have valid lines array
        if (!this.lines || this.lines.length === 0) {
            this.lines = [''];
            this.cursor = [0, 0];
            this.updateVisualLines();

            return;
        }

        // Case 1: Delete character within line
        if (col > 0) {
            const line = this.lines[row] || '';
            const before = cpSlice(line, 0, col - 1);
            const after = cpSlice(line, col);
            this.lines[row] = before + after;
            this.cursor = [row, col - 1];
        }
        // Case 2: Merge with previous line
        else if (row > 0) {
            const currentLine = this.lines[row] || '';
            const prevLine = this.lines[row - 1] || '';
            const prevLineLen = cpLen(prevLine);

            // Merge lines
            this.lines[row - 1] = prevLine + currentLine;
            this.lines.splice(row, 1);

            // Move cursor to end of previous line
            this.cursor = [row - 1, prevLineLen];
        }
        // Case 3: Already at start of first line - do nothing
        else {
            // At position [0, 0], cannot backspace further
            this.updateVisualLines();
            return;
        }

        this.updateVisualLines();
        this.notifyChange();
    }

    /**
     * Delete character at cursor
     * Safely handles edge cases
     */
    delete() {
        const [row, col] = this.cursor;

        // Ensure we have valid lines array
        if (!this.lines || this.lines.length === 0) {
            this.lines = [''];
            this.cursor = [0, 0];
            this.updateVisualLines();

            return;
        }

        const line = this.lines[row] || '';
        const lineLen = cpLen(line);

        // Case 1: Delete character within line
        if (col < lineLen) {
            const before = cpSlice(line, 0, col);
            const after = cpSlice(line, col + 1);
            this.lines[row] = before + after;
        }
        // Case 2: Merge with next line
        else if (row < this.lines.length - 1) {
            const nextLine = this.lines[row + 1] || '';
            this.lines[row] = line + nextLine;
            this.lines.splice(row + 1, 1);
        }
        // Case 3: At end of last line - do nothing
        else {
            // Already at end, cannot delete further
            this.updateVisualLines();
            return;
        }

        this.updateVisualLines();
        this.notifyChange();
    }

    /**
     * Move cursor
     */
    move(direction) {
        const [row, col] = this.cursor;
        const line = this.lines[row] || '';
        const oldCursor = [...this.cursor];

        switch (direction) {
            case 'left':
                if (col > 0) {
                    this.cursor = [row, col - 1];
                } else if (row > 0) {
                    this.cursor = [row - 1, cpLen(this.lines[row - 1] || '')];
                }
                break;

            case 'right':
                if (col < cpLen(line)) {
                    this.cursor = [row, col + 1];
                } else if (row < this.lines.length - 1) {
                    this.cursor = [row + 1, 0];
                }
                break;

            case 'up':
                if (row > 0) {
                    const prevLineLen = cpLen(this.lines[row - 1] || '');
                    this.cursor = [row - 1, Math.min(col, prevLineLen)];
                }
                break;

            case 'down':
                if (row < this.lines.length - 1) {
                    const nextLineLen = cpLen(this.lines[row + 1] || '');
                    this.cursor = [row + 1, Math.min(col, nextLineLen)];
                }
                break;

            case 'home':
                this.cursor = [row, 0];
                break;

            case 'end':
                this.cursor = [row, cpLen(line)];
                break;
        }

        const cursorChanged = oldCursor[0] !== this.cursor[0] || oldCursor[1] !== this.cursor[1];

        if (cursorChanged) {
            this.updateVisualLines();
            // Always notify for cursor changes - needed for display update
            this.notifyChange();
        }
    }

    /**
     * Move to offset position
     */
    moveToOffset(offset) {
        this.cursor = offsetToLogicalPos(this.lines, offset);
        this.updateVisualLines();
        
    }

    /**
     * Replace range by offset
     */
    replaceRangeByOffset(startOffset, endOffset, replacement) {
        const fullText = this.text;
        const cps = toCodePoints(fullText);
        const before = cps.slice(0, startOffset).join('');
        const after = cps.slice(endOffset).join('');

        this.setText(before + replacement + after);
        this.moveToOffset(startOffset + cpLen(replacement));
    }

    /**
     * Kill line right (Ctrl+K)
     */
    killLineRight() {
        const [row, col] = this.cursor;
        const line = this.lines[row] || '';
        this.lines[row] = cpSlice(line, 0, col);
        this.updateVisualLines();
        this.notifyChange();
    }

    /**
     * Kill line left (Ctrl+U)
     */
    killLineLeft() {
        const [row, col] = this.cursor;
        const line = this.lines[row] || '';
        this.lines[row] = cpSlice(line, col);
        this.cursor = [row, 0];
        this.updateVisualLines();
        this.notifyChange();
    }

    /**
     * Delete word left (Ctrl+W)
     */
    deleteWordLeft() {
        const [row, col] = this.cursor;
        if (col === 0) return;

        const line = this.lines[row] || '';
        const before = cpSlice(line, 0, col);
        const after = cpSlice(line, col);

        // Find word boundary
        const trimmed = before.trimEnd();
        const lastSpace = trimmed.lastIndexOf(' ');
        const newCol = lastSpace >= 0 ? lastSpace + 1 : 0;

        this.lines[row] = cpSlice(line, 0, newCol) + after;
        this.cursor = [row, newCol];
        this.updateVisualLines();
        this.notifyChange();
    }

    /**
     * Open in external editor (stub for now)
     */
    openInExternalEditor() {
        consolelog('External editor not implemented yet');
    }
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
