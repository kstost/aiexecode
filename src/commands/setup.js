// /setup 명령어 - 설정 마법사를 실행합니다
import { resetAIClients } from '../system/ai_request.js';
import { uiEvents } from '../system/ui_events.js';

export default {
    name: 'setup',
    description: 'Run the setup wizard to configure API keys and models',
    usage: '/setup',
    handler: async (args, context) => {
        // UI 이벤트를 통해 setup wizard 모달 표시
        uiEvents.emit('setup:show', {});
    }
};
