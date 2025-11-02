/**
 * Advanced Input component with multi-line support
 */

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';
import { useKeypress, keyMatchers, Command } from '../hooks/useKeypress.js';
import { useCompletion } from '../hooks/useCompletion.js';
import { AutocompleteMenu } from './AutocompleteMenu.js';
import { cpSlice, cpLen } from '../utils/inputBuffer.js';
import { uiEvents } from '../../system/ui_events.js';
import chalk from 'chalk';
import stringWidth from 'string-width';

// 20개의 placeholder 메시지
const PLACEHOLDER_MESSAGES = [
    '  Fix all bugs in the codebase',
    '  Add unit tests for the API',
    '  Refactor the authentication module',
    '  Optimize database queries',
    '  Implement user profile page',
    '  Add error handling to services',
    '  Write documentation for utils',
    '  Create REST API endpoints',
    '  Set up CI/CD pipeline',
    '  Improve code performance',
    '  Add input validation',
    '  Implement caching layer',
    '  Fix linting errors',
    '  Add logging functionality',
    '  Create data migration scripts',
    '  Implement search feature',
    '  Add authentication middleware',
    '  Optimize bundle size',
    '  Update dependencies',
    '  Add responsive design'
];

// 무작위 placeholder 선택 함수
function getRandomPlaceholder() {
    return PLACEHOLDER_MESSAGES[Math.floor(Math.random() * PLACEHOLDER_MESSAGES.length)];
}

function InputPromptComponent({ buffer, onSubmit, onClearScreen, onExit, commands = [], placeholder, focus = true, isSessionRunning = false }) {
    const [isExiting, setIsExiting] = useState(false);

    // placeholder가 제공되지 않으면 무작위로 선택 (컴포넌트 마운트 시 한 번만)
    const defaultPlaceholder = useMemo(() => placeholder || getRandomPlaceholder(), []);

    const completionRaw = useCompletion(buffer, commands);

    // Stabilize completion object to prevent handleInput from being recreated
    const completion = useMemo(() => completionRaw, [
        completionRaw.showSuggestions,
        completionRaw.suggestions.length,
        completionRaw.activeSuggestionIndex,
        completionRaw.handleAutocomplete,
        completionRaw.navigateUp,
        completionRaw.navigateDown
    ]);


    const handleSubmitAndClear = useCallback((submittedValue) => {
        buffer.setText('');
        onSubmit(submittedValue);
    }, [onSubmit, buffer]);

    const handleInput = useCallback((key) => {
        if (!focus) return;

        // Block all input if exiting
        if (isExiting) return;

        // PRIORITY 1: Handle paste events
        if (key.paste) {
            buffer.handleInput(key);
            return;
        }

        // PRIORITY 2: Exit commands
        if (keyMatchers[Command.QUIT](key)) {
            // Direct exit without confirmation
            setIsExiting(true);
            if (onExit) {
                onExit();
            }
            return;
        }

        if (keyMatchers[Command.EXIT](key)) {
            if (buffer.text.length > 0) return;
            // Direct exit
            setIsExiting(true);
            if (onExit) {
                onExit();
            }
            return;
        }

        // PRIORITY 4: Escape handling
        if (keyMatchers[Command.ESCAPE](key)) {
            // 1순위: 자동완성 목록이 열려있으면 목록만 닫기
            if (completion.showSuggestions) {
                completion.resetCompletionState();
                return;
            }

            // 2순위: 입력 텍스트가 있으면 지우기
            if (buffer.text !== '') {
                buffer.setText('');
                return;
            }

            // 3순위: 세션이 실행 중이면 중단 요청
            if (isSessionRunning) {
                // 중단 요청 전송
                uiEvents.requestSessionInterrupt();
                return;
            }

            // 4순위: 아무것도 없으면 무시
            return;
        }

        // PRIORITY 5: Clear screen
        if (keyMatchers[Command.CLEAR_SCREEN](key)) {
            onClearScreen();
            return;
        }

        // PRIORITY 6: Submit handling
        if (keyMatchers[Command.SUBMIT](key)) {
            // Block submission if session is running
            if (isSessionRunning) {
                return;
            }

            // If suggestions are shown, accept the active suggestion
            if (completion.showSuggestions && completion.suggestions.length > 0) {
                const targetIndex = completion.activeSuggestionIndex === -1 ? 0 : completion.activeSuggestionIndex;
                completion.handleAutocomplete(targetIndex);
                // Execute the command immediately
                const completedCommand = completion.suggestions[targetIndex].value;
                handleSubmitAndClear(completedCommand);
                return;
            }

            if (buffer.text.trim()) {
                const [row, col] = buffer.cursor;
                const line = buffer.lines[row];
                const charBefore = col > 0 ? cpSlice(line, col - 1, col) : '';

                if (charBefore === '\\') {
                    buffer.backspace();
                    buffer.newline();
                } else {
                    handleSubmitAndClear(buffer.text);
                }
            }
            return;
        }

        // PRIORITY 7: Newline
        if (keyMatchers[Command.NEWLINE](key)) {
            buffer.newline();
            return;
        }

        // PRIORITY 8: Navigation commands
        if (keyMatchers[Command.HOME](key)) {
            buffer.move('home');
            return;
        }

        if (keyMatchers[Command.END](key)) {
            buffer.move('end');
            return;
        }

        if (keyMatchers[Command.KILL_LINE_LEFT](key)) {
            buffer.killLineLeft();
            return;
        }

        if (keyMatchers[Command.KILL_LINE_RIGHT](key)) {
            buffer.killLineRight();
            return;
        }

        if (keyMatchers[Command.DELETE_WORD_BACKWARD](key)) {
            buffer.deleteWordLeft();
            return;
        }

        // PRIORITY 9: Autocomplete
        if (keyMatchers[Command.ACCEPT_SUGGESTION](key)) {
            if (completion.showSuggestions && completion.suggestions.length > 0) {
                const targetIndex = completion.activeSuggestionIndex === -1 ? 0 : completion.activeSuggestionIndex;
                completion.handleAutocomplete(targetIndex);
                return;
            }
        }

        // PRIORITY 10: Arrow keys (completion or navigation)
        if (key.upArrow) {
            if (completion.showSuggestions && completion.suggestions.length > 1) {
                completion.navigateUp();
                return;
            }
            buffer.move('up');
            return;
        }
        if (key.downArrow) {
            if (completion.showSuggestions && completion.suggestions.length > 1) {
                completion.navigateDown();
                return;
            }
            buffer.move('down');
            return;
        }
        if (key.leftArrow) {
            buffer.move('left');
            return;
        }
        if (key.rightArrow) {
            buffer.move('right');
            return;
        }

        // PRIORITY 11: Backspace and Delete
        if (key.backspace) {
            const count = key.repeatCount || 1;
            for (let i = 0; i < count; i++) {
                buffer.backspace();
            }
            return;
        }

        if (key.delete) {
            const count = key.repeatCount || 1;
            for (let i = 0; i < count; i++) {
                buffer.delete();
            }
            return;
        }

        // PRIORITY 12: Default input handling
        buffer.handleInput(key);
    }, [
        focus,
        buffer,
        onClearScreen,
        handleSubmitAndClear,
        completion,
        isSessionRunning,
        isExiting,
        onExit
    ]);

    useKeypress(handleInput, { isActive: focus });

    // Extract all needed values in one go to avoid multiple getter calls
    const linesToRender = useMemo(() => buffer.viewportVisualLines, [buffer.viewportVisualLines]);
    const [cursorVisualRowAbsolute, cursorVisualColAbsolute] = useMemo(() => buffer.visualCursor, [buffer.visualCursor]);
    const scrollVisualRow = useMemo(() => buffer.visualScrollRow, [buffer.visualScrollRow]);
    const cursorVisualRow = cursorVisualRowAbsolute - scrollVisualRow;
    const bufferTextLength = useMemo(() => buffer.text.length, [buffer.text]);

    return React.createElement(Box, { flexDirection: "column", flexGrow: 1 },
        React.createElement(Box, {
            borderStyle: "round",
            borderColor: theme.brand.light,
            paddingX: 1,
            flexDirection: "row",
            alignItems: "flex-start",
            minHeight: 3,
            maxHeight: 12,  // Limit input height to prevent pushing other elements
            flexShrink: 0   // Prevent input from being squeezed by other elements
            // Don't set explicit width - let Ink calculate it
        },
            React.createElement(Text, { color: theme.brand.light }, '> '),
            React.createElement(Box, { flexGrow: 1, flexDirection: "column" },
                bufferTextLength === 0 && defaultPlaceholder
                    ? (focus
                        ? React.createElement(Text, null,
                            chalk.inverse(defaultPlaceholder.slice(0, 1)),
                            React.createElement(Text, { color: theme.text.secondary }, defaultPlaceholder.slice(1)))
                        : React.createElement(Text, { color: theme.text.secondary }, defaultPlaceholder))
                    : linesToRender.map((lineText, visualIdxInRenderedSet) => {
                        const isOnCursorLine = focus && visualIdxInRenderedSet === cursorVisualRow;
                        let display = lineText;

                        // Render cursor inline
                        if (isOnCursorLine && cursorVisualColAbsolute < cpLen(lineText)) {
                            const charToHighlight = cpSlice(lineText, cursorVisualColAbsolute, cursorVisualColAbsolute + 1);
                            const highlighted = chalk.inverse(charToHighlight);
                            display =
                                cpSlice(lineText, 0, cursorVisualColAbsolute) +
                                highlighted +
                                cpSlice(lineText, cursorVisualColAbsolute + 1);
                        } else if (isOnCursorLine && cursorVisualColAbsolute === cpLen(lineText)) {
                            display = lineText + chalk.inverse(' ');
                        }

                        return React.createElement(Box, { key: `line-${visualIdxInRenderedSet}`, height: 1 },
                            React.createElement(Text, { color: theme.text.primary }, display)
                        );
                    })
            )
        ),

        completion.showSuggestions && React.createElement(AutocompleteMenu, {
            suggestions: completion.suggestions,
            activeIndex: completion.activeSuggestionIndex
        })
    );
}

// Don't memoize - buffer state changes frequently and we need to react to it
// The buffer object reference is stable (from useRef), but its internal state changes
export const Input = InputPromptComponent;
