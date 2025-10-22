/**
 * Notifications - System notifications and warnings
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/semantic-tokens.js';
import { useUIState, StreamingState } from '../contexts/UIStateContext.js';

export function Notifications({ warnings = [], errors = [] }) {
    const uiState = useUIState();

    // Don't show notifications during streaming to avoid clutter
    if (uiState.streamingState === StreamingState.Responding) {
        return null;
    }

    if (warnings.length === 0 && errors.length === 0) {
        return null;
    }

    return React.createElement(Box, {
        flexDirection: "column",
        marginBottom: 1
    },
        warnings.length > 0 && React.createElement(Box, {
            borderStyle: "round",
            borderColor: theme.status.warning,
            paddingX: 1,
            marginBottom: errors.length > 0 ? 1 : 0,
            flexDirection: "column"
        },
            warnings.map((warning, index) =>
                React.createElement(Text, {
                    key: index,
                    color: theme.status.warning
                }, '⚠ ' + warning)
            )
        ),

        errors.length > 0 && React.createElement(Box, {
            borderStyle: "round",
            borderColor: theme.status.error,
            paddingX: 1,
            flexDirection: "column"
        },
            errors.map((error, index) =>
                React.createElement(Text, {
                    key: index,
                    color: theme.status.error
                }, '✗ ' + error)
            )
        )
    );
}
