// MCP CLI 명령어 핸들러
import chalk from 'chalk';
import {
    addServerToScope,
    getMcpConfigPath,
    loadMergedMcpConfig,
    removeServerFromScope,
    findServerScope
} from '../util/mcp_config_manager.js';

/**
 * MCP 서버 추가
 */
export async function addMcpServer(name, args, options) {
    const { transport, env, header } = options;

    try {
        // 서버 설정 생성
        let serverConfig = { type: transport };

        if (transport === 'stdio') {
            // stdio: command와 args 분리
            if (args.length === 0) {
                console.error(chalk.red('Error: stdio transport requires command'));
                console.error(chalk.gray('\nExample:'));
                console.error(chalk.cyan('  aiexecode mcp add --transport stdio github -- npx -y @modelcontextprotocol/server-github'));
                process.exit(1);
            }

            serverConfig.command = args[0];
            serverConfig.args = args.slice(1);

            // 환경 변수 추가
            if (env.length > 0) {
                serverConfig.env = {};
                env.forEach(item => {
                    const [key, value] = item.split('=');
                    if (!key || value === undefined) {
                        console.error(chalk.red(`Error: Invalid env format '${item}'. Use KEY=VALUE`));
                        process.exit(1);
                    }
                    serverConfig.env[key] = value;
                });
            }

        } else if (transport === 'http' || transport === 'sse') {
            // http/sse: URL 필요
            if (args.length === 0) {
                console.error(chalk.red(`Error: ${transport} transport requires URL`));
                console.error(chalk.gray('\nExample:'));
                console.error(chalk.cyan(`  aiexecode mcp add --transport ${transport} notion https://mcp.notion.com/mcp`));
                process.exit(1);
            }

            serverConfig.url = args[0];

            // 헤더 추가
            if (header.length > 0) {
                serverConfig.headers = {};
                header.forEach(item => {
                    const colonIndex = item.indexOf(':');
                    if (colonIndex === -1) {
                        console.error(chalk.red(`Error: Invalid header format '${item}'. Use KEY:VALUE`));
                        process.exit(1);
                    }
                    const key = item.substring(0, colonIndex).trim();
                    const value = item.substring(colonIndex + 1).trim();
                    serverConfig.headers[key] = value;
                });
            }
        } else {
            console.error(chalk.red(`Error: Unknown transport type '${transport}'`));
            console.error(chalk.gray('Valid types: stdio, http, sse'));
            process.exit(1);
        }

        // 설정 저장
        const configPath = await addServerToScope(name, serverConfig);

        console.log(chalk.green(`\n✓ MCP server '${name}' added successfully`));
        console.log(chalk.gray(`  Config: ${configPath}`));

        // 설정 요약 표시
        console.log(chalk.gray('\n  Configuration:'));
        console.log(chalk.gray(`    Type: ${transport}`));
        if (transport === 'stdio') {
            console.log(chalk.gray(`    Command: ${serverConfig.command} ${serverConfig.args?.join(' ') || ''}`));
        } else {
            console.log(chalk.gray(`    URL: ${serverConfig.url}`));
        }

        console.log(chalk.yellow('\nTo test the connection, start aiexecode and use /mcp'));
        process.exit(0);

    } catch (error) {
        console.error(chalk.red(`\nError: ${error.message}`));
        process.exit(1);
    }
}

/**
 * MCP 서버 목록 표시
 */
export async function listMcpServers() {
    try {
        const servers = await loadMergedMcpConfig();
        const serverNames = Object.keys(servers);

        if (serverNames.length === 0) {
            console.log(chalk.yellow('\nNo MCP servers configured'));
            console.log(chalk.gray('\nTo add a server, run:'));
            console.log(chalk.cyan('  aiexecode mcp add --transport stdio <name> -- <command>'));
            console.log(chalk.cyan('  aiexecode mcp add --transport http <name> <url>'));
            console.log(chalk.cyan('  aiexecode mcp add --transport sse <name> <url>'));
            process.exit(0);
        }

        console.log(chalk.bold(`\nConfigured MCP Servers (${serverNames.length}):\n`));

        serverNames.forEach(name => {
            const config = servers[name];

            console.log(chalk.bold(`  ${name}`));
            console.log(chalk.gray(`    Type: ${config.type}`));

            if (config.type === 'stdio') {
                console.log(chalk.gray(`    Command: ${config.command} ${config.args?.join(' ') || ''}`));
                if (config.env && Object.keys(config.env).length > 0) {
                    console.log(chalk.gray(`    Env vars: ${Object.keys(config.env).join(', ')}`));
                }
            } else {
                console.log(chalk.gray(`    URL: ${config.url}`));
                if (config.headers) {
                    console.log(chalk.gray(`    Headers: ${Object.keys(config.headers).join(', ')}`));
                }
            }
            console.log();
        });

        process.exit(0);

    } catch (error) {
        console.error(chalk.red(`\nError: ${error.message}`));
        process.exit(1);
    }
}

/**
 * 특정 MCP 서버 상세 정보 표시
 */
export async function getMcpServer(name) {
    try {
        const servers = await loadMergedMcpConfig();
        const server = servers[name];

        if (!server) {
            console.error(chalk.red(`\nServer '${name}' not found`));
            console.error(chalk.gray('\nUse "aiexecode mcp list" to see all configured servers'));
            process.exit(1);
        }

        console.log(chalk.bold(`\nMCP Server: ${name}`));
        console.log(chalk.gray('─'.repeat(50)));

        console.log(JSON.stringify(server, null, 2));

        const configPath = getMcpConfigPath();
        console.log(chalk.gray('\nConfiguration file:'));
        console.log(chalk.gray(`  ${configPath}\n`));
        process.exit(0);

    } catch (error) {
        console.error(chalk.red(`\nError: ${error.message}`));
        process.exit(1);
    }
}

/**
 * MCP 서버 제거
 */
export async function removeMcpServer(name) {
    try {
        // 서버 존재 여부 확인
        const exists = await findServerScope(name);
        if (!exists) {
            console.error(chalk.red(`\nServer '${name}' not found`));
            console.error(chalk.gray('\nUse "aiexecode mcp list" to see all configured servers'));
            process.exit(1);
        }

        // 제거
        const result = await removeServerFromScope(name);

        if (result.success) {
            console.log(chalk.green(`\n✓ ${result.message}`));
            process.exit(0);
        } else {
            console.error(chalk.red(`\n${result.message}`));
            process.exit(1);
        }

    } catch (error) {
        console.error(chalk.red(`\nError: ${error.message}`));
        process.exit(1);
    }
}

/**
 * JSON으로부터 MCP 서버 추가
 */
export async function addMcpServerFromJson(name, jsonString) {
    try {
        const serverConfig = JSON.parse(jsonString);

        // 기본 검증
        if (!serverConfig.type) {
            console.error(chalk.red('Error: JSON must include "type" field (stdio, http, or sse)'));
            process.exit(1);
        }

        // 설정 저장
        const configPath = await addServerToScope(name, serverConfig);

        console.log(chalk.green(`\n✓ MCP server '${name}' added from JSON`));
        console.log(chalk.gray(`  Config: ${configPath}\n`));
        process.exit(0);

    } catch (error) {
        if (error instanceof SyntaxError) {
            console.error(chalk.red('\nError: Invalid JSON'));
            console.error(chalk.gray('Make sure to escape quotes properly in your shell'));
            console.error(chalk.gray('\nExample:'));
            console.error(chalk.cyan('  aiexecode mcp add-json weather \'{"type":"http","url":"https://api.example.com"}\''));
        } else {
            console.error(chalk.red(`\nError: ${error.message}`));
        }
        process.exit(1);
    }
}
