/**
 * Anthropic Claude 모델 설정
 *
 * 모든 Claude 모델 정보를 중앙 집중식으로 관리합니다.
 * 새 모델 추가 시 이 파일만 수정하면 됩니다.
 *
 * 참고: https://docs.anthropic.com/en/docs/about-claude/models/overview
 */

export const CLAUDE_MODELS = {
    // ========================================
    // Claude 4.x 시리즈 (최신)
    // ========================================
    'claude-sonnet-4-5-20250929': {
        name: 'Claude Sonnet 4.5',
        description: 'Best model for complex agents and coding (recommended)',
        contextWindow: 200000, // 200K (베타: 1M)
        maxTokens: 64000, // 64K
        pricing: {
            input: 3,   // $3 per million tokens
            output: 15  // $15 per million tokens
        },
        speed: 'fast',
        knowledgeCutoff: '2025-01',
        trainingDataCutoff: '2025-07'
    },
    'claude-sonnet-4-20250514': {
        name: 'Claude Sonnet 4',
        description: 'High-performance model',
        contextWindow: 200000, // 200K (베타: 1M)
        maxTokens: 64000, // 64K
        pricing: {
            input: 3,
            output: 15
        },
        speed: 'fast',
        knowledgeCutoff: '2025-01',
        trainingDataCutoff: '2025-07'
    },
    'claude-opus-4-1-20250805': {
        name: 'Claude Opus 4.1',
        description: 'Exceptional model for specialized complex tasks',
        contextWindow: 200000, // 200K
        maxTokens: 32000, // 32K
        pricing: {
            input: 15,  // $15 per million tokens
            output: 75  // $75 per million tokens
        },
        speed: 'moderate',
        knowledgeCutoff: '2025-01',
        trainingDataCutoff: '2025-03'
    },
    'claude-opus-4-20250514': {
        name: 'Claude Opus 4',
        description: 'Previous flagship model (very high intelligence)',
        contextWindow: 200000, // 200K
        maxTokens: 32000, // 32K
        pricing: {
            input: 15,
            output: 75
        },
        speed: 'moderate',
        knowledgeCutoff: '2025-01',
        trainingDataCutoff: '2025-03'
    },
    'claude-haiku-4-5-20251001': {
        name: 'Claude Haiku 4.5',
        description: 'Fastest and most intelligent Haiku model (extended thinking support)',
        contextWindow: 200000, // 200K
        maxTokens: 64000, // 64K
        pricing: {
            input: 1,  // $1 per million tokens
            output: 5  // $5 per million tokens
        },
        speed: 'fastest',
        knowledgeCutoff: '2025-02',
        trainingDataCutoff: '2025-07'
    },

    // ========================================
    // Claude 3.x 시리즈
    // ========================================
    'claude-3-7-sonnet-20250219': {
        name: 'Claude Sonnet 3.7',
        description: 'High-performance model with extended thinking support',
        contextWindow: 200000, // 200K
        maxTokens: 64000, // 64K (베타: 128K)
        pricing: {
            input: 3,
            output: 15
        },
        speed: 'fast',
        knowledgeCutoff: '2025-01',
        trainingDataCutoff: '2025-07'
    },
    'claude-3-5-sonnet-20241022': {
        name: 'Claude 3.5 Sonnet',
        description: 'Proven model with balanced performance',
        contextWindow: 200000, // 200K
        maxTokens: 8192, // 8K
        pricing: {
            input: 3,
            output: 15
        },
        speed: 'fast',
        knowledgeCutoff: '2024-04',
        trainingDataCutoff: '2024-04'
    },
    'claude-3-5-haiku-20241022': {
        name: 'Claude 3.5 Haiku',
        description: 'Very fast response speed',
        contextWindow: 200000, // 200K
        maxTokens: 8192, // 8K
        pricing: {
            input: 1,
            output: 5
        },
        speed: 'fastest',
        knowledgeCutoff: '2024-07',
        trainingDataCutoff: '2024-07'
    },
    'claude-3-haiku-20240307': {
        name: 'Claude 3 Haiku',
        description: 'Fast and concise responses',
        contextWindow: 200000, // 200K
        maxTokens: 4096, // 4K
        pricing: {
            input: 0.25,
            output: 1.25
        },
        speed: 'very-fast',
        knowledgeCutoff: '2023-08',
        trainingDataCutoff: '2023-08'
    }
};

/**
 * 모델 ID로 모델 정보 가져오기
 */
export function getClaudeModelInfo(modelId) {
    return CLAUDE_MODELS[modelId] || null;
}

/**
 * 모델 ID로 max_tokens 가져오기
 */
export function getClaudeMaxTokens(modelId) {
    const model = CLAUDE_MODELS[modelId];
    return model ? model.maxTokens : 8192; // 기본값 8K
}

/**
 * 모델 ID로 context window 크기 가져오기
 */
export function getClaudeContextWindow(modelId) {
    const model = CLAUDE_MODELS[modelId];
    return model ? model.contextWindow : 200000; // 기본값 200K
}

/**
 * 모든 Claude 모델 ID 목록 가져오기
 */
export function getAllClaudeModelIds() {
    return Object.keys(CLAUDE_MODELS);
}

/**
 * Claude 4.x 시리즈 모델 ID 목록
 */
export function getClaude4Models() {
    return [
        'claude-sonnet-4-5-20250929',
        'claude-sonnet-4-20250514',
        'claude-opus-4-1-20250805',
        'claude-opus-4-20250514',
        'claude-haiku-4-5-20251001'
    ];
}

/**
 * Claude 3.x 시리즈 모델 ID 목록
 */
export function getClaude3Models() {
    return [
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-haiku-20240307'
    ];
}

/**
 * 기본 권장 Claude 모델 ID
 */
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
