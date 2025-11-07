import dotenv from "dotenv";
// 이 파일은 계획을 실제 행동으로 옮기기 위해 어떤 도구를 호출할지 결정합니다.
import path from 'path';
import { truncateWithOmit } from "../util/text_formatter.js";
import { createSystemMessage } from "../util/prompt_loader.js";
import { request, shouldRetryWithTrim, getModelForProvider } from "../system/ai_request.js";
import { cleanupOrphanOutputs, trimConversation } from "../system/conversation_trimmer.js";
import { runPythonCodeSchema, bashSchema } from "../system/code_executer.js";
import { readFileSchema, readFileRangeSchema } from "../tools/file_reader.js";
import { writeFileSchema, editFileRangeSchema, editFileReplaceSchema } from "../tools/code_editor.js";
import { fetchWebPageSchema } from "../tools/web_downloader.js";
import { responseMessageSchema } from "../tools/response_message.js";
import { todoWriteSchema } from "../tools/todo_write.js";
import { ripgrepSchema } from "../tools/ripgrep.js";
import { globSearchSchema } from "../tools/glob.js";
import { loadSettings } from "../util/config.js";
import { createDebugLogger } from "../util/debug_log.js";
import { getCurrentTodos } from "../system/session_memory.js";
dotenv.config({ quiet: true });

const debugLog = createDebugLogger('orchestrator.log', 'orchestrator');

const orchestratorConversation = [];
let orchestratorRequestOptions = null;

/**
 * Orchestrator conversation을 초기화하거나 시스템 프롬프트를 업데이트합니다.
 * 매 요청마다 프롬프트 파일을 새로 읽어서 변경사항을 즉시 반영합니다.
 */
async function ensureConversationInitialized() {
    // 매번 최신 시스템 프롬프트를 로드
    const systemMessage = await createSystemMessage("orchestrator.txt", {
        CWD: process.cwd(),
        OS: process.app_custom?.systemInfo?.os || 'unknown'
    });

    // 현재 todos 가져오기
    const currentTodos = getCurrentTodos();

    // todos를 system message에 추가
    let systemMessageText = systemMessage.content;
    if (currentTodos && currentTodos.length > 0) {
        const todosSection = '\n\n## Current Task List (Your TODO tracker)\n\n' +
            'You have created the following task list to track your work. Continue working on these tasks systematically:\n\n' +
            currentTodos.map((todo, index) => {
                const statusIcon = todo.status === 'completed' ? '✓' :
                                  todo.status === 'in_progress' ? '→' : '○';
                return `${index + 1}. [${statusIcon}] ${todo.content} (${todo.status})`;
            }).join('\n') +
            '\n\n**Remember**: Mark tasks as completed immediately after finishing them. Keep exactly ONE task as in_progress at a time.\n';

        systemMessageText += todosSection;
        debugLog(`[ensureConversationInitialized] Added ${currentTodos.length} todos to system message`);
    }

    const systemMessageEntry = {
        role: "system",
        content: [
            {
                type: "input_text",
                text: systemMessageText
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

// 대화 cleanup 및 trim 함수는 conversation_trimmer 모듈에서 가져옴

async function dispatchOrchestratorRequest({ toolChoice }) {
    debugLog(`[dispatchOrchestratorRequest] START - toolChoice: ${toolChoice}`);

    if (!orchestratorRequestOptions) {
        debugLog(`[dispatchOrchestratorRequest] ERROR - orchestratorRequestOptions not initialized`);
        throw new Error('Orchestrator request options not initialized.');
    }

    debugLog(`[dispatchOrchestratorRequest] Options - model: ${orchestratorRequestOptions.model}, tools count: ${orchestratorRequestOptions.tools?.length || 0}`);

    let attemptCount = 0;
    while (true) {
        attemptCount++;
        debugLog(`[dispatchOrchestratorRequest] Attempt ${attemptCount} - starting cleanup...`);
        cleanupOrphanOutputs(orchestratorConversation);

        debugLog(`[dispatchOrchestratorRequest] Conversation has ${orchestratorConversation.length} entries`);

        // Conversation 구조 분석
        const conversationTypes = {};
        orchestratorConversation.forEach(entry => {
            const type = entry?.type || entry?.role || 'unknown';
            conversationTypes[type] = (conversationTypes[type] || 0) + 1;
        });
        debugLog(`[dispatchOrchestratorRequest] Conversation structure: ${JSON.stringify(conversationTypes)}`);

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

        debugLog(`[dispatchOrchestratorRequest] Request config - model: ${model}, tool_choice: ${requestConfig.tool_choice}, tools: ${tools.length}, conversation entries: ${orchestratorConversation.length}`);

        // Conversation 토큰 추정 (대략적)
        const conversationJson = JSON.stringify(orchestratorConversation);
        const estimatedTokens = Math.ceil(conversationJson.length / 4); // 대략 4 chars = 1 token
        debugLog(`[dispatchOrchestratorRequest] Estimated tokens: ${estimatedTokens} (conversation size: ${conversationJson.length} bytes)`);

        debugLog(`[dispatchOrchestratorRequest] Sending API request...`);

        try {
            const response = await request(taskName, requestConfig);
            debugLog(`[dispatchOrchestratorRequest] API request successful`);
            debugLog(`[dispatchOrchestratorRequest] Response outputs: ${response?.output?.length || 0}`);
            if (response?.output) {
                const outputTypes = {};
                response.output.forEach(o => {
                    const type = o?.type || 'unknown';
                    outputTypes[type] = (outputTypes[type] || 0) + 1;
                });
                debugLog(`[dispatchOrchestratorRequest] Response output types: ${JSON.stringify(outputTypes)}`);
            }
            debugLog(`[dispatchOrchestratorRequest] END - success`);
            // consolelog(JSON.stringify(response, null, 2));
            return response;
        } catch (error) {
            debugLog(`[dispatchOrchestratorRequest] API request failed: ${error.message}`);
            debugLog(`[dispatchOrchestratorRequest] Error name: ${error.name}, type: ${error?.constructor?.name}`);

            // AbortError는 즉시 전파 (세션 중단)
            if (error.name === 'AbortError') {
                debugLog(`[dispatchOrchestratorRequest] Request aborted by user, propagating AbortError`);
                throw error;
            }

            if (!shouldRetryWithTrim(error)) {
                debugLog(`[dispatchOrchestratorRequest] Not recoverable by trimming, re-throwing`);
                throw error;
            }

            debugLog(`[dispatchOrchestratorRequest] Recoverable error detected, attempting to trim conversation...`);
            const trimmed = trimConversation(orchestratorConversation);
            debugLog(`[dispatchOrchestratorRequest] Trim result: ${trimmed}, new conversation length: ${orchestratorConversation.length}`);
            if (!trimmed) {
                debugLog(`[dispatchOrchestratorRequest] Cannot trim further, re-throwing error`);
                throw error;
            }
            debugLog(`[dispatchOrchestratorRequest] Retrying with trimmed conversation...`);
        }
    }
}

export async function continueOrchestratorConversation() {
    debugLog(`[continueOrchestratorConversation] START`);
    debugLog(`[continueOrchestratorConversation] Current conversation length: ${orchestratorConversation.length}`);

    // 매번 최신 프롬프트를 반영
    await ensureConversationInitialized();
    debugLog(`[continueOrchestratorConversation] Conversation initialized/updated`);

    const response = await dispatchOrchestratorRequest({ toolChoice: "auto" });
    debugLog(`[continueOrchestratorConversation] Received response, appending to conversation...`);
    appendResponseToConversation(response);
    debugLog(`[continueOrchestratorConversation] Conversation length after append: ${orchestratorConversation.length}`);
    debugLog(`[continueOrchestratorConversation] END`);
    return response;
}
// 쉘스크립트 코딩 규칙:
// - 사용자 확인이 필요한 명령은 피하고 -y 또는 -f 플래그로 자동 확인 설정
// - 출력이 과도한 명령은 피하고 필요한 경우 파일에 저장
// - 여러 명령은 && 연산자로 연결하여 중단 최소화
// - 명령 출력을 파이프 연산자로 전달하여 작업 단순화
// - 단순 계산은 비대화형 bc, 복잡한 수학 계산은 Python 사용; 절대 암산 금지



// 탐색 기반으로 현재 상황을 분석하고, 다음에 취할 행동을 AI에게 결정받습니다.
export async function orchestrateMission({ improvement_points = '', mcpToolSchemas = [], isAutoGenerated = false }) {
    debugLog('');
    debugLog('========================================');
    debugLog('===== orchestrateMission START =========');
    debugLog('========================================');

    const taskName = 'orchestrator';

    debugLog(`[orchestrateMission] Called with improvement_points: "${improvement_points?.substring(0, 100) || '(empty)'}", isAutoGenerated: ${isAutoGenerated}`);
    debugLog(`[orchestrateMission] improvement_points length: ${improvement_points?.length || 0} characters`);
    // mcpToolSchemas: MCP Integration에서 전달받은 MCP 도구들의 스키마 배열
    debugLog(`[orchestrateMission] mcpToolSchemas count: ${mcpToolSchemas.length}`);
    const improvementPointsText = typeof improvement_points === 'string' && improvement_points.trim().length ? improvement_points : '';
    debugLog(`[orchestrateMission] improvementPointsText after processing: "${improvementPointsText.substring(0, 100) || '(empty)'}"`);
    if (isAutoGenerated) {
        debugLog(`[orchestrateMission] This is an auto-generated user message (from completion_judge)`);
    }


    // Python 사용 가능 여부 확인
    const hasPython = process.app_custom?.systemInfo?.commands?.hasPython || false;
    debugLog(`[orchestrateMission] Python available: ${hasPython}`);

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
        todo_write: todoWriteSchema,
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

    // MCP Tools 추가 (MCP 서버로부터 동적으로 제공받은 도구들)
    // mcpToolSchemas는 MCP Integration이 연결된 MCP 서버들로부터 조회한 도구 스키마
    // 각 스키마는 OpenAI function calling 형식으로 변환되어 있음
    debugLog(`[orchestrateMission] Adding ${mcpToolSchemas.length} MCP tools to available tools`);
    tools.push(...mcpToolSchemas);
    debugLog(`[orchestrateMission] Total tools after MCP: ${tools.length}`);

    // Planner가 선언한 도구 이름을 실제 함수 스키마로 연결해, LLM이 지시한 작업이 즉시 실행되도록 합니다.
    tools.forEach(tool => {
        tool.type = "function";
    });

    const model = await getModelForProvider();
    const isGpt5Model = model.startsWith("gpt-5");
    debugLog(`[orchestrateMission] Using model: ${model}, isGpt5Model: ${isGpt5Model}`);

    orchestratorRequestOptions = {
        model,
        isGpt5Model,
        tools,
        taskName,
        parallel_tool_calls: true
    };
    debugLog(`[orchestrateMission] orchestratorRequestOptions configured with ${tools.length} tools`);

    await ensureConversationInitialized();
    debugLog(`[orchestrateMission] Conversation initialized, current length: ${orchestratorConversation.length}`);

    debugLog(`[orchestrateMission] Adding user message to conversation: "${improvementPointsText.substring(0, 100)}"`);
    const userMessage = {
        role: "user",
        content: [
            {
                type: "input_text",
                text: improvementPointsText
            }
        ]
    };

    // Auto-generated user message인 경우 _internal_only 플래그 추가
    if (isAutoGenerated) {
        userMessage._internal_only = true;
        debugLog(`[_internal_only] Marked user message as internal-only (auto-generated from completion_judge)`);
    }

    orchestratorConversation.push(userMessage);
    debugLog(`[orchestrateMission] Conversation length after adding user message: ${orchestratorConversation.length}`);

    debugLog(`[orchestrateMission] Dispatching orchestrator request with toolChoice: required`);
    const response = await dispatchOrchestratorRequest({ toolChoice: "required" });
    debugLog(`[orchestrateMission] Received response, appending to conversation...`);
    appendResponseToConversation(response);
    debugLog(`[orchestrateMission] Conversation length after response: ${orchestratorConversation.length}`);

    debugLog('========================================');
    debugLog('===== orchestrateMission END ===========');
    debugLog('========================================');
    debugLog('');
    return response;
}
