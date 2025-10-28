/**
 * 커맨드 로더
 * src/commands 폴더의 모든 커맨드를 자동으로 로드하고 등록합니다.
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { safeReaddir } from '../util/safe_fs.js';

/**
 * 모든 커맨드를 로드하고 commandRegistry에 등록
 * @param {CommandRegistry} commandRegistry - 커맨드를 등록할 레지스트리
 * @param {Object} context - 커맨드 핸들러에 전달할 컨텍스트 (mcpIntegration 등)
 */
export async function loadCommands(commandRegistry, context) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const commandsDir = join(__dirname, '../commands');

    const commandFiles = (await safeReaddir(commandsDir))
        .filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const commandModule = await import(join(commandsDir, file));
        const commands = commandModule.default;

        // 단일 커맨드 또는 배열 형태 지원
        const commandList = Array.isArray(commands) ? commands : [commands];

        for (const command of commandList) {
            commandRegistry.register(command.name, {
                description: command.description,
                usage: command.usage,
                handler: async (args) => {
                    // context를 핸들러에 전달
                    return await command.handler(args, context);
                }
            });
        }
    }
}
