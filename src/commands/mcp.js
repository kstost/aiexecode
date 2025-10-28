import { uiEvents } from '../system/ui_events.js';
import chalk from 'chalk';

/**
 * /mcp 커맨드 - MCP 서버 연결 상태 및 도구 목록 표시
 *
 * 메모리 효율적인 단순 출력 방식 (인터랙티브 UI 제거)
 */
export default {
    name: 'mcp',
    description: 'Show connected MCP servers, tools, and configuration',
    usage: '/mcp [server-name]',
    handler: async (args, context) => {
        const { mcpIntegration } = context;

        if (!mcpIntegration) {
            uiEvents.addSystemMessage('MCP Integration not available');
            return;
        }

        const servers = mcpIntegration.getConnectedServers();

        if (servers.length === 0) {
            uiEvents.addSystemMessage('No MCP servers configured');
            uiEvents.addSystemMessage('Use CLI: aiexecode mcp add --transport stdio <name> -- <cmd>');
            return;
        }

        // 특정 서버 지정된 경우
        const serverName = args[0];
        if (serverName) {
            showServerDetail(mcpIntegration, servers, serverName);
        } else {
            showServerList(servers);
        }
    }
};

/**
 * 서버 목록 표시
 */
function showServerList(servers) {
    let output = '\nMCP Servers:\n\n';

    servers.forEach(server => {
        const status = server.status === 'connected' ? 'Connected' : 'Disconnected';
        output += `  ${server.name} (${status}, ${server.toolCount} tools)\n`;
    });

    output += '\nUse: /mcp <server-name> to see tools';

    uiEvents.addSystemMessage(output);
}

/**
 * 서버 상세 정보 표시
 */
function showServerDetail(mcpIntegration, servers, serverName) {
    const server = servers.find(s => s.name === serverName);

    if (!server) {
        uiEvents.addSystemMessage(`Server '${serverName}' not found`);
        return;
    }

    const toolSchemas = mcpIntegration.getToolSchemas();

    // 해당 서버의 도구만 필터링
    const serverTools = toolSchemas.filter(tool => {
        const match = tool.description?.match(/^\[(.+?) MCP\]/);
        return match && match[1] === serverName;
    });

    let output = `\n${server.name}\n\n`;
    output += `Status: ${server.status === 'connected' ? 'Connected' : 'Disconnected'}\n`;
    output += `Tools: ${serverTools.length}\n\n`;

    if (serverTools.length > 0) {
        output += 'Available Tools:\n\n';

        serverTools.forEach((tool, idx) => {
            const desc = tool.description?.replace(/^\[.+?\] - /, '') || '';
            output += `${idx + 1}. ${tool.name}\n`;

            if (desc) {
                output += `   ${desc}\n`;
            }

            const params = tool.parameters?.properties || {};
            const required = tool.parameters?.required || [];
            const paramNames = Object.keys(params);

            if (paramNames.length > 0) {
                const requiredParams = paramNames.filter(p => required.includes(p));
                const optionalParams = paramNames.filter(p => !required.includes(p));

                if (requiredParams.length > 0) {
                    output += `   Required: ${requiredParams.join(', ')}\n`;
                }
                if (optionalParams.length > 0) {
                    output += `   Optional: ${optionalParams.join(', ')}\n`;
                }
            }

            output += '\n';
        });
    }

    uiEvents.addSystemMessage(output);
}
