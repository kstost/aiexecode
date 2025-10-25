import { uiEvents } from '../system/ui_events.js';
import { loadSettings, saveSettings, SETTINGS_FILE } from '../util/config.js';
import { resetAIClients } from '../system/ai_request.js';
import { CLAUDE_MODELS, getClaude4Models, getClaude3Models, DEFAULT_CLAUDE_MODEL } from '../config/claude_models.js';
import { OPENAI_MODELS, getGPT5Models, DEFAULT_OPENAI_MODEL } from '../config/openai_models.js';
import { renderInkComponent } from '../ui/utils/renderInkComponent.js';
import { ENABLE_ANTHROPIC_PROVIDER } from '../config/feature_flags.js';

// 지원하는 모델 목록
// OpenAI: https://platform.openai.com/docs/pricing
// Anthropic: https://docs.claude.com/en/docs/about-claude/models/overview
const MODELS = {
    openai: OPENAI_MODELS,
    anthropic: CLAUDE_MODELS
};

// 모델 ID로 provider 찾기
function getProviderForModel(modelId) {
    for (const [provider, models] of Object.entries(MODELS)) {
        // Feature flag가 비활성화된 경우 anthropic provider 제외
        if (!ENABLE_ANTHROPIC_PROVIDER && provider === 'anthropic') {
            continue;
        }
        if (models[modelId]) {
            return provider;
        }
    }
    return null;
}

// 모든 모델 목록 표시
async function listAllModels() {
    const React = await import('react');
    const { ModelListView } = await import('../ui/components/ModelListView.js');

    const gpt5Models = getGPT5Models();
    const openaiModels = gpt5Models.map(id => ({
        id,
        ...MODELS.openai[id]
    }));

    // Feature flag에 따라 Claude 모델 표시 여부 결정
    let claudeModels = null;
    if (ENABLE_ANTHROPIC_PROVIDER) {
        const claude4Models = getClaude4Models();
        const claude3Models = getClaude3Models();

        claudeModels = {
            claude4: claude4Models.map(id => ({
                id,
                ...CLAUDE_MODELS[id]
            })),
            claude3: claude3Models.map(id => ({
                id,
                ...CLAUDE_MODELS[id]
            }))
        };
    }

    const component = React.createElement(ModelListView, {
        openaiModels,
        claudeModels
    });

    const output = await renderInkComponent(component);
    return output;
}

// 현재 설정된 모델 표시
async function showCurrentModel() {
    try {
        const React = await import('react');
        const { CurrentModelView } = await import('../ui/components/CurrentModelView.js');

        const settings = await loadSettings();
        const provider = settings?.AI_PROVIDER || 'openai';

        let currentModel;
        if (provider === 'anthropic') {
            currentModel = settings?.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL;
        } else {
            currentModel = settings?.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
        }

        const modelInfo = MODELS[provider]?.[currentModel];

        const component = React.createElement(CurrentModelView, {
            provider,
            modelId: currentModel,
            modelInfo
        });

        const output = await renderInkComponent(component);
        return output;
    } catch (error) {
        return `Failed to retrieve current model information: ${error.message}`;
    }
}

/**
 * /model 커맨드 - AI 모델 선택
 */
export default {
    name: 'model',
    description: ENABLE_ANTHROPIC_PROVIDER
        ? 'Select AI model (OpenAI or Anthropic)'
        : 'Select AI model (OpenAI)',
    usage: '/model [model-id] or /model list',
    handler: async (args, context) => {
        // 인자가 없으면 현재 모델 표시
        if (!args || args.length === 0) {
            const message = await showCurrentModel();
            uiEvents.addSystemMessage(message);
            return;
        }

        const command = args[0].toLowerCase();

        // list 명령어
        if (command === 'list' || command === 'ls') {
            const message = await listAllModels();
            uiEvents.addSystemMessage(message);
            return;
        }

        // 모델 선택
        const modelId = args[0];
        const provider = getProviderForModel(modelId);

        if (!provider) {
            uiEvents.addSystemMessage(
                `Unsupported model: ${modelId}\n\n` +
                `Use \`/model list\` to see available models.`
            );
            return;
        }

        try {
            // 현재 설정 로드
            const settings = await loadSettings();

            // Provider와 모델 업데이트
            settings.AI_PROVIDER = provider;
            process.env.AI_PROVIDER = provider;
            
            if (provider === 'openai') {
                settings.OPENAI_MODEL = modelId;
                process.env.OPENAI_MODEL = modelId;
            } else if (provider === 'anthropic') {
                settings.ANTHROPIC_MODEL = modelId;
                process.env.ANTHROPIC_MODEL = modelId;
            }

            // 설정 저장
            await saveSettings(settings);
            
            // AI 클라이언트 캐시 초기화 (다음 요청 시 새 설정 적용)
            resetAIClients();
            
            // UI 모델 표시 업데이트
            uiEvents.emit('model:changed', { model: modelId });

            // 성공 메시지
            const React = await import('react');
            const { ModelUpdatedView } = await import('../ui/components/ModelUpdatedView.js');

            const modelInfo = MODELS[provider][modelId];

            let warning = null;
            if (provider === 'openai' && !settings.OPENAI_API_KEY) {
                warning = {
                    message: 'OpenAI API key is not configured.',
                    hint: 'Set your API key with: `/apikey openai sk-proj-...`'
                };
            } else if (provider === 'anthropic' && !settings.ANTHROPIC_API_KEY) {
                warning = {
                    message: 'Anthropic API key is not configured.',
                    hint: 'Set your API key with: `/apikey anthropic sk-ant-...`'
                };
            }

            const component = React.createElement(ModelUpdatedView, {
                provider,
                modelId,
                modelInfo,
                settingsFile: SETTINGS_FILE,
                warning
            });

            const message = await renderInkComponent(component);
            uiEvents.addSystemMessage(message);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            uiEvents.addErrorMessage(`Failed to update model: ${errorMessage}`);
        }
    }
};

