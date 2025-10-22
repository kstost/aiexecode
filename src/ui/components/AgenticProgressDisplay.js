/**
 * AgenticProgressDisplay - Shows agentic coding operations with detailed progress
 * Isolated animation to prevent parent re-renders
 */

import React, { useState, useEffect, memo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/semantic-tokens.js';

const OPERATION_ICONS = {
    thinking: '🤔',
    analyzing: '🔍',
    reading: '📖',
    writing: '✏️',
    editing: '📝',
    executing: '⚙️',
    building: '🔨',
    testing: '🧪',
    debugging: '🐛',
    searching: '🔎',
    planning: '📋',
    completed: '✅'
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Isolated spinner component
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
export const AgenticProgressDisplay = memo(function AgenticProgressDisplay({ operations = [] }) {
    if (operations.length === 0) {
        return null;
    }

    return React.createElement(Box, {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: theme.border.default,
        paddingX: 1,
        marginBottom: 1
    },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { color: theme.text.accent, bold: true },
                '🤖 Agentic Operations')
        ),
        operations.map((op, index) =>
            React.createElement(OperationItem, {
                key: op.id || index,
                operation: op
            })
        )
    );
});

const OperationItem = memo(function OperationItem({ operation }) {
    const { type, name, status, progress, detail, startTime } = operation;

    const icon = OPERATION_ICONS[type] || '•';
    const statusColor = {
        running: theme.status.info,
        completed: theme.status.success,
        error: theme.status.error,
        waiting: theme.text.secondary
    }[status] || theme.text.secondary;

    const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

    return React.createElement(Box, {
        flexDirection: "column",
        marginBottom: 0
    },
        React.createElement(Box, { flexDirection: "row" },
            status === 'running' && React.createElement(SpinnerFrame),
            React.createElement(Text, null, icon + ' '),
            React.createElement(Text, { color: statusColor, bold: status === 'running' }, name),
            status === 'running' && elapsed > 0 && React.createElement(Text, {
                color: theme.text.secondary,
                dimColor: true
            }, ` (${elapsed}s)`)
        ),
        detail && React.createElement(Box, { marginLeft: 4 },
            React.createElement(Text, {
                color: theme.text.secondary,
                dimColor: true
            }, detail)
        ),
        progress && React.createElement(Box, { marginLeft: 4 },
            React.createElement(ProgressBar, { progress })
        )
    );
});

const ProgressBar = memo(function ProgressBar({ progress }) {
    const percentage = Math.min(100, Math.max(0, progress));
    const width = 40;
    const filled = Math.floor((percentage / 100) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    return React.createElement(Box, { flexDirection: "row" },
        React.createElement(Text, { color: theme.status.info }, bar),
        React.createElement(Text, {
            color: theme.text.secondary,
            dimColor: true
        }, ` ${percentage.toFixed(0)}%`)
    );
});
