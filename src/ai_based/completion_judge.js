import dotenv from "dotenv";
import { request, isContextWindowError, getModelForProvider } from "../system/ai_request.js";
import { getOrchestratorConversation } from "./orchestrator.js";
import { createSystemMessage } from "../util/prompt_loader.js";
import { createDebugLogger } from "../util/debug_log.js";

dotenv.config({ quiet: true });

const debugLog = createDebugLogger('completion_judge.log', 'completion_judge');

export const completionJudgmentSchema = {
    name: "completion_judgment",
    schema: {
        type: "object",
        properties: {
            should_complete: {
                type: "boolean",
                description: "Whether the mission is truly complete (true) or should continue (false). If whatUserShouldSay is hard to determine, set this to true."
            },
            whatUserShouldSay: {
                type: "string",
                description: "The most appropriate thing the user should say next, as if you (the assistant) were the user observing the current situation. Put yourself in the user's shoes and determine what would be the most natural and helpful thing to say to guide the agent forward. CRITICAL: The statement must ONLY reference work that is explicitly part of the user's original request. NEVER suggest optional enhancements, additional features, improvements, or tasks beyond the user's explicit request. MUST be a single, clear, decisive instruction without hedging words like 'maybe', 'perhaps', 'consider', 'you could', or offering multiple options. Pick the MOST important next step from the user's explicit requirements and state it with strong conviction. Empty string if mission is complete or if it's genuinely unclear what the user should say."
            }
        },
        required: ["should_complete", "whatUserShouldSay"],
        additionalProperties: false
    },
    strict: true
};

// systemMessage는 judgeMissionCompletion 호출 시 동적으로 생성됨

const completionJudgeConversation = [];
let lastOrchestratorSnapshotLength = 0;

function cloneMessage(message) {
    return JSON.parse(JSON.stringify(message));
}


async function createCompletionJudgeRequestOptions() {
    const model = await getModelForProvider();
    return {
        taskName: 'completion_judge',
        model,
        isGpt5Model: model.startsWith("gpt-5")
    };
}

/**
 * Completion judge conversation을 초기화하거나 시스템 프롬프트를 업데이트합니다.
 * 매 요청마다 프롬프트 파일을 새로 읽어서 변경사항을 즉시 반영합니다.
 */
async function ensureCompletionJudgeConversationInitialized(templateVars = {}) {
    // 매번 최신 시스템 프롬프트를 로드
    const systemMessage = await createSystemMessage("completion_judge.txt", templateVars);

    const systemMessageEntry = {
        role: "system",
        content: [
            {
                type: "input_text",
                text: systemMessage.content
            }
        ]
    };

    // conversation이 비어있으면 새로 추가
    if (!completionJudgeConversation.length) {
        completionJudgeConversation.push(systemMessageEntry);
    } else {
        // conversation이 있으면 첫 번째 system 메시지를 업데이트
        if (completionJudgeConversation[0]?.role === "system") {
            completionJudgeConversation[0] = systemMessageEntry;
        } else {
            // system 메시지가 맨 앞에 없으면 추가
            completionJudgeConversation.unshift(systemMessageEntry);
        }
    }
}

function syncOrchestratorConversation() {
    debugLog(`[syncOrchestratorConversation] START`);
    const sourceConversation = getOrchestratorConversation();
    debugLog(`[syncOrchestratorConversation] Source conversation length: ${sourceConversation?.length || 0}`);
    debugLog(`[syncOrchestratorConversation] Last snapshot length: ${lastOrchestratorSnapshotLength}`);
    debugLog(`[syncOrchestratorConversation] Current completionJudge conversation length: ${completionJudgeConversation.length}`);

    if (!Array.isArray(sourceConversation) || !sourceConversation.length) {
        debugLog(`[syncOrchestratorConversation] No source conversation to sync`);
        return;
    }

    let syncedCount = 0;
    for (let i = lastOrchestratorSnapshotLength; i < sourceConversation.length; i++) {
        const entry = sourceConversation[i];
        if (!entry) continue;

        // Completion judge는 자체 system 메시지를 유지하므로, Orchestrator의 system 메시지는 제외
        if (entry.role === "system") {
            debugLog(`[syncOrchestratorConversation] Skipping system message at index ${i}`);
            continue;
        }

        debugLog(`[syncOrchestratorConversation] Syncing entry ${i}: type=${entry.type}, role=${entry.role}`);
        // reasoning과 message를 모두 그대로 복사
        // ai_request.js에서 이미 reasoning-message 쌍이 유지되고 있음
        completionJudgeConversation.push(cloneMessage(entry));
        syncedCount++;
    }

    lastOrchestratorSnapshotLength = sourceConversation.length;
    debugLog(`[syncOrchestratorConversation] Synced ${syncedCount} entries, new snapshot length: ${lastOrchestratorSnapshotLength}`);
    debugLog(`[syncOrchestratorConversation] CompletionJudge conversation now has ${completionJudgeConversation.length} entries`);
    debugLog(`[syncOrchestratorConversation] END`);
}

function trimCompletionJudgeConversation() {
    for (let i = 1; i < completionJudgeConversation.length - 1; i++) {
        const candidate = completionJudgeConversation[i];
        if (candidate?.role !== "system") {
            completionJudgeConversation.splice(i, 1);
            return true;
        }
    }
    return false;
}

async function dispatchCompletionJudgeRequest(options) {
    debugLog(`[dispatchCompletionJudgeRequest] START`);

    if (!options) {
        debugLog(`[dispatchCompletionJudgeRequest] ERROR - options not initialized`);
        throw new Error('Completion judge request options not initialized.');
    }

    debugLog(`[dispatchCompletionJudgeRequest] Options - model: ${options.model}, taskName: ${options.taskName}`);

    let attemptCount = 0;
    while (true) {
        attemptCount++;
        debugLog(`[dispatchCompletionJudgeRequest] Attempt ${attemptCount}`);

        const { model, isGpt5Model, taskName } = options;

        // Conversation 구조 분석
        const conversationTypes = {};
        completionJudgeConversation.forEach(entry => {
            const type = entry?.type || entry?.role || 'unknown';
            conversationTypes[type] = (conversationTypes[type] || 0) + 1;
        });
        debugLog(`[dispatchCompletionJudgeRequest] Conversation structure: ${JSON.stringify(conversationTypes)}`);
        debugLog(`[dispatchCompletionJudgeRequest] Total conversation entries: ${completionJudgeConversation.length}`);

        const requestPayload = {
            model,
            input: completionJudgeConversation,
            text: {
                format: {
                    type: "json_schema",
                    name: completionJudgmentSchema.name,
                    strict: completionJudgmentSchema.strict,
                    schema: completionJudgmentSchema.schema
                }
            },
            reasoning: {},
            tool_choice: "none",
            tools: [],
            top_p: 1,
            store: true
        };

        if (!isGpt5Model) {
            requestPayload.temperature = 0;
        }

        // 토큰 추정
        const conversationJson = JSON.stringify(completionJudgeConversation);
        const estimatedTokens = Math.ceil(conversationJson.length / 4);
        debugLog(`[dispatchCompletionJudgeRequest] Estimated tokens: ${estimatedTokens} (conversation size: ${conversationJson.length} bytes)`);

        debugLog(`[dispatchCompletionJudgeRequest] Sending API request...`);
        try {
            const response = await request(taskName, requestPayload);
            debugLog(`[dispatchCompletionJudgeRequest] API request successful`);
            debugLog(`[dispatchCompletionJudgeRequest] Response output_text length: ${response?.output_text?.length || 0}`);
            debugLog(`[dispatchCompletionJudgeRequest] END - success`);
            return response;
        } catch (error) {
            debugLog(`[dispatchCompletionJudgeRequest] API request failed: ${error.message}`);
            debugLog(`[dispatchCompletionJudgeRequest] Error name: ${error.name}, type: ${error?.constructor?.name}`);

            // AbortError는 즉시 전파 (세션 중단)
            if (error.name === 'AbortError') {
                debugLog(`[dispatchCompletionJudgeRequest] Request aborted by user, propagating AbortError`);
                throw error;
            }

            if (!isContextWindowError(error)) {
                debugLog(`[dispatchCompletionJudgeRequest] Not a context window error, re-throwing`);
                throw error;
            }

            debugLog(`[dispatchCompletionJudgeRequest] Context window error detected, attempting to trim...`);
            const trimmed = trimCompletionJudgeConversation();
            debugLog(`[dispatchCompletionJudgeRequest] Trim result: ${trimmed}, new conversation length: ${completionJudgeConversation.length}`);
            if (!trimmed) {
                debugLog(`[dispatchCompletionJudgeRequest] Cannot trim further, re-throwing error`);
                throw error;
            }
            debugLog(`[dispatchCompletionJudgeRequest] Retrying with trimmed conversation...`);
        }
    }
}

export function resetCompletionJudgeConversation() {
    completionJudgeConversation.length = 0;
    lastOrchestratorSnapshotLength = 0;
}

export function getCompletionJudgeConversation() {
    return completionJudgeConversation;
}

export function restoreCompletionJudgeConversation(savedConversation, savedSnapshotLength = 0) {
    completionJudgeConversation.length = 0;
    if (Array.isArray(savedConversation)) {
        completionJudgeConversation.push(...savedConversation);
    }
    lastOrchestratorSnapshotLength = savedSnapshotLength;
}

/**
 * Orchestrator가 function call 없이 message만 반환했을 때,
 * 실제로 미션이 완료되었는지 판단하는 함수
 *
 * @param {Object} templateVars - 시스템 프롬프트 템플릿 변수 (예: mission)
 * @returns {Promise<{shouldComplete: boolean, whatUserShouldSay: string}>}
 */
export async function judgeMissionCompletion(templateVars = {}) {
    debugLog('');
    debugLog('========================================');
    debugLog('=== judgeMissionCompletion START =======');
    debugLog('========================================');
    debugLog(`[judgeMissionCompletion] Called with templateVars: ${JSON.stringify(Object.keys(templateVars))}`);
    if (templateVars.what_user_requests) {
        debugLog(`[judgeMissionCompletion] what_user_requests: ${templateVars.what_user_requests.substring(0, 200)}`);
    }

    try {
        debugLog(`[judgeMissionCompletion] Creating request options...`);
        const requestOptions = await createCompletionJudgeRequestOptions();
        debugLog(`[judgeMissionCompletion] Request options - model: ${requestOptions.model}, isGpt5Model: ${requestOptions.isGpt5Model}`);

        // Completion judge 자체 system 메시지 초기화 (템플릿 변수 전달)
        debugLog(`[judgeMissionCompletion] Initializing completion judge conversation...`);
        await ensureCompletionJudgeConversationInitialized(templateVars);
        debugLog(`[judgeMissionCompletion] Conversation initialized, length: ${completionJudgeConversation.length}`);

        // Orchestrator의 대화 내용 동기화 (system 메시지 제외)
        debugLog(`[judgeMissionCompletion] Syncing orchestrator conversation...`);
        syncOrchestratorConversation();
        debugLog(`[judgeMissionCompletion] Sync complete, conversation length: ${completionJudgeConversation.length}`);

        debugLog(`[judgeMissionCompletion] Sending request with ${completionJudgeConversation.length} conversation entries`);

        const response = await dispatchCompletionJudgeRequest(requestOptions);

        debugLog(`[judgeMissionCompletion] Received response, parsing output_text`);
        debugLog(`[judgeMissionCompletion] Raw output_text: ${response.output_text?.substring(0, 500)}`);

        // Completion judge 자신의 응답은 히스토리에 추가하지 않음 (Orchestrator와 동일한 히스토리 유지)
        // 대화 기록 초기화 (다음 판단을 위해)
        debugLog(`[judgeMissionCompletion] Resetting completion judge conversation...`);
        resetCompletionJudgeConversation();

        try {
            const judgment = JSON.parse(response.output_text);
            debugLog(`[judgeMissionCompletion] Parsed judgment successfully`);
            debugLog(`[judgeMissionCompletion] should_complete: ${judgment.should_complete}`);
            debugLog(`[judgeMissionCompletion] whatUserShouldSay: ${judgment.whatUserShouldSay}`);

            const result = {
                shouldComplete: judgment.should_complete === true,
                whatUserShouldSay: judgment.whatUserShouldSay || ""
            };

            debugLog('========================================');
            debugLog('=== judgeMissionCompletion END =========');
            debugLog(`=== Result: shouldComplete=${result.shouldComplete}, whatUserShouldSay="${result.whatUserShouldSay.substring(0, 100)}"`);
            debugLog('========================================');
            debugLog('');

            return result;
        } catch (parseError) {
            debugLog(`[judgeMissionCompletion] Parse error: ${parseError.message}`);
            debugLog(`[judgeMissionCompletion] Failed to parse output_text as JSON`);
            throw new Error('Completion judge response did not include valid JSON output_text.');
        }

    } catch (error) {
        debugLog(`[judgeMissionCompletion] ERROR: ${error.message}, error.name: ${error.name}`);
        debugLog(`[judgeMissionCompletion] Error stack: ${error.stack}`);

        // 에러 발생 시 대화 기록 초기화
        debugLog(`[judgeMissionCompletion] Resetting completion judge conversation due to error...`);
        resetCompletionJudgeConversation();

        // AbortError는 즉시 전파 (세션 중단)
        if (error.name === 'AbortError') {
            debugLog(`[judgeMissionCompletion] AbortError detected, propagating to caller`);
            debugLog('========================================');
            debugLog('=== judgeMissionCompletion END (ABORT) =');
            debugLog('========================================');
            debugLog('');
            throw error;
        }

        // 다른 에러 발생 시 안전하게 계속 진행
        debugLog(`[judgeMissionCompletion] Non-abort error, returning safe default (shouldComplete=false)`);
        debugLog('========================================');
        debugLog('=== judgeMissionCompletion END (ERROR) =');
        debugLog('========================================');
        debugLog('');

        return {
            shouldComplete: false,
            whatUserShouldSay: ""
        };
    }
}
