/**
 * History display component for showing message history
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/semantic-tokens.js';

function renderHistoryItem(item, index) {
    const { type } = item;

    switch (type) {
        case 'user':
            return React.createElement(Box, { key: index, marginBottom: 1 },
                React.createElement(Text, { color: theme.text.accent, bold: true }, '> '),
                React.createElement(Text, { color: theme.text.primary }, item.text)
            );

        case 'assistant':
            return React.createElement(Box, { key: index, marginBottom: 1 },
                React.createElement(Text, { color: theme.status.info, bold: true }, '◆ '),
                React.createElement(Text, { color: theme.text.primary }, item.text)
            );

        case 'system':
            return React.createElement(Box, { key: index, marginBottom: 1 },
                React.createElement(Text, { color: theme.text.secondary }, item.text)
            );

        case 'error':
            return React.createElement(Box, { key: index, marginBottom: 1 },
                React.createElement(Text, { color: theme.status.error, bold: true }, '✗ '),
                React.createElement(Text, { color: theme.status.error }, item.text)
            );

        case 'iteration_start':
            return React.createElement(Box, { key: index, marginY: 1, borderStyle: "round", borderColor: theme.border.focused, paddingX: 1 },
                React.createElement(Text, { color: theme.text.accent, bold: true },
                    `🔄 Iteration ${item.iterationNumber}`)
            );

        case 'tool_start':
            return React.createElement(Box, { key: index, marginBottom: 1 },
                React.createElement(Text, { color: theme.status.success, bold: true }, '⚙ '),
                React.createElement(Text, { color: theme.status.success }, item.toolName)
            );

        case 'tool_result':
            return React.createElement(Box, { key: index, marginBottom: 1, marginLeft: 2 },
                React.createElement(Text, { color: theme.text.secondary }, item.result.stdout || '')
            );

        case 'code_execution':
            return React.createElement(Box, { key: index, flexDirection: "column", marginBottom: 1 },
                React.createElement(Box, {
                    borderStyle: "round",
                    borderColor: theme.status.success,
                    paddingX: 1
                },
                    React.createElement(Text, { color: theme.status.success }, item.code)
                )
            );

        case 'code_result':
            return React.createElement(Box, { key: index, flexDirection: "column", marginBottom: 1, marginLeft: 2 },
                item.stdout && React.createElement(Text, { color: theme.text.primary }, item.stdout),
                item.stderr && React.createElement(Text, { color: theme.status.error }, item.stderr),
                item.exitCode !== 0 && React.createElement(Text, { color: theme.status.warning },
                    `Exit code: ${item.exitCode}`)
            );

        case 'rag_search':
            return React.createElement(Box, { key: index, marginBottom: 1 },
                React.createElement(Text, { color: theme.status.info }, '🔍 '),
                React.createElement(Text, { color: theme.text.secondary },
                    `RAG context: ${item.contextLength} chars`)
            );

        case 'conversation_restored':
            return React.createElement(Box, { key: index, marginBottom: 1 },
                React.createElement(Text, { color: theme.status.info },
                    `🔄 Restored ${item.messageCount} messages`)
            );

        case 'verification_result':
            return React.createElement(Box, { key: index, flexDirection: "column", marginY: 1,
                borderStyle: "round", borderColor: theme.border.default, paddingX: 1 },
                React.createElement(Text, { color: theme.text.accent }, `Decision: ${item.result.decision}`),
                item.result.improvement_points && React.createElement(Text, { color: theme.text.secondary },
                    `Next: ${item.result.improvement_points}`)
            );

        case 'mission_completed':
            return React.createElement(Box, { key: index, marginY: 1 },
                React.createElement(Text, { color: theme.status.success, bold: true },
                    '✅ Mission Complete!')
            );

        case 'mission_failed':
            return React.createElement(Box, { key: index, marginY: 1 },
                React.createElement(Text, { color: theme.status.error, bold: true },
                    `❌ Mission Failed: ${item.reason}`)
            );

        default:
            return React.createElement(Box, { key: index, marginBottom: 1 },
                React.createElement(Text, { color: theme.text.secondary },
                    JSON.stringify(item))
            );
    }
}

export function HistoryDisplay({ history = [] }) {
    if (history.length === 0) {
        return null;
    }

    return React.createElement(Box, { flexDirection: "column", marginBottom: 1 },
        history.map((item, index) => renderHistoryItem(item, index))
    );
}
