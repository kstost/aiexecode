/**
 * Help View Component - Ink-based UI for displaying available commands
 */

import React from 'react';
import { Box, Text } from 'ink';

export function HelpView({ commands }) {
    // 커맨드를 카테고리별로 분류
    const aiCommands = commands.filter(cmd =>
        ['model', 'reasoning_effort', 'apikey'].includes(cmd.name)
    );

    const sessionCommands = commands.filter(cmd =>
        ['clear', 'exit'].includes(cmd.name)
    );

    const otherCommands = commands.filter(cmd =>
        !aiCommands.includes(cmd) && !sessionCommands.includes(cmd)
    );

    const renderCommandGroup = (title, commandList) => {
        if (commandList.length === 0) return null;

        return React.createElement(React.Fragment, null,
            React.createElement(Box, {
                flexDirection: 'column',
                borderStyle: 'round',
                borderColor: 'gray',
                paddingX: 2,
                paddingY: 1,
                marginBottom: 1
            },
                React.createElement(Text, {
                    bold: true,
                    color: 'cyan'
                }, title),
                React.createElement(Text, null),

                commandList.map(cmd =>
                    React.createElement(Box, {
                        key: cmd.name,
                        flexDirection: 'column',
                        marginBottom: 1
                    },
                        React.createElement(Box, { flexDirection: 'row', gap: 1 },
                            React.createElement(Text, { color: 'green', bold: true }, '•'),
                            React.createElement(Text, { color: 'white', bold: true }, cmd.usage)
                        ),
                        React.createElement(Box, {
                            flexDirection: 'row',
                            marginLeft: 2
                        },
                            React.createElement(Text, { color: 'gray' }, cmd.description)
                        )
                    )
                )
            )
        );
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
            }, 'Available Commands')
        ),

        React.createElement(Text, null),

        // AI Configuration Commands
        renderCommandGroup('🤖 AI Configuration', aiCommands),

        // Session Commands
        renderCommandGroup('📝 Session', sessionCommands),

        // Other Commands
        renderCommandGroup('🔧 Other', otherCommands),

        // Footer
        React.createElement(Box, {
            flexDirection: 'column',
            borderStyle: 'single',
            borderColor: 'gray',
            paddingX: 2,
            paddingY: 1
        },
            React.createElement(Text, {
                dimColor: true,
                italic: true
            }, '💡 Type any command followed by arguments to execute'),
            React.createElement(Text, {
                dimColor: true,
                italic: true
            }, '💡 Press Ctrl+C to cancel current operation')
        )
    );
}
