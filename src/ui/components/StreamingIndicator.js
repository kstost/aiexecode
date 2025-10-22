/**
 * StreamingIndicator - Animated indicator for streaming/processing state
 * Isolated animation to prevent parent re-renders
 */

import React, { useState, useEffect, memo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/semantic-tokens.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DOTS_FRAMES = ['.  ', '.. ', '...', '   '];

// Isolated animation component
const AnimatedFrame = memo(function AnimatedFrame({ type }) {
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
        const frames = type === 'spinner' ? SPINNER_FRAMES : DOTS_FRAMES;
        const interval = setInterval(() => {
            setFrameIndex(prev => (prev + 1) % frames.length);
        }, type === 'spinner' ? 80 : 400);

        return () => clearInterval(interval);
    }, [type]);

    const frames = type === 'spinner' ? SPINNER_FRAMES : DOTS_FRAMES;
    return React.createElement(Text, { color: theme.status.info }, frames[frameIndex] + ' ');
});

// Main component
export const StreamingIndicator = memo(function StreamingIndicator({ message = 'Processing', type = 'spinner' }) {
    return React.createElement(Box, { marginLeft: 2, marginTop: 0 },
        React.createElement(AnimatedFrame, { type }),
        React.createElement(Text, { color: theme.text.secondary }, message)
    );
});
