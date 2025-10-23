/**
 * LoadingIndicator - Shows loading state with thought/progress message
 * Isolated animation to prevent parent re-renders
 */

import React, { useState, useEffect, memo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/semantic-tokens.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Isolated spinner animation component
const SpinnerFrame = memo(function SpinnerFrame() {
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setFrameIndex(prev => (prev + 1) % SPINNER_FRAMES.length);
        }, 80);

        return () => clearInterval(interval);
    }, []);

    return React.createElement(Text, { color: theme.status.info },
        SPINNER_FRAMES[frameIndex] + ' '
    );
});

// Main component
export const LoadingIndicator = memo(function LoadingIndicator({ thought, currentLoadingPhrase, elapsedTime }) {
    if (!thought && !currentLoadingPhrase && !elapsedTime) {
        return null;
    }

    const displayTime = elapsedTime ? `${Math.floor(elapsedTime / 1000)}s` : '';

    return React.createElement(Box, {
        flexDirection: "column",
        marginBottom: 0
    },
        thought && React.createElement(Box, null,
            React.createElement(SpinnerFrame),
            React.createElement(Text, { color: theme.text.link, italic: true }, '💭 ' + thought)
        ),
        currentLoadingPhrase && React.createElement(Box, null,
            React.createElement(SpinnerFrame),
            React.createElement(Text, { color: theme.text.secondary }, currentLoadingPhrase),
            displayTime && React.createElement(Text, {
                color: theme.text.secondary,
                dimColor: true
            }, ` (${displayTime})`)
        )
    );
});
