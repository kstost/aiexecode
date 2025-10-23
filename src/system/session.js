// Agent Loop: 계획·실행·검증 사이클을 수행하는 핵심 모듈
import { orchestrateMission, continueOrchestratorConversation, resetOrchestratorConversation, recordOrchestratorToolResult, getOrchestratorConversation, restoreOrchestratorConversation } from "../ai_based/orchestrator.js";
import { verifyResult, resetVerifierConversation, getVerifierConversation, restoreVerifierConversation } from "../ai_based/verifier.js";
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
import { logSystem, logInfo, logSuccess, logWarning, logError, logAssistantMessage, logToolCall, logToolResult, logCodeExecution, logCodeResult, logIteration, logVerificationResult, logMissionComplete, logConversationRestored } from "./output_helper.js";
import { requiresApproval, requestApproval } from "./tool_approval.js";
import { setCurrentSession, saveFileSnapshot, getFileSnapshot } from "./file_integrity.js";
import { abortCurrentRequest } from "./ai_request.js";
import { promises as fs, appendFileSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { existsSync } from 'fs';
import { ENABLE_DEBUG_LOG } from '../config/config.js';
import { DEBUG_LOG_DIR } from '../util/config.js';

// Debug logging configuration
const LOG_FILE = join(DEBUG_LOG_DIR, 'session.log');

// Debug logging helper
function debugLog(message) {
    if (!ENABLE_DEBUG_LOG) return;
    try {
        // 디렉토리가 없으면 생성 (동기)
        const logDir = dirname(LOG_FILE);
        if (!existsSync(logDir)) {
            mkdirSync(logDir, { recursive: true });
        }
        const timestamp = new Date().toISOString();
        appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
    } catch (err) {
        // Ignore logging errors
    }
}

/**
 * Verifier 사용 여부를 제어하는 상수
 * true: Verifier를 통한 검증 사이클 활성화
 * false: Verifier 없이 Orchestrator만 실행 (각 iteration마다 자동으로 다음 단계 진행)
 */
const ENABLE_VERIFIER = false;

/**
 * 상수 정의
 */
const MAX_REASONING_ONLY_RESPONSES = 5;
const MAX_WHAT_IT_DID_HISTORY = 12;
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
 */
function processMessageOutput(output) {
    const rawMessage = output.content?.[0]?.text ?? '';
    const truncatedMessage = clampOutput(rawMessage);

    // 빈 메시지가 아닐 때만 로그 출력 (세션 종료 신호는 출력하지 않음)
    if (rawMessage.trim()) {
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
    // edit_file_range인 경우 파일 스냅샷을 승인 요청 전에 저장
    // (ToolApprovalPrompt에서 DiffViewer 표시를 위해 필요)
    if (name === 'edit_file_range' && argument.file_path) {
        try {
            const fileContent = await fs.readFile(argument.file_path, 'utf8');
            saveFileSnapshot(argument.file_path, fileContent);
        } catch (error) {
            // 파일을 읽을 수 없는 경우 (존재하지 않는 파일 등)
            // 스냅샷 저장 실패는 무시 (도구 실행에서 처리됨)
        }
    }

    // 승인이 필요한 도구인지 확인 (args 전달하여 실패 여부 판단)
    const approvalCheck = requiresApproval(name, argument);

    // 도구 호출 메시지 먼저 출력
    logToolCall(name, argument);

    // 승인이 스킵되는 경우 (확실히 실패할 것으로 예상) - 도구 호출 메시지 다음에 출력
    if (approvalCheck && approvalCheck.skipApproval) {
        logInfo(`Tool approval skipped: ${approvalCheck.reason}`);
    }

    // 승인이 필요한 경우
    if (approvalCheck === true) {
        const approved = await requestApproval(name, argument);
        if (!approved) {
            const errorResult = {
                operation_successful: false,
                error_message: 'User denied tool execution'
            };
            const stdout = formatToolStdout(name, errorResult);
            const exeResult = prepareExecutionResult(stdout, '', 1);

            logToolResult(name, exeResult.stdout, errorResult, argument);

            return {
                exeResult,
                originalResult: errorResult,
                content: `${name}(${JSON.stringify(argument, null, 2)})`
            };
        }
    }

    // 도구가 toolMap에 없는 경우 처리
    if (!toolMap[name] || typeof toolMap[name] !== 'function') {
        const errorResult = {
            operation_successful: false,
            error_message: `Tool '${name}' is not available. This tool may be disabled due to missing system dependencies.`
        };
        const stdout = formatToolStdout(name, errorResult);
        const exeResult = prepareExecutionResult(stdout, '', 1);

        logToolResult(name, exeResult.stdout, errorResult, argument);

        return {
            exeResult,
            originalResult: errorResult,
            content: `${name}(${JSON.stringify(argument, null, 2)})`
        };
    }

    const argumentWithSession = { ...argument, sessionID };
    const result = await toolMap[name](argumentWithSession);

    if (result.constructor !== Object) {
        logError('Tool result is not an object');
        throw new Error('Tool result is not an object');
    }

    const stdout = formatToolStdout(name, result);
    const exeResult = prepareExecutionResult(stdout, '', 0);

    // edit_file_range인 경우 스냅샷도 함께 전달
    let snapshotForLog = null;
    if (name === 'edit_file_range' && argument.file_path) {
        const snapshot = getFileSnapshot(argument.file_path);
        if (snapshot) {
            snapshotForLog = {
                content: snapshot.content,
                timestamp: snapshot.timestamp
            };
        }
    }

    logToolResult(name, exeResult.stdout, result, argument, snapshotForLog);

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
    const approvalCheck = requiresApproval(name, argument);

    // 코드 실행 메시지 먼저 출력
    logCodeExecution(codeType, codeContent);

    // 승인이 스킵되는 경우 (확실히 실패할 것으로 예상) - 코드 실행 메시지 다음에 출력
    if (approvalCheck && approvalCheck.skipApproval) {
        logInfo(`Tool approval skipped: ${approvalCheck.reason}`);
    }

    // 승인이 필요한 경우
    if (approvalCheck === true) {
        const approved = await requestApproval(name, argument);
        if (!approved) {
            const exeResult = prepareExecutionResult('', 'User denied code execution', 1);
            logCodeResult(exeResult.stdout, exeResult.stderr, exeResult.code);

            return {
                exeResult,
                content: codeContent
            };
        }
    }

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
 * 검증 결과 상태 맵
 */
const VERIFICATION_DECISION_STATUS = {
    'MISSION_COMPLETE': '✅ Complete',
    'SUBMISSION_COMPLETE': '✅ Subtask Complete',
    'IN_PROGRESS': '⏳ In Progress',
    'REPLAN_NEEDED': '🔄 Needs Replanning'
};

/**
 * 루프 제어 결과 타입 정의
 */
const LOOP_CONTROL = {
    CONTINUE: 'continue',
    BREAK: 'break'
};

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
                debugLog(`  Processing MESSAGE output...`);
                const { exeResult, content: msgContent } = processMessageOutput(output);
                exe_result = exeResult;
                content = msgContent;
                debugLog(`  MESSAGE processed: content length ${msgContent?.length || 0}`);
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
            debugLog(`COMPLETION: No function call + message type = mission solved`);
            missionSolved = true;
            break;
        }

        if (!executedFunctionCall) {
            debugLog(`COMPLETION: No function call executed, breaking loop`);
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
    debugLog(`  Total loop iterations: ${loopIteration}`);
    debugLog(`  Final toolUsageHistory: ${toolUsageHistory.length} items`);

    return {
        hadAnyFunctionCall,
        stallDetected,
        missionSolved
    };
}

/**
 * 검증 결과에 따라 다음 동작을 결정하는 함수
 * @returns {{ loopControl: string, improvementPoints: string, missionSolved: boolean }}
 */
function handleVerificationResult(verificationResult) {
    const decision = verificationResult.decision;

    switch (decision) {
        case 'MISSION_COMPLETE':
            return {
                loopControl: LOOP_CONTROL.BREAK,
                improvementPoints: '',
                missionSolved: true
            };

        case 'SUBMISSION_COMPLETE':
            uiEvents.addSystemMessage('✅ Sub-mission complete; continuing towards full mission completion.');
            return {
                loopControl: LOOP_CONTROL.CONTINUE,
                improvementPoints: verificationResult.improvement_points || '',
                missionSolved: false
            };

        case 'IN_PROGRESS':
            return {
                loopControl: LOOP_CONTROL.CONTINUE,
                improvementPoints: verificationResult.improvement_points || '',
                missionSolved: false
            };

        case 'REPLAN_NEEDED':
            uiEvents.addSystemMessage('🔄 Revisit approach required - will try a different angle next iteration.');
            return {
                loopControl: LOOP_CONTROL.CONTINUE,
                improvementPoints: verificationResult.improvement_points || '',
                missionSolved: false
            };

        default:
            return {
                loopControl: LOOP_CONTROL.CONTINUE,
                improvementPoints: '',
                missionSolved: false
            };
    }
}

/**
 * 실행 요약을 생성하는 헬퍼 함수
 */
function buildExecutionSummary(executionOutputList) {
    return executionOutputList.map((exec_result, index) => {
        const toolName = exec_result.more_info?.name || 'unknown';
        const operationType = exec_result.more_info?.type || 'unknown';
        const stdoutBlock = exec_result.stdout ? `\n\`\`\`\n${exec_result.stdout}\n\`\`\`` : '\n(empty)';
        const stderrBlock = exec_result.stderr ? `\n\`\`\`\n${exec_result.stderr}\n\`\`\`` : '\n(empty)';
        const ragRefLine = exec_result.rag_reference ? `- RAG Reference: ${exec_result.rag_reference}\n` : '';
        return `### Step ${index + 1}\n- Function: \`${toolName}\`\n- Operation Type: \`${operationType}\`\n- Exit Code: ${typeof exec_result.code === 'number' ? exec_result.code : '?'}\n${ragRefLine}- STDOUT:${stdoutBlock}\n- STDERR:${stderrBlock}`;
    }).join('\n\n');
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
 * @property {Array} verification_memory - 검증 메모리
 * @property {Array} whatItDidHistory - 수행 작업 히스토리
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
    // 세션 중단 플래그 초기화
    sessionInterrupted = false;

    // 세션 중단 이벤트 리스너 등록
    const handleInterrupt = () => {
        if (!sessionInterrupted) {
            sessionInterrupted = true;
            abortCurrentRequest(); // API 요청 즉시 중단
            uiEvents.addSystemMessage('⚠ Session interrupted by user (ESC)');
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
        const verification_memory = [];
        const whatItDidHistory = [];
        const toolUsageHistory = [];

        let mission_solved = false;
        let iteration_count = 0;
        let improvement_points = '';

        // 대화 상태 복원 또는 리셋
        const conversationState = getLastConversationState(sessionsToUse);
        if (conversationState && conversationState.orchestratorConversation.length > 0) {
            // logConversationRestored(conversationState.orchestratorConversation.length);
            restoreOrchestratorConversation(
                conversationState.orchestratorConversation,
                conversationState.orchestratorRequestOptions
            );
            if (ENABLE_VERIFIER) {
                restoreVerifierConversation(
                    conversationState.verifierConversation,
                    conversationState.lastOrchestratorSnapshotLength
                );
            }
            // logSuccess('✓ Conversation state restored');
        } else {
            // logSystem('ℹ Starting with fresh conversation state');
            resetOrchestratorConversation();
            if (ENABLE_VERIFIER) {
                resetVerifierConversation();
            }
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
        while (!mission_solved && iteration_count < maxIterations && !sessionInterrupted) {
            iteration_count++;
            logIteration(iteration_count);

            // 세션 중단 확인
            if (sessionInterrupted) {
                break;
            }


            // 세션 중단 확인
            if (sessionInterrupted) {
                break;
            }

            // 첫 반복에서 improvement_points 설정
            if (iteration_count === 1) {
                improvement_points = `${mission}`;
            }

            // Orchestrator 실행
            let orchestratedMission;
            try {
                orchestratedMission = await orchestrateMission({
                    improvement_points: improvement_points,
                    mcpToolSchemas: mcpToolSchemas
                });
            } catch (err) {
                // AbortError는 중단으로 처리
                if (err.name === 'AbortError' || sessionInterrupted) {
                    break;
                }
                throw err;
            }
            improvement_points = '';

            // 세션 중단 확인
            if (sessionInterrupted) {
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

            // 세션 중단 확인
            if (sessionInterrupted) {
                break;
            }

            // 미션 완료 처리
            if (mission_solved) {
                break;
            }

            // function call이 없었던 경우 처리
            if (!hadAnyFunctionCall) {
                mission_solved = true;
                const message = stallDetected
                    ? '⚠ Session ended due to orchestrator stall'
                    : '✅ No function calls detected - mission complete';
                uiEvents.addSystemMessage(message);
                break;
            }

            // Verifier가 비활성화된 경우 계속 진행
            if (!ENABLE_VERIFIER) {
                uiEvents.addSystemMessage('ℹ Verifier disabled - orchestrator continues');
                improvement_points = '';
                continue;
            }


            // Verifier 실행
            const verification_result = await verifyResult({ what_user_requests: mission });
            uiEvents.addSystemMessage(`${verification_result.decision}`);
            if (false) uiEvents.addSystemMessage(`Verified ${verification_result.improvement_points}`);
            if (verification_result.replan_needed) uiEvents.addSystemMessage(`Verified Re-Plan Required`);
            if (verification_result.what_it_did) {
                whatItDidHistory.push(verification_result.what_it_did);
                if (whatItDidHistory.length > MAX_WHAT_IT_DID_HISTORY) {
                    whatItDidHistory.shift();
                }
            }

            // Verification memory에 추가
            const memoryEntry = {
                timestamp: new Date().toISOString(),
                mission: mission,
                iteration: iteration_count,
                what_it_did: verification_result.what_it_did || '',
                result: verification_result,
                what_it_did_history: [...whatItDidHistory],
                tool_history: [...iterationToolHistory]
            };

            verification_memory.push(memoryEntry);

            // 미션 상태에 따른 처리
            const nextAction = handleVerificationResult(verification_result);
            improvement_points = nextAction.improvementPoints;
            mission_solved = nextAction.missionSolved;

            if (nextAction.loopControl === LOOP_CONTROL.BREAK) {
                break;
            }
        }

        // 대화 상태 저장
        const finalOrchestratorConversation = getOrchestratorConversation();
        const finalVerifierConversation = ENABLE_VERIFIER ? getVerifierConversation() : [];

        // 결과 반환
        const result = {
            mission_solved,
            iteration_count,
            verification_memory,
            whatItDidHistory,
            toolUsageHistory,
            // 대화 상태도 반환하여 저장할 수 있도록 함
            orchestratorConversation: finalOrchestratorConversation,
            verifierConversation: finalVerifierConversation,

            previousSessions: sessionsToUse
        };
        // 결과를 현재 세션 데이터에 저장
        currentSessionData.completed_at = new Date().toISOString();
        currentSessionData.mission_solved = result.mission_solved;
        currentSessionData.iteration_count = result.iteration_count;
        currentSessionData.verification_memory = result.verification_memory;
        currentSessionData.whatItDidHistory = result.whatItDidHistory;
        currentSessionData.toolUsageHistory = result.toolUsageHistory;
        currentSessionData.previousSessions = result.previousSessions;
        // 대화 상태 저장
        currentSessionData.orchestratorConversation = result.orchestratorConversation;
        currentSessionData.verifierConversation = result.verifierConversation;
        currentSessionData.lastOrchestratorSnapshotLength = result.orchestratorConversation?.length || 0;
        currentSessionData.orchestratorRequestOptions = null; // 필요시 orchestrator에서 가져올 수 있음

        // 세션 히스토리에 저장
        await saveSessionToHistory(currentSessionData);

        return currentSessionData;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorType = error?.type || error?.constructor?.name || 'Error';
        const errorCode = error?.code || 'UNKNOWN';
        const errorStatus = error?.status || 'N/A';
        const errorStack = error?.stack || 'No stack trace available';

        // 에러 메시지를 history에 표시 (한 번에 통합)
        const detailMessage = error?.error?.message || errorMessage;
        const consolidatedErrorMessage = [
            `[Session] Internal session error: ${errorType}`,
            `  ├─ Message: ${detailMessage}`,
            `  ├─ Code: ${errorCode}`,
            `  ├─ Status: ${errorStatus}`,
            `  ├─ Nested Error: ${error?.error ? JSON.stringify(error.error, null, 2) : 'None'}`,
            `  ├─ Full Error Object: ${JSON.stringify(error, null, 2)}`,
            `  └─ Stack trace: ${errorStack}`
        ].join('\n');
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
