/**
 * Model List View Component - Ink-based UI for displaying available models
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';

export function ModelListView({ openaiModels }) {
    const sections = [
        // Header
        React.createElement(Box, {
            key: 'header',
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

        React.createElement(Text, { key: 'spacer1' }, null),

        // OpenAI Section
        React.createElement(Box, {
            key: 'openai-section',
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
        )
    ];

    sections.push(
        React.createElement(Text, { key: 'spacer4' }, null),

        // Footer
        React.createElement(Box, {
            key: 'footer',
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
            React.createElement(Text, { color: theme.text.link }, '  OpenAI: https://platform.openai.com/docs/pricing')
        )
    );

    return React.createElement(Box, {
        flexDirection: 'column',
        paddingX: 2,
        paddingY: 1
    }, ...sections);
}
