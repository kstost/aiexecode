/**
 * Model Updated View Component - Ink-based UI for model update confirmation
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';

export function ModelUpdatedView({ provider, modelId, modelInfo, settingsFile, warning }) {
    const providerColors = {
        openai: 'cyan'
    };

    const providerEmojis = {
        openai: '🤖'
    };

    return React.createElement(Box, {
        flexDirection: 'column',
        paddingX: 2,
        paddingY: 1
    },
        // Header
        React.createElement(Box, {
            borderStyle: 'double',
            borderColor: 'gray',
            paddingX: 2,
            paddingY: 0,
            justifyContent: 'center'
        },
            React.createElement(Text, {
                bold: true,
                color: 'whiteBright'
            }, '✓ Model Updated Successfully')
        ),

        React.createElement(Text, null),

        // Main Content
        React.createElement(Box, {
            flexDirection: 'column',
            borderStyle: 'round',
            borderColor: 'gray',
            paddingX: 2,
            paddingY: 1
        },
            // Provider
            React.createElement(Box, { flexDirection: 'row', gap: 1 },
                React.createElement(Text, {
                    bold: true,
                    color: theme.text.secondary
                }, 'Provider:'),
                React.createElement(Text, {
                    color: providerColors[provider] || 'white',
                    bold: true
                }, `${providerEmojis[provider] || ''} ${provider.toUpperCase()}`)
            ),

            React.createElement(Text, null),

            // Model ID
            React.createElement(Box, { flexDirection: 'row', gap: 1 },
                React.createElement(Text, {
                    bold: true,
                    color: theme.text.secondary
                }, 'Model ID:'),
                React.createElement(Text, {
                    color: 'white',
                    bold: true
                }, modelId)
            ),

            React.createElement(Text, null),

            // Name
            React.createElement(Box, { flexDirection: 'row', gap: 1 },
                React.createElement(Text, {
                    bold: true,
                    color: theme.text.secondary
                }, 'Name:'),
                React.createElement(Text, {
                    color: 'white'
                }, modelInfo.name)
            ),

            React.createElement(Text, null),

            // Description
            React.createElement(Box, { flexDirection: 'column' },
                React.createElement(Text, {
                    bold: true,
                    color: theme.text.secondary
                }, 'Description:'),
                React.createElement(Text, {
                    color: theme.text.secondary,
                    dimColor: true
                }, `  ${modelInfo.description}`)
            ),

            modelInfo.pricing && React.createElement(React.Fragment, null,
                React.createElement(Text, null),

                // Pricing
                React.createElement(Box, { flexDirection: 'row', gap: 1 },
                    React.createElement(Text, {
                        bold: true,
                        color: theme.text.secondary
                    }, 'Pricing:'),
                    React.createElement(Text, {
                        color: 'green'
                    }, `💰 $${modelInfo.pricing.input}/$${modelInfo.pricing.output}`),
                    React.createElement(Text, {
                        dimColor: true,
                        italic: true
                    }, '(input/output per 1M tokens)')
                )
            ),

            React.createElement(Text, null),

            // Saved to
            React.createElement(Box, { flexDirection: 'row', gap: 1 },
                React.createElement(Text, {
                    dimColor: true,
                    italic: true
                }, '📁 Saved to:'),
                React.createElement(Text, {
                    dimColor: true,
                    italic: true
                }, settingsFile)
            )
        ),

        // Warning if API key not configured
        warning && React.createElement(React.Fragment, null,
            React.createElement(Text, null),
            React.createElement(Box, {
                flexDirection: 'column',
                borderStyle: 'round',
                borderColor: 'gray',
                paddingX: 2,
                paddingY: 1
            },
                React.createElement(Text, {
                    bold: true,
                    color: 'yellow'
                }, '⚠ Warning'),
                React.createElement(Text, null),
                React.createElement(Text, { color: theme.text.secondary }, warning.message),
                React.createElement(Text, {
                    dimColor: true,
                    italic: true
                }, warning.hint)
            )
        )
    );
}
