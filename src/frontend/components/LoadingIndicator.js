/**
 * Loading Indicator component
 * Displays a loading spinner during initialization
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export function LoadingIndicator({ tasks = [] }) {
    return React.createElement(Box, {
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: 10
    },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { color: "cyan" },
                React.createElement(Spinner, { type: "dots" }),
                " Initializing..."
            )
        ),
        tasks.length > 0 && tasks.map((task) =>
            React.createElement(Text, {
                key: task.id,
                color: "gray",
                dimColor: true
            }, task.text)
        )
    );
}
