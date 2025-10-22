/**
 * SessionSpinner - Displays animated spinner for session processing
 * Memoized to prevent parent re-renders from animation updates
 */

import React, { useState, useEffect, memo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../themes/semantic-tokens.js';

// Internal component that handles the animation
const SpinnerContent = memo(function SpinnerContent({ message, elapsedSeconds }) {
    const formatTime = (seconds) => {
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    return React.createElement(Box, {
        height: 1,
        paddingLeft: 1,
        paddingY: 0,
        marginBottom: 0
    },
        React.createElement(Box, { marginRight: 1 },
            React.createElement(Text, { color: theme.text.accent },
                React.createElement(Spinner, { type: 'dots' })
            )
        ),
        React.createElement(Text, { color: theme.text.accent }, message),
        React.createElement(Text, { color: theme.text.secondary },
            ` (${formatTime(elapsedSeconds)})`
        )
    );
});

// Outer component with minimal re-render impact
export const SessionSpinner = memo(function SessionSpinner({ isRunning, message = 'Processing...' }) {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        if (!isRunning) {
            setElapsedSeconds(0);
            return;
        }

        const timer = setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [isRunning]);

    // Always render a Box with fixed height to prevent layout shift
    if (!isRunning) {
        return React.createElement(Box, {
            height: 1,
            paddingLeft: 1,
            paddingY: 0,
            marginBottom: 0
        });
    }

    return React.createElement(SpinnerContent, {
        message,
        elapsedSeconds
    });
});
