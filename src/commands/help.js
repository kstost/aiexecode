import { uiEvents } from '../system/ui_events.js';
import { renderInkComponent } from '../ui/utils/renderInkComponent.js';

/**
 * /help 커맨드 - 사용 가능한 커맨드 목록 표시
 */
export default {
    name: 'help',
    description: 'Show available commands',
    usage: '/help',
    handler: async (args, context) => {
        const { commandRegistry } = context;

        const React = await import('react');
        const { HelpView } = await import('../ui/components/HelpView.js');

        const commands = commandRegistry.getCommands();

        const component = React.createElement(HelpView, {
            commands
        });

        const output = await renderInkComponent(component);
        uiEvents.addSystemMessage(output);
    }
};
