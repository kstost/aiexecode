import OpenAI from "openai";
import dotenv from "dotenv";
import path from 'path';
import { safeWriteFile } from '../util/safe_fs.js';
import { logger } from "./log.js";
import { ensureConfigDirectory, loadSettings, SETTINGS_FILE } from "../util/config.js";
import { getReasoningModels, supportsReasoningEffort, DEFAULT_OPENAI_MODEL } from "../config/openai_models.js";
import { createDebugLogger } from "../util/debug_log.js";
import { formatReadFileStdout } from "../util/output_formatter.js";

const debugLog = createDebugLogger('ai_request.log', 'ai_request');

// OpenAI SDK를 사용하기 위한 환경변수를 불러옵니다.
dotenv.config({ quiet: true });

// AI 클라이언트를 초기화합니다.
let openaiClient = null;
let currentAbortController = null;

async function getOpenAIClient() {
    debugLog('[getOpenAIClient] Called');
    if (openaiClient) {
        debugLog('[getOpenAIClient] Using cached client');
        return openaiClient;
    }

    debugLog('[getOpenAIClient] Creating new client');
    // Settings 로드 및 환경변수 설정
    await ensureConfigDirectory();
    const settings = await loadSettings();
    debugLog(`[getOpenAIClient] Settings loaded: AI_PROVIDER=${settings?.AI_PROVIDER}, OPENAI_MODEL=${settings?.OPENAI_MODEL}, OPENAI_REASONING_EFFORT=${settings?.OPENAI_REASONING_EFFORT}`);

    if (!process.env.OPENAI_API_KEY && settings?.OPENAI_API_KEY) {
        process.env.OPENAI_API_KEY = settings.OPENAI_API_KEY;
        debugLog('[getOpenAIClient] OPENAI_API_KEY loaded from settings');
    }

    // 모델 설정도 환경변수에 로드
    if (!process.env.OPENAI_MODEL && settings?.OPENAI_MODEL) {
        process.env.OPENAI_MODEL = settings.OPENAI_MODEL;
        debugLog(`[getOpenAIClient] OPENAI_MODEL set to: ${settings.OPENAI_MODEL}`);
    }

    // reasoning_effort 설정도 환경변수에 로드
    if (!process.env.OPENAI_REASONING_EFFORT && settings?.OPENAI_REASONING_EFFORT) {
        process.env.OPENAI_REASONING_EFFORT = settings.OPENAI_REASONING_EFFORT;
        debugLog(`[getOpenAIClient] OPENAI_REASONING_EFFORT set to: ${settings.OPENAI_REASONING_EFFORT}`);
    }

    if (!process.env.OPENAI_API_KEY) {
        debugLog('[getOpenAIClient] ERROR: OPENAI_API_KEY not configured');
        throw new Error(`OPENAI_API_KEY is not configured. Please update ${SETTINGS_FILE}.`);
    }

    debugLog('[getOpenAIClient] Initializing OpenAI client with API key (first 10 chars): ' + process.env.OPENAI_API_KEY.substring(0, 10) + '...');
    openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    debugLog('[getOpenAIClient] Client created successfully');
    return openaiClient;
}

async function getCurrentProvider() {
    return 'openai';
}

// Provider에 맞는 모델 이름 가져오기
async function getModelForProvider() {
    debugLog('[getModelForProvider] Called');
    const settings = await loadSettings();
    const model = process.env.OPENAI_MODEL || settings?.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    debugLog(`[getModelForProvider] Model: ${model} (from: ${process.env.OPENAI_MODEL ? 'env' : settings?.OPENAI_MODEL ? 'settings' : 'default'})`);
    return model;
}

// 클라이언트 및 캐시 리셋 함수 (모델 변경 시 사용)
export function resetAIClients() {
    debugLog('[resetAIClients] Resetting AI client cache');
    openaiClient = null;
    currentAbortController = null;
    debugLog('[resetAIClients] Client cache cleared');
}

// 현재 진행 중인 AI 요청을 중단하는 함수
export function abortCurrentRequest() {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
}

// export로 다른 파일에서 사용 가능하도록
export { getModelForProvider };

export function structureFixer(response) {
    for (let i = 0; i < response.output.length; i++) {
        if (response.output[i].type === 'reasoning') {
            if (!(response.output[i + 1]?.id)) {
                response.output[i] = null;
            }
        }
    }
    response.output = response.output.filter(Boolean);
    return response;
}
/**
 * 배열에서 지정된 type과 name을 가진 객체들을 start_line 기준으로 내림차순 정렬합니다.
 * 조건에 부합하지 않는 객체들은 원래 위치를 유지합니다.
 * @param {Array<Object>} array - 처리할 원본 배열
 * @param {string} typeValue - 찾을 객체의 'type' 속성 값
 * @param {string} nameValue - 찾을 객체의 'name' 속성 값
 * @returns {Array<Object>} start_line 기준으로 정렬된 새로운 배열
 */
function sortByStartLineDescending(array, typeValue, nameValue) {
    // 1. 원본 배열을 직접 수정하지 않기 위해 깊은 복사를 합니다.
    const newArray = JSON.parse(JSON.stringify(array));

    // 2. 조건에 부합하는 객체인지 확인하는 함수를 정의합니다.
    const isTarget = (obj) => obj.type === typeValue && obj.name === nameValue;

    // 3. 조건에 부합하는 객체들과 그 인덱스를 추출합니다.
    const targetIndexes = [];
    const targetObjs = [];
    newArray.forEach((obj, index) => {
        if (isTarget(obj)) {
            targetIndexes.push(index);
            targetObjs.push(obj);
        }
    });

    // 4. 조건에 부합하는 객체들을 start_line 기준으로 내림차순 정렬합니다.
    targetObjs.sort((a, b) => {
        try {
            const argsA = JSON.parse(a.arguments);
            const argsB = JSON.parse(b.arguments);
            const startLineA = argsA.start_line || 0;
            const startLineB = argsB.start_line || 0;
            return startLineB - startLineA; // 내림차순 (큰 값이 앞으로)
        } catch {
            return 0; // 파싱 실패 시 순서 유지
        }
    });

    // 5. 정렬된 객체들을 원래 위치에 다시 배치합니다.
    targetIndexes.forEach((originalIndex, i) => {
        newArray[originalIndex] = targetObjs[i];
    });

    // 6. 정렬된 새 배열을 반환합니다.
    return newArray;
}

function toAbsolutePath(anyPath) {
    let combinedPath;

    // 1. 절대 경로인지 확인
    if (path.isAbsolute(anyPath)) {
        // 절대 경로이면 그대로 사용
        combinedPath = anyPath;
    } else {
        // 상대 경로이면 CWD와 합침
        combinedPath = path.join(process.cwd(), anyPath);
    }

    // 2. normalize()를 통해 최종 경로를 정리해서 반환
    return path.normalize(combinedPath);
}

// 모든 AI 요청 과정에서 요청/응답 로그를 남기고 결과를 돌려줍니다.
export async function request(taskName, requestPayload) {
    debugLog(`[request] ========== START: ${taskName} ==========`);
    const provider = await getCurrentProvider();
    debugLog(`[request] Provider: ${provider}`);

    // requestPayload를 deep copy하여 원본 보호
    let payloadCopy = JSON.parse(JSON.stringify(requestPayload));
    debugLog(`[request] Payload copied - model: ${payloadCopy.model}, input messages: ${payloadCopy.input?.length || 0}`);

    // _internal_only 속성 제거 (API 요청에 무효한 속성)
    debugLog(`[request] Checking for _internal_only attributes...`);
    let removedInternalOnlyCount = 0;
    if (payloadCopy.input && Array.isArray(payloadCopy.input)) {
        for (const msg of payloadCopy.input) {
            if (msg._internal_only) {
                delete msg._internal_only;
                removedInternalOnlyCount++;
            }
        }
    }
    if (removedInternalOnlyCount > 0) {
        debugLog(`[request] Removed _internal_only from ${removedInternalOnlyCount} messages`);
    }

    debugLog(`[request] Starting payload transformation...`);
    if (payloadCopy.input && Array.isArray(payloadCopy.input)) {
        const marker = {};
        const remove_call_id = {};//[];
        const response_message_call_id = {};

        debugLog(`[request] Processing ${payloadCopy.input.length} input messages for deduplication and formatting`);
        let processedCount = 0;

        for (let i = payloadCopy.input.length - 1; i >= 0; i--) {
            const msg = payloadCopy.input[i];
            const { type, call_id, output } = msg;
            if (type !== 'function_call_output') continue;
            processedCount++;

            debugLog(`[ai_request] Processing function_call_output, call_id: ${call_id}, output length: ${output?.length || 0}`);

            const parsedOutput = JSON.parse(output);
            const { tool, stdout, stderr, exit_code } = parsedOutput;

            debugLog(`[ai_request] Parsed output - tool: ${tool}, stdout: ${stdout?.length || 0} bytes, stderr: ${stderr?.length || 0} bytes`);

            if (tool === 'edit_file_range') {
                const parsedStdout = JSON.parse(stdout);
                if (!parsedStdout.absolute_file_path) continue;
                let abolute_path = toAbsolutePath(parsedStdout.absolute_file_path)
                const updated_content = parsedStdout.file_stats?.updated_content;
                delete parsedStdout.absolute_file_path;
                delete parsedStdout.file_stats;
                if (marker[abolute_path]) {
                    parsedStdout.target_file_path;
                } else {
                    if (updated_content) {
                        parsedStdout.updated_content = formatReadFileStdout({ file_lines: updated_content.split('\n') });
                    }
                }
                marker[abolute_path] = true;
                msg.output = JSON.stringify(parsedStdout, null, 2);
                debugLog(`[ai_request] edit_file_range - new output length: ${msg.output.length}`);
            }
            else if (tool === 'edit_file_replace') {
                const parsedStdout = JSON.parse(stdout);
                if (!parsedStdout.absolute_file_path) continue;
                let abolute_path = toAbsolutePath(parsedStdout.absolute_file_path)
                const updated_content = parsedStdout.file_stats?.updated_content;
                delete parsedStdout.absolute_file_path;
                delete parsedStdout.file_stats;
                if (marker[abolute_path]) {
                    parsedStdout.target_file_path;
                } else {
                    if (updated_content) {
                        parsedStdout.updated_content = formatReadFileStdout({ file_lines: updated_content.split('\n') });
                    }
                }
                marker[abolute_path] = true;
                msg.output = JSON.stringify(parsedStdout, null, 2);
                debugLog(`[ai_request] edit_file_replace - new output length: ${msg.output.length}`);
            }
            else if (tool === 'read_file') {
                const parsedStdout = JSON.parse(stdout);
                if (!parsedStdout.absolute_file_path) continue;
                let abolute_path = toAbsolutePath(parsedStdout.absolute_file_path)
                const content = parsedStdout.content;
                if (marker[abolute_path]) {
                    remove_call_id[call_id] = true;//.push(call_id);
                    msg.output = '(표시하지 않음)';
                } else {
                    msg.output = content;
                }
                marker[abolute_path] = true;
                debugLog(`[ai_request] read_file - new output length: ${msg.output.length}`);
                // msg.output = 'FG';
            } else {
                debugLog(`[ai_request] OTHER TOOL (${tool}) - BEFORE: output is full JSON with stderr`);
                // run_python_code, bash 등의 경우 stdout과 stderr를 모두 포함
                let combinedOutput = '';
                if (stdout && stderr) {
                    combinedOutput = `stdout:\n${stdout}\n\nstderr:\n${stderr}`;
                } else if (stdout) {
                    combinedOutput = stdout;
                } else if (stderr) {
                    combinedOutput = `stderr:\n${stderr}`;
                }
                msg.output = combinedOutput;
                debugLog(`[ai_request] OTHER TOOL (${tool}) - AFTER: output length: ${msg.output.length} bytes (stdout: ${stdout?.length || 0}, stderr: ${stderr?.length || 0})`);
            }
        }

        debugLog(`[request] Processed ${processedCount} function_call_output entries`);
        debugLog(`[request] Marked files for deduplication: ${Object.keys(marker).length}`);

        let responseMessageCount = 0;
        for (let i = payloadCopy.input.length - 1; i >= 0; i--) {
            const msg = payloadCopy.input[i];
            const { type, call_id, name } = msg;
            if (type !== 'function_call') continue;
            if (name !== 'response_message') continue;
            response_message_call_id[call_id] = true;
            responseMessageCount++;
        }
        debugLog(`[request] Found ${responseMessageCount} response_message function calls`);

        let simplifiedResponseMessages = 0;
        for (let i = payloadCopy.input.length - 1; i >= 0; i--) {
            const msg = payloadCopy.input[i];
            const { type, call_id } = msg;
            if (type !== 'function_call_output') continue;
            if (!response_message_call_id[call_id]) continue;
            msg.output = JSON.stringify({ message_displayed: true });
            simplifiedResponseMessages++;
        }
        debugLog(`[request] Simplified ${simplifiedResponseMessages} response_message outputs`);
    }

    debugLog(`[request] Payload transformation complete`);
    let response;
    let originalRequest;
    let originalResponse;

    // AbortController 생성
    currentAbortController = new AbortController();

    try {
        // OpenAI API 사용
        debugLog('[request] Getting OpenAI client');
        const openai = await getOpenAIClient();

        // reasoning 설정 추가 (OpenAI 추론 모델용)
        const settings = await loadSettings();
        const reasoningEffort = settings?.OPENAI_REASONING_EFFORT || process.env.OPENAI_REASONING_EFFORT || 'medium';
        debugLog(`[request] Reasoning effort: ${reasoningEffort}`);

        // reasoning을 지원하는 모델인지 확인
        const reasoningModels = getReasoningModels();
        const currentModel = payloadCopy.model || settings?.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
        debugLog(`[request] Current model: ${currentModel}`);

        if (reasoningModels.some(m => currentModel.startsWith(m))) {
            debugLog(`[request] Model supports reasoning - checking effort compatibility`);
            let effectiveEffort = reasoningEffort;

            // 모델이 해당 effort를 지원하는지 확인하고 필요하면 fallback
            if (!supportsReasoningEffort(currentModel, reasoningEffort)) {
                debugLog(`[request] Effort ${reasoningEffort} not supported by ${currentModel}, finding fallback`);
                // high를 지원하는지 확인 (gpt-5-pro 등)
                if (supportsReasoningEffort(currentModel, 'high')) {
                    effectiveEffort = 'high';
                    debugLog(`[request] Fallback to 'high'`);
                }
                // medium을 지원하는지 확인
                else if (supportsReasoningEffort(currentModel, 'medium')) {
                    effectiveEffort = 'medium';
                    debugLog(`[request] Fallback to 'medium'`);
                }
                // low를 지원하는지 확인
                else if (supportsReasoningEffort(currentModel, 'low')) {
                    effectiveEffort = 'low';
                    debugLog(`[request] Fallback to 'low'`);
                }
            } else {
                debugLog(`[request] Effort ${reasoningEffort} is supported by ${currentModel}`);
            }

            // reasoning 객체로 설정
            payloadCopy.reasoning = {
                effort: effectiveEffort,
                summary: 'auto'
            };
            debugLog(`[request] Applied reasoning config: effort=${effectiveEffort}, summary=auto`);
        } else {
            debugLog(`[request] Model does not support reasoning`);
        }

        originalRequest = JSON.parse(JSON.stringify(payloadCopy)); // 원본 OpenAI 요청
        debugLog(`[request] Request prepared - logging to file`);

        // 로그는 원본 OpenAI 포맷으로 저장 (API 호출 전)
        await logger(`${taskName}_REQ`, originalRequest, provider);
        debugLog(`[request] Request logged - calling OpenAI API`);

        response = await openai.responses.create(originalRequest, {
            signal: currentAbortController.signal
        });
        debugLog(`[request] Response received - id: ${response?.id}, status: ${response?.status}, output items: ${response?.output?.length || 0}`);

        // 원본 응답을 깊은 복사로 보존 (이후 수정으로부터 보호)
        originalResponse = JSON.parse(JSON.stringify(response));
        debugLog(`[request] Response copied for logging`);
    } catch (error) {
        // AbortController 정리
        currentAbortController = null;

        debugLog(`[request] ERROR occurred: ${error.name} - ${error.message}`);
        debugLog(`[request] Error code: ${error.code}, status: ${error.status}`);

        // Abort 에러인 경우 명확하게 처리
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.message?.includes('aborted')) {
            debugLog(`[request] Request was aborted by user`);
            const abortError = new Error('Request aborted by user');
            abortError.name = 'AbortError';
            throw abortError;
        }

        debugLog(`[request] Re-throwing error: ${error.stack}`);
        // 기타 에러는 그대로 throw
        throw error;
    }

    // 요청 완료 후 AbortController 정리
    currentAbortController = null;
    debugLog(`[request] AbortController cleaned up`);

    if (taskName === 'orchestrator') {
        debugLog(`[request] Post-processing orchestrator response`);
        debugLog(`[request] Sorting edit_file_range calls by start_line (descending)`);
        response.output = sortByStartLineDescending(response.output, 'function_call', 'edit_file_range');
        debugLog(`[request] Sorted - output items: ${response.output.length}`);
    }

    debugLog(`[request] Applying structure fixer to response`);
    structureFixer(response);
    debugLog(`[request] Structure fixed - output items: ${response.output.length}`);

    // 로그는 원본 포맷으로 저장
    debugLog(`[request] Logging response to file`);
    await logger(`${taskName}_RES`, originalResponse, provider);
    debugLog(`[request] ========== END: ${taskName} ==========`);

    return response;
}

/**
 * OpenAI API의 컨텍스트 윈도우 초과 에러인지 확인합니다.
 *
 * 이 함수는 OpenAI API의 공식 에러 코드만을 신뢰하며,
 * 에러 메시지 문자열 매칭은 사용하지 않습니다.
 *
 * @param {Error | Object} error - 확인할 에러 객체
 * @returns {boolean} 컨텍스트 윈도우 초과 에러 여부
 *
 * @see https://platform.openai.com/docs/guides/error-codes
 */
export function isContextWindowError(error) {
    if (!error) return false;

    // OpenAI SDK의 공식 에러 코드 확인
    // error.code 또는 error.error.code에서 확인
    const errorCode = error?.code || error?.error?.code;

    if (errorCode === 'context_length_exceeded') {
        debugLog('[isContextWindowError] Detected: context_length_exceeded');
        return true;
    }

    // 감지되지 않은 에러 - 디버깅을 위해 로그 남김
    if (error?.status === 400 || error?.response?.status === 400) {
        const errorType = error?.type || error?.error?.type;
        const errorMessage = error?.message || error?.error?.message || '';
        debugLog(
            `[isContextWindowError] Not detected - ` +
            `Status: 400, Type: ${errorType}, Code: ${errorCode}, ` +
            `Message: ${errorMessage.substring(0, 200)}`
        );
    }

    return false;
}
