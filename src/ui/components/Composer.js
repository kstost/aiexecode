/**
 * Composer - Input area with loading indicators and context display
 */

import React from 'react';
import { Box } from 'ink';
import { InputPrompt } from './InputPrompt.js';
import { LoadingIndicator } from './LoadingIndicator.js';
import { AgenticProgressDisplay } from './AgenticProgressDisplay.js';
import { SessionSpinner } from './SessionSpinner.js';
import { useUIState, StreamingState } from '../contexts/UIStateContext.js';

export function Composer({ onSubmit, onClearScreen, commands = [], buffer }) {
    const uiState = useUIState();

    const showLoading = uiState.streamingState === StreamingState.Responding ||
        uiState.streamingState === StreamingState.Executing;

    return React.createElement(Box, {
        flexDirection: "column",
        flexShrink: 0
    },
        showLoading && React.createElement(LoadingIndicator, {
            thought: uiState.thought,
            currentLoadingPhrase: uiState.progressMessage,
            elapsedTime: uiState.elapsedTime
        }),

        uiState.operations.length > 0 && React.createElement(AgenticProgressDisplay, {
            operations: uiState.operations
        }),

        React.createElement(SessionSpinner, {
            isRunning: uiState.isSessionRunning,
            message: uiState.sessionMessage
        }),

        React.createElement(InputPrompt, {
            buffer,
            onSubmit,
            onClearScreen,
            commands,
            focus: true
        })
    );
}
