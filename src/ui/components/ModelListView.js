/**
 * Model List View Component - Ink-based UI for displaying available models
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/semantic-tokens.js';

export function ModelListView({ openaiModels, claudeModels }) {
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
            }, 'Available AI Models')
        ),

        React.createElement(Text, null),

        // OpenAI Section
        React.createElement(Box, {
            flexDirection: 'column',
            borderStyle: 'round',
            borderColor: 'gray',
            paddingX: 2,
            paddingY: 1
        },
            React.createElement(Box, { flexDirection: 'column' },
                React.createElement(Text, {
                    bold: true,
                    color: 'cyan'
                }, '🤖 OpenAI Models'),
                React.createElement(Text, {
                    dimColor: true,
                    italic: true
                }, 'GPT-5 Series (Latest generation, recommended)'),
                React.createElement(Text, null)
            ),

            openaiModels.map((model, index) =>
                React.createElement(Box, {
                    key: model.id,
                    flexDirection: 'column',
                    marginBottom: index < openaiModels.length - 1 ? 1 : 0
                },
                    React.createElement(Box, { flexDirection: 'row', gap: 1 },
                        React.createElement(Text, { color: 'green', bold: true }, '•'),
                        React.createElement(Text, {
                            color: 'white',
                            bold: true
                        }, model.id)
                    ),
                    React.createElement(Box, {
                        flexDirection: 'column',
                        marginLeft: 2,
                        gap: 0
                    },
                        React.createElement(Text, {
                            color: theme.text.secondary
                        }, `${model.name} - ${model.description}`),
                        React.createElement(Text, {
                            dimColor: true,
                            italic: true
                        }, `💰 $${model.pricing.input}/$${model.pricing.output} (input/output per 1M tokens)`)
                    )
                )
            )
        ),

        React.createElement(Text, null),

        // Anthropic Claude 4.x Section
        React.createElement(Box, {
            flexDirection: 'column',
            borderStyle: 'round',
            borderColor: 'gray',
            paddingX: 2,
            paddingY: 1
        },
            React.createElement(Box, { flexDirection: 'column' },
                React.createElement(Text, {
                    bold: true,
                    color: 'magenta'
                }, '🧠 Anthropic Claude Models'),
                React.createElement(Text, {
                    dimColor: true,
                    italic: true
                }, 'Claude 4.x Series (Latest)'),
                React.createElement(Text, null)
            ),

            claudeModels.claude4.map((model, index) =>
                React.createElement(Box, {
                    key: model.id,
                    flexDirection: 'column',
                    marginBottom: index < claudeModels.claude4.length - 1 ? 1 : 0
                },
                    React.createElement(Box, { flexDirection: 'row', gap: 1 },
                        React.createElement(Text, { color: 'green', bold: true }, '•'),
                        React.createElement(Text, {
                            color: 'white',
                            bold: true
                        }, model.id)
                    ),
                    React.createElement(Box, {
                        flexDirection: 'column',
                        marginLeft: 2,
                        gap: 0
                    },
                        React.createElement(Text, {
                            color: theme.text.secondary
                        }, `${model.name} - ${model.description}`),
                        React.createElement(Text, {
                            dimColor: true,
                            italic: true
                        }, `💰 $${model.pricing.input}/$${model.pricing.output} (input/output per 1M tokens)`)
                    )
                )
            )
        ),

        React.createElement(Text, null),

        // Claude 3.x Section
        React.createElement(Box, {
            flexDirection: 'column',
            borderStyle: 'round',
            borderColor: 'gray',
            paddingX: 2,
            paddingY: 1
        },
            React.createElement(Box, { flexDirection: 'column' },
                React.createElement(Text, {
                    dimColor: true,
                    italic: true
                }, 'Claude 3.x Series'),
                React.createElement(Text, null)
            ),

            claudeModels.claude3.map((model, index) =>
                React.createElement(Box, {
                    key: model.id,
                    flexDirection: 'column',
                    marginBottom: index < claudeModels.claude3.length - 1 ? 1 : 0
                },
                    React.createElement(Box, { flexDirection: 'row', gap: 1 },
                        React.createElement(Text, { color: 'green', bold: true }, '•'),
                        React.createElement(Text, {
                            color: 'white',
                            bold: true
                        }, model.id)
                    ),
                    React.createElement(Box, {
                        flexDirection: 'column',
                        marginLeft: 2,
                        gap: 0
                    },
                        React.createElement(Text, {
                            color: theme.text.secondary
                        }, `${model.name} - ${model.description}`),
                        React.createElement(Text, {
                            dimColor: true,
                            italic: true
                        }, `💰 $${model.pricing.input}/$${model.pricing.output} (input/output per 1M tokens)`)
                    )
                )
            )
        ),

        React.createElement(Text, null),

        // Footer
        React.createElement(Box, {
            flexDirection: 'column',
            borderStyle: 'single',
            borderColor: 'gray',
            paddingX: 2,
            paddingY: 1
        },
            React.createElement(Text, { bold: true }, '📖 Usage'),
            React.createElement(Text, null, '  /model <model-id>'),
            React.createElement(Text, { dimColor: true }, '  Example: /model gpt-5'),
            React.createElement(Text, null),
            React.createElement(Text, { bold: true }, '🔗 More Info'),
            React.createElement(Text, { color: theme.text.link }, '  OpenAI: https://platform.openai.com/docs/pricing'),
            React.createElement(Text, { color: theme.text.link }, '  Anthropic: https://docs.claude.com/en/docs/about-claude/models/overview')
        )
    );
}
