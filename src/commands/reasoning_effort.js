import { uiEvents } from '../system/ui_events.js';
import { loadSettings, saveSettings, SETTINGS_FILE } from '../util/config.js';
import { resetAIClients } from '../system/ai_request.js';
import { OPENAI_MODELS, getReasoningModels, supportsReasoningEffort, DEFAULT_OPENAI_MODEL } from '../config/openai_models.js';

// reasoning_effort 값 검증 및 설명
const EFFORT_LEVELS = {
    'minimal': {
        description: 'Ultra-fast response - minimal reasoning tokens (for simple tasks)',
        benchmarkScore: 44,
        relativeTokens: '1x',
        speed: 'Very Fast'
    },
    'low': {
        description: 'Fast response - basic reasoning (for general tasks)',
        benchmarkScore: 64,
        relativeTokens: '~5x',
        speed: 'Fast'
    },
    'medium': {
        description: 'Balanced response - moderate reasoning (default, for general purpose)',
        benchmarkScore: 67,
        relativeTokens: '~12x',
        speed: 'Normal'
    },
    'high': {
        description: 'Highest quality - deep reasoning (for complex tasks)',
        benchmarkScore: 68,
        relativeTokens: '~23x',
        speed: 'Slow'
    }
};

// 현재 모델이 reasoning_effort를 지원하는지 확인
async function checkModelSupport() {
    const settings = await loadSettings();
    const currentModel = settings?.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    const provider = settings?.AI_PROVIDER || 'openai';

    if (provider !== 'openai') {
        return { supported: false, reason: 'Only OpenAI models support reasoning_effort.' };
    }

    const modelInfo = OPENAI_MODELS[currentModel];
    if (!modelInfo || !modelInfo.supportsReasoning) {
        return { supported: false, reason: `Current model (${currentModel}) does not support reasoning_effort.` };
    }

    return { supported: true, model: currentModel, modelInfo };
}

// 현재 설정 표시
async function showCurrentSettings() {
    const settings = await loadSettings();
    const currentModel = settings?.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    const provider = settings?.AI_PROVIDER || 'openai';
    const reasoningEffort = settings?.OPENAI_REASONING_EFFORT || 'medium';

    let message = 'Reasoning Effort Configuration\n\n';

    if (provider !== 'openai') {
        message += 'Current provider is not OpenAI.\n';
        message += `Current Provider: ${provider.toUpperCase()}\n`;
        message += '\nReasoning effort is only supported for OpenAI models.\n';
        message += 'Use `/model gpt-5` or `/model gpt-5-mini` to switch to an OpenAI model.\n';
        return message;
    }

    const modelInfo = OPENAI_MODELS[currentModel];

    if (!modelInfo || !modelInfo.supportsReasoning) {
        message += `Current model (\`${currentModel}\`) does not support reasoning_effort.\n\n`;
        message += 'Use `/model list` to see supported models.\n';
        return message;
    }

    message += `Current Model: \`${currentModel}\` (${modelInfo.name})\n`;
    message += `Reasoning Effort: \`${reasoningEffort}\`\n`;

    const effortInfo = EFFORT_LEVELS[reasoningEffort];
    if (effortInfo) {
        message += `Description: ${effortInfo.description}\n`;
        message += `Benchmark Score: ${effortInfo.benchmarkScore}\n`;
        message += `Relative Tokens: ${effortInfo.relativeTokens}\n`;
        message += `Speed: ${effortInfo.speed}\n`;
    }

    return message;
}

// 모든 effort 레벨 표시
function listEffortLevels(currentModel) {
    const modelInfo = OPENAI_MODELS[currentModel];

    let message = 'Available Reasoning Effort Levels\n\n';

    for (const [level, info] of Object.entries(EFFORT_LEVELS)) {
        const supported = supportsReasoningEffort(currentModel, level);
        const statusIcon = supported ? '[SUPPORTED]' : '[NOT SUPPORTED]';

        message += `${statusIcon} \`${level}\``;
        if (level === 'medium') {
            message += ' (default)';
        }
        message += '\n';
        message += `  ${info.description}\n`;
        message += `  Benchmark: ${info.benchmarkScore} | Tokens: ${info.relativeTokens} | Speed: ${info.speed}\n`;

        if (!supported && modelInfo) {
            message += `  Not supported by current model (${modelInfo.name})\n`;
        }
        message += '\n';
    }

    message += 'Usage: `/reasoning_effort <level>`\n';
    message += 'Example: `/reasoning_effort minimal` or `/reasoning_effort high`\n';

    return message;
}

/**
 * /reasoning_effort 커맨드 - OpenAI reasoning_effort 설정
 */
export default {
    name: 'reasoning_effort',
    description: 'Set reasoning effort for OpenAI models (minimal, low, medium, high)',
    usage: '/reasoning_effort [level] or /reasoning_effort list',
    handler: async (args, context) => {
        // 모델 지원 확인
        const supportCheck = await checkModelSupport();

        // 인자가 없으면 현재 설정 표시
        if (!args || args.length === 0) {
            const message = await showCurrentSettings();
            uiEvents.addSystemMessage(message);
            return;
        }

        const command = args[0].toLowerCase();

        // list 명령어
        if (command === 'list' || command === 'ls') {
            if (!supportCheck.supported) {
                const modelList = getReasoningModels().map(m => `  ${m}`).join('\n');
                uiEvents.addSystemMessage(
                    `${supportCheck.reason}\n\n` +
                    `Supported models:\n${modelList}`
                );
                return;
            }

            const message = listEffortLevels(supportCheck.model);
            uiEvents.addSystemMessage(message);
            return;
        }

        // 모델이 지원되지 않으면 에러
        if (!supportCheck.supported) {
            const modelList = getReasoningModels().map(m => `  ${m}`).join('\n');
            uiEvents.addSystemMessage(
                `${supportCheck.reason}\n\n` +
                `Supported models:\n${modelList}`
            );
            return;
        }

        // effort 레벨 설정
        const effortLevel = args[0].toLowerCase();

        // 유효한 레벨인지 확인
        if (!EFFORT_LEVELS[effortLevel]) {
            uiEvents.addSystemMessage(
                `Unsupported reasoning effort: ${effortLevel}\n\n` +
                `Available levels: minimal, low, medium, high\n` +
                `Use \`/reasoning_effort list\` to see all levels.`
            );
            return;
        }

        // 현재 모델이 해당 레벨을 지원하는지 확인
        if (!supportsReasoningEffort(supportCheck.model, effortLevel)) {
            let message = `Current model (${supportCheck.model}) does not support \`${effortLevel}\` level.\n\n`;
            message += `Use \`/reasoning_effort list\` to see supported effort levels for ${supportCheck.model}.`;
            uiEvents.addSystemMessage(message);
            return;
        }

        try {
            // 현재 설정 로드
            const settings = await loadSettings();

            // reasoning_effort 업데이트
            settings.OPENAI_REASONING_EFFORT = effortLevel;
            process.env.OPENAI_REASONING_EFFORT = effortLevel;

            // 설정 저장
            await saveSettings(settings);

            // AI 클라이언트 캐시 초기화 (다음 요청 시 새 설정 적용)
            resetAIClients();

            // UI에 reasoning effort 변경 알림
            uiEvents.reasoningEffortChanged(effortLevel);

            // 성공 메시지
            const effortInfo = EFFORT_LEVELS[effortLevel];

            let message = `Reasoning Effort Updated\n\n` +
                `Model: \`${supportCheck.model}\` (${supportCheck.modelInfo.name})\n` +
                `Reasoning Effort: \`${effortLevel}\`\n` +
                `Description: ${effortInfo.description}\n` +
                `Benchmark Score: ${effortInfo.benchmarkScore}\n` +
                `Relative Tokens: ${effortInfo.relativeTokens}\n` +
                `Speed: ${effortInfo.speed}\n\n` +
                `Saved to: ${SETTINGS_FILE}`;

            // 추가 안내
            if (effortLevel === 'minimal') {
                message += '\n\nMinimal Mode Tips:\n' +
                    '  - Best for simple classification, extraction, formatting tasks\n' +
                    '  - Not suitable for multi-step planning or complex tool usage';
            } else if (effortLevel === 'high') {
                message += '\n\nHigh Mode Tips:\n' +
                    '  - Optimal for complex reasoning, math, coding problems\n' +
                    '  - Uses ~23x more tokens than Minimal (consider costs)';
            }

            uiEvents.addSystemMessage(message);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            uiEvents.addErrorMessage(`Failed to update reasoning effort: ${errorMessage}`);
        }
    }
};
