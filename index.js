#!/usr/bin/env node
// 이 파일은 계획·실행·검증으로 이어지는 전체 에이전트 사이클을 조립하여 단일 작업 흐름으로 실행합니다.
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { initializeMCPIntegration } from "./src/system/mcp_integration.js";
import { ensureConfigDirectory, loadSettings, SETTINGS_FILE, PAYLOAD_LOG_DIR, DEBUG_LOG_DIR } from "./src/util/config.js";
import { runSession } from "./src/system/session.js";
import { CommandRegistry, isCommand } from "./src/system/command_parser.js";
import { loadCommands } from "./src/system/command_loader.js";
import { getSystemInfo, checkDependencies } from "./src/system/system_info.js";
import { loadPreviousSessions, reconstructUIHistory, deleteHistoryFile } from "./src/system/session_memory.js";
import { getModelForProvider } from "./src/system/ai_request.js";
import { runSetupWizard, isConfigured } from "./src/util/setup_wizard.js";
import { safeRm, safeMkdir, safeCopyFile, safeReaddir } from './src/util/safe_fs.js';
import chalk from 'chalk';
import { startUI } from './src/frontend/index.js';
import { uiEvents } from './src/system/ui_events.js';
import { performExit } from './src/util/exit_handler.js';
import { Command } from 'commander';
import { registerMcpCliCommands } from './src/cli/mcp_cli.js';
import { createDebugLogger } from './src/util/debug_log.js';

const debugLog = createDebugLogger('index.log', 'index');

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
const VERSION = packageJson.version;

// CLI 옵션 파싱
const program = new Command();
program
    .name('aiexecode')
    .description('AI-powered autonomous coding agent that executes development tasks through natural language missions')
    .version(VERSION)
    .option('-c, --continue <session_id>', 'Continue from previous session (16-char hex session ID)')
    .option('--viewer', 'Start payload viewer web server')
    .option('-p, --port <port>', 'Port for payload viewer (default: 3300)', '3300')
    .option('--init', 'Initialize project-specific prompts in current directory')
    .argument('[mission]', 'Natural language task description (e.g., "refactor auth module")')
    .action((mission, options) => {
        // 메인 커맨드 action 핸들러
        // Commander가 서브커맨드와 메인 커맨드를 구분할 수 있도록 함
        // 실제 처리는 parse() 이후 기존 코드에서 수행
    })
    .addHelpText('after', `
Examples:
  $ aiexecode "fix all linting errors"
  $ aiexecode "add unit tests for authentication"
  $ aiexecode -c abc1234567890def "continue with deployment setup"
  $ aiexecode
    Interactive mode - enter missions and commands in the UI
  $ aiexecode --init
    Initialize project-specific prompts in .aiexe/prompts/
  $ aiexecode --viewer
    Start payload viewer on default port (3300)
  $ aiexecode --viewer --port 8000
    Start payload viewer on custom port

Available Slash Commands (in interactive mode):
  /help       Show all available commands
  /exit       Exit the application
  /clear      Clear the screen
  /apikey     Manage API keys configuration
  /mcp        Manage MCP server connections and status

MCP (Model Context Protocol) Commands:
  $ aiexecode mcp add --transport stdio <name> -- <command>
    Add a stdio-based MCP server
  $ aiexecode mcp add --transport http <name> <url>
    Add an HTTP-based MCP server
  $ aiexecode mcp add-json <name> '{"type":"http","url":"..."}'
    Add an MCP server from JSON configuration
  $ aiexecode mcp list
    List all configured MCP servers
  $ aiexecode mcp get <name>
    Get details of a specific MCP server
  $ aiexecode mcp remove <name>
    Remove an MCP server

Configuration:
  Settings are stored in ~/.aiexe/settings.json
  Sessions are saved in <project_dir>/.aiexe/<session_id>/
  Execution logs are saved in ~/.aiexe/payload_log/
  Project-specific prompts: <project_dir>/.aiexe/prompts/ (optional)
  MCP servers: ~/.aiexe/mcp_config.json

Supported AI Providers:
  - OpenAI (GPT-4, GPT-5)

For more information, visit the project repository.
`);

// MCP CLI 명령어 등록
registerMcpCliCommands(program);

// 항상 파싱 수행 (action 핸들러가 있으므로 안전)
program.parse(process.argv);

const options = program.opts();
const args = program.args;
const shouldContinue = options.continue;
const viewerMode = options.viewer;
const initMode = options.init;
const viewerPort = parseInt(options.port, 10);
let mission = args[0];

// Init 모드 처리
if (initMode) {
    console.log(chalk.cyan('Initializing project-specific prompts...'));

    // 현재 작업 디렉토리
    const cwd = process.cwd();
    const targetPromptsDir = join(cwd, '.aiexe', 'prompts');

    // 프로젝트 루트의 prompts 디렉토리
    const projectRoot = dirname(fileURLToPath(import.meta.url));
    const sourcePromptsDir = join(projectRoot, 'prompts');

    try {
        // .aiexe/prompts 디렉토리 생성 (recursive로 .aiexe도 함께 생성)
        await safeMkdir(targetPromptsDir, { recursive: true });
        console.log(chalk.green(`✓ Created directory: ${targetPromptsDir}`));

        // prompts 디렉토리의 모든 파일 복사
        const files = await safeReaddir(sourcePromptsDir);
        let copiedCount = 0;

        for (const file of files) {
            const sourcePath = join(sourcePromptsDir, file);
            const targetPath = join(targetPromptsDir, file);

            await safeCopyFile(sourcePath, targetPath);
            console.log(chalk.gray(`  Copied: ${file}`));
            copiedCount++;
        }

        console.log(chalk.green(`\n✓ Successfully copied ${copiedCount} prompt file(s)`));
        console.log(chalk.yellow(`\nYou can now customize prompts in: ${targetPromptsDir}`));
        console.log(chalk.gray('These project-specific prompts will be used instead of the default ones.'));

    } catch (error) {
        console.log(chalk.red('\nStartup Failed: Prompt Initialization Error\n'));
        console.log(chalk.yellow('Reason:'));
        console.log(`  Failed to initialize project-specific prompts: ${error.message}`);
        console.log(chalk.yellow('\nSolution:'));
        console.log('  1. Check if you have write permissions in the current directory');
        console.log('  2. Ensure the prompts directory exists in the project root');
        console.log('  3. Verify disk space availability');
        console.log(`  4. Try running with sudo if permission is denied\n`);
        process.exit(1);
    }

    process.exit(0);
}

// Viewer 모드 처리
if (viewerMode) {
    console.log(chalk.cyan(`Starting payload viewer on port ${viewerPort}...`));
    const { startWebServer } = await import('./payload_viewer/web_server.js');
    await startWebServer(viewerPort);
    console.log(chalk.green(`✓ Payload viewer is running`));
    console.log(chalk.yellow(`Press Ctrl+C to stop the server`));
    // Keep process alive
    await new Promise(() => {});
}

// 전역 설정
process.app_custom = {};
process.app_custom.__dirname = dirname(fileURLToPath(import.meta.url));

// 개발 모드 감지: 현재 디렉토리에서 node index.js로 실행했는지 확인
// (글로벌 설치 후 aiexecode 명령으로 실행 시에는 다른 경로에서 실행됨)
const packageJsonPath = join(process.app_custom.__dirname, 'package.json');
const isDevelopment = existsSync(packageJsonPath) &&
                      process.app_custom.__dirname === dirname(fileURLToPath(import.meta.url));
process.env.IS_DEVELOPMENT = isDevelopment ? 'true' : 'false';

// Session ID 생성 함수 (16자리 hex)
function generateSessionID() {
    const chars = '0123456789abcdef';
    let sessionID = '';
    for (let i = 0; i < 16; i++) {
        sessionID += chars[Math.floor(Math.random() * chars.length)];
    }
    return sessionID;
}

// Session ID 설정
if (shouldContinue) {
    // --continue 모드일 때는 옵션 값이 session_id
    if (typeof shouldContinue !== 'string' || shouldContinue.length !== 16 || !/^[0-9a-f]{16}$/.test(shouldContinue)) {
        console.log(chalk.red('\nStartup Failed: Invalid Session ID Format\n'));
        console.log(chalk.yellow('Reason:'));
        console.log('  The session ID must be a 16-character hexadecimal string (0-9, a-f).');
        console.log(chalk.yellow('\nSolution:'));
        console.log('  1. Check your session ID format - it should look like: abc1234567890def');
        console.log('  2. Use the correct format with --continue option:');
        console.log(chalk.cyan('     aiexecode --continue abc1234567890def "your mission"'));
        console.log('  3. Or start a new session without --continue option\n');
        process.exit(1);
    }
    process.app_custom.sessionID = shouldContinue;
    debugLog(`Continuing session ID: ${process.app_custom.sessionID}`);
} else {
    // 일반 모드일 때는 새로운 session_id 생성
    process.app_custom.sessionID = generateSessionID();
    debugLog(`New session ID: ${process.app_custom.sessionID}`);
}

// 임시 폴더 정리
await safeRm(PAYLOAD_LOG_DIR, { recursive: true, force: true }); // 홈 디렉토리의 .aiexe/payload_log (모든 모드)
await safeRm(DEBUG_LOG_DIR, { recursive: true, force: true }); // 홈 디렉토리의 .aiexe/debuglog (모든 모드)

// 설정 로드 (시스템 정보 수집 전에 먼저 로드)
await ensureConfigDirectory();

// 초기 설정 확인 및 Setup Wizard 실행
const configured = await isConfigured();
if (!configured) {
    const setupCompleted = await runSetupWizard();

    if (!setupCompleted) {
        console.log(chalk.red('\nStartup Failed: Setup Wizard Cancelled\n'));
        console.log(chalk.yellow('Reason:'));
        console.log('  Initial configuration was not completed.');
        console.log(chalk.yellow('\nSolution:'));
        console.log('  1. Run aiexecode again to restart the setup wizard');
        console.log('  2. Complete all required configuration steps');
        console.log('  3. Provide valid API keys and settings');
        console.log(`  4. Or manually edit the settings file: ${SETTINGS_FILE}\n`);
        process.exit(1);
    }
}

const settings = await loadSettings();

// Python 도구 사용 여부 확인
const skipPython = settings?.TOOLS_ENABLED?.run_python_code === false;

// 시스템 정보 수집 (Python 도구가 비활성화된 경우 Python 체크 생략)
process.app_custom.systemInfo = await getSystemInfo({ skipPython });

// 의존성 체크 (flutter doctor와 유사)
const dependencyCheck = await checkDependencies({ skipPython });
if (!dependencyCheck.success) {
    console.log(chalk.red('\nStartup Failed: Missing Required Dependencies\n'));
    console.log(chalk.yellow('Reason:'));
    console.log('  One or more required system dependencies are missing or incompatible.\n');

    dependencyCheck.issues.forEach(issue => {
        if (issue.type === 'unsupported_os') {
            console.log(chalk.red('  [UNSUPPORTED] ') + issue.message);
            console.log('    ' + issue.details);
        } else if (issue.type === 'missing_command') {
            console.log(chalk.red(`  [MISSING] ${issue.command}: `) + issue.message);
            console.log(chalk.cyan(`    Install: ${issue.install}`));
        }
    });

    console.log(chalk.yellow('\nSolution:'));
    console.log('  1. Install all missing dependencies listed above');
    console.log('  2. Ensure all commands are accessible in your PATH');
    console.log('  3. Restart your terminal after installation');
    console.log('  4. Run aiexecode again\n');
    process.exit(1);
}

// 선택적 의존성 경고 표시
if (dependencyCheck.warnings && dependencyCheck.warnings.length > 0) {
    debugLog('\n⚠️  Optional Dependencies\n');

    dependencyCheck.warnings.forEach(warning => {
        if (warning.type === 'optional_command') {
            debugLog(`  ⚠ ${warning.command}: ${warning.message}`);
            debugLog(`    Install: ${warning.install}`);
            debugLog(`    Impact: ${warning.impact}`);
        }
    });
}

// 환경변수 설정
if (!process.env.OPENAI_API_KEY && settings?.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = settings.OPENAI_API_KEY;
}
if (!process.env.OPENAI_MODEL && settings?.OPENAI_MODEL) {
    process.env.OPENAI_MODEL = settings.OPENAI_MODEL;
}
if (!process.env.OPENAI_REASONING_EFFORT && settings?.OPENAI_REASONING_EFFORT) {
    process.env.OPENAI_REASONING_EFFORT = settings.OPENAI_REASONING_EFFORT;
}

// 최종 검증
if (!process.env.OPENAI_API_KEY) {
    console.log(chalk.red('\nStartup Failed: Missing OpenAI API Key\n'));
    console.log(chalk.yellow('Reason:'));
    console.log('  OPENAI_API_KEY is not configured in the settings.');
    console.log(chalk.yellow('\nSolution:'));
    console.log('  1. Obtain an API key from OpenAI:');
    console.log(chalk.cyan('     https://platform.openai.com/account/api-keys'));
    console.log(`  2. Add the API key to your settings file:`);
    console.log(chalk.cyan(`     ${SETTINGS_FILE}`));
    console.log('  3. Or run the setup wizard again by deleting the settings file');
    console.log('  4. Ensure the key is valid and has sufficient credits\n');
    process.exit(1);
}

// MCP Integration 초기화 (현재 작업 디렉토리 기준)
const mcpIntegration = await initializeMCPIntegration(process.cwd());
const mcpToolFunctions = mcpIntegration ? mcpIntegration.getToolFunctions() : {};
const mcpToolSchemas = mcpIntegration ? mcpIntegration.getToolSchemas() : [];

if (mcpIntegration) {
    const servers = mcpIntegration.getConnectedServers();
    debugLog(`MCP integration complete: ${servers.length} server(s), ${Object.keys(mcpToolFunctions).length} tool(s)`);
    servers.forEach(server => {
        debugLog(`   - ${server.name}: ${server.toolCount} tool(s) (${server.status})`);
    });
}

// 커맨드 레지스트리 초기화
const commandRegistry = new CommandRegistry();
await loadCommands(commandRegistry, {
    commandRegistry,
    mcpIntegration
});

// 커맨드 목록 준비
const commandList = Array.from(commandRegistry.commands.entries()).map(([name, cmd]) => ({
    name,
    description: cmd.description || ''
}));

// Ink UI 시작
let uiInstance = null;
let currentMission = mission;

async function handleSubmit(text) {
    if (!text || !text.trim()) return;

    currentMission = text;

    // 슬래시 커맨드 처리
    if (isCommand(text)) {
        try {
            await commandRegistry.execute(text);
        } catch (err) {
            debugLog(`Command execution error: ${err.message}`);
            uiEvents.addErrorMessage(`${err.message}\nType /help to see available commands`);
        }
        return;
    }

    // 세션 실행 (시작/종료 알림 및 저장은 runSession 내부에서 처리)
    try {
        await runSession({
            mission: text,
            maxIterations: 50,
            mcpToolSchemas,
            mcpToolFunctions
        });
    } catch (err) {
        // API 인증 에러 등 세션 실행 중 발생한 에러를 history에 표시
        const errorMessage = err?.message || String(err);
        const errorCode = err?.code || 'UNKNOWN';
        const errorStatus = err?.status || 'N/A';
        const errorType = err?.type || err?.constructor?.name || 'Error';
        const errorStack = err?.stack || 'No stack trace available';

        // 인증 에러인 경우 설정 파일 안내
        if (err?.code === 'invalid_api_key' || err?.status === 401) {
            const consolidatedErrorMessage = [
                `[Main] Authentication failed: ${errorMessage}`,
                `  ├─ Code: ${errorCode}`,
                `  ├─ Status: ${errorStatus}`,
                `  ├─ Type: ${errorType}`,
                `  └─ Stack trace: ${errorStack}`
            ].join('\n');
            uiEvents.addErrorMessage(consolidatedErrorMessage);
            uiEvents.addSystemMessage(`💡 Please check your API key in ${SETTINGS_FILE}`);
        } else {
            // 일반 에러
            const consolidatedErrorMessage = [
                `[Main] Session execution error: ${errorMessage}`,
                `  ├─ Code: ${errorCode}`,
                `  ├─ Status: ${errorStatus}`,
                `  ├─ Type: ${errorType}`,
                `  ├─ Error Object: ${JSON.stringify(err, null, 2)}`,
                `  └─ Stack trace: ${errorStack}`
            ].join('\n');
            uiEvents.addErrorMessage(consolidatedErrorMessage);
        }
    }
}

function handleClearScreen() {
    console.clear();
}

async function handleExit() {
    await performExit({
        mcpIntegration,
        uiInstance,
        showMessages: true
    });
}

// 히스토리 복원 (--continue 옵션)
let initialHistory = [];
if (shouldContinue) {
    const previousSessions = await loadPreviousSessions(process.app_custom.sessionID);
    if (previousSessions && previousSessions.length > 0) {
        debugLog(`Loaded ${previousSessions.length} session(s) from history`);

        // 디버깅: 세션 데이터 확인
        previousSessions.forEach((session, idx) => {
            debugLog(`   Session ${idx}: mission="${session.mission}", toolUsageHistory=${session.toolUsageHistory?.length || 0} items`);
            if (session.toolUsageHistory && session.toolUsageHistory.length > 0) {
                session.toolUsageHistory.slice(0, 2).forEach((tool, tidx) => {
                    const argsStr = JSON.stringify(tool.args || {});
                    debugLog(`     Tool ${tidx}: toolName="${tool.toolName}", args=${argsStr.substring(0, 50)}`);
                });
            }
        });

        initialHistory = reconstructUIHistory(previousSessions);
        debugLog(`   ${initialHistory.length} history items reconstructed`);

        // 디버깅: 복원된 항목 확인
        initialHistory.slice(0, 5).forEach((item, idx) => {
            const textPreview = item.text ? (typeof item.text === 'string' ? item.text.substring(0, 50) : JSON.stringify(item.text).substring(0, 50)) : 'NO TEXT';
            debugLog(`   [${idx}] type=${item.type}, toolName=${item.toolName || 'N/A'}, text=${textPreview}`);
        });
    } else {
        debugLog(`No previous session history found for session ID: ${process.app_custom.sessionID}`);
        debugLog(`Starting with empty history. The session will be saved to ${process.cwd()}/.aiexe/${process.app_custom.sessionID}/`);
    }
} else {
    await deleteHistoryFile(process.app_custom.sessionID);
}

// UI 시작
const currentModel = await getModelForProvider();
const currentReasoningEffort = settings?.OPENAI_REASONING_EFFORT || process.env.OPENAI_REASONING_EFFORT;
uiInstance = startUI({
    onSubmit: handleSubmit,
    onClearScreen: handleClearScreen,
    onExit: handleExit,
    commands: commandList,
    model: currentModel,
    version: VERSION,
    initialHistory,
    reasoningEffort: currentReasoningEffort
});

// 초기 미션이 있으면 자동 실행
if (currentMission && currentMission.trim()) {
    handleSubmit(currentMission);
}

// 종료 처리 (Ctrl+C) - handleExit를 호출하도록 변경
process.on('SIGINT', handleExit);

// UI가 종료될 때까지 대기
await uiInstance.waitUntilExit();

// MCP Integration 정리
if (mcpIntegration) {
    await mcpIntegration.cleanup();
}
