/**
 * Keypress hook for handling keyboard input
 */

import { useInput } from 'ink';

export function useKeypress(handler, options = {}) {
    const { isActive = true } = options;

    useInput((input, key) => {
        if (!isActive) return;

        // Fix backspace detection - Ink has serious bugs
        // Workaround: Ignore empty sequence events and wait for valid ones
        let actualBackspace = false;
        let actualDelete = false;

        // Check key.name first (most reliable when present)
        if (key.name === 'backspace') {
            actualBackspace = true;
        } else if (key.name === 'delete') {
            actualDelete = true;
        }
        // If key.name is undefined, check the original flags
        else if (key.backspace === true) {
            // For backspace, only accept if there's sequence data (Ink bug workaround)
            if (input && input.length > 0) {
                actualBackspace = true;
            } else {
                // Ignore spurious empty backspace events
                return;
            }
        } else if (key.delete === true) {
            // WORKAROUND: In some terminals, backspace is mapped to delete with empty input
            // If delete flag is set but there's no input sequence, treat it as backspace
            if (!input || input.length === 0) {
                actualBackspace = true;
            } else {
                actualDelete = true;
            }
        }
        // Last resort: check input sequence
        else if (input && input.length > 0) {
            const charCode = input.charCodeAt(0);
            // Backspace: \x7F (127) or \x08 (8)
            if (charCode === 127 || charCode === 8) {
                actualBackspace = true;
            }
            // Delete: ESC[3~
            else if (input === '\x1B[3~' || input.startsWith('\x1B[3')) {
                actualDelete = true;
            }
        }

        // Count multiple backspaces/deletes in the sequence (for fast deletion)
        let repeatCount = 1;
        if ((actualBackspace || actualDelete) && input && input.length > 1) {
            // Count how many backspace/delete characters are in the sequence
            if (actualBackspace) {
                repeatCount = Array.from(input).filter(c =>
                    c.charCodeAt(0) === 127 || c.charCodeAt(0) === 8
                ).length;
            }
            // For delete, it's always 1 (escape sequences don't batch)
        }

        // Detect Ctrl+C/D when name is undefined
        let detectedName = key.name;
        if (key.ctrl && !detectedName && input) {
            // In Ink's raw mode, Ctrl+C comes as input="c" with ctrl=true
            // not as charCode 3
            if (input.toLowerCase() === 'c') {
                detectedName = 'c';
            } else if (input.toLowerCase() === 'd') {
                detectedName = 'd';
            } else {
                // Fallback: check for actual control characters
                const charCode = input.charCodeAt(0);
                if (charCode === 3) {
                    detectedName = 'c';
                } else if (charCode === 4) {
                    detectedName = 'd';
                }
            }
        }

        // Normalize key object to prevent undefined issues
        const normalizedKey = {
            ...key,
            sequence: input,
            name: key.return ? 'return' : detectedName,
            ctrl: key.ctrl ?? false,
            meta: key.meta ?? false,
            shift: key.shift ?? false,
            escape: key.escape ?? false,
            return: key.return ?? false,
            upArrow: key.upArrow ?? false,
            downArrow: key.downArrow ?? false,
            leftArrow: key.leftArrow ?? false,
            rightArrow: key.rightArrow ?? false,
            backspace: actualBackspace,  // Use corrected value
            delete: actualDelete,        // Use corrected value
            repeatCount: repeatCount,    // NEW: How many times to repeat
            tab: key.tab ?? false,
            home: key.home ?? false,
            end: key.end ?? false,
            pageUp: key.pageUp ?? false,
            pageDown: key.pageDown ?? false,
            paste: key.paste ?? false, // Important for paste detection
        };

        handler(normalizedKey);
    }, { isActive });
}

/**
 * Key matcher functions
 */
export const keyMatchers = {
    SUBMIT: (key) => key.return && !key.shift && !key.ctrl && !key.meta,
    NEWLINE: (key) => key.return && key.shift,
    ESCAPE: (key) => key.escape,
    NAVIGATION_UP: (key) => key.upArrow && !key.ctrl,
    NAVIGATION_DOWN: (key) => key.downArrow && !key.ctrl,
    HISTORY_UP: (key) => key.upArrow && !key.ctrl,
    HISTORY_DOWN: (key) => key.downArrow && !key.ctrl,
    COMPLETION_UP: (key) => key.upArrow && key.ctrl,
    COMPLETION_DOWN: (key) => key.downArrow && key.ctrl,
    ACCEPT_SUGGESTION: (key) => key.tab,
    HOME: (key) => (key.name === 'a' && key.ctrl) || key.home,
    END: (key) => (key.name === 'e' && key.ctrl) || key.end,
    CLEAR_INPUT: (key) => key.name === 'c' && key.ctrl && !key.meta,
    CLEAR_SCREEN: (key) => key.name === 'l' && key.ctrl,
    KILL_LINE_RIGHT: (key) => key.name === 'k' && key.ctrl,
    KILL_LINE_LEFT: (key) => key.name === 'u' && key.ctrl,
    DELETE_WORD_BACKWARD: (key) => key.name === 'w' && key.ctrl,
    QUIT: (key) => key.name === 'c' && key.ctrl,
    EXIT: (key) => key.name === 'd' && key.ctrl,
    REVERSE_SEARCH: (key) => key.name === 'r' && key.ctrl,
};

export const Command = Object.keys(keyMatchers).reduce((acc, key) => {
    acc[key] = key;
    return acc;
}, {});
