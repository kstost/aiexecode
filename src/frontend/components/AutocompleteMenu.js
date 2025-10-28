/**
 * Autocomplete menu component for command suggestions
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';

export function AutocompleteMenu({ suggestions = [], activeIndex = 0 }) {
    if (suggestions.length === 0) {
        return null;
    }

    return React.createElement(Box, {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: theme.border.default,
        paddingX: 1,
        marginTop: 0
    },
        React.createElement(Text, { color: theme.text.secondary, bold: true }, 'Suggestions'),
        suggestions.map((suggestion, index) => {
            const isActive = index === activeIndex;
            return React.createElement(Box, { key: index, marginLeft: 1 },
                React.createElement(Text, {
                    color: isActive ? theme.text.accent : theme.text.primary,
                    bold: isActive
                },
                    isActive ? '▶ ' : '  ',
                    suggestion.value,
                    suggestion.description && React.createElement(Text, { color: theme.text.secondary },
                        ' - ' + suggestion.description)
                )
            );
        }),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { color: theme.text.secondary, dimColor: true },
                '↑/↓ to navigate, Tab to accept')
        )
    );
}
