/**
 * Footer component with status information
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';
import { AI_MODELS } from '../../config/ai_models.js';

export function Footer({ model = 'gpt-4', reasoningEffort = null, cwd = process.cwd() }) {
    const displayCwd = cwd.length > 40 ? '...' + cwd.slice(-37) : cwd;

    // Display reasoning effort for models that support it
    let displayModel = model;
    const modelInfo = AI_MODELS[model];
    const supportsReasoningEffort = modelInfo?.supportsReasoning || false;
    if (reasoningEffort && supportsReasoningEffort) {
        displayModel = `${model} (${reasoningEffort})`;
    }

    return React.createElement(Box, { paddingX: 1, marginTop: 0, gap: 1 },
        React.createElement(Text, { color: theme.brand.dark }, displayModel),
        React.createElement(Text, { color: theme.brand.dark }, displayCwd)
    );
}
