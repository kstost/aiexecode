import dotenv from "dotenv";
import { request, isContextWindowError, getModelForProvider } from "../system/ai_request.js";
import { getOrchestratorConversation } from "./orchestrator.js";
import { createSystemMessage } from "../util/prompt_loader.js";

dotenv.config({ quiet: true });

const verificationSchema = {
    name: "verification_result",
    schema: {
        type: "object",
        properties: {
            decision: {
                type: "string",
                description: "Verification verdict (MISSION_COMPLETE: full mission accomplished, SUBMISSION_COMPLETE: sub-mission completed, IN_PROGRESS: sub-mission still in progress, REPLAN_NEEDED: plan must be revised)",
                enum: ["MISSION_COMPLETE", "SUBMISSION_COMPLETE", "IN_PROGRESS", "REPLAN_NEEDED"]
            },
            what_it_did: {
                type: "string",
                description: "Short summary in one sentence of what it did"
            },
            improvement_points: {
                type: "string",
                description: "Concise list of required improvements",
                minLength: 1
            },
            replan_needed: {
                type: "boolean",
                description: "Whether the current plan must be rebuilt"
            }
        },
        required: ["decision", "what_it_did", "improvement_points", "replan_needed"],
        additionalProperties: false
    },
    strict: true
};

// systemMessage는 verifyResult 호출 시 동적으로 생성됨

const verifierConversation = [];
let lastOrchestratorSnapshotLength = 0;

function cloneMessage(message) {
    return JSON.parse(JSON.stringify(message));
}


async function createVerifierRequestOptions() {
    const model = await getModelForProvider();
    return {
        taskName: 'verifier',
        model,
        isGpt5Model: model.startsWith("gpt-5")
    };
}

/**
 * Verifier conversation을 초기화하거나 시스템 프롬프트를 업데이트합니다.
 * 매 요청마다 프롬프트 파일을 새로 읽어서 변경사항을 즉시 반영합니다.
 */
async function ensureVerifierConversationInitialized(templateVars = {}) {
    // 매번 최신 시스템 프롬프트를 로드
    const systemMessage = await createSystemMessage("verifier.txt", templateVars);

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
    if (!verifierConversation.length) {
        verifierConversation.push(systemMessageEntry);
    } else {
        // conversation이 있으면 첫 번째 system 메시지를 업데이트
        if (verifierConversation[0]?.role === "system") {
            verifierConversation[0] = systemMessageEntry;
        } else {
            // system 메시지가 맨 앞에 없으면 추가
            verifierConversation.unshift(systemMessageEntry);
        }
    }
}

function appendResponseToConversation(response) {
    if (!response?.output || !Array.isArray(response.output)) {
        return;
    }

    for (const item of response.output) {
        if (!item) continue;
        verifierConversation.push(cloneMessage(item));
    }
}

function syncOrchestratorConversation() {
    const sourceConversation = getOrchestratorConversation();
    if (!Array.isArray(sourceConversation) || !sourceConversation.length) {
        return;
    }

    for (let i = lastOrchestratorSnapshotLength; i < sourceConversation.length; i++) {
        const entry = sourceConversation[i];
        if (!entry) continue;

        // Verifier는 자체 system 메시지를 유지하므로, Orchestrator의 system 메시지는 제외
        if (entry.role === "system") continue;

        // reasoning과 message를 모두 그대로 복사
        // ai_request.js에서 이미 reasoning-message 쌍이 유지되고 있음
        verifierConversation.push(cloneMessage(entry));
    }

    lastOrchestratorSnapshotLength = sourceConversation.length;
}

function trimVerifierConversation() {
    for (let i = 1; i < verifierConversation.length - 1; i++) {
        const candidate = verifierConversation[i];
        if (candidate?.role !== "system") {
            verifierConversation.splice(i, 1);
            return true;
        }
    }
    return false;
}

async function dispatchVerifierRequest(options) {
    if (!options) {
        throw new Error('Verifier request options not initialized.');
    }

    while (true) {
        const { model, isGpt5Model, taskName } = options;
        const requestPayload = {
            model,
            input: verifierConversation,
            text: {
                format: {
                    type: "json_schema",
                    name: verificationSchema.name,
                    strict: verificationSchema.strict,
                    schema: verificationSchema.schema
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

        try {
            return await request(taskName, requestPayload);
        } catch (error) {
            if (!isContextWindowError(error)) {
                throw error;
            }

            const trimmed = trimVerifierConversation();
            if (!trimmed) {
                throw error;
            }
        }
    }
}

export function resetVerifierConversation() {
    verifierConversation.length = 0;
    lastOrchestratorSnapshotLength = 0;
}

export function getVerifierConversation() {
    return verifierConversation;
}

export function restoreVerifierConversation(savedConversation, savedSnapshotLength = 0) {
    verifierConversation.length = 0;
    if (Array.isArray(savedConversation)) {
        verifierConversation.push(...savedConversation);
    }
    lastOrchestratorSnapshotLength = savedSnapshotLength;
}

export async function verifyResult(templateVars = {}) {
    const requestOptions = await createVerifierRequestOptions();

    // Verifier 자체 system 메시지 초기화 (템플릿 변수 전달)
    await ensureVerifierConversationInitialized(templateVars);
    // Orchestrator의 대화 내용 동기화 (system 메시지 제외)
    syncOrchestratorConversation();

    const response = await dispatchVerifierRequest(requestOptions);
    // Verifier 자신의 응답은 히스토리에 추가하지 않음 (Orchestrator와 동일한 히스토리 유지)
    // appendResponseToConversation(response);

    try {
        return JSON.parse(response.output_text);
    } catch (error) {
        throw new Error('Verifier response did not include valid JSON output_text.');
    }
}
