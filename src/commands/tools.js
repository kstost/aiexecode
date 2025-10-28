import { uiEvents } from '../system/ui_events.js';
import { loadSettings, saveSettings, SETTINGS_FILE } from '../util/config.js';

// 사용 가능한 도구 목록
const AVAILABLE_TOOLS = {
    edit_file_range: {
        name: 'edit_file_range',
        description: 'Edit specific line ranges in files'
    },
    edit_file_replace: {
        name: 'edit_file_replace',
        description: 'Replace exact strings in files'
    },
    write_file: {
        name: 'write_file',
        description: 'Create or overwrite entire files'
    },
    read_file: {
        name: 'read_file',
        description: 'Read entire file contents'
    },
    read_file_range: {
        name: 'read_file_range',
        description: 'Read specific line ranges from files'
    },
    bash: {
        name: 'bash',
        description: 'Execute bash commands'
    },
    run_python_code: {
        name: 'run_python_code',
        description: 'Execute Python code'
    },
    fetch_web_page: {
        name: 'fetch_web_page',
        description: 'Fetch web page content'
    },
    response_message: {
        name: 'response_message',
        description: 'Display messages to user'
    },
    ripgrep: {
        name: 'ripgrep',
        description: 'Search code using ripgrep'
    },
    glob_search: {
        name: 'glob_search',
        description: 'Search files using glob patterns'
    }
};

// 모든 도구 목록 표시
function listAllTools(toolsEnabled) {
    const lines = [];
    lines.push('Available Tools:');
    lines.push('');

    for (const [toolName, toolInfo] of Object.entries(AVAILABLE_TOOLS)) {
        const enabled = toolsEnabled[toolName] !== false;
        const status = enabled ? '✓ enabled' : '✗ disabled';
        lines.push(`  ${status.padEnd(12)} ${toolName.padEnd(20)} - ${toolInfo.description}`);
    }

    lines.push('');
    lines.push('Usage:');
    lines.push('  /tools                    - Show all tools');
    lines.push('  /tools enable <tool>      - Enable a tool');
    lines.push('  /tools disable <tool>     - Disable a tool');
    lines.push('  /tools enable all         - Enable all tools');
    lines.push('  /tools disable all        - Disable all tools');

    return lines.join('\n');
}

/**
 * /tools 커맨드 - 도구 활성화/비활성화 설정
 */
export default {
    name: 'tools',
    description: 'Enable or disable AI agent tools',
    usage: '/tools [enable|disable] [tool-name|all]',
    handler: async (args, context) => {
        try {
            const settings = await loadSettings();
            const toolsEnabled = settings?.TOOLS_ENABLED || {};

            // 인자가 없으면 현재 도구 목록 표시
            if (!args || args.length === 0) {
                const message = listAllTools(toolsEnabled);
                uiEvents.addSystemMessage(message);
                return;
            }

            const action = args[0].toLowerCase();
            const toolName = args[1]?.toLowerCase();

            if (action !== 'enable' && action !== 'disable') {
                uiEvents.addSystemMessage(
                    'Invalid action. Use "enable" or "disable".\n' +
                    'Example: /tools enable edit_file_range'
                );
                return;
            }

            if (!toolName) {
                uiEvents.addSystemMessage(
                    'Please specify a tool name or "all".\n' +
                    'Example: /tools enable edit_file_range\n' +
                    'Example: /tools disable all'
                );
                return;
            }

            const enableValue = action === 'enable';

            // "all" 처리
            if (toolName === 'all') {
                for (const tool of Object.keys(AVAILABLE_TOOLS)) {
                    if (!settings.TOOLS_ENABLED) {
                        settings.TOOLS_ENABLED = {};
                    }
                    settings.TOOLS_ENABLED[tool] = enableValue;
                }

                await saveSettings(settings);

                uiEvents.addSystemMessage(
                    `All tools have been ${action}d.\n` +
                    `Configuration saved to ${SETTINGS_FILE}`
                );
                return;
            }

            // 특정 도구 처리
            if (!AVAILABLE_TOOLS[toolName]) {
                uiEvents.addSystemMessage(
                    `Unknown tool: ${toolName}\n\n` +
                    `Use \`/tools\` to see available tools.`
                );
                return;
            }

            if (!settings.TOOLS_ENABLED) {
                settings.TOOLS_ENABLED = {};
            }
            settings.TOOLS_ENABLED[toolName] = enableValue;

            await saveSettings(settings);

            const toolInfo = AVAILABLE_TOOLS[toolName];
            uiEvents.addSystemMessage(
                `Tool "${toolName}" has been ${action}d.\n` +
                `Description: ${toolInfo.description}\n` +
                `Configuration saved to ${SETTINGS_FILE}`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            uiEvents.addErrorMessage(`Failed to update tools configuration: ${errorMessage}`);
        }
    }
};
