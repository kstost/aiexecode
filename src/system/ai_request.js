import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import path from 'path';
// import process from 'process';
import fs from 'fs';
import { logger } from "./log.js";
import { ensureConfigDirectory, loadSettings, SETTINGS_FILE } from "../util/config.js";
import { getClaudeMaxTokens, DEFAULT_CLAUDE_MODEL } from "../config/claude_models.js";
import { getReasoningModels, supportsReasoningEffort, DEFAULT_OPENAI_MODEL } from "../config/openai_models.js";
import { formatReadFileStdout } from "../util/output_formatter.js";
import { ENABLE_DEBUG_LOG } from "../config/config.js";

// Debug logging helper
function debugLog(message) {
    if (!ENABLE_DEBUG_LOG) return;
    try {
        const timestamp = new Date().toISOString();
        fs.appendFileSync('debug.txt', `[${timestamp}] ${message}\n`);
    } catch (err) {
        // Ignore logging errors
    }
}

// Planner·Orchestrator·Verifier가 동일한 방식으로 모델을 호출할 수 있도록 공통 게이트웨이를 제공합니다.
// OpenAI 및 Anthropic SDK를 사용하기 위한 환경변수를 불러옵니다.
dotenv.config({ quiet: true });

// AI 클라이언트를 초기화합니다.
let openaiClient = null;
let anthropicClient = null;
let currentProvider = null;
let currentAbortController = null;
function consolelog() { }

async function getOpenAIClient() {
    if (openaiClient) {
        return openaiClient;
    }

    // Settings 로드 및 환경변수 설정
    await ensureConfigDirectory();
    const settings = await loadSettings();

    if (!process.env.OPENAI_API_KEY && settings?.OPENAI_API_KEY) {
        process.env.OPENAI_API_KEY = settings.OPENAI_API_KEY;
    }

    // 모델 설정도 환경변수에 로드
    if (!process.env.OPENAI_MODEL && settings?.OPENAI_MODEL) {
        process.env.OPENAI_MODEL = settings.OPENAI_MODEL;
    }

    // reasoning_effort 설정도 환경변수에 로드
    if (!process.env.OPENAI_REASONING_EFFORT && settings?.OPENAI_REASONING_EFFORT) {
        process.env.OPENAI_REASONING_EFFORT = settings.OPENAI_REASONING_EFFORT;
    }

    if (!process.env.OPENAI_API_KEY) {
        throw new Error(`OPENAI_API_KEY is not configured. Please update ${SETTINGS_FILE}.`);
    }

    openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    return openaiClient;
}

async function getAnthropicClient() {
    if (anthropicClient) {
        return anthropicClient;
    }

    // Settings 로드 및 환경변수 설정
    await ensureConfigDirectory();
    const settings = await loadSettings();

    if (!process.env.ANTHROPIC_API_KEY && settings?.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = settings.ANTHROPIC_API_KEY;
    }

    // 모델 설정도 환경변수에 로드
    if (!process.env.ANTHROPIC_MODEL && settings?.ANTHROPIC_MODEL) {
        process.env.ANTHROPIC_MODEL = settings.ANTHROPIC_MODEL;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(`ANTHROPIC_API_KEY is not configured. Please update ${SETTINGS_FILE}.`);
    }

    anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
    });

    return anthropicClient;
}

async function getCurrentProvider() {
    if (currentProvider) {
        return currentProvider;
    }

    await ensureConfigDirectory();
    const settings = await loadSettings();
    currentProvider = settings?.AI_PROVIDER || 'openai';

    // 환경변수로 설정된 경우 우선 적용
    if (process.env.AI_PROVIDER) {
        currentProvider = process.env.AI_PROVIDER;
    } else if (settings?.AI_PROVIDER) {
        // Settings에서 환경변수로 로드
        process.env.AI_PROVIDER = settings.AI_PROVIDER;
    }

    return currentProvider;
}

// Provider에 맞는 모델 이름 가져오기
async function getModelForProvider() {
    const provider = await getCurrentProvider();
    const settings = await loadSettings();

    if (provider === 'anthropic') {
        // Anthropic 모델 사용
        return process.env.ANTHROPIC_MODEL || settings?.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL;
    } else {
        // OpenAI 모델 사용 (기본값)
        return process.env.OPENAI_MODEL || settings?.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    }
}

// 클라이언트 및 캐시 리셋 함수 (모델 변경 시 사용)
export function resetAIClients() {
    openaiClient = null;
    anthropicClient = null;
    currentProvider = null;
    currentAbortController = null;
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

// OpenAI 포맷을 Anthropic 포맷으로 변환
function convertOpenAIToAnthropic(requestPayload) {
    // 모델 이름 매핑 (OpenAI 모델이 지정된 경우 Anthropic 모델로 변환)
    let modelName = requestPayload.model;
    if (modelName && modelName.startsWith('gpt-')) {
        // OpenAI 모델이면 기본 Anthropic 모델로 변경
        modelName = process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL;
    }

    // 모델별 max_tokens 설정 (중앙 설정에서 가져옴)
    const maxTokens = getClaudeMaxTokens(modelName);

    const anthropicRequest = {
        model: modelName,
        max_tokens: maxTokens, // Anthropic requires max_tokens
        messages: []
    };

    // tool_use와 tool_result 간의 매칭을 위한 ID 수집
    const toolUseIds = new Set();
    const toolResultIds = new Set();

    for (const msg of requestPayload.input) {
        if (msg.type === 'function_call') {
            toolUseIds.add(msg.id || msg.call_id);
        }
        if (msg.type === 'function_call_output') {
            toolResultIds.add(msg.call_id);
        }
    }

    // 양방향 매칭 필터: tool_use와 tool_result가 모두 존재하는 ID만 유효
    const validToolIds = new Set(
        [...toolUseIds].filter(id => toolResultIds.has(id))
    );

    // input을 messages로 변환
    if (requestPayload.input && Array.isArray(requestPayload.input)) {
        for (const msg of requestPayload.input) {
            // system 메시지는 별도 처리
            if (msg.role === 'system') {
                if (msg.content && Array.isArray(msg.content)) {
                    const systemText = msg.content.map(c => c.text || c).join('\n');
                    anthropicRequest.system = systemText;
                    continue;
                } else if (typeof msg.content === 'string') {
                    anthropicRequest.system = msg.content;
                    continue;
                }
            }

            // function_call_output을 tool_result로 변환
            if (msg.type === 'function_call_output') {
                // 고아 tool_result 방지: 대응하는 tool_use가 없으면 건너뛰기
                if (!validToolIds.has(msg.call_id)) {
                    continue;
                }
                const lastMsg = anthropicRequest.messages[anthropicRequest.messages.length - 1];
                if (lastMsg && lastMsg.role === 'user') {
                    // 이미 user 메시지가 있으면 content에 추가
                    if (!Array.isArray(lastMsg.content)) {
                        // 문자열 content를 제대로 된 배열로 변환
                        lastMsg.content = [{ type: 'text', text: lastMsg.content }];
                    }
                    lastMsg.content.push({
                        type: 'tool_result',
                        tool_use_id: msg.call_id,
                        content: msg.output || ''
                    });
                } else {
                    // 새 user 메시지 생성
                    anthropicRequest.messages.push({
                        role: 'user',
                        content: [{
                            type: 'tool_result',
                            tool_use_id: msg.call_id,
                            content: msg.output || ''
                        }]
                    });
                }
                continue;
            }

            // function_call을 tool_use로 변환 (assistant 메시지의 일부)
            if (msg.type === 'function_call') {
                // 고아 tool_use 방지: 대응하는 tool_result가 없으면 건너뛰기
                const toolId = msg.id || msg.call_id;
                if (!validToolIds.has(toolId)) {
                    continue;
                }

                const lastMsg = anthropicRequest.messages[anthropicRequest.messages.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                    // 이미 assistant 메시지가 있으면 content에 추가
                    if (!Array.isArray(lastMsg.content)) {
                        // 문자열 content를 제대로 된 배열로 변환
                        lastMsg.content = [{ type: 'text', text: lastMsg.content }];
                    }
                    lastMsg.content.push({
                        type: 'tool_use',
                        id: toolId,
                        name: msg.name,
                        input: JSON.parse(msg.arguments || '{}')
                    });
                } else {
                    // 새 assistant 메시지 생성
                    anthropicRequest.messages.push({
                        role: 'assistant',
                        content: [{
                            type: 'tool_use',
                            id: toolId,
                            name: msg.name,
                            input: JSON.parse(msg.arguments || '{}')
                        }]
                    });
                }
                continue;
            }

            // reasoning 타입은 건너뛰기 (Anthropic에 없는 타입)
            if (msg.type === 'reasoning') {
                continue;
            }

            // 일반 메시지 처리
            const anthropicMsg = {
                role: msg.role,
                content: []
            };

            // content 변환
            if (msg.content && Array.isArray(msg.content)) {
                for (const c of msg.content) {
                    if (c.type === 'input_text' || c.type === 'text' || c.type === 'output_text') {
                        // 빈 text는 건너뛰기 (Anthropic은 빈 text를 허용하지 않음)
                        if (c.text && c.text.trim()) {
                            anthropicMsg.content.push({
                                type: 'text',
                                text: c.text
                            });
                        }
                    } else if (c.text) {
                        if (c.text.trim()) {
                            anthropicMsg.content.push({
                                type: 'text',
                                text: c.text
                            });
                        }
                    }
                }
            } else if (typeof msg.content === 'string') {
                anthropicMsg.content = msg.content;
            }

            // content가 있을 때만 메시지 추가 (빈 배열이나 빈 문자열은 제외)
            if (anthropicMsg.content.length > 0 ||
                (typeof anthropicMsg.content === 'string' && anthropicMsg.content.trim())) {
                anthropicRequest.messages.push(anthropicMsg);
            }
        }
    }

    // tools 변환
    if (requestPayload.tools && Array.isArray(requestPayload.tools)) {
        anthropicRequest.tools = requestPayload.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema || tool.parameters
        }));
    }

    // tool_choice 변환
    if (requestPayload.tool_choice) {
        if (requestPayload.tool_choice === 'auto') {
            anthropicRequest.tool_choice = { type: 'auto' };
        } else if (requestPayload.tool_choice === 'required') {
            anthropicRequest.tool_choice = { type: 'any' };
        } else if (typeof requestPayload.tool_choice === 'object') {
            anthropicRequest.tool_choice = requestPayload.tool_choice;
        }
    }

    // temperature와 top_p는 동시에 사용할 수 없음 (Anthropic API 제약)
    // temperature가 있으면 temperature 사용, 없으면 top_p 사용
    if (requestPayload.temperature !== undefined) {
        anthropicRequest.temperature = requestPayload.temperature;
    } else if (requestPayload.top_p !== undefined) {
        anthropicRequest.top_p = requestPayload.top_p;
    }

    return anthropicRequest;
}

// Anthropic 응답을 OpenAI 포맷으로 변환
function convertAnthropicToOpenAI(anthropicResponse) {
    const openaiResponse = {
        output: [],
        output_text: ''
    };

    let fullText = '';
    let hasTextContent = false;

    // content 변환
    if (anthropicResponse.content && Array.isArray(anthropicResponse.content)) {
        // Anthropic 세션 종료 신호: content가 비어있고 stop_reason이 end_turn
        // OpenAI 로직과 호환되도록 빈 message를 추가
        if (anthropicResponse.content.length === 0 && anthropicResponse.stop_reason === 'end_turn') {
            openaiResponse.output.push({
                role: 'assistant',
                type: 'message',
                content: [{
                    type: 'output_text',
                    text: ''
                }]
            });
        }

        // 일반적인 content 처리
        for (const content of anthropicResponse.content) {
            if (content.type === 'text') {
                fullText += content.text;
                hasTextContent = true;
                openaiResponse.output.push({
                    role: 'assistant',
                    type: 'message',
                    content: [{
                        type: 'output_text',
                        text: content.text
                    }]
                });
            } else if (content.type === 'tool_use') {
                openaiResponse.output.push({
                    role: 'assistant',  // role 추가
                    type: 'function_call',
                    id: content.id,
                    name: content.name,
                    arguments: JSON.stringify(content.input),
                    call_id: content.id  // call_id도 추가 (일관성)
                });
            }
        }
    }

    openaiResponse.output_text = fullText;

    // Anthropic 응답의 메타데이터 복사
    if (anthropicResponse.id) {
        openaiResponse.id = anthropicResponse.id;
    }
    if (anthropicResponse.model) {
        openaiResponse.model = anthropicResponse.model;
    }
    if (anthropicResponse.type) {
        openaiResponse.object = anthropicResponse.type;
    }

    // stop_reason 처리
    if (anthropicResponse.stop_reason) {
        openaiResponse.stop_reason = anthropicResponse.stop_reason;
    }
    if (anthropicResponse.stop_sequence) {
        openaiResponse.stop_sequence = anthropicResponse.stop_sequence;
    }

    // usage 정보 복사 (cache 토큰 포함)
    if (anthropicResponse.usage) {
        openaiResponse.usage = anthropicResponse.usage;
    }

    return openaiResponse;
}

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
    const provider = await getCurrentProvider();

    // requestPayload를 deep copy하여 원본 보호
    let payloadCopy = JSON.parse(JSON.stringify(requestPayload));

    // function_call_output의 output에서 original_result 제거
    if (false && payloadCopy.input && Array.isArray(payloadCopy.input)) {
        for (const msg of payloadCopy.input) {
            if (msg.type === 'function_call_output' && msg.output) {
                try {
                    const outputObj = JSON.parse(msg.output);
                    if (outputObj && typeof outputObj === 'object' && 'original_result' in outputObj) {
                        delete outputObj.original_result;

                        // tool이 response_message인 경우 stdout 변경
                        if (outputObj.tool === 'response_message') {
                            outputObj.stdout = 'response complete';
                        }

                        msg.output = JSON.stringify(outputObj);
                    }
                } catch {
                    // JSON 파싱 실패 시 무시
                }
            }
        }
    }

    // read_file + edit_file_range: 같은 파일의 최신 모습만 유지
    if (false && payloadCopy.input && Array.isArray(payloadCopy.input)) {
        // 1. absolute_file_path를 가진 모든 function_call_output 수집
        const pathGroups = new Map(); // absolute_file_path -> [{index, msg, outputObj, stdoutObj, toolName}]

        payloadCopy.input.forEach((msg, index) => {
            if (msg.type === 'function_call_output' && msg.output) {
                try {
                    const outputObj = JSON.parse(msg.output);
                    const toolName = outputObj?.tool;

                    if (outputObj && typeof outputObj === 'object' && outputObj.stdout) {
                        let stdoutObj = null;
                        let absolutePath = null;

                        // edit_file_range: stdout이 JSON 객체
                        if (toolName === 'edit_file_range') {
                            stdoutObj = JSON.parse(outputObj.stdout);
                            absolutePath = stdoutObj?.absolute_file_path;
                        }
                        // read_file: stdout이 JSON 객체 (orchestrator에서 생성)
                        else if (toolName === 'read_file') {
                            stdoutObj = JSON.parse(outputObj.stdout);
                            absolutePath = stdoutObj?.absolute_file_path;
                        }

                        if (stdoutObj && absolutePath) {
                            if (!pathGroups.has(absolutePath)) {
                                pathGroups.set(absolutePath, []);
                            }
                            pathGroups.get(absolutePath).push({ index, msg, outputObj, stdoutObj, toolName });
                        }
                    }
                } catch {
                    // JSON 파싱 실패 시 무시
                }
            }
        });

        // 2. 각 그룹에서 index 기준 마지막만 내용 유지
        for (const [path, group] of pathGroups.entries()) {
            // index 기준 정렬 (시간순)
            group.sort((a, b) => a.index - b.index);

            // 마지막 요소의 index
            const lastIndex = group[group.length - 1].index;

            group.forEach((item) => {
                const { index, outputObj, stdoutObj, msg, toolName } = item;
                const isLast = (index === lastIndex);

                if (toolName === 'edit_file_range') {
                    // 마지막이 아닌 요소는 updated_content 제거
                    if (!isLast) {
                        if (stdoutObj.file_stats && 'updated_content' in stdoutObj.file_stats) {
                            delete stdoutObj.file_stats.updated_content;
                        }
                    } else {
                        // 마지막 요소는 updated_content에 formatReadFileStdout 적용
                        if (stdoutObj.file_stats && 'updated_content' in stdoutObj.file_stats) {
                            const content = stdoutObj.file_stats.updated_content;
                            const lines = content.split('\n');
                            const formattedContent = formatReadFileStdout({ file_lines: lines });
                            stdoutObj.file_stats.updated_content = formattedContent;
                        }
                    }

                    // absolute_file_path 제거 후 JSON으로 직렬화
                    delete stdoutObj.absolute_file_path;
                    outputObj.stdout = JSON.stringify(stdoutObj);
                    msg.output = JSON.stringify(outputObj);

                } else if (toolName === 'read_file') {
                    // 마지막이 아닌 요소는 content를 "(내용 표시 안함)"으로 대체
                    if (!isLast) {
                        if ('content' in stdoutObj) {
                            stdoutObj.content = '(내용 표시 안함)';
                        }
                    }

                    // absolute_file_path 제거 후 문자열로 직렬화
                    delete stdoutObj.absolute_file_path;
                    outputObj.stdout = stdoutObj.content;
                    msg.output = JSON.stringify(outputObj);
                }
            });
        }
    }
    if (payloadCopy.input && Array.isArray(payloadCopy.input)) {
        const marker = {};
        const remove_call_id = {};//[];
        const response_message_call_id = {};
        for (let i = payloadCopy.input.length - 1; i >= 0; i--) {
            const msg = payloadCopy.input[i];
            const { type, call_id, output } = msg;
            if (type !== 'function_call_output') continue;

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
        for (let i = payloadCopy.input.length - 1; i >= 0; i--) {
            const msg = payloadCopy.input[i];
            const { type, call_id, name } = msg;
            if (type !== 'function_call') continue;
            if (name !== 'response_message') continue;
            response_message_call_id[call_id] = true;
        }
        for (let i = payloadCopy.input.length - 1; i >= 0; i--) {
            const msg = payloadCopy.input[i];
            const { type, call_id } = msg;
            if (type !== 'function_call_output') continue;
            if (!response_message_call_id[call_id]) continue;
            msg.output = JSON.stringify({ message_displayed: true });
        }
        if (!true) {
            const newArr = [];
            payloadCopy.input.forEach(msg => {
                if (msg.call_id && remove_call_id[msg.call_id]) return;
                newArr.push(msg)
            });
            if (!process.__counter) process.__counter = 1;
            process.__counter++;
            fs.writeFileSync(`debugging_${process.__counter}.txt`, JSON.stringify(newArr, null, 2));
            payloadCopy = JSON.parse(JSON.stringify({ ...payloadCopy, input: newArr }, null, 2)); //⭐️
        } else {
            // fs.writeFileSync('debugging3.txt', JSON.stringify(payloadCopy, null, 2));

        }

    }
    if (false && payloadCopy.input && Array.isArray(payloadCopy.input)) {
        for (const msg of payloadCopy.input) {
            if (msg.type === 'function_call_output') {
                const parsed = JSON.parse(msg.output);
                msg.output = parsed.stdout;
                // [
                //     `stdout:`
                // ]
            }

        }
    }
    let response;
    let originalRequest;
    let originalResponse;

    // AbortController 생성
    currentAbortController = new AbortController();

    try {
        if (provider === 'anthropic') {
            // Anthropic API 사용
            const anthropic = await getAnthropicClient();
            const anthropicRequest = convertOpenAIToAnthropic(JSON.parse(JSON.stringify(payloadCopy)));
            originalRequest = JSON.parse(JSON.stringify(anthropicRequest)); // 원본 Anthropic 요청

            // 로그는 원본 Anthropic 포맷으로 저장 (API 호출 전)
            await logger(`${taskName}_REQ`, originalRequest, provider);

            const anthropicResponse = await anthropic.messages.create(
                anthropicRequest,
                {
                    signal: currentAbortController.signal
                }
            );
            originalResponse = JSON.parse(JSON.stringify(anthropicResponse)); // 원본 Anthropic 응답

            // OpenAI 포맷으로 변환
            response = convertAnthropicToOpenAI(anthropicResponse);
        } else {
            // OpenAI API 사용 (기본값)
            const openai = await getOpenAIClient();

            // reasoning 설정 추가 (OpenAI 추론 모델용)
            const settings = await loadSettings();
            const reasoningEffort = settings?.OPENAI_REASONING_EFFORT || process.env.OPENAI_REASONING_EFFORT || 'medium';

            // reasoning을 지원하는 모델인지 확인
            const reasoningModels = getReasoningModels();
            const currentModel = payloadCopy.model || settings?.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

            if (reasoningModels.some(m => currentModel.startsWith(m))) {
                let effectiveEffort = reasoningEffort;

                // 모델이 해당 effort를 지원하는지 확인하고 필요하면 fallback
                if (!supportsReasoningEffort(currentModel, reasoningEffort)) {
                    // high를 지원하는지 확인 (gpt-5-pro 등)
                    if (supportsReasoningEffort(currentModel, 'high')) {
                        effectiveEffort = 'high';
                    }
                    // medium을 지원하는지 확인
                    else if (supportsReasoningEffort(currentModel, 'medium')) {
                        effectiveEffort = 'medium';
                    }
                    // low를 지원하는지 확인
                    else if (supportsReasoningEffort(currentModel, 'low')) {
                        effectiveEffort = 'low';
                    }
                }

                // reasoning 객체로 설정
                payloadCopy.reasoning = {
                    effort: effectiveEffort,
                    summary: 'auto'
                };
            }

            originalRequest = JSON.parse(JSON.stringify(payloadCopy)); // 원본 OpenAI 요청

            // 로그는 원본 OpenAI 포맷으로 저장 (API 호출 전)
            await logger(`${taskName}_REQ`, originalRequest, provider);

            response = await openai.responses.create(originalRequest, {
                signal: currentAbortController.signal
            });
            // 원본 응답을 깊은 복사로 보존 (이후 수정으로부터 보호)
            originalResponse = JSON.parse(JSON.stringify(response));
        }
    } catch (error) {
        // AbortController 정리
        currentAbortController = null;

        // Abort 에러인 경우 명확하게 처리
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.message?.includes('aborted')) {
            const abortError = new Error('Request aborted by user');
            abortError.name = 'AbortError';
            throw abortError;
        }

        // 기타 에러는 그대로 throw
        throw error;
    }

    // 요청 완료 후 AbortController 정리
    currentAbortController = null;

    if (taskName === 'orchestrator') {
        if (false) {
            response.output.forEach(obj => {
                consolelog('OUTPUT', obj.type, '|', obj.name);
            });
        }
        try {
            if (false) response.output.forEach(obj => {
                if (obj.type !== 'function_call') return;
                if (obj.name !== 'response_message') return;
                const text = JSON.parse(obj.arguments).message;
                Object.keys(obj).forEach(key => delete obj[key]);
                delete obj.id;
                obj.role = 'assistant';
                obj.type = 'message';
                obj.content = [{ text, "type": "output_text", }];
            });
        } catch {
        }
        response.output = sortByStartLineDescending(response.output, 'function_call', 'edit_file_range');
    }
    structureFixer(response);

    // 로그는 원본 포맷으로 저장 (Anthropic이면 Anthropic 응답, OpenAI면 OpenAI 응답)
    await logger(`${taskName}_RES`, originalResponse, provider);

    return response;
}

export function isContextWindowError(error) {
    if (!error) return false;

    // OpenAI 에러 코드 확인
    const errorCode = typeof error?.error?.code === 'string' ? error.error.code : typeof error?.code === 'string' ? error.code : '';
    if (errorCode && errorCode.toLowerCase() === 'context_length_exceeded') {
        return true;
    }

    // Anthropic 에러 타입 확인
    const errorType = typeof error?.error?.type === 'string' ? error.error.type : typeof error?.type === 'string' ? error.type : '';

    // Anthropic의 context window 초과 에러
    if (errorType === 'invalid_request_error') {
        const errorParam = typeof error?.error?.param === 'string' ? error.error.param : typeof error?.param === 'string' ? error.param : '';

        if (errorParam) {
            const normalizedParam = errorParam.toLowerCase();
            if (normalizedParam.includes('message') || normalizedParam.includes('prompt') || normalizedParam.includes('input')) {
                const maybeStatus = typeof error?.response?.status === 'number' ? error.response.status : typeof error?.status === 'number' ? error.status : null;
                if (maybeStatus === 400) {
                    return true;
                }
            }
        }
    }

    // 에러 메시지 확인
    const message = typeof error === 'string'
        ? error
        : typeof error?.error?.message === 'string'
            ? error.error.message
            : typeof error?.message === 'string'
                ? error.message
                : '';

    if (!message) {
        return false;
    }

    const lowerMessage = message.toLowerCase();
    return lowerMessage.includes('context length')
        || lowerMessage.includes('maximum context length')
        || lowerMessage.includes('context window')
        || lowerMessage.includes('prompt is too long')
        || (lowerMessage.includes('token') && lowerMessage.includes('exceed'))
        || lowerMessage.includes('too much context')
        || lowerMessage.includes('too many tokens');
}
