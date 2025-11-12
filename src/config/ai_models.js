/**
 * AI 모델 설정
 *
 * 모든 AI 제조사의 모델 정보를 중앙 집중식으로 관리합니다.
 * 새 모델 추가 시 이 파일만 수정하면 됩니다.
 */

export const AI_MODELS = {
    // ========================================
    // Claude 시리즈
    // ========================================
    'claude-sonnet-4-5-20250929': {
        provider: 'claude',
        name: 'Claude Sonnet 4.5',
        contextWindow: 200000,
        maxTokens: 64000,
        supportsReasoning: true,
    },
    'claude-haiku-4-5-20251001': {
        provider: 'claude',
        name: 'Claude Haiku 4.5',
        contextWindow: 200000,
        maxTokens: 64000,
        supportsReasoning: true,
    },
    'claude-opus-4-1-20250805': {
        provider: 'claude',
        name: 'Claude Opus 4.1',
        contextWindow: 200000,
        maxTokens: 32000,
        supportsReasoning: true,
    },
    'claude-sonnet-4-20250514': {
        provider: 'claude',
        name: 'Claude Sonnet 4',
        contextWindow: 200000,
        maxTokens: 64000,
        supportsReasoning: true,
    },
    'claude-3-7-sonnet-20250219': {
        provider: 'claude',
        name: 'Claude Sonnet 3.7',
        contextWindow: 200000,
        maxTokens: 64000,
        supportsReasoning: true,
    },
    'claude-opus-4-20250514': {
        provider: 'claude',
        name: 'Claude Opus 4',
        contextWindow: 200000,
        maxTokens: 32000,
        supportsReasoning: true,
    },
    'claude-3-5-haiku-20241022': {
        provider: 'claude',
        name: 'Claude Haiku 3.5',
        contextWindow: 200000,
        maxTokens: 8000,
    },
    'claude-3-haiku-20240307': {
        provider: 'claude',
        name: 'Claude Haiku 3',
        contextWindow: 200000,
        maxTokens: 4096,
    },

    // ========================================
    // Google Gemini 시리즈
    // ========================================
    // 'gemini-2.5-flash': {
    //     provider: 'gemini',
    //     name: 'Gemini 2.5 Flash',
    //     contextWindow: 1048576, // 1M tokens
    //     maxTokens: 65536, // 64K tokens
    //     supportsReasoning: true,
    // },

    // ========================================
    // OpenAI GPT-5 시리즈
    // ========================================
    'gpt-5': {
        provider: 'openai',
        name: 'GPT-5',
        contextWindow: 400000, // 400K
        maxTokens: 128000, // 128K
        supportsReasoning: true,
        reasoningSupport: {
            minimal: true,
            low: true,
            medium: true,
            high: true
        }
    },
    'gpt-5-mini': {
        provider: 'openai',
        name: 'GPT-5 Mini',
        contextWindow: 400000, // 400K
        maxTokens: 128000, // 128K
        supportsReasoning: true,
        reasoningSupport: {
            minimal: true,
            low: true,
            medium: true,
            high: true
        }
    },
    'gpt-5-nano': {
        provider: 'openai',
        name: 'GPT-5 Nano',
        contextWindow: 400000, // 400K
        maxTokens: 128000, // 128K
        supportsReasoning: true,
        reasoningSupport: {
            minimal: true,
            low: true,
            medium: true,
            high: true
        }
    },
    'gpt-5-codex': {
        provider: 'openai',
        name: 'GPT-5 Codex',
        contextWindow: 400000, // 400K
        maxTokens: 128000, // 128K
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
export function getModelInfo(modelId) {
    return AI_MODELS[modelId] || null;
}

/**
 * 모델 ID로 max_tokens 가져오기
 */
export function getMaxTokens(modelId) {
    const model = AI_MODELS[modelId];
    return model ? model.maxTokens : 128000; // 기본값 128K
}

/**
 * 모델 ID로 context window 크기 가져오기
 */
export function getContextWindow(modelId) {
    const model = AI_MODELS[modelId];
    return model ? model.contextWindow : 400000; // 기본값 400K
}

/**
 * 모든 모델 ID 목록 가져오기
 */
export function getAllModelIds() {
    return Object.keys(AI_MODELS);
}

/**
 * 특정 제조사의 모델 ID 목록 가져오기
 */
export function getModelsByProvider(provider) {
    return Object.keys(AI_MODELS).filter(
        modelId => AI_MODELS[modelId].provider === provider
    );
}

/**
 * GPT-5 시리즈 모델 ID 목록 (하위 호환성)
 */
export function getGPT5Models() {
    return getModelsByProvider('openai');
}

/**
 * Reasoning 지원 모델 ID 목록
 */
export function getReasoningModels() {
    return Object.keys(AI_MODELS).filter(
        modelId => AI_MODELS[modelId].supportsReasoning
    );
}

/**
 * 특정 모델이 특정 reasoning effort를 지원하는지 확인
 */
export function supportsReasoningEffort(modelId, effort) {
    const model = AI_MODELS[modelId];
    if (!model || !model.supportsReasoning) {
        return false;
    }
    return model.reasoningSupport?.[effort] || false;
}

/**
 * 기본 권장 모델 ID
 */
export const DEFAULT_MODEL = 'gpt-5-mini';

// ========================================
// 하위 호환성을 위한 별칭 (Deprecated)
// ========================================
export const OPENAI_MODELS = AI_MODELS;
export const getOpenAIModelInfo = getModelInfo;
export const getOpenAIMaxTokens = getMaxTokens;
export const getOpenAIContextWindow = getContextWindow;
export const getAllOpenAIModelIds = getAllModelIds;
export const DEFAULT_OPENAI_MODEL = DEFAULT_MODEL;
