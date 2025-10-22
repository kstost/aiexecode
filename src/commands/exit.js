import { performExit } from '../util/exit_handler.js';

/**
 * /exit 커맨드 - 프로그램 종료
 */
export default {
    name: 'exit',
    description: 'Exit the program',
    usage: '/exit',
    handler: async (args, context) => {
        const { mcpIntegration, uiInstance } = context;

        await performExit({
            mcpIntegration,
            uiInstance,
            showMessages: true
        });
    }
};
