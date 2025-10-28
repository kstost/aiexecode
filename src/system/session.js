// Agent Loop: 계획·실행·검증 사이클을 수행하는 핵심 모듈
import { orchestrateMission, continueOrchestratorConversation, resetOrchestratorConversation, recordOrchestratorToolResult, getOrchestratorConversation, restoreOrchestratorConversation } from "../ai_based/orchestrator.js";
import { judgeMissionCompletion } from "../ai_based/completion_judge.js";
import { execPythonCode, execShellScript } from "./code_executer.js";
import { FILE_READER_FUNCTIONS } from "../tools/file_reader.js";
import { RIPGREP_FUNCTIONS } from "../tools/ripgrep.js";
import { GLOB_FUNCTIONS } from "../tools/glob.js";
import { CODE_EDITOR_FUNCTIONS } from "../tools/code_editor.js";
import { WEB_DOWNLOADER_FUNCTIONS } from "../tools/web_downloader.js";
import { RESPONSE_MESSAGE_FUNCTIONS } from '../tools/response_message.js';
import { clampOutput, formatToolStdout } from "../util/output_formatter.js";
import { buildToolHistoryEntry } from "../util/rag_helper.js";
import { createSessionData, getLastConversationState, loadPreviousSessions, saveSessionToHistory } from "./session_memory.js";
import { uiEvents } from "./ui_events.js";
import { logSystem, logError, logAssistantMessage, logToolCall, logToolResult, logCodeExecution, logCodeResult, logIteration, logMissionComplete, logConversationRestored } from "./output_helper.js";
import { requiresApproval, requestApproval } from "./tool_approval.js";
import { setCurrentSession, saveFileSnapshot, getFileSnapshot } from "./file_integrity.js";
import { abortCurrentRequest } from "./ai_request.js";
import { safeReadFile } from '../util/safe_fs.js';
import { resolve } from 'path';
import { createDebugLogger } from '../util/debug_log.js';
import { ERROR_VERBOSITY } from '../config/feature_flags.js';

const debugLog = createDebugLogger('session.log', 'session');

/**
 * 상수 정의
 */
const MAX_REASONING_ONLY_RESPONSES = 5;
const DEFAULT_MAX_ITERATIONS = 50;
const SUB_MISSION_MAX_LENGTH = 120;


/**
 * 서브미션 이름을 추론하는 헬퍼 함수
 */
function inferSubMission(orchestratedResponse, iterationCount) {
    const defaultSubMission = `Adaptive iteration ${iterationCount}`;

    const firstMessage = orchestratedResponse?.output?.find(item => item.type === 'message');
    const inferredLabel = firstMessage?.content?.[0]?.text?.trim();

    if (!inferredLabel) {
        return defaultSubMission;
    }

    const firstLine = inferredLabel.split('\n')[0].trim();
    return firstLine ? firstLine.slice(0, SUB_MISSION_MAX_LENGTH) : defaultSubMission;
}

/**
 * 실행 결과를 준비하는 헬퍼 함수
 */
function prepareExecutionResult(rawStdout, rawStderr, code = 0) {
    return {
        code,
        stdout: clampOutput(rawStdout),
        stderr: clampOutput(rawStderr),
        __raw_stdout: rawStdout,
        __raw_stderr: rawStderr
    };
}

/**
 * RAG에 저장할 raw 데이터를 추출하는 헬퍼 함수
 */
function extractRawOutputs(exeResult) {
    const rawStdout = typeof exeResult.__raw_stdout === 'string'
        ? exeResult.__raw_stdout
        : (typeof exeResult.stdout === 'string' ? exeResult.stdout : '');

    const rawStderr = typeof exeResult.__raw_stderr === 'string'
        ? exeResult.__raw_stderr
        : (typeof exeResult.stderr === 'string' ? exeResult.stderr : '');

    return { rawStdout, rawStderr };
}

/**
 * 실행 결과를 정리하는 헬퍼 함수 (raw 데이터 제거)
 */
function cleanupExecutionResult(exeResult, rawStdout, rawStderr) {
    exeResult.stdout = typeof exeResult.stdout === 'string' ? exeResult.stdout : clampOutput(rawStdout);
    exeResult.stderr = typeof exeResult.stderr === 'string' ? exeResult.stderr : clampOutput(rawStderr);
    delete exeResult.__raw_stdout;
    delete exeResult.__raw_stderr;
}

/**
 * 메시지 타입 출력을 처리하는 함수
 * @param {Object} output - 메시지 출력 객체
 * @param {boolean} shouldOutput - 메시지를 출력할지 여부 (기본값: false, completion_judge 판단 후 결정)
 */
function processMessageOutput(output, shouldOutput = false) {
    const rawMessage = output.content?.[0]?.text ?? '';
    const truncatedMessage = clampOutput(rawMessage);

    // shouldOutput이 true이고 빈 메시지가 아닐 때만 로그 출력
    if (shouldOutput && rawMessage.trim()) {
        logAssistantMessage(truncatedMessage);
    }

    return {
        exeResult: prepareExecutionResult(rawMessage, '', 0),
        content: rawMessage
    };
}

/**
 * 일반 도구 호출을 처리하는 함수
 */
async function processToolCall(name, argument, toolMap, sessionID) {
    debugLog(`[processToolCall] START - tool: ${name}`);
    debugLog(`[processToolCall] Arguments: ${JSON.stringify(argument, null, 2)}`);

    // edit_file_range, edit_file_replace인 경우 파일 스냅샷을 승인 요청 전에 저장
    // (ToolApprovalPrompt에서 DiffViewer 표시를 위해 필요)
    if ((name === 'edit_file_range' || name === 'edit_file_replace') && argument.file_path) {
        try {
            debugLog(`[processToolCall] Saving file snapshot for: ${argument.file_path}`);
            const fileContent = await safeReadFile(argument.file_path, 'utf8');
            saveFileSnapshot(argument.file_path, fileContent);
            debugLog(`[processToolCall] Snapshot saved successfully (${fileContent.length} bytes)`);
        } catch (error) {
            debugLog(`[processToolCall] Snapshot save failed: ${error.message}`);
            // 파일을 읽을 수 없는 경우 (존재하지 않는 파일 등)
            // 스냅샷 저장 실패는 무시 (도구 실행에서 처리됨)
        }
    }

    // 승인이 필요한 도구인지 확인 (args 전달하여 실패 여부 판단)
    debugLog(`[processToolCall] Checking approval requirement...`);
    const approvalCheck = await requiresApproval(name, argument);
    debugLog(`[processToolCall] Approval check result: ${JSON.stringify(approvalCheck)}`);

    // 승인이 스킵되는 경우 (확실히 실패할 것으로 예상) - 바로 에러 반환
    if (approvalCheck && approvalCheck.skipApproval) {
        debugLog(`[processToolCall] Approval skipped - tool will fail: ${approvalCheck.reason}`);
        const errorResult = {
            operation_successful: false,
            error_message: approvalCheck.reason
        };
        const stdout = formatToolStdout(name, errorResult);
        const exeResult = prepareExecutionResult(stdout, '', 1);

        // 도구 호출과 결과를 History에 표시
        logToolCall(name, argument);
        logToolResult(name, exeResult.stdout, errorResult, argument);

        debugLog(`[processToolCall] END - skipped with error`);
        return {
            exeResult,
            originalResult: errorResult,
            content: `${name}(${JSON.stringify(argument, null, 2)})`
        };
    }

    // 승인이 필요한 경우 - 승인 요청을 먼저 처리 (History에 표시되기 전)
    if (approvalCheck === true) {
        debugLog(`[processToolCall] Requesting user approval...`);
        const approved = await requestApproval(name, argument);
        debugLog(`[processToolCall] User approval result: ${approved}`);
        if (!approved) {
            const errorResult = {
                operation_successful: false,
                error_message: 'User denied tool execution'
            };
            const stdout = formatToolStdout(name, errorResult);
            const exeResult = prepareExecutionResult(stdout, '', 1);

            // 거부된 경우에만 도구 호출과 결과를 History에 표시
            logToolCall(name, argument);
            logToolResult(name, exeResult.stdout, errorResult, argument);

            debugLog(`[processToolCall] END - user denied`);
            return {
                exeResult,
                originalResult: errorResult,
                content: `${name}(${JSON.stringify(argument, null, 2)})`
            };
        }
    }

    // 승인 완료 후 또는 승인 불필요한 경우 - 도구 호출 메시지 출력
    debugLog(`[processToolCall] Approval passed, executing tool...`);
    logToolCall(name, argument);

    // 도구가 toolMap에 없는 경우 처리
    if (!toolMap[name] || typeof toolMap[name] !== 'function') {
        debugLog(`[processToolCall] Tool not found in toolMap: ${name}`);
        const errorResult = {
            operation_successful: false,
            error_message: `Tool '${name}' is not available. This tool may be disabled due to missing system dependencies.`
        };
        const stdout = formatToolStdout(name, errorResult);
        const exeResult = prepareExecutionResult(stdout, '', 1);

        logToolResult(name, exeResult.stdout, errorResult, argument);

        debugLog(`[processToolCall] END - tool not available`);
        return {
            exeResult,
            originalResult: errorResult,
            content: `${name}(${JSON.stringify(argument, null, 2)})`
        };
    }

    const argumentWithSession = { ...argument, sessionID };
    debugLog(`[processToolCall] Calling tool function...`);
    const result = await toolMap[name](argumentWithSession);
    debugLog(`[processToolCall] Tool execution completed`);
    debugLog(`[processToolCall] Result type: ${result?.constructor?.name}, keys: ${Object.keys(result || {}).join(', ')}`);

    if (result.constructor !== Object) {
        logError('Tool result is not an object');
        throw new Error('Tool result is not an object');
    }

    const stdout = formatToolStdout(name, result);
    const exeResult = prepareExecutionResult(stdout, '', 0);
    debugLog(`[processToolCall] Formatted stdout length: ${stdout.length} bytes`);

    // edit_file_range인 경우 스냅샷도 함께 전달
    let snapshotForLog = null;
    if (name === 'edit_file_range' && argument.file_path) {
        const snapshot = getFileSnapshot(argument.file_path);
        if (snapshot) {
            debugLog(`[processToolCall] Retrieved snapshot for log: ${snapshot.content.length} bytes`);
            snapshotForLog = {
                content: snapshot.content,
                timestamp: snapshot.timestamp
            };
        }
    }

    logToolResult(name, exeResult.stdout, result, argument, snapshotForLog);

    debugLog(`[processToolCall] END - success`);
    return {
        exeResult,
        originalResult: result,  // 원본 도구 결과 반환
        content: `${name}(${JSON.stringify(argument, null, 2)})`
    };
}

/**
 * 코드 실행 도구를 처리하는 함수
 */
async function processCodeExecution(name, argument, toolMap) {
    const codeContent = argument.code || argument.script;
    const codeType = name === 'run_python_code' ? 'python' : 'bash';

    debugLog(`[processCodeExecution] Processing ${codeType} execution`);

    // 승인이 필요한 도구인지 확인 (args 전달하여 실패 여부 판단)
    const approvalCheck = await requiresApproval(name, argument);

    // 승인이 스킵되는 경우 (확실히 실패할 것으로 예상) - 바로 에러 반환
    if (approvalCheck && approvalCheck.skipApproval) {
        const exeResult = prepareExecutionResult('', approvalCheck.reason, 1);
        
        // 코드 실행과 결과를 History에 표시
        logCodeExecution(codeType, codeContent);
        logCodeResult(exeResult.stdout, exeResult.stderr, exeResult.code);

        return {
            exeResult,
            content: codeContent
        };
    }

    // 승인이 필요한 경우 - 승인 요청을 먼저 처리 (History에 표시되기 전)
    if (approvalCheck === true) {
        const approved = await requestApproval(name, argument);
        if (!approved) {
            const exeResult = prepareExecutionResult('', 'User denied code execution', 1);
            
            // 거부된 경우에만 코드 실행과 결과를 History에 표시
            logCodeExecution(codeType, codeContent);
            logCodeResult(exeResult.stdout, exeResult.stderr, exeResult.code);

            return {
                exeResult,
                content: codeContent
            };
        }
    }

    // 승인 완료 후 또는 승인 불필요한 경우 - 코드 실행 메시지 출력
    logCodeExecution(codeType, codeContent);

    // 도구가 toolMap에 없는 경우 처리
    if (!toolMap[name] || typeof toolMap[name] !== 'function') {
        const errorMessage = `Tool '${name}' is not available. This tool may be disabled due to missing system dependencies (e.g., Python not installed).`;
        const exeResult = prepareExecutionResult('', errorMessage, 1);
        logCodeResult(exeResult.stdout, exeResult.stderr, exeResult.code);

        return {
            exeResult,
            content: codeContent
        };
    }

    debugLog(`[processCodeExecution] Calling toolMap[${name}]`);
    const rawResult = await toolMap[name](argument);
    debugLog(`[processCodeExecution] rawResult - stdout: ${rawResult.stdout?.length || 0} bytes, stderr: ${rawResult.stderr?.length || 0} bytes, code: ${rawResult.code}`);

    const rawStdout = typeof rawResult.stdout === 'string' ? rawResult.stdout : '';
    const rawStderr = typeof rawResult.stderr === 'string' ? rawResult.stderr : '';

    debugLog(`[processCodeExecution] After extraction - rawStdout: ${rawStdout.length} bytes, rawStderr: ${rawStderr.length} bytes`);

    const exeResult = {
        ...rawResult,
        ...prepareExecutionResult(rawStdout, rawStderr, rawResult.code)
    };

    debugLog(`[processCodeExecution] exeResult - stdout: ${exeResult.stdout?.length || 0} bytes, stderr: ${exeResult.stderr?.length || 0} bytes`);
    logCodeResult(exeResult.stdout, exeResult.stderr, exeResult.code);

    return {
        exeResult,
        content: codeContent
    };
}



/**
 * Orchestrator 응답을 처리하는 함수
 */
async function processOrchestratorResponses(params) {
    debugLog('========== processOrchestratorResponses START ==========');
    const {
        orchestratedResponse: initialResponse,
        execution_output_list,
        executionStepsRagKeys,
        iterationToolHistory,
        toolUsageHistory,
        toolMap,
        mission,
        sub_mission,
        iteration_count,
        sessionID
    } = params;

    debugLog(`Parameters:`);
    debugLog(`  sessionID: ${sessionID}`);
    debugLog(`  iteration_count: ${iteration_count}`);
    debugLog(`  mission: ${mission?.substring(0, 100)}${mission?.length > 100 ? '...' : ''}`);
    debugLog(`  sub_mission: ${sub_mission || 'none'}`);
    debugLog(`  initialResponse outputs: ${initialResponse?.output?.length || 0}`);
    debugLog(`  existing toolUsageHistory: ${toolUsageHistory.length} items`);
    debugLog(`  existing execution_output_list: ${execution_output_list.length} items`);

    let orchestratedResponse = initialResponse;
    let reasoningOnlyResponses = 0;
    let hadAnyFunctionCall = false;
    let stallDetected = false;
    let missionSolved = false;
    let improvementPoints = '';
    let improvementPointsIsAutoGenerated = false;
    let completionJudgeExecuted = false;

    debugLog(`Starting response processing loop...`);
    let loopIteration = 0;
    while (true) {
        loopIteration++;
        debugLog(`---------- Loop iteration ${loopIteration} START ----------`);
        // 세션이 중단되었는지 확인
        if (sessionInterrupted) {
            debugLog(`Session interrupted, breaking loop`);
            break;
        }

        const outputs = orchestratedResponse?.output ?? [];
        debugLog(`Received ${outputs.length} outputs from orchestrator`);

        // 출력 타입별 카운트
        const outputTypes = {};
        outputs.forEach(o => {
            const type = o?.type || 'unknown';
            outputTypes[type] = (outputTypes[type] || 0) + 1;
        });
        debugLog(`Output types: ${JSON.stringify(outputTypes)}`);

        // 처리 가능한 출력이 없는 경우
        const hasProcessableOutput = outputs.some(
            item => item && item.type !== 'reasoning' && item.type !== 'function_call_output'
        );
        debugLog(`Has processable output: ${hasProcessableOutput}`);

        if (!hasProcessableOutput) {
            debugLog(`No processable output, reasoningOnlyResponses: ${reasoningOnlyResponses}`);
            if (reasoningOnlyResponses >= MAX_REASONING_ONLY_RESPONSES) {
                debugLog(`Reached MAX_REASONING_ONLY_RESPONSES (${MAX_REASONING_ONLY_RESPONSES}), treating as stall`);
                uiEvents.addSystemMessage('⚠ Orchestrator stalled (reasoning only) - treating as completion');
                stallDetected = true;
                break;
            }
            debugLog(`Continuing orchestrator conversation...`);
            try {
                orchestratedResponse = await continueOrchestratorConversation();
                debugLog(`Continued conversation, received ${orchestratedResponse?.output?.length || 0} new outputs`);
            } catch (err) {
                if (err.name === 'AbortError' || sessionInterrupted) {
                    debugLog(`Conversation aborted or interrupted: ${err.name}`);
                    break;
                }
                debugLog(`ERROR in continueOrchestratorConversation: ${err.message}`);
                throw err;
            }
            reasoningOnlyResponses += 1;
            continue;
        }

        debugLog(`Processing ${outputs.length} outputs...`);
        reasoningOnlyResponses = 0;
        let executedFunctionCall = false;
        let lastOutputType = null;
        let pendingMessageOutput = null; // 출력 대기 중인 MESSAGE 저장

        // 각 출력 처리
        for (let outputIndex = 0; outputIndex < outputs.length; outputIndex++) {
            const output = outputs[outputIndex];
            debugLog(`  --- Processing output ${outputIndex + 1}/${outputs.length} ---`);

            // 세션이 중단되었는지 확인
            if (sessionInterrupted) {
                debugLog(`  Session interrupted, breaking output loop`);
                break;
            }

            const type = output.type;
            debugLog(`  Output type: ${type}`);

            if (type === 'reasoning' || type === 'function_call_output') {
                debugLog(`  Skipping ${type} output`);
                continue;
            }

            const MESSAGE = type === 'message';
            const FUNCTION_CALL = type === 'function_call';
            debugLog(`  Is MESSAGE: ${MESSAGE}, Is FUNCTION_CALL: ${FUNCTION_CALL}`);

            lastOutputType = type;
            let exe_result = {};
            let content;

            if (MESSAGE) {
                debugLog(`  Processing MESSAGE output (without displaying)...`);
                // 출력하지 않고 저장만 함 (shouldOutput = false)
                const { exeResult, content: msgContent } = processMessageOutput(output, false);
                exe_result = exeResult;
                content = msgContent;
                pendingMessageOutput = output; // 나중에 출력할 수 있도록 저장
                debugLog(`  MESSAGE processed (pending): content length ${msgContent?.length || 0}`);
            }

            if (FUNCTION_CALL) {
                executedFunctionCall = true;
                hadAnyFunctionCall = true;
                const argument = JSON.parse(output.arguments || '{}');
                const name = output.name;
                debugLog(`  FUNCTION_CALL: ${name}`);
                debugLog(`  Arguments keys: ${Object.keys(argument).join(', ')}`);
                if (argument.file_path) {
                    debugLog(`  file_path argument: ${argument.file_path}`);
                }
                const operation = name;

                const isCodeExecution = name === 'run_python_code' || name === 'bash';
                debugLog(`  Is code execution: ${isCodeExecution}`);

                let toolOriginalResult = null;  // 원본 도구 결과 저장용

                if (!isCodeExecution) {
                    debugLog(`  Calling processToolCall for ${name}...`);
                    const { exeResult: toolResult, originalResult, content: toolContent } = await processToolCall(
                        name,
                        argument,
                        toolMap,
                        sessionID
                    );
                    exe_result = toolResult;
                    toolOriginalResult = originalResult;
                    content = toolContent;
                    debugLog(`  processToolCall completed:`);
                    debugLog(`    exe_result.code: ${exe_result.code}`);
                    debugLog(`    originalResult exists: ${!!originalResult}`);
                    if (originalResult) {
                        debugLog(`    originalResult.operation_successful: ${originalResult.operation_successful}`);
                        if (originalResult.target_file_path) {
                            debugLog(`    originalResult.target_file_path: ${originalResult.target_file_path}`);
                        }
                    }
                    debugLog(`    content length: ${toolContent?.length || 0}`);
                } else {
                    debugLog(`  Calling processCodeExecution for ${name}...`);
                    const { exeResult: codeResult, content: codeContent } = await processCodeExecution(
                        name,
                        argument,
                        toolMap
                    );
                    exe_result = codeResult;
                    content = codeContent;
                    debugLog(`  processCodeExecution completed: exe_result.code ${exe_result.code}`);
                }

                exe_result.more_info = {
                    name,
                    type: operation,
                    content
                };

                const { rawStdout: rawStdoutForRag, rawStderr: rawStderrForRag } = extractRawOutputs(exe_result);
                debugLog(`[processOrchestratorResponses] extractRawOutputs - rawStdout: ${rawStdoutForRag.length} bytes, rawStderr: ${rawStderrForRag.length} bytes`);

                // RAG용 마크다운 문자열
                const ragHistoryEntry = buildToolHistoryEntry({
                    stepIndex: toolUsageHistory.length + 1,
                    toolName: name,
                    operation,
                    argument,
                    stdout: rawStdoutForRag,
                    stderr: rawStderrForRag
                });

                // 세션 저장 및 UI 복원용 객체
                const historyObject = {
                    toolName: name,
                    args: argument,
                    result: {
                        stdout: rawStdoutForRag,
                        stderr: rawStderrForRag,
                        exit_code: exe_result.code || 0
                    },
                    timestamp: Date.now()
                };

                // edit_file_range 또는 edit_file_replace인 경우 스냅샷을 historyObject에 포함
                if ((name === 'edit_file_range' || name === 'edit_file_replace') && argument.file_path) {
                    // 절대 경로로 변환 (스냅샷은 절대 경로로 저장됨)
                    const absolutePath = resolve(argument.file_path);
                    debugLog(`[processOrchestratorResponses] Getting fileSnapshot for: ${absolutePath}`);
                    const snapshot = getFileSnapshot(absolutePath);
                    if (snapshot) {
                        debugLog(`[processOrchestratorResponses] fileSnapshot found: ${snapshot.content.length} bytes`);
                        historyObject.fileSnapshot = {
                            content: snapshot.content,
                            timestamp: snapshot.timestamp
                        };
                    } else {
                        debugLog(`[processOrchestratorResponses] fileSnapshot NOT found for: ${absolutePath}`);
                    }
                }

                toolUsageHistory.push(historyObject);
                iterationToolHistory.push(ragHistoryEntry);

                cleanupExecutionResult(exe_result, rawStdoutForRag, rawStderrForRag);

                const toolCallId = output.call_id || output.id || null;
                if (toolCallId) {
                    debugLog(`[processOrchestratorResponses] Recording tool result - toolCallId: ${toolCallId}, stdout: ${rawStdoutForRag.length} bytes, stderr: ${rawStderrForRag.length} bytes`);
                    recordOrchestratorToolResult({
                        toolCallId,
                        toolName: name,
                        arguments: argument,
                        stdout: rawStdoutForRag,
                        stderr: rawStderrForRag,
                        exitCode: exe_result.code,
                        originalResult: toolOriginalResult  // 원본 도구 결과 전달
                    });
                }

                execution_output_list.push(exe_result);
            }

            if (MESSAGE) {
                exe_result.more_info = {
                    name: 'assistant_message',
                    type: 'message',
                    content
                };

                const { rawStdout: rawStdoutForRag, rawStderr: rawStderrForRag } = extractRawOutputs(exe_result);
                cleanupExecutionResult(exe_result, rawStdoutForRag, rawStderrForRag);
                execution_output_list.push(exe_result);
            }
        }

        debugLog(`---------- Loop iteration ${loopIteration} END ----------`);
        debugLog(`  executedFunctionCall: ${executedFunctionCall}`);
        debugLog(`  lastOutputType: ${lastOutputType}`);
        debugLog(`  toolUsageHistory now has ${toolUsageHistory.length} items`);

        // 완료 조건 체크
        debugLog(`Checking completion conditions...`);
        if (!executedFunctionCall && lastOutputType === 'message') {
            debugLog(`COMPLETION: No function call + message type - judging if mission is truly complete`);

            // 세션 중단 확인 (completion_judge 호출 전)
            if (sessionInterrupted) {
                debugLog(`Session interrupted before judgeMissionCompletion, breaking loop`);
                break;
            }

            // LLM을 통해 실제 완료 여부 판단
            let judgement;
            try {
                judgement = await judgeMissionCompletion({
                    what_user_requests: mission
                });
                completionJudgeExecuted = true; // completion_judge 실행 완료
            } catch (err) {
                if (err.name === 'AbortError' || sessionInterrupted) {
                    debugLog(`judgeMissionCompletion aborted or interrupted: ${err.name}`);
                    break;
                }
                throw err;
            }

            // 세션 중단 확인 (completion_judge 호출 후)
            if (sessionInterrupted) {
                debugLog(`Session interrupted after judgeMissionCompletion, breaking loop`);
                break;
            }

            debugLog(`Completion judgement: shouldComplete=${judgement.shouldComplete}, whatUserShouldSay=${judgement.whatUserShouldSay}`);

            missionSolved = judgement.shouldComplete;

            if (missionSolved) {
                // 미션이 완료되었다고 판단되면 대기 중인 메시지 출력 후 종료
                debugLog(`Mission judged as complete, displaying pending message and breaking loop`);
                if (pendingMessageOutput) {
                    processMessageOutput(pendingMessageOutput, true); // 이제 출력
                }
                break;
            } else {
                // 미션이 완료되지 않았다고 판단되면 메시지를 출력하지 않고 계속 진행
                debugLog(`Mission not complete, continuing without displaying message`);

                // orchestratorConversation에서 방금 추가된 assistant message에 _internal_only 플래그 추가
                const conversation = getOrchestratorConversation();
                for (let i = conversation.length - 1; i >= 0; i--) {
                    const entry = conversation[i];
                    if (entry.type === 'message' && entry.role === 'assistant') {
                        entry._internal_only = true;
                        debugLog(`[_internal_only] Marked assistant message at index ${i} as internal-only (not for display)`);
                        break;
                    }
                }

                // whatUserShouldSay를 새로운 사용자 요구사항으로 처리
                if (judgement.whatUserShouldSay && judgement.whatUserShouldSay.trim().length > 0) {
                    debugLog(`Treating whatUserShouldSay as new user request: ${judgement.whatUserShouldSay}`);
                    // 💬 Auto-continuing 메시지 제거

                    // whatUserShouldSay를 새로운 mission으로 설정하여 루프를 빠져나감
                    // 상위 runSession 루프에서 다시 orchestrateMission이 호출될 것임
                    improvementPoints = judgement.whatUserShouldSay;
                    improvementPointsIsAutoGenerated = true; // auto-generated 플래그 설정
                    debugLog(`[_internal_only] Set improvementPointsIsAutoGenerated=true for whatUserShouldSay`);
                    missionSolved = false;  // 완료되지 않았으므로 상위 루프 계속
                    break;  // processOrchestratorResponses 루프 종료
                } else {
                    // whatUserShouldSay가 없으면 빈 문자열로 계속 진행
                    improvementPoints = "";
                    debugLog(`Continuing mission without whatUserShouldSay`);

                    // 세션 중단 확인 (continueOrchestratorConversation 호출 전)
                    if (sessionInterrupted) {
                        debugLog(`Session interrupted before continueOrchestratorConversation, breaking loop`);
                        break;
                    }

                    try {
                        orchestratedResponse = await continueOrchestratorConversation();
                        debugLog(`Received response with ${orchestratedResponse?.output?.length || 0} outputs`);
                        continue; // 루프 처음으로 돌아가서 새 응답 처리
                    } catch (err) {
                        if (err.name === 'AbortError' || sessionInterrupted) {
                            debugLog(`Conversation aborted or interrupted: ${err.name}`);
                            break;
                        }
                        debugLog(`ERROR in continueOrchestratorConversation: ${err.message}`);
                        throw err;
                    }
                }
            }
        }

        if (!executedFunctionCall) {
            debugLog(`COMPLETION: No function call executed (other cases), breaking loop`);
            break;
        }

        // continueOrchestratorConversation 호출
        debugLog(`Continuing orchestrator conversation for next iteration...`);
        try {
            orchestratedResponse = await continueOrchestratorConversation();
            debugLog(`Received response with ${orchestratedResponse?.output?.length || 0} outputs`);
        } catch (err) {
            if (err.name === 'AbortError' || sessionInterrupted) {
                debugLog(`Conversation aborted or interrupted: ${err.name}`);
                break;
            }
            debugLog(`ERROR in continueOrchestratorConversation: ${err.message}`);
            throw err;
        }
    }

    debugLog('========== processOrchestratorResponses END ==========');
    debugLog(`Final state:`);
    debugLog(`  hadAnyFunctionCall: ${hadAnyFunctionCall}`);
    debugLog(`  stallDetected: ${stallDetected}`);
    debugLog(`  missionSolved: ${missionSolved}`);
    debugLog(`  improvementPoints: ${improvementPoints}`);
    debugLog(`  improvementPointsIsAutoGenerated: ${improvementPointsIsAutoGenerated}`);
    debugLog(`  completionJudgeExecuted: ${completionJudgeExecuted}`);
    debugLog(`  Total loop iterations: ${loopIteration}`);
    debugLog(`  Final toolUsageHistory: ${toolUsageHistory.length} items`);

    return {
        hadAnyFunctionCall,
        stallDetected,
        missionSolved,
        improvementPoints,
        improvementPointsIsAutoGenerated,
        completionJudgeExecuted
    };
}



/**
 * Agent Loop 실행 옵션
 * @typedef {Object} AgentLoopOptions
 * @property {string} mission - 수행할 미션
 * @property {number} maxIterations - 최대 반복 횟수 (기본: 50)
 * @property {Array} mcpToolSchemas - MCP 도구 스키마 배열
 * @property {Object} mcpToolFunctions - MCP 도구 함수 맵
 * @property {Array} previousSessions - 이전 세션 배열 (선택)
 */

/**
 * Agent Loop 실행 결과
 * @typedef {Object} AgentLoopResult
 * @property {boolean} mission_solved - 미션 완료 여부
 * @property {number} iteration_count - 실행된 반복 횟수
 * @property {Array} toolUsageHistory - 도구 사용 히스토리
 */

/**
 * 세션 중단 플래그
 */
let sessionInterrupted = false;

/**
 * Agent Loop 메인 함수
 * @param {AgentLoopOptions} options - 실행 옵션
 * @returns {Promise<AgentLoopResult>} 실행 결과
 */
export async function runSession(options) {
    debugLog('========================================');
    debugLog('========== runSession START ==========');
    debugLog('========================================');
    debugLog(`Options: ${JSON.stringify(Object.keys(options))}`);
    debugLog(`Mission: ${options.mission?.substring(0, 200)}${options.mission?.length > 200 ? '...' : ''}`);
    debugLog(`MaxIterations: ${options.maxIterations || DEFAULT_MAX_ITERATIONS}`);

    // 세션 중단 플래그 초기화
    sessionInterrupted = false;

    // 세션 중단 이벤트 리스너 등록
    const handleInterrupt = () => {
        if (!sessionInterrupted) {
            sessionInterrupted = true;
            abortCurrentRequest(); // API 요청 즉시 중단
            uiEvents.addErrorMessage('Session interrupted by user');
            debugLog('[runSession] Session interrupted by user');
        }
    };
    uiEvents.on('session:interrupt', handleInterrupt);

    // 세션 시작 알림
    uiEvents.sessionStart('Running agent session...');

    try {
        // 현재 세션 데이터 생성
        const {
            mission,
            maxIterations = DEFAULT_MAX_ITERATIONS,
            mcpToolSchemas = [],
            mcpToolFunctions = {},
            previousSessions = null
        } = options;

        debugLog(`MCP tool schemas count: ${mcpToolSchemas.length}`);
        debugLog(`MCP tool functions count: ${Object.keys(mcpToolFunctions).length}`);

        // previousSessions가 제공되지 않은 경우 자동으로 로드
        const sessionsToUse = previousSessions ?? await loadPreviousSessions(process.app_custom.sessionID);

        const currentSessionData = createSessionData(process.app_custom.sessionID, mission);

        // 파일 무결성 시스템에 현재 세션 ID 설정
        setCurrentSession(process.app_custom.sessionID);

        // 이전 세션에서 파일 스냅샷 복원
        if (sessionsToUse && sessionsToUse.length > 0) {
            const lastSession = sessionsToUse[sessionsToUse.length - 1];
            if (lastSession.toolUsageHistory) {
                for (const historyItem of lastSession.toolUsageHistory) {
                    if ((historyItem.toolName === 'edit_file_range' || historyItem.toolName === 'edit_file_replace') && historyItem.fileSnapshot) {
                        saveFileSnapshot(
                            historyItem.args.file_path,
                            historyItem.fileSnapshot.content
                        );
                    }
                }
            }
        }

        // 미션 검증
        if (!mission || !mission.trim()) {
            throw new Error('Mission is required');
        }

        // 메모리 초기화
        const toolUsageHistory = [];

        let mission_solved = false;
        let iteration_count = 0;
        let improvement_points = '';
        let improvement_points_is_auto_generated = false; // whatUserShouldSay에서 온 것인지 표시

        // 대화 상태 복원 또는 리셋
        const conversationState = getLastConversationState(sessionsToUse);
        if (conversationState && conversationState.orchestratorConversation.length > 0) {
            // logConversationRestored(conversationState.orchestratorConversation.length);
            restoreOrchestratorConversation(
                conversationState.orchestratorConversation,
                conversationState.orchestratorRequestOptions
            );
            // logSuccess('✓ Conversation state restored');
        } else {
            // logSystem('ℹ Starting with fresh conversation state');
            resetOrchestratorConversation();
        }

        // Python 사용 가능 여부 확인
        const hasPython = process.app_custom?.systemInfo?.commands?.hasPython || false;

        // 도구 맵 구성
        const toolMap = {
            ...FILE_READER_FUNCTIONS,
            ...CODE_EDITOR_FUNCTIONS,
            ...RIPGREP_FUNCTIONS,
            ...GLOB_FUNCTIONS,
            ...RESPONSE_MESSAGE_FUNCTIONS,
            ...mcpToolFunctions,
            "bash": async (args) => execShellScript(args.script)
        };

        // Python이 있는 경우에만 Python 관련 도구 추가
        if (hasPython) {
            Object.assign(toolMap, WEB_DOWNLOADER_FUNCTIONS);
            toolMap["run_python_code"] = async (args) => execPythonCode(args.code);
        }

        // 메인 루프
        debugLog(`[runSession] Starting main loop - maxIterations: ${maxIterations}`);
        while (!mission_solved && iteration_count < maxIterations && !sessionInterrupted) {
            iteration_count++;
            debugLog('');
            debugLog('========================================');
            debugLog(`========== ITERATION ${iteration_count} START ==========`);
            debugLog('========================================');
            debugLog(`Current state - mission_solved: ${mission_solved}, sessionInterrupted: ${sessionInterrupted}`);
            logIteration(iteration_count);

            // 첫 반복에서 improvement_points 설정
            // (이후 반복에서는 processOrchestratorResponses에서 설정된 값 유지)
            if (iteration_count === 1) {
                improvement_points = `${mission}`;
                improvement_points_is_auto_generated = false; // 첫 번째는 실제 사용자 입력
                debugLog(`[ITERATION ${iteration_count}] Setting initial improvement_points: ${improvement_points.substring(0, 100)}`);
            } else if (!improvement_points) {
                // improvementPoints가 설정되지 않았으면 빈 문자열
                improvement_points = '';
                improvement_points_is_auto_generated = false;
                debugLog(`[ITERATION ${iteration_count}] No improvement_points, setting to empty string`);
            } else {
                debugLog(`[ITERATION ${iteration_count}] Using existing improvement_points: ${improvement_points.substring(0, 100)}, isAutoGenerated: ${improvement_points_is_auto_generated}`);
            }

            // Orchestrator 실행
            debugLog(`[ITERATION ${iteration_count}] Calling orchestrateMission with improvement_points: "${improvement_points.substring(0, 100)}", isAutoGenerated: ${improvement_points_is_auto_generated}`);
            let orchestratedMission;
            try {
                orchestratedMission = await orchestrateMission({
                    improvement_points: improvement_points,
                    mcpToolSchemas: mcpToolSchemas,
                    isAutoGenerated: improvement_points_is_auto_generated
                });
            } catch (err) {
                // AbortError는 중단으로 처리
                if (err.name === 'AbortError' || sessionInterrupted) {
                    // 중단 시에도 현재까지의 상태를 저장
                    currentSessionData.completed_at = new Date().toISOString();
                    currentSessionData.mission_solved = false;
                    currentSessionData.iteration_count = iteration_count;
                    currentSessionData.toolUsageHistory = toolUsageHistory;
                    currentSessionData.orchestratorConversation = getOrchestratorConversation();
                    currentSessionData.orchestratorRequestOptions = null;

                    debugLog(`[ITERATION ${iteration_count}] Session aborted during orchestration - NOT saving session to history (disabled)`);
                    // await saveSessionToHistory(currentSessionData).catch(saveErr => {
                    //     debugLog(`[ITERATION ${iteration_count}] Failed to save session: ${saveErr.message}`);
                    // });
                    break;
                }
                throw err;
            }
            // improvement_points_is_auto_generated 플래그 리셋 (다음 iteration을 위해)
            improvement_points_is_auto_generated = false;
            // improvement_points는 여기서 리셋하지 않음 (processOrchestratorResponses에서 설정될 수 있음)
            debugLog(`[ITERATION ${iteration_count}] orchestrateMission completed`)

            // 세션 중단 확인
            if (sessionInterrupted) {
                // 중단 시에도 현재까지의 상태를 저장
                currentSessionData.completed_at = new Date().toISOString();
                currentSessionData.mission_solved = false;
                currentSessionData.iteration_count = iteration_count;
                currentSessionData.toolUsageHistory = toolUsageHistory;
                currentSessionData.orchestratorConversation = getOrchestratorConversation();
                currentSessionData.orchestratorRequestOptions = null;

                debugLog(`[ITERATION ${iteration_count}] Session interrupted after orchestration - NOT saving session to history (disabled)`);
                // await saveSessionToHistory(currentSessionData).catch(err => {
                //     debugLog(`[ITERATION ${iteration_count}] Failed to save session: ${err.message}`);
                // });
                break;
            }

            // 서브미션 이름 추론
            const sub_mission = inferSubMission(orchestratedMission, iteration_count);

            // 실행 결과 처리
            const execution_output_list = [];
            const executionStepsRagKeys = [];
            const iterationToolHistory = [];
            let hadAnyFunctionCall = false;

            let orchestratedResponse = orchestratedMission;
            let reasoningOnlyResponses = 0;
            let stallDetected = false;

            // Orchestrator 응답 처리 루프
            const orchestratorResult = await processOrchestratorResponses({
                orchestratedResponse: orchestratedMission,
                execution_output_list,
                executionStepsRagKeys,
                iterationToolHistory,
                toolUsageHistory,
                toolMap,
                mission,
                sub_mission,
                iteration_count,
                sessionID: process.app_custom.sessionID
            });

            hadAnyFunctionCall = orchestratorResult.hadAnyFunctionCall;
            stallDetected = orchestratorResult.stallDetected;
            mission_solved = orchestratorResult.missionSolved;

            debugLog(`[ITERATION ${iteration_count}] orchestratorResult.improvementPoints: "${orchestratorResult.improvementPoints || '(empty)'}", isAutoGenerated: ${orchestratorResult.improvementPointsIsAutoGenerated}`);

            // completion_judge가 완료된 직후 세션 저장 (mission_solved 상태와 무관하게 무조건 저장)
            if (orchestratorResult.completionJudgeExecuted) {
                currentSessionData.completed_at = new Date().toISOString();
                currentSessionData.mission_solved = mission_solved;
                currentSessionData.iteration_count = iteration_count;
                currentSessionData.toolUsageHistory = toolUsageHistory;
                currentSessionData.orchestratorConversation = getOrchestratorConversation();
                currentSessionData.orchestratorRequestOptions = null;

                debugLog(`[ITERATION ${iteration_count}] Saving session to history after completion_judge (mission_solved=${mission_solved})`);
                await saveSessionToHistory(currentSessionData).catch(err => {
                    debugLog(`[ITERATION ${iteration_count}] Failed to save session after completion_judge: ${err.message}`);
                });
            }

            // improvementPoints가 반환된 경우 다음 iteration에 사용
            // 반환되지 않은 경우 리셋
            if (orchestratorResult.improvementPoints) {
                improvement_points = orchestratorResult.improvementPoints;
                improvement_points_is_auto_generated = orchestratorResult.improvementPointsIsAutoGenerated || false;
                debugLog(`[ITERATION ${iteration_count}] Setting improvement_points from orchestratorResult: "${improvement_points.substring(0, 100)}", isAutoGenerated: ${improvement_points_is_auto_generated}`);
            } else {
                improvement_points = '';
                improvement_points_is_auto_generated = false;
                debugLog(`[ITERATION ${iteration_count}] No improvementPoints from orchestratorResult, resetting to empty`);
            }

            // 세션 중단 확인
            if (sessionInterrupted) {
                // 중단 시에도 현재까지의 상태를 저장
                currentSessionData.completed_at = new Date().toISOString();
                currentSessionData.mission_solved = false;
                currentSessionData.iteration_count = iteration_count;
                currentSessionData.toolUsageHistory = toolUsageHistory;
                currentSessionData.orchestratorConversation = getOrchestratorConversation();
                currentSessionData.orchestratorRequestOptions = null;

                debugLog(`[ITERATION ${iteration_count}] Session interrupted - NOT saving session to history (disabled)`);
                // await saveSessionToHistory(currentSessionData).catch(err => {
                //     debugLog(`[ITERATION ${iteration_count}] Failed to save session: ${err.message}`);
                // });
                break;
            }

            // 매 iteration마다 세션 히스토리 저장 (실시간 저장) - DISABLED
            currentSessionData.completed_at = new Date().toISOString();
            currentSessionData.mission_solved = mission_solved;
            currentSessionData.iteration_count = iteration_count;
            currentSessionData.toolUsageHistory = toolUsageHistory;
            currentSessionData.orchestratorConversation = getOrchestratorConversation();
            currentSessionData.orchestratorRequestOptions = null;

            debugLog(`[ITERATION ${iteration_count}] NOT saving session to history (disabled - will only save after completion_judge)`);
            // await saveSessionToHistory(currentSessionData).catch(err => {
            //     debugLog(`[ITERATION ${iteration_count}] Failed to save session: ${err.message}`);
            // });

            // 미션 완료 처리
            if (mission_solved) {
                debugLog(`[ITERATION ${iteration_count}] Mission solved, breaking loop`);
                debugLog('========================================');
                debugLog(`========== ITERATION ${iteration_count} END ==========`);
                debugLog('========================================');
                break;
            }

            // function call이 없었던 경우 처리
            if (!hadAnyFunctionCall) {
                mission_solved = true;
                const message = stallDetected
                    ? '⚠ Session ended due to orchestrator stall'
                    : '✅ No function calls detected - mission complete';
                uiEvents.addSystemMessage(message);
                debugLog(`[ITERATION ${iteration_count}] ${message}`);
                debugLog('========================================');
                debugLog(`========== ITERATION ${iteration_count} END ==========`);
                debugLog('========================================');
                break;
            }

            // improvement_points가 설정되어 있으면 다음 iteration 계속 진행
            debugLog(`[ITERATION ${iteration_count}] Continuing with improvement_points: "${improvement_points?.substring(0, 100) || '(empty)'}"`);
            debugLog('========================================');
            debugLog(`========== ITERATION ${iteration_count} END ==========`);
            debugLog('========================================');
            continue;
        }

        // 대화 상태 저장
        const finalOrchestratorConversation = getOrchestratorConversation();

        // 결과 반환
        const result = {
            mission_solved,
            iteration_count,
            toolUsageHistory,
            // 대화 상태도 반환하여 저장할 수 있도록 함
            orchestratorConversation: finalOrchestratorConversation,

            previousSessions: sessionsToUse
        };
        // 결과를 현재 세션 데이터에 저장
        currentSessionData.completed_at = new Date().toISOString();
        currentSessionData.mission_solved = result.mission_solved;
        currentSessionData.iteration_count = result.iteration_count;
        currentSessionData.toolUsageHistory = result.toolUsageHistory;
        // previousSessions는 saveSessionToHistory에서 파일로부터 로드하므로 저장하지 않음 (메모리 누적 방지)
        // currentSessionData.previousSessions = result.previousSessions;
        debugLog('[runSession] previousSessions NOT saved to currentSessionData to prevent exponential growth');
        // 대화 상태 저장
        currentSessionData.orchestratorConversation = result.orchestratorConversation;
        currentSessionData.orchestratorRequestOptions = null; // 필요시 orchestrator에서 가져올 수 있음

        debugLog(`[runSession] NOT saving final session to history (disabled - will only save after completion_judge) - sessionID: ${currentSessionData.sessionID}`);
        debugLog(`[runSession] Session data size: ${JSON.stringify(currentSessionData).length} bytes`);
        debugLog(`[runSession] Final state - mission_solved: ${currentSessionData.mission_solved}, iteration_count: ${currentSessionData.iteration_count}`);
        debugLog(`[runSession] Tool usage history entries: ${currentSessionData.toolUsageHistory.length}`);
        // 최종 세션 히스토리에 저장 (중복 저장이지만 최신 상태 보장) - DISABLED
        // await saveSessionToHistory(currentSessionData);

        debugLog('========================================');
        debugLog('========== runSession END ==========');
        debugLog('========================================');
        return currentSessionData;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorType = error?.type || error?.constructor?.name || 'Error';
        const errorCode = error?.code || 'UNKNOWN';
        const errorStatus = error?.status || 'N/A';
        const errorStack = error?.stack || 'No stack trace available';

        // 에러 메시지를 history에 표시 (한 번에 통합)
        const detailMessage = error?.error?.message || errorMessage;

        let consolidatedErrorMessage;
        if (ERROR_VERBOSITY === 'verbose') {
            // 상세 모드: 모든 에러 정보 표시
            consolidatedErrorMessage = [
                `[Session] Internal session error: ${errorType}`,
                `  ├─ Message: ${detailMessage}`,
                `  ├─ Code: ${errorCode}`,
                `  ├─ Status: ${errorStatus}`,
                `  ├─ Nested Error: ${error?.error ? JSON.stringify(error.error, null, 2) : 'None'}`,
                `  ├─ Full Error Object: ${JSON.stringify(error, null, 2)}`,
                `  └─ Stack trace: ${errorStack}`
            ].join('\n');
        } else {
            // 간결 모드 (기본값): 에러 메시지만 표시
            consolidatedErrorMessage = `[Session] Internal session error: ${detailMessage}`;
        }

        uiEvents.addErrorMessage(consolidatedErrorMessage);

        // 에러를 throw하지 않고 정상적으로 종료
        return null;
    } finally {
        // 세션 중단 이벤트 리스너 제거
        uiEvents.off('session:interrupt', handleInterrupt);

        // 세션 종료 알림
        uiEvents.sessionEnd();
    }
}
