/**
 * Footer component with status information
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/semantic-tokens.js';
import { OPENAI_MODELS } from '../../config/openai_models.js';

export function Footer({ model = 'gpt-4', reasoningEffort = null, cwd = process.cwd() }) {
    const displayCwd = cwd.length > 40 ? '...' + cwd.slice(-37) : cwd;

    // Display reasoning effort for OpenAI models that support it
    let displayModel = model;
    const modelInfo = OPENAI_MODELS[model];
    const supportsReasoningEffort = modelInfo?.supportsReasoning || false;
    if (reasoningEffort && supportsReasoningEffort) {
        displayModel = `${model} (${reasoningEffort})`;
    }

    return React.createElement(Box, { justifyContent: "space-between", paddingX: 1, marginTop: 1 },
        React.createElement(Box, null,
            React.createElement(Text, { color: theme.text.link }, `CWD:${displayCwd}`)),
        React.createElement(Box, null,
            React.createElement(Text, { color: theme.text.accent }, displayModel))
    );
}
