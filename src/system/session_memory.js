// 세션별 실행 기록을 파일로 저장하고 로드하는 모듈
import { safeReadFile, safeWriteFile, safeExists, safeMkdir, safeUnlink } from '../util/safe_fs.js';
import { join, resolve } from 'path';
import chalk from 'chalk';
import { formatToolCall, formatToolResult, getToolDisplayName, getToolDisplayConfig } from './tool_registry.js';
import { createDebugLogger } from '../util/debug_log.js';

const MAX_HISTORY_SESSIONS = 1; // 최대 보관 세션 수

const debugLog = createDebugLogger('session_memory.log', 'session_memory');

// 현재 작업 디렉토리 기준 세션 디렉토리 경로 생성
function getSessionDir(sessionID) {
    return join(process.cwd(), '.aiexe', sessionID);
}

// 세션 히스토리 파일 경로 생성
function getHistoryFile(sessionID) {
    return join(getSessionDir(sessionID), 'session_history.json');
}

// 디렉토리 생성 확인
async function ensureHistoryDir(sessionID) {
    const sessionDir = getSessionDir(sessionID);
    // recursive: true 이므로 이미 존재해도 에러 없음
    await safeMkdir(sessionDir, { recursive: true });
}

/**
 * 세션 히스토리 파일을 삭제
 * @param {string} sessionID - 세션 ID
 * @returns {Promise<void>}
 */
export async function deleteHistoryFile(sessionID) {
    try {
        const historyFile = getHistoryFile(sessionID);
        // safeUnlink 내부에서 파일 존재 여부를 체크하므로 중복 체크 불필요
        await safeUnlink(historyFile);
    } catch (err) {
    }
}

/**
 * 이전 세션들을 파일에서 로드
 * @param {string} sessionID - 세션 ID
 * @returns {Promise<Array>} 이전 세션 배열
 */
export async function loadPreviousSessions(sessionID) {
    try {
        await ensureHistoryDir(sessionID);
        const historyFile = getHistoryFile(sessionID);
        if (await safeExists(historyFile)) {
            const content = await safeReadFile(historyFile, 'utf8');
            const sessions = JSON.parse(content);
            debugLog(`Loaded ${sessions.length} previous sessions from history`);
            return sessions;
        }
    } catch (err) {
        debugLog(`Could not load previous sessions: ${err.message}`);
    }
    return [];
}

/**
 * 현재 세션을 히스토리에 저장
 * @param {Object} sessionData - 저장할 세션 데이터
 * @returns {Promise<void>}
 */
export async function saveSessionToHistory(sessionData) {
    try {
        const sessionID = sessionData.sessionID || process.app_custom.sessionID;
        await ensureHistoryDir(sessionID);
        const historyFile = getHistoryFile(sessionID);

        debugLog('========== saveSessionToHistory START ==========');
        debugLog(`sessionID: ${sessionID}`);
        debugLog(`historyFile: ${historyFile}`);

        // 파일에서 이전 세션들을 로드 (메모리 누적 방지)
        const previousSessions = (await safeExists(historyFile))
            ? JSON.parse(await safeReadFile(historyFile, 'utf8'))
            : [];

        debugLog(`previousSessions loaded from file: ${previousSessions.length} sessions`);

        // sessionData에서 previousSessions 제거 (중복 저장 방지)
        const { previousSessions: _, ...sessionToSave } = sessionData;

        debugLog(`sessionToSave size: ${JSON.stringify(sessionToSave).length} bytes`);

        const allSessions = [...previousSessions, sessionToSave];
        debugLog(`allSessions total: ${allSessions.length} sessions`);

        // 최대 개수 제한 (fileSnapshot은 UI 표시를 위해 모두 유지)
        const sessionsToKeep = allSessions.length > MAX_HISTORY_SESSIONS
            ? allSessions.slice(-MAX_HISTORY_SESSIONS)
            : allSessions;

        debugLog(`sessionsToKeep: ${sessionsToKeep.length} sessions`);
        const totalSize = JSON.stringify(sessionsToKeep).length;
        debugLog(`Total file size to write: ${totalSize} bytes (${(totalSize / 1024).toFixed(2)} KB)`);

        await safeWriteFile(historyFile, JSON.stringify(sessionsToKeep, null, 2), 'utf8');
        debugLog('File written successfully');
        debugLog('========== saveSessionToHistory END ==========');

        return sessionsToKeep;
    } catch (err) {
        debugLog(`ERROR in saveSessionToHistory: ${err.message}`);
        debugLog(`Stack: ${err.stack}`);
    }
    return null;
}

/**
 * 현재 세션 데이터 구조 생성
 * @param {string} sessionID - 세션 ID
 * @param {string} mission - 미션 설명
 * @returns {Object} 세션 데이터 객체
 */
export function createSessionData(sessionID, mission) {
    return {
        sessionID,
        mission,
        started_at: new Date().toISOString(),
        completed_at: null,
        mission_solved: false,
        iteration_count: 0,
        toolUsageHistory: [],
        // 대화 상태 저장
        orchestratorConversation: [],
        orchestratorRequestOptions: null
    };
}

/**
 * 가장 최근 세션의 대화 상태를 가져옴
 * @param {Array} sessions - 전체 세션 배열
 * @returns {Object|null} 대화 상태 객체 또는 null
 */
export function getLastConversationState(sessions) {
    if (!sessions || sessions.length === 0) {
        return null;
    }

    const lastSession = sessions[sessions.length - 1];

    return {
        orchestratorConversation: lastSession.orchestratorConversation || [],
        orchestratorRequestOptions: lastSession.orchestratorRequestOptions || null
    };
}

/**
 * 세션 히스토리에서 UI 이벤트 목록을 복원
 * @param {Array} sessions - 전체 세션 배열
 * @returns {Array} UI 히스토리 이벤트 배열
 */
export function reconstructUIHistory(sessions) {
    debugLog('========== reconstructUIHistory START ==========');
    debugLog(`Input sessions: ${sessions?.length || 0}`);

    if (!sessions || sessions.length === 0) {
        debugLog('No sessions to reconstruct, returning empty array');
        debugLog('========== reconstructUIHistory END ==========');
        return [];
    }

    const uiHistory = [];

    sessions.forEach((session, sessionIndex) => {
        debugLog(`---------- Processing session ${sessionIndex + 1}/${sessions.length} ----------`);
        debugLog(`Session ID: ${session.sessionID || 'unknown'}`);
        debugLog(`Mission: ${session.mission?.substring(0, 100)}${session.mission?.length > 100 ? '...' : ''}`);
        debugLog(`Started at: ${session.started_at}`);
        debugLog(`Has orchestratorConversation: ${!!session.orchestratorConversation}`);
        debugLog(`Has toolUsageHistory: ${!!session.toolUsageHistory}`);
        if (session.toolUsageHistory) {
            debugLog(`toolUsageHistory items: ${session.toolUsageHistory.length}`);
        }

        // orchestratorConversation에서 도구 사용 이벤트 추출
        // 이전 세션까지의 대화 길이를 계산하여 중복 제거
        if (session.orchestratorConversation && session.orchestratorConversation.length > 0) {
            const conversation = session.orchestratorConversation;
            debugLog(`orchestratorConversation length: ${conversation.length}`);

            // 현재 세션의 시작 지점: 항상 0부터 시작 (각 세션은 독립적)
            let startIndex = 0;

            // 현재 세션의 끝 지점: conversation 전체 길이 사용
            const endIndex = conversation.length;
            debugLog(`Current session conversation length: ${endIndex}`);
            debugLog(`Processing conversation slice [${startIndex}, ${endIndex}]`);

            // 현재 세션에서 새로 추가된 대화만 추출
            const newConversation = conversation.slice(startIndex, endIndex);
            debugLog(`New conversation items to process: ${newConversation.length}`);

            for (let i = 0; i < newConversation.length; i++) {
                const item = newConversation[i];

                // function_call 타입 처리
                if (item.type === 'function_call' && item.name) {
                    const toolName = item.name;
                    let args = {};
                    try {
                        args = item.arguments ? JSON.parse(item.arguments) : {};
                    } catch (e) {
                        args = {};
                    }

                    // response_message는 중간 안내 메시지(assistant_progress)로 변환
                    const toolConfig = getToolDisplayConfig(toolName);
                    if (toolName === 'response_message' && toolConfig.extract_message_from) {
                        const message = args[toolConfig.extract_message_from];
                        if (message) {
                            uiHistory.push({
                                type: 'assistant_progress',
                                text: message,
                                toolName: toolName,
                                timestamp: Date.now()
                            });
                        }
                        continue;
                    }

                    // 다음 항목에서 결과 찾기
                    let result = null;
                    let originalResult = null;
                    if (i + 1 < newConversation.length && newConversation[i + 1].type === 'function_call_output') {
                        try {
                            const outputData = JSON.parse(newConversation[i + 1].output || '{}');
                            result = outputData;
                            // original_result가 있으면 사용 (새로운 형식)
                            if (outputData.original_result) {
                                originalResult = outputData.original_result;
                            }
                        } catch (e) {
                            result = {};
                        }
                    }

                    // bash 실행은 code_execution 타입으로 변환
                    if (toolName === 'bash') {
                        uiHistory.push({
                            type: 'code_execution',
                            language: 'bash',
                            code: args.script || '',
                            timestamp: Date.now()
                        });

                        if (result) {
                            uiHistory.push({
                                type: 'code_result',
                                stdout: result.stdout || '',
                                stderr: result.stderr || '',
                                exitCode: result.exit_code || 0,
                                timestamp: Date.now()
                            });
                        }
                    } else if (toolName === 'run_python_code') {
                        // run_python_code 실행도 code_execution 타입으로 변환
                        uiHistory.push({
                            type: 'code_execution',
                            language: 'python',
                            code: args.code || '',
                            timestamp: Date.now()
                        });

                        if (result) {
                            uiHistory.push({
                                type: 'code_result',
                                stdout: result.stdout || '',
                                stderr: result.stderr || '',
                                exitCode: result.exit_code || 0,
                                timestamp: Date.now()
                            });
                        }
                    } else {
                        // tool_start 생성
                        const displayName = getToolDisplayName(toolName) || toolName;
                        const formattedArgs = formatToolCall(toolName, args);
                        const toolStartText = formattedArgs ? `${displayName} ${formattedArgs}` : displayName;

                        // edit_file_range 또는 edit_file_replace인 경우 toolUsageHistory에서 fileSnapshot 찾기
                        let fileSnapshot = null;
                        if ((toolName === 'edit_file_range' || toolName === 'edit_file_replace') && session.toolUsageHistory) {
                            debugLog(`========== Searching for fileSnapshot ==========`);
                            debugLog(`toolName: ${toolName}`);
                            debugLog(`file_path: ${args.file_path}`);
                            debugLog(`toolUsageHistory items: ${session.toolUsageHistory.length}`);

                            // 절대 경로로 정규화하여 비교
                            const targetAbsolutePath = resolve(args.file_path);
                            debugLog(`target absolute path: ${targetAbsolutePath}`);

                            const historyItem = session.toolUsageHistory.find(h => {
                                if ((h.toolName === 'edit_file_range' || h.toolName === 'edit_file_replace') && h.args?.file_path && h.fileSnapshot) {
                                    const historyAbsolutePath = resolve(h.args.file_path);
                                    return historyAbsolutePath === targetAbsolutePath;
                                }
                                return false;
                            });

                            if (historyItem) {
                                fileSnapshot = historyItem.fileSnapshot;
                                debugLog(`fileSnapshot FOUND: ${fileSnapshot.content.length} bytes`);
                            } else {
                                debugLog(`fileSnapshot NOT FOUND`);
                                debugLog(`Available history items:`);
                                session.toolUsageHistory.forEach((h, idx) => {
                                    if (h.toolName === 'edit_file_range' || h.toolName === 'edit_file_replace') {
                                        const absPath = h.args?.file_path ? resolve(h.args.file_path) : 'N/A';
                                        debugLog(`  [${idx}] ${h.toolName} - ${h.args?.file_path} (abs: ${absPath}) - hasSnapshot: ${!!h.fileSnapshot}`);
                                    }
                                });
                            }
                            debugLog(`========== fileSnapshot search END ==========`);
                        }

                        const toolStartItem = {
                            type: 'tool_start',
                            toolName: toolName,
                            args: args,
                            text: toolStartText,
                            timestamp: Date.now()
                        };

                        if (fileSnapshot) {
                            toolStartItem.args = { ...args, fileSnapshot };
                            debugLog(`fileSnapshot added to toolStartItem.args`);
                        } else {
                            debugLog(`No fileSnapshot to add to toolStartItem.args`);
                        }

                        uiHistory.push(toolStartItem);

                        if (result) {
                            // tool_result 생성
                            const resultData = {
                                stdout: result.stdout || '',
                                stderr: result.stderr || '',
                                originalResult: originalResult || result
                            };
                            const formattedResult = formatToolResult(toolName, resultData);

                            uiHistory.push({
                                type: 'tool_result',
                                toolName: toolName,
                                toolInput: args,
                                result: resultData,
                                text: formattedResult,
                                timestamp: Date.now()
                            });
                        }
                    }
                }

                // message 타입 처리 (assistant 응답)
                if (item.type === 'message' && item.role === 'assistant' && item.content) {
                    // _internal_only 플래그가 있으면 건너뛰기
                    if (item._internal_only) {
                        debugLog(`[reconstructUIHistory] Skipping assistant message with _internal_only flag`);
                        continue;
                    }

                    const text = item.content[0]?.text || '';
                    if (text) {
                        uiHistory.push({
                            type: 'assistant',
                            text: text,
                            timestamp: Date.now()
                        });
                    }
                }

                // user 메시지 타입 처리
                if (item.role === 'user' && item.content) {
                    // _internal_only 플래그가 있으면 건너뛰기
                    if (item._internal_only) {
                        debugLog(`[reconstructUIHistory] Skipping user message with _internal_only flag`);
                        continue;
                    }

                    const textContent = item.content.find(c => c.type === 'input_text');
                    if (textContent && textContent.text) {
                        uiHistory.push({
                            type: 'user',
                            text: textContent.text,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        }

    });

    return uiHistory;
}
