// MCP CLI 명령어 등록
// CLI 환경에서 MCP 서버 설정을 관리하는 명령어들을 등록
import { Command } from 'commander';
import {
    addMcpServer,
    listMcpServers,
    getMcpServer,
    removeMcpServer,
    addMcpServerFromJson
} from './mcp_commands.js';

/**
 * MCP 관련 CLI 명령어를 commander 프로그램에 등록
 * 사용자가 터미널에서 'aiexecode mcp ...' 명령으로 MCP 서버를 관리할 수 있게 함
 * @param {Command} program - Commander 프로그램 인스턴스
 */
export function registerMcpCliCommands(program) {
    // 'mcp' 상위 명령어 생성 (aiexecode mcp ...)
    const mcp = program
        .command('mcp')
        .description('Manage MCP (Model Context Protocol) servers');

    // 'aiexecode mcp add' - MCP 서버 추가 명령어
    // stdio, http, sse 등 다양한 전송 방식을 지원
    mcp.command('add')
        .description('Add an MCP server')
        .option('--transport <type>', 'Transport type: stdio, http, or sse', 'stdio')
        .option('--env <key=value>', 'Environment variable (repeatable)', collect, [])
        .option('--header <key:value>', 'HTTP header (repeatable)', collect, [])
        .argument('<name>', 'Server name')
        .argument('[args...]', 'Command and arguments (for stdio) or URL (for http/sse)')
        .action(addMcpServer);

    // 'aiexecode mcp list' - 설정된 모든 MCP 서버 목록 조회
    mcp.command('list')
        .description('List all configured MCP servers')
        .action(listMcpServers);

    // 'aiexecode mcp get <name>' - 특정 MCP 서버의 상세 정보 조회
    mcp.command('get')
        .description('Get details of a specific MCP server')
        .argument('<name>', 'Server name')
        .action(getMcpServer);

    // 'aiexecode mcp remove <name>' - MCP 서버 설정 제거
    mcp.command('remove')
        .description('Remove an MCP server')
        .argument('<name>', 'Server name')
        .action(removeMcpServer);

    // 'aiexecode mcp add-json <name> <json>' - JSON 형식으로 MCP 서버 추가
    // 복잡한 설정을 한 번에 추가할 때 유용
    mcp.command('add-json')
        .description('Add an MCP server from JSON configuration')
        .argument('<name>', 'Server name')
        .argument('<json>', 'JSON configuration string')
        .action(addMcpServerFromJson);
}

/**
 * 반복 가능한 옵션 수집 헬퍼 함수
 * Commander.js에서 --env, --header 같은 옵션을 여러 번 사용할 수 있게 함
 * 예: --env KEY1=val1 --env KEY2=val2
 * @param {string} value - 새 값
 * @param {Array} previous - 이전 값들
 * @returns {Array} 누적된 값 배열
 */
function collect(value, previous) {
    return previous.concat([value]);
}
