/**
 * OpenAI 모델 설정
 *
 * 모든 OpenAI 모델 정보를 중앙 집중식으로 관리합니다.
 * 새 모델 추가 시 이 파일만 수정하면 됩니다.
 *
 * 참고: https://platform.openai.com/docs/pricing
 */

export const OPENAI_MODELS = {
    // ========================================
    // GPT-5 시리즈 (최신 세대, 권장)
    // ========================================
    'gpt-5': {
        name: 'GPT-5',
        description: 'Best model for coding and agentic tasks across industries',
        contextWindow: 400000, // 400K
        maxTokens: 128000, // 128K
        pricing: {
            input: 1.25,      // $1.25 per million tokens
            cachedInput: 0.125, // $0.125 per million tokens
            output: 10.00     // $10.00 per million tokens
        },
        speed: 'fast',
        supportsReasoning: true,
        reasoningSupport: {
            minimal: true,
            low: true,
            medium: true,
            high: true
        }
    },
    'gpt-5-mini': {
        name: 'GPT-5 Mini',
        description: 'Faster and more affordable version of GPT-5 for well-defined tasks',
        contextWindow: 400000, // 400K
        maxTokens: 128000, // 128K
        pricing: {
            input: 0.25,      // $0.25 per million tokens
            cachedInput: 0.025, // $0.025 per million tokens
            output: 2.00      // $2.00 per million tokens
        },
        speed: 'very-fast',
        supportsReasoning: true,
        reasoningSupport: {
            minimal: true,
            low: true,
            medium: true,
            high: true
        }
    },
    'gpt-5-nano': {
        name: 'GPT-5 Nano',
        description: 'Fastest and most affordable version of GPT-5, ideal for summarization and classification tasks',
        contextWindow: 400000, // 400K
        maxTokens: 128000, // 128K
        pricing: {
            input: 0.05,       // $0.05 per million tokens
            cachedInput: 0.005, // $0.005 per million tokens
            output: 0.40       // $0.40 per million tokens
        },
        speed: 'fastest',
        supportsReasoning: true,
        reasoningSupport: {
            minimal: true,
            low: true,
            medium: true,
            high: true
        }
    },
    'gpt-5-codex': {
        name: 'GPT-5 Codex',
        description: 'Optimized for agentic software engineering tasks',
        contextWindow: 400000, // 400K
        maxTokens: 128000, // 128K
        pricing: {
            input: 1.25,      // $1.25 per million tokens
            cachedInput: 0.125, // $0.125 per million tokens (90% discount)
            output: 10.00     // $10.00 per million tokens
        },
        speed: 'fast',
        supportsReasoning: true,
        reasoningSupport: {
            minimal: true,
            low: true,
            medium: true,
            high: true
        }
    }
};

/**
 * 모델 ID로 모델 정보 가져오기
 */
export function getOpenAIModelInfo(modelId) {
    return OPENAI_MODELS[modelId] || null;
}

/**
 * 모델 ID로 max_tokens 가져오기
 */
export function getOpenAIMaxTokens(modelId) {
    const model = OPENAI_MODELS[modelId];
    return model ? model.maxTokens : 128000; // 기본값 128K
}

/**
 * 모델 ID로 context window 크기 가져오기
 */
export function getOpenAIContextWindow(modelId) {
    const model = OPENAI_MODELS[modelId];
    return model ? model.contextWindow : 400000; // 기본값 400K
}

/**
 * 모든 OpenAI 모델 ID 목록 가져오기
 */
export function getAllOpenAIModelIds() {
    return Object.keys(OPENAI_MODELS);
}

/**
 * GPT-5 시리즈 모델 ID 목록
 */
export function getGPT5Models() {
    return Object.keys(OPENAI_MODELS);
}

/**
 * Reasoning 지원 모델 ID 목록
 */
export function getReasoningModels() {
    return Object.keys(OPENAI_MODELS).filter(
        modelId => OPENAI_MODELS[modelId].supportsReasoning
    );
}

/**
 * 특정 모델이 특정 reasoning effort를 지원하는지 확인
 */
export function supportsReasoningEffort(modelId, effort) {
    const model = OPENAI_MODELS[modelId];
    if (!model || !model.supportsReasoning) {
        return false;
    }
    return model.reasoningSupport?.[effort] || false;
}

/**
 * 기본 권장 OpenAI 모델 ID
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
