import React from 'react';
import { uiEvents } from '../system/ui_events.js';
import { loadSettings, saveSettings, SETTINGS_FILE } from '../util/config.js';
import { resetAIClients } from '../system/ai_request.js';
import { OPENAI_MODELS, getGPT5Models, DEFAULT_OPENAI_MODEL } from '../config/openai_models.js';
import { renderInkComponent } from '../frontend/utils/renderInkComponent.js';
import { ModelListView } from '../frontend/components/ModelListView.js';
import { CurrentModelView } from '../frontend/components/CurrentModelView.js';
import { ModelUpdatedView } from '../frontend/components/ModelUpdatedView.js';

// 지원하는 모델 목록
// OpenAI: https://platform.openai.com/docs/pricing
const MODELS = {
    openai: OPENAI_MODELS
};

// 모델 ID로 provider 찾기
function getProviderForModel(modelId) {
    if (MODELS.openai[modelId]) {
        return 'openai';
    }
    return null;
}

// 모든 모델 목록 표시
async function listAllModels() {
    const gpt5Models = getGPT5Models();
    const openaiModels = gpt5Models.map(id => ({
        id,
        ...MODELS.openai[id]
    }));

    const component = React.createElement(ModelListView, {
        openaiModels
    });

    const output = await renderInkComponent(component);
    return output;
}

// 현재 설정된 모델 표시
async function showCurrentModel() {
    try {
        const settings = await loadSettings();
        const currentModel = settings?.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
        const modelInfo = MODELS.openai?.[currentModel];

        const component = React.createElement(CurrentModelView, {
            provider: 'openai',
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
    description: 'Select AI model (OpenAI)',
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

            // 모델 업데이트
            settings.OPENAI_MODEL = modelId;
            process.env.OPENAI_MODEL = modelId;

            // 설정 저장
            await saveSettings(settings);
            
            // AI 클라이언트 캐시 초기화 (다음 요청 시 새 설정 적용)
            resetAIClients();
            
            // UI 모델 표시 업데이트
            uiEvents.emit('model:changed', { model: modelId });

            // 성공 메시지
            const modelInfo = MODELS[provider][modelId];

            let warning = null;
            if (!settings.OPENAI_API_KEY) {
                warning = {
                    message: 'OpenAI API key is not configured.',
                    hint: 'Set your API key with: `/apikey openai sk-proj-...`'
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

