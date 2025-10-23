import dotenv from "dotenv";
// 이 파일은 계획을 실제 행동으로 옮기기 위해 어떤 도구를 호출할지 결정합니다.
import path from 'path';
import { truncateWithOmit } from "../util/text_formatter.js";
import { createSystemMessage } from "../util/prompt_loader.js";
import { request, isContextWindowError, getModelForProvider } from "../system/ai_request.js";
import { runPythonCodeSchema, bashSchema } from "../system/code_executer.js";
import { readFileSchema, readFileRangeSchema } from "../tools/file_reader.js";
import { writeFileSchema, editFileRangeSchema, editFileReplaceSchema } from "../tools/code_editor.js";
import { fetchWebPageSchema } from "../tools/web_downloader.js";
import { responseMessageSchema } from "../tools/response_message.js";
import { ripgrepSchema } from "../tools/ripgrep.js";
import { globSearchSchema } from "../tools/glob.js";
import { loadSettings } from "../util/config.js";
import { createDebugLogger } from "../util/debug_log.js";
dotenv.config({ quiet: true });

const debugLog = createDebugLogger('orchestrator.log', 'orchestrator');

function consolelog() { }

const orchestratorConversation = [];
let orchestratorRequestOptions = null;

/**
 * Orchestrator conversation을 초기화하거나 시스템 프롬프트를 업데이트합니다.
 * 매 요청마다 프롬프트 파일을 새로 읽어서 변경사항을 즉시 반영합니다.
 */
async function ensureConversationInitialized() {
    // Python 사용 가능 여부 확인
    const hasPython = process.app_custom?.systemInfo?.commands?.hasPython || false;
    const pythonStatus = hasPython ? 'Available' : 'Not available (run_python_code and fetch_web_page tools are disabled)';

    // 매번 최신 시스템 프롬프트를 로드
    const systemMessage = await createSystemMessage("orchestrator.txt", {
        CWD: process.cwd(),
        OS: process.app_custom?.systemInfo?.os || 'unknown',
        PYTHON_STATUS: pythonStatus
    });

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
    if (!orchestratorConversation.length) {
        orchestratorConversation.push(systemMessageEntry);
    } else {
        // conversation이 있으면 첫 번째 system 메시지를 업데이트
        if (orchestratorConversation[0]?.role === "system") {
            orchestratorConversation[0] = systemMessageEntry;
        } else {
            // system 메시지가 맨 앞에 없으면 추가
            orchestratorConversation.unshift(systemMessageEntry);
        }
    }
}

function appendResponseToConversation(response) {
    if (!response?.output || !Array.isArray(response.output)) {
        debugLog(`[appendResponseToConversation] No output to append`);
        return;
    }

    debugLog(`[appendResponseToConversation] Appending ${response.output.length} items from response`);

    for (const item of response.output) {
        if (!item) continue;
        debugLog(`[appendResponseToConversation] Appending item type: ${item.type}, role: ${item.role}, tool_calls: ${item.tool_calls?.length || 0}`);
        orchestratorConversation.push(JSON.parse(JSON.stringify(item)));
    }

    debugLog(`[appendResponseToConversation] Conversation now has ${orchestratorConversation.length} entries`);
}

export function resetOrchestratorConversation() {
    orchestratorConversation.length = 0;
    orchestratorRequestOptions = null;
}

export function getOrchestratorConversation() {
    return orchestratorConversation;
}

export function restoreOrchestratorConversation(savedConversation, savedRequestOptions = null) {
    orchestratorConversation.length = 0;
    if (Array.isArray(savedConversation)) {
        orchestratorConversation.push(...savedConversation);
    }
    if (savedRequestOptions) {
        orchestratorRequestOptions = savedRequestOptions;
    }
}

export function recordOrchestratorToolResult({ toolCallId, toolName = '', arguments: toolArguments = null, stdout = '', stderr = '', exitCode = null, originalResult = null }) {
    debugLog(`[recordOrchestratorToolResult] Called - toolName: ${toolName}, toolCallId: ${toolCallId}, stdout: ${stdout?.length || 0} bytes, stderr: ${stderr?.length || 0} bytes`);

    if (!toolCallId) {
        debugLog(`[recordOrchestratorToolResult] No toolCallId provided, returning null`);
        return null;
    }

    if (toolName === 'read_file') {
        const filePath = toolArguments.filePath || '';
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(process.cwd(), filePath);

        stdout = JSON.stringify({
            absolute_file_path: absolutePath,
            content: stdout
        });
    }

    const payload = {
        tool: toolName || null,
        call_id: toolCallId,
        exit_code: exitCode,
        stdout: stdout ? truncateWithOmit(stdout, 8000) : '',
        stderr: stderr ? truncateWithOmit(stderr, 4000) : '',
        original_result: originalResult  // 원본 도구 결과 저장
    };

    debugLog(`[recordOrchestratorToolResult] payload - stdout: ${payload.stdout.length} bytes, stderr: ${payload.stderr.length} bytes, stderr content: "${payload.stderr}"`);

    const toolResult = {
        type: "function_call_output",
        call_id: toolCallId,
        output: JSON.stringify(payload)
    };

    debugLog(`[recordOrchestratorToolResult] toolResult output length: ${toolResult.output.length} bytes`);
    orchestratorConversation.push(toolResult);
    return toolResult;
}

function extractCallIdsFromItem(item) {
    if (!item || typeof item !== 'object') {
        return [];
    }

    const callIds = new Set();

    const maybeIds = [item.call_id, item.tool_call_id, item.id];
    for (const id of maybeIds) {
        if (typeof id === 'string' && id.trim().length) {
            callIds.add(id);
        }
    }

    if (item.function && typeof item.function === 'object') {
        const fnIds = [item.function.call_id, item.function.id];
        for (const id of fnIds) {
            if (typeof id === 'string' && id.trim().length) {
                callIds.add(id);
            }
        }
    }

    if (Array.isArray(item.tool_calls)) {
        for (const toolCall of item.tool_calls) {
            extractCallIdsFromItem(toolCall).forEach(id => callIds.add(id));
        }
    }

    return Array.from(callIds);
}

function removeConversationEntriesByCallIds(callIds) {
    if (!Array.isArray(callIds) || callIds.length === 0) {
        return;
    }

    const callIdSet = new Set(callIds.filter(id => typeof id === 'string' && id.trim().length));
    if (!callIdSet.size) {
        return;
    }

    for (let index = orchestratorConversation.length - 1; index >= 0; index--) {
        const entry = orchestratorConversation[index];
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        if (entry.type === 'function_call_output') {
            if (callIdSet.has(entry.call_id)) {
                orchestratorConversation.splice(index, 1);
            }
            continue;
        }

        if (Array.isArray(entry.tool_calls) && entry.tool_calls.length) {
            const filteredToolCalls = entry.tool_calls.filter(toolCall => {
                const ids = extractCallIdsFromItem(toolCall);
                return !ids.some(id => callIdSet.has(id));
            });

            if (filteredToolCalls.length !== entry.tool_calls.length) {
                if (filteredToolCalls.length === 0 && (!entry.content || entry.content.length === 0)) {
                    orchestratorConversation.splice(index, 1);
                } else {
                    entry.tool_calls = filteredToolCalls;
                }
                continue;
            }
        }

        const entryCallIds = extractCallIdsFromItem(entry);
        if (entryCallIds.some(id => callIdSet.has(id))) {
            orchestratorConversation.splice(index, 1);
        }
    }
}

function cleanupOrchestratorConversation() {
    debugLog(`[cleanupOrchestratorConversation] Starting cleanup, conversation length: ${orchestratorConversation.length}`);

    const validCallIds = new Set();

    for (const entry of orchestratorConversation) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        if (entry.type === 'function_call') {
            const ids = extractCallIdsFromItem(entry);
            debugLog(`[cleanupOrchestratorConversation] Found function_call with call_ids: ${ids.join(', ')}`);
            ids.forEach(id => validCallIds.add(id));
        }

        if (Array.isArray(entry.tool_calls)) {
            for (const toolCall of entry.tool_calls) {
                const ids = extractCallIdsFromItem(toolCall);
                debugLog(`[cleanupOrchestratorConversation] Found tool_call with call_ids: ${ids.join(', ')}`);
                ids.forEach(id => validCallIds.add(id));
            }
        }
    }

    debugLog(`[cleanupOrchestratorConversation] Valid call IDs: ${Array.from(validCallIds).join(', ')}`);

    for (let index = orchestratorConversation.length - 1; index >= 0; index--) {
        const entry = orchestratorConversation[index];
        if (entry?.type === 'function_call_output') {
            const callId = entry.call_id;
            if (!callId || !validCallIds.has(callId)) {
                debugLog(`[cleanupOrchestratorConversation] REMOVING function_call_output at index ${index} with call_id: ${callId} (not in validCallIds)`);
                orchestratorConversation.splice(index, 1);
            } else {
                debugLog(`[cleanupOrchestratorConversation] KEEPING function_call_output at index ${index} with call_id: ${callId}, output length: ${entry.output?.length || 0}`);
            }
        }
    }

    debugLog(`[cleanupOrchestratorConversation] Finished cleanup, conversation length: ${orchestratorConversation.length}`);
}

function trimOrchestratorConversation() {
    if (orchestratorConversation.length <= 2) {
        return false;
    }

    for (let i = 1; i < orchestratorConversation.length - 1; i++) {
        const target = orchestratorConversation[i];
        const callIds = extractCallIdsFromItem(target);

        orchestratorConversation.splice(i, 1);

        if (callIds.length) {
            removeConversationEntriesByCallIds(callIds);
        }

        return true;
    }
    return false;
}

async function dispatchOrchestratorRequest({ toolChoice }) {
    if (!orchestratorRequestOptions) {
        throw new Error('Orchestrator request options not initialized.');
    }

    while (true) {
        cleanupOrchestratorConversation();

        debugLog(`[dispatchOrchestratorRequest] Conversation has ${orchestratorConversation.length} entries`);

        // function_call_output 항목들 확인
        const functionCallOutputs = orchestratorConversation.filter(item => item.type === 'function_call_output');
        debugLog(`[dispatchOrchestratorRequest] Found ${functionCallOutputs.length} function_call_output entries`);

        functionCallOutputs.forEach((item, index) => {
            debugLog(`[dispatchOrchestratorRequest] function_call_output[${index}] - call_id: ${item.call_id}, output length: ${item.output?.length || 0}, output preview: ${item.output?.substring(0, 200)}`);
        });

        const { model, isGpt5Model, tools, taskName } = orchestratorRequestOptions;
        const requestConfig = {
            model,
            input: orchestratorConversation,
            reasoning: {},
            tools,
            tool_choice: toolChoice ?? "auto",
            top_p: 1,
            store: true
        };

        if (!isGpt5Model) {
            requestConfig.temperature = 0;
        }

        debugLog(`[dispatchOrchestratorRequest] About to send request with ${orchestratorConversation.length} conversation entries`);

        try {
            const response = await request(taskName, requestConfig);
            // consolelog(JSON.stringify(response, null, 2));
            return response;
        } catch (error) {
            if (!isContextWindowError(error)) {
                throw error;
            }

            const trimmed = trimOrchestratorConversation();
            if (!trimmed) {
                throw error;
            }
        }
    }
}

export async function continueOrchestratorConversation() {
    // 매번 최신 프롬프트를 반영
    await ensureConversationInitialized();

    const response = await dispatchOrchestratorRequest({ toolChoice: "auto" });
    appendResponseToConversation(response);
    return response;
}
// 쉘스크립트 코딩 규칙:
// - 사용자 확인이 필요한 명령은 피하고 -y 또는 -f 플래그로 자동 확인 설정
// - 출력이 과도한 명령은 피하고 필요한 경우 파일에 저장
// - 여러 명령은 && 연산자로 연결하여 중단 최소화
// - 명령 출력을 파이프 연산자로 전달하여 작업 단순화
// - 단순 계산은 비대화형 bc, 복잡한 수학 계산은 Python 사용; 절대 암산 금지



// 탐색 기반으로 현재 상황을 분석하고, 다음에 취할 행동을 AI에게 결정받습니다.
export async function orchestrateMission({ improvement_points = '', mcpToolSchemas = [] }) {
    const taskName = 'orchestrator';

    const improvementPointsText = typeof improvement_points === 'string' && improvement_points.trim().length ? improvement_points : '';

    // Python 사용 가능 여부 확인
    const hasPython = process.app_custom?.systemInfo?.commands?.hasPython || false;

    // 설정 로드
    const settings = await loadSettings();
    const toolsEnabled = settings?.TOOLS_ENABLED || {};

    // 도구 이름과 스키마를 매핑
    const availableTools = {
        bash: bashSchema,
        read_file: readFileSchema,
        read_file_range: readFileRangeSchema,
        write_file: writeFileSchema,
        edit_file_range: editFileRangeSchema,
        edit_file_replace: editFileReplaceSchema,
        response_message: responseMessageSchema,
        ripgrep: ripgrepSchema,
        glob_search: globSearchSchema
    };

    // Python 관련 도구 (조건부 추가)
    if (hasPython) {
        availableTools.run_python_code = runPythonCodeSchema;
        availableTools.fetch_web_page = fetchWebPageSchema;
    }

    // 활성화된 도구만 선택
    const tools = [];
    for (const [toolName, schema] of Object.entries(availableTools)) {
        // 설정에 도구가 명시되어 있지 않거나 true로 설정된 경우 포함
        if (toolsEnabled[toolName] !== false) {
            tools.push(schema);
        }
    }

    // MCP Tools (동적으로 추가)
    tools.push(...mcpToolSchemas);
    // Planner가 선언한 도구 이름을 실제 함수 스키마로 연결해, LLM이 지시한 작업이 즉시 실행되도록 합니다.
    tools.forEach(tool => {
        tool.type = "function";
    });

    const model = await getModelForProvider();
    const isGpt5Model = model.startsWith("gpt-5");

    orchestratorRequestOptions = {
        model,
        isGpt5Model,
        tools,
        taskName,
        parallel_tool_calls: true
    };

    await ensureConversationInitialized();


    orchestratorConversation.push({
        role: "user",
        content: [
            {
                type: "input_text",
                text: improvementPointsText
            }
        ]
    });

    const response = await dispatchOrchestratorRequest({ toolChoice: "required" });
    appendResponseToConversation(response);
    return response;
}
