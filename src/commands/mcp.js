import { uiEvents } from '../system/ui_events.js';
import chalk from 'chalk';

/**
 * /mcp 커맨드 - AI Agent 세션 내에서 MCP 서버 상태 조회
 *
 * AI Agent 실행 중 사용자가 입력하는 대화형 명령어
 * 현재 연결된 MCP 서버 목록과 사용 가능한 도구들을 표시
 *
 * 사용법:
 *   /mcp              - 모든 MCP 서버 목록 표시
 *   /mcp <서버이름>   - 특정 서버의 도구 목록 상세 표시
 */
export default {
    name: 'mcp',
    description: 'Show connected MCP servers, tools, and configuration',
    usage: '/mcp [server-name]',
    handler: async (args, context) => {
        const { mcpIntegration } = context;

        // MCP Integration이 초기화되지 않은 경우 (설정된 서버가 없거나 초기화 실패)
        if (!mcpIntegration) {
            uiEvents.addSystemMessage('MCP Integration not available');
            return;
        }

        // 현재 연결된 MCP 서버 목록 조회
        const servers = mcpIntegration.getConnectedServers();

        if (servers.length === 0) {
            uiEvents.addSystemMessage('No MCP servers configured');
            uiEvents.addSystemMessage('Use CLI: aiexecode mcp add --transport stdio <name> -- <cmd>');
            return;
        }

        // 인자로 특정 서버 이름이 전달된 경우 해당 서버 상세 정보 표시
        const serverName = args[0];
        if (serverName) {
            showServerDetail(mcpIntegration, servers, serverName);
        } else {
            // 인자 없이 /mcp만 입력한 경우 전체 서버 목록 표시
            showServerList(servers);
        }
    }
};

/**
 * 연결된 모든 MCP 서버 목록을 간략하게 표시
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
 * 특정 MCP 서버의 상세 정보 및 도구 목록 표시
 * 각 도구의 이름, 설명, 필수/선택 파라미터 정보 포함
 */
function showServerDetail(mcpIntegration, servers, serverName) {
    const server = servers.find(s => s.name === serverName);

    if (!server) {
        uiEvents.addSystemMessage(`Server '${serverName}' not found`);
        return;
    }

    // 전체 도구 스키마 조회
    const toolSchemas = mcpIntegration.getToolSchemas();

    // 설명 문자열에서 서버 이름을 추출하여 해당 서버의 도구만 필터링
    // 형식: "[서버이름 MCP] - 설명"
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
            // 도구 설명에서 "[서버이름 MCP] - " 접두사 제거
            const desc = tool.description?.replace(/^\[.+?\] - /, '') || '';
            output += `${idx + 1}. ${tool.name}\n`;

            if (desc) {
                output += `   ${desc}\n`;
            }

            // 도구의 파라미터 정보 표시
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

    // UI 시스템에 메시지 전달하여 사용자에게 표시
    uiEvents.addSystemMessage(output);
}
