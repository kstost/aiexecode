/**
 * Current Model View Component - Ink-based UI for displaying current model configuration
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';

export function CurrentModelView({ provider, modelId, modelInfo }) {
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
            }, '✓ Current Model Configuration')
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

            modelInfo && React.createElement(React.Fragment, null,
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
                )
            )
        ),

        React.createElement(Text, null),

        // Footer
        React.createElement(Box, {
            flexDirection: 'column',
            paddingX: 1
        },
            React.createElement(Text, {
                dimColor: true,
                italic: true
            }, '💡 Use `/model list` to see all available models'),
            React.createElement(Text, {
                dimColor: true,
                italic: true
            }, '💡 Use `/model <model-id>` to change the model')
        )
    );
}
