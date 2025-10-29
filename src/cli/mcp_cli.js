// MCP CLI 명령어 등록
import { Command } from 'commander';
import {
    addMcpServer,
    listMcpServers,
    getMcpServer,
    removeMcpServer,
    addMcpServerFromJson
} from './mcp_commands.js';

/**
 * MCP 명령어를 commander 프로그램에 등록
 * @param {Command} program - Commander 프로그램 인스턴스
 */
export function registerMcpCliCommands(program) {
    const mcp = program
        .command('mcp')
        .description('Manage MCP (Model Context Protocol) servers');

    // aiexecode mcp add --transport <type> <name> <args...>
    mcp.command('add')
        .description('Add an MCP server')
        .option('--transport <type>', 'Transport type: stdio, http, or sse', 'stdio')
        .option('--env <key=value>', 'Environment variable (repeatable)', collect, [])
        .option('--header <key:value>', 'HTTP header (repeatable)', collect, [])
        .argument('<name>', 'Server name')
        .argument('[args...]', 'Command and arguments (for stdio) or URL (for http/sse)')
        .action(addMcpServer);

    // aiexecode mcp list
    mcp.command('list')
        .description('List all configured MCP servers')
        .action(listMcpServers);

    // aiexecode mcp get <name>
    mcp.command('get')
        .description('Get details of a specific MCP server')
        .argument('<name>', 'Server name')
        .action(getMcpServer);

    // aiexecode mcp remove <name>
    mcp.command('remove')
        .description('Remove an MCP server')
        .argument('<name>', 'Server name')
        .action(removeMcpServer);

    // aiexecode mcp add-json <name> '<json>'
    mcp.command('add-json')
        .description('Add an MCP server from JSON configuration')
        .argument('<name>', 'Server name')
        .argument('<json>', 'JSON configuration string')
        .action(addMcpServerFromJson);
}

/**
 * 반복 가능한 옵션 수집 헬퍼
 * @param {string} value - 새 값
 * @param {Array} previous - 이전 값들
 * @returns {Array} 누적된 값 배열
 */
function collect(value, previous) {
    return previous.concat([value]);
}
