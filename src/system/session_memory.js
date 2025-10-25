// 세션별 실행 기록을 파일로 저장하고 로드하는 모듈
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';
import { formatToolCall, formatToolResult, getToolDisplayName, getToolDisplayConfig } from './tool_registry.js';
import { createDebugLogger } from '../util/debug_log.js';

const MAX_HISTORY_SESSIONS = 20; // 최대 보관 세션 수

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
function ensureHistoryDir(sessionID) {
    const sessionDir = getSessionDir(sessionID);
    if (!existsSync(sessionDir)) {
        mkdirSync(sessionDir, { recursive: true });
    }
}

function consolelog() { }

/**
 * 세션 히스토리 파일을 삭제
 * @param {string} sessionID - 세션 ID
 * @returns {Promise<void>}
 */
export async function deleteHistoryFile(sessionID) {
    try {
        const historyFile = getHistoryFile(sessionID);
        if (existsSync(historyFile)) {
            await fs.unlink(historyFile);
        }
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
        ensureHistoryDir(sessionID);
        const historyFile = getHistoryFile(sessionID);
        if (existsSync(historyFile)) {
            const content = await fs.readFile(historyFile, 'utf8');
            const sessions = JSON.parse(content);
            // consolelog(chalk.blue(`📚 Loaded ${sessions.length} previous sessions from history`));
            return sessions;
        }
    } catch (err) {
        // consolelog(chalk.yellow(`⚠ Could not load previous sessions: ${err.message}`));
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
        ensureHistoryDir(sessionID);
        const historyFile = getHistoryFile(sessionID);

        const previousSessions = sessionData.previousSessions || [];
        const allSessions = [...previousSessions, sessionData];

        // 최대 개수 제한
        const sessionsToKeep = allSessions.length > MAX_HISTORY_SESSIONS
            ? allSessions.slice(-MAX_HISTORY_SESSIONS)
            : allSessions;

        await fs.writeFile(historyFile, JSON.stringify(sessionsToKeep, null, 2), 'utf8');
        return sessionsToKeep;
    } catch (err) {
    }
    return null;
}

/**
 * 최근 N개의 세션만 추출
 * @param {Array} sessions - 전체 세션 배열
 * @param {number} count - 가져올 개수
 * @returns {Array} 최근 N개 세션
 */
export function getRecentSessions(sessions, count = 5) {
    return sessions.slice(-count);
}

/**
 * 현재 미션과 관련된 세션들을 필터링
 * @param {Array} sessions - 전체 세션 배열
 * @param {string} currentMission - 현재 미션
 * @returns {Array} 관련 세션들
 */
export function getRelatedSessions(sessions, currentMission) {
    const keywords = currentMission.toLowerCase().split(/\s+/);

    return sessions.filter(session => {
        const sessionMission = (session.mission || '').toLowerCase();
        // 키워드 중 하나라도 매칭되면 관련 세션으로 판단
        return keywords.some(keyword =>
            keyword.length > 2 && sessionMission.includes(keyword)
        );
    });
}

/**
 * 이전 세션들을 AI가 이해할 수 있는 컨텍스트로 변환
 * @param {Array} sessions - 세션 배열
 * @param {string} currentMission - 현재 미션
 * @returns {string} AI용 컨텍스트 문자열
 */
export function buildHistoricalContext(sessions, currentMission) {
    if (!sessions || sessions.length === 0) {
        return '';
    }

    // 현재 미션과 관련된 세션 + 최근 세션 조합
    const relatedSessions = getRelatedSessions(sessions, currentMission);
    const recentSessions = getRecentSessions(sessions, 3);

    // 중복 제거하면서 합치기
    const sessionSet = new Set([...relatedSessions, ...recentSessions]);
    const relevantSessions = Array.from(sessionSet).slice(-5); // 최대 5개만

    if (relevantSessions.length === 0) {
        return '';
    }

    const contextParts = [
        '# Previous Execution History',
        `You have access to ${relevantSessions.length} previous session(s) that may be relevant:`,
        ''
    ];

    relevantSessions.forEach((session, idx) => {
        contextParts.push(`## Session ${idx + 1} (${session.started_at || 'unknown time'})`);
        contextParts.push(`**Mission**: ${session.mission}`);
        contextParts.push(`**Status**: ${session.mission_solved ? '✅ Completed' : '❌ Not completed'}`);
        contextParts.push(`**Iterations**: ${session.iteration_count || 0}`);

        // 주요 수행 내역
        if (session.whatItDidHistory && session.whatItDidHistory.length > 0) {
            contextParts.push(`**Actions Taken**:`);
            session.whatItDidHistory.slice(-3).forEach(action => {
                contextParts.push(`  - ${action}`);
            });
        }

        // 도구 사용 통계
        if (session.toolUsageHistory && session.toolUsageHistory.length > 0) {
            const toolCounts = {};
            session.toolUsageHistory.forEach(tool => {
                toolCounts[tool.toolName] = (toolCounts[tool.toolName] || 0) + 1;
            });
            contextParts.push(`**Tools Used**: ${Object.entries(toolCounts).map(([name, count]) => `${name}(${count})`).join(', ')}`);
        }

        // 마지막 검증 결과
        if (session.verification_memory && session.verification_memory.length > 0) {
            const lastVerification = session.verification_memory[session.verification_memory.length - 1];
            if (lastVerification.result) {
                contextParts.push(`**Final Decision**: ${lastVerification.result.decision}`);
                if (lastVerification.result.improvement_points) {
                    contextParts.push(`**Lessons**: ${lastVerification.result.improvement_points.slice(0, 200)}...`);
                }
            }
        }

        contextParts.push('');
    });

    return contextParts.join('\n');
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
        verification_memory: [],
        whatItDidHistory: [],
        toolUsageHistory: [],
        // 대화 상태 저장
        orchestratorConversation: [],
        verifierConversation: [],
        lastOrchestratorSnapshotLength: 0,
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
        verifierConversation: lastSession.verifierConversation || [],
        lastOrchestratorSnapshotLength: lastSession.lastOrchestratorSnapshotLength || 0,
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

        // 미션 시작
        uiHistory.push({
            type: 'user',
            text: session.mission,
            timestamp: new Date(session.started_at).getTime()
        });
        debugLog(`Added user mission to uiHistory (index ${uiHistory.length - 1})`);

        // orchestratorConversation에서 도구 사용 이벤트 추출
        // 이전 세션까지의 대화 길이를 계산하여 중복 제거
        if (session.orchestratorConversation && session.orchestratorConversation.length > 0) {
            const conversation = session.orchestratorConversation;
            debugLog(`orchestratorConversation length: ${conversation.length}`);

            // 현재 세션의 시작 지점: 이전 세션의 끝 = 이전 세션의 lastOrchestratorSnapshotLength
            let startIndex = 0;
            if (sessionIndex > 0) {
                startIndex = sessions[sessionIndex - 1].lastOrchestratorSnapshotLength || 0;
                debugLog(`Previous session lastOrchestratorSnapshotLength: ${startIndex}`);
            }

            // 현재 세션의 끝 지점: 현재 세션의 lastOrchestratorSnapshotLength
            const endIndex = session.lastOrchestratorSnapshotLength || conversation.length;
            debugLog(`Current session lastOrchestratorSnapshotLength: ${endIndex}`);
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

                    // response_message는 assistant 메시지로 변환
                    const toolConfig = getToolDisplayConfig(toolName);
                    if (toolName === 'response_message' && toolConfig.extract_message_from) {
                        const message = args[toolConfig.extract_message_from];
                        if (message) {
                            uiHistory.push({
                                type: 'assistant',
                                text: message,
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
                    const text = item.content[0]?.text || '';
                    if (text) {
                        uiHistory.push({
                            type: 'assistant',
                            text: text,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        }

        // whatItDidHistory와 verification_memory는 orchestratorConversation에
        // 이미 포함되어 있으므로 중복 추가하지 않음

        // mission_completed는 UI에서 필터링되므로 추가하지 않음
    });

    return uiHistory;
}
