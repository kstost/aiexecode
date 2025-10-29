/**
 * TodoList Component
 * Displays the current task list with status indicators
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';

const getStatusIcon = (status) => {
    switch (status) {
        case 'completed':
            return '✓';
        case 'in_progress':
            return '→';
        case 'pending':
            return '○';
        default:
            return '?';
    }
};

const getStatusColor = (status) => {
    switch (status) {
        case 'completed':
            return theme.brand.light;
        case 'in_progress':
            return theme.brand.light;
        case 'pending':
            return theme.brand.dark;
        default:
            return theme.text.primary;
    }
};

export function TodoList({ todos }) {
    if (!todos || todos.length === 0) {
        return null;
    }

    return React.createElement(Box, { flexDirection: "column", marginTop: 1, marginBottom: 1 },
        React.createElement(Box, null,
            React.createElement(Text, { bold: true, color: theme.brand.light }, '• Tasks:')
        ),
        ...todos.map((todo, index) =>
            React.createElement(Box, { key: index, marginLeft: 2 },
                React.createElement(Text, {
                    color: getStatusColor(todo.status),
                    strikethrough: todo.status === 'completed'
                },
                    `${getStatusIcon(todo.status)} ${todo.status === 'in_progress' ? todo.activeForm : todo.content}`
                )
            )
        )
    );
}
