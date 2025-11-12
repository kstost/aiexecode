/**
 * Model Updated View Component - Ink-based UI for model update confirmation
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';

export function ModelUpdatedView({ provider, modelId, modelInfo, settingsFile, warning }) {
    return React.createElement(Box, {
        flexDirection: 'column'
    },
        React.createElement(Text, {
            color: 'green'
        }, `Model updated: ${modelId}`),

        // Warning if API key not configured
        warning && React.createElement(Text, {
            color: 'yellow'
        }, `Warning: ${warning.message} ${warning.hint}`)
    );
}
