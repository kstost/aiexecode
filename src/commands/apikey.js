import { uiEvents } from '../system/ui_events.js';
import { loadSettings, saveSettings, SETTINGS_FILE } from '../util/config.js';
import { resetAIClients } from '../system/ai_request.js';
import { ENABLE_ANTHROPIC_PROVIDER } from '../config/feature_flags.js';

/**
 * /apikey 커맨드 - AI Provider 및 API 키 설정
 */
export default {
    name: 'apikey',
    description: ENABLE_ANTHROPIC_PROVIDER
        ? 'Set AI provider and API key (openai or anthropic)'
        : 'Set AI provider and API key (openai)',
    usage: ENABLE_ANTHROPIC_PROVIDER
        ? '/apikey <provider> <api-key>'
        : '/apikey openai <api-key>',
    handler: async (args, context) => {
        // 인자 확인
        if (!args || args.length < 2) {
            const usageExamples = ENABLE_ANTHROPIC_PROVIDER
                ? `  /apikey openai sk-proj-...\n  /apikey anthropic sk-ant-...`
                : `  /apikey openai sk-proj-...`;

            uiEvents.addSystemMessage(
                `Please enter provider and API key.\n\n` +
                `Usage:\n` +
                usageExamples
            );
            return;
        }

        try {
            // 현재 설정 로드
            const settings = await loadSettings();

            const providerArg = args[0].toLowerCase();

            // Provider 검증
            const validProviders = ENABLE_ANTHROPIC_PROVIDER
                ? ['openai', 'anthropic']
                : ['openai'];

            if (!validProviders.includes(providerArg)) {
                const validProvidersText = ENABLE_ANTHROPIC_PROVIDER
                    ? 'openai, anthropic'
                    : 'openai';

                uiEvents.addSystemMessage(
                    `Invalid provider: ${providerArg}\n\n` +
                    `Valid providers: ${validProvidersText}`
                );
                return;
            }

            const provider = providerArg;
            const apiKey = args[1];

            // Provider 설정
            settings.AI_PROVIDER = provider;

            // API 키 업데이트
            if (provider === 'openai') {
                settings.OPENAI_API_KEY = apiKey;
                process.env.OPENAI_API_KEY = apiKey;
            } else if (provider === 'anthropic') {
                settings.ANTHROPIC_API_KEY = apiKey;
                process.env.ANTHROPIC_API_KEY = apiKey;
            }

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
                `Provider: ${provider.toUpperCase()}\n` +
                `API Key: ${maskedKey}\n` +
                `Saved to: ${SETTINGS_FILE}`
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            uiEvents.addErrorMessage(`API key configuration failed: ${errorMessage}`);
        }
    }
};

