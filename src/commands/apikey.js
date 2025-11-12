import { uiEvents } from '../system/ui_events.js';
import { loadSettings, saveSettings, SETTINGS_FILE } from '../util/config.js';
import { resetAIClients } from '../system/ai_request.js';

/**
 * /apikey 커맨드 - API 키 설정
 */
export default {
    name: 'apikey',
    description: 'Set API key',
    usage: '/apikey <api-key>',
    handler: async (args, context) => {
        // 인자 확인
        if (!args || args.length < 1) {
            uiEvents.addSystemMessage(
                `Please enter API key.\n\n` +
                `Usage:\n` +
                `  /apikey sk-proj-...`
            );
            return;
        }

        try {
            // 현재 설정 로드
            const settings = await loadSettings();

            const apiKey = args[0];

            // API 키 업데이트
            settings.API_KEY = apiKey;
            process.env.API_KEY = apiKey;

            // 설정 저장
            await saveSettings(settings);

            // AI 클라이언트 캐시 초기화 (다음 요청 시 새 설정 적용)
            resetAIClients();

            // 성공 메시지
            const maskedKey = apiKey.length > 20
                ? `${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`
                : `${apiKey.slice(0, 6)}...`;

            uiEvents.addSystemMessage(
                `API configuration complete\n\n` +
                `API Key: ${maskedKey}\n` +
                `Saved to: ${SETTINGS_FILE}`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            uiEvents.addErrorMessage(`API key configuration failed: ${errorMessage}`);
        }
    }
};

