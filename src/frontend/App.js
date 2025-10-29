/**
 * Main App component
 * Optimized to prevent unnecessary re-renders and screen flickering
 */

import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { Box, Text, Newline, useStdout, Static } from 'ink';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { Input } from './components/Input.js';
import { SessionSpinner } from './components/SessionSpinner.js';
import { ConversationItem } from './components/ConversationItem.js';
import { BlankLine } from './components/BlankLine.js';
import { TodoList } from './components/TodoList.js';
import { useTextBuffer } from './utils/inputBuffer.js';
import { uiEvents } from '../system/ui_events.js';
import { getToolDisplayConfig, extractMessageFromArgs, formatToolCall, formatToolResult, getToolDisplayName } from '../system/tool_registry.js';
import { ToolApprovalPrompt } from './components/ToolApprovalPrompt.js';
import { SetupWizard } from './components/SetupWizard.js';
import { createDebugLogger } from '../util/debug_log.js';

const debugLog = createDebugLogger('ui_app.log', 'App');

/**
 * 빈 줄 추가 여부를 결정하는 함수
 *
 * ## 간격 규칙 상세 설명
 *
 * ### 1. user (사용자 입력)
 * - **규칙**: 항상 뒤에 빈 줄 추가
 * - **이유**: 사용자 입력과 AI 응답/도구 실행을 시각적으로 구분
 * - **예시**:
 *   ```
 *   > 사용자 입력
 *   (빈 줄)
 *   < AI 응답 또는 ⚙ Tool 실행
 *   ```
 *
 * ### 2. assistant (AI 응답)
 * - **규칙**: 항상 뒤에 빈 줄 추가
 * - **이유**: AI 응답과 다음 요소(사용자 입력 또는 도구 실행)를 구분
 * - **예시**:
 *   ```
 *   < AI의 설명
 *   (빈 줄)
 *   ⚙ Read (file.js)
 *   ```
 *
 * ### 3. tool_result (도구 실행 결과)
 * - **규칙**: 항상 뒤에 빈 줄 추가
 * - **이유**: 도구 실행 완료를 명확히 구분, 다음 도구나 응답과 분리
 * - **예시**:
 *   ```
 *   ⚙ Read (file.js)
 *     ㄴRead 100 lines
 *   (빈 줄)
 *   ⚙ Write (output.js)
 *   ```
 *
 * ### 4. tool_start (도구 실행 시작)
 * - **규칙**: 다음이 tool_result가 아니면 빈 줄 추가
 * - **이유**: tool_start와 tool_result는 하나의 쌍으로 붙어있어야 함
 * - **예외**: tool_start 바로 다음이 tool_result면 빈 줄 없음 (붙어서 표시)
 * - **정상 케이스 (빈 줄 없음)**:
 *   ```
 *   ⚙ Read (file.js)
 *     ㄴRead 100 lines
 *   ```
 * - **예외 케이스 (빈 줄 있음)**: tool_result가 denied되거나 누락된 경우
 *   ```
 *   ⚙ Read (file.js)
 *   (빈 줄) <- tool_result가 없으므로 빈 줄 추가
 *   ⚙ Write (output.js)
 *   ```
 *
 * ### 5. code_execution (코드 실행)
 * - **규칙**: 다음이 code_result가 아니면 빈 줄 추가
 * - **이유**: code_execution과 code_result는 하나의 쌍으로 붙어있어야 함
 * - **정상 케이스 (빈 줄 없음)**:
 *   ```
 *   ▶ Executing Python
 *   ◀ [출력 결과]
 *   ```
 * - **예외 케이스 (빈 줄 있음)**: code_result가 denied되거나 누락된 경우
 *   ```
 *   ▶ Executing Python
 *   (빈 줄)
 *   < AI 응답
 *   ```
 *
 * ### 6. code_result (코드 실행 결과)
 * - **규칙**: 항상 뒤에 빈 줄 추가
 * - **이유**: 코드 실행 블록 완료를 명확히 구분
 *
 * ### 7. system, error 등 기타 타입
 * - **규칙**: 항상 뒤에 빈 줄 추가
 * - **이유**: 시스템 메시지나 에러는 독립적인 정보 단위로 분리
 *
 * ## 핵심 원칙
 *
 * 1. **독립 요소는 항상 구분**: user, assistant, system, error, tool_result, code_result
 * 2. **쌍(pair)은 붙여서 표시**: (tool_start + tool_result), (code_execution + code_result)
 * 3. **예외 처리**: 쌍이 완성되지 않으면 빈 줄로 구분
 *
 * @param {Object} item - 현재 아이템
 * @param {Object} nextItem - 다음 아이템 (있는 경우)
 * @returns {Object} { shouldAdd: boolean, reason: string }
 */
function shouldAddBlankLineAfter(item, nextItem) {
    const { type, toolName } = item;

    debugLog(`[BlankLine Check] item.type=${type}, toolName=${toolName || 'N/A'}, nextItem=${nextItem ? nextItem.type : 'null'}`);

    // user 입력 뒤: 항상 빈 줄
    if (type === 'user') {
        debugLog(`[BlankLine] -> YES: user 타입 뒤에는 항상 빈 줄`);
        return { shouldAdd: true, reason: 'after user input' };
    }

    // assistant 응답 뒤: 항상 빈 줄
    if (type === 'assistant') {
        debugLog(`[BlankLine] -> YES: assistant 타입 뒤에는 항상 빈 줄`);
        return { shouldAdd: true, reason: 'after assistant response' };
    }

    // assistant_progress (중간 안내 메시지) 뒤: 항상 빈 줄
    if (type === 'assistant_progress') {
        debugLog(`[BlankLine] -> YES: assistant_progress 타입 뒤에는 항상 빈 줄`);
        return { shouldAdd: true, reason: 'after assistant progress message' };
    }

    // tool_result 뒤: 항상 빈 줄
    if (type === 'tool_result') {
        debugLog(`[BlankLine] -> YES: tool_result 타입 뒤에는 항상 빈 줄`);
        return { shouldAdd: true, reason: 'after tool_result' };
    }

    // tool_start 뒤: 다음이 tool_result가 아니면 빈 줄
    // 정상: tool_start + tool_result는 붙여서 표시
    // 예외: tool_result가 없으면 빈 줄로 구분
    if (type === 'tool_start') {
        if (!nextItem || nextItem.type !== 'tool_result') {
            debugLog(`[BlankLine] -> YES: tool_start 뒤에 tool_result가 없음 (nextItem=${nextItem ? nextItem.type : 'null'})`);
            return { shouldAdd: true, reason: 'tool_start without following tool_result' };
        } else {
            debugLog(`[BlankLine] -> NO: tool_start 뒤에 tool_result가 있음 (pair로 붙임)`);
            return { shouldAdd: false, reason: 'tool_start with following tool_result' };
        }
    }

    // code_execution 뒤: 다음이 code_result가 아니면 빈 줄
    // 정상: code_execution + code_result는 붙여서 표시
    // 예외: code_result가 없으면 빈 줄로 구분
    if (type === 'code_execution') {
        if (!nextItem || nextItem.type !== 'code_result') {
            debugLog(`[BlankLine] -> YES: code_execution 뒤에 code_result가 없음`);
            return { shouldAdd: true, reason: 'code_execution without following code_result' };
        } else {
            debugLog(`[BlankLine] -> NO: code_execution 뒤에 code_result가 있음 (pair로 붙임)`);
            return { shouldAdd: false, reason: 'code_execution with following code_result' };
        }
    }

    // code_result 뒤: 항상 빈 줄
    if (type === 'code_result') {
        debugLog(`[BlankLine] -> YES: code_result 타입 뒤에는 항상 빈 줄`);
        return { shouldAdd: true, reason: 'after code_result' };
    }

    // system, error 등 기타 타입: 항상 빈 줄
    debugLog(`[BlankLine] -> YES: 기타 타입(${type}) 뒤에는 항상 빈 줄`);
    return { shouldAdd: true, reason: `after ${type}` };
}

/**
 * 아이템 배열을 빈 줄과 함께 React 엘리먼트로 변환
 *
 * ## 기능
 *
 * 히스토리 아이템 배열을 받아서 ConversationItem과 BlankLine 컴포넌트를
 * 적절히 조합한 React 엘리먼트 배열을 생성합니다.
 *
 * ## 처리 과정
 *
 * 각 아이템마다:
 * 1. ConversationItem 컴포넌트 생성
 * 2. shouldAddBlankLineAfter()로 빈 줄 필요 여부 확인
 * 3. 필요하면 BlankLine 컴포넌트 추가
 *
 * ## 예시
 *
 * 입력: [user, tool_start, tool_result]
 * 출력:
 *   - ConversationItem(user)
 *   - BlankLine (user 뒤)
 *   - ConversationItem(tool_start)
 *   - ConversationItem(tool_result)  <- tool_start와 붙음, 빈 줄 없음
 *   - BlankLine (tool_result 뒤)
 *
 * ## 키 관리
 *
 * - startKey부터 시작하여 순차적으로 증가
 * - ConversationItem: `${keyPrefix}-${n}`
 * - BlankLine: `${keyPrefix}-blank-${n}`
 * - 반환값의 nextKey: 다음에 사용할 키 번호
 *
 * ## 호출 지점
 *
 * - 초기 히스토리 로드
 * - 사용자 입력 추가
 * - Tool pair 완료 (tool_start + tool_result)
 * - Single event (assistant 응답)
 * - Orphaned result (매칭되지 않은 result)
 * - Session 종료 (pending → static)
 * - Pending items 렌더링
 *
 * @param {Array} items - 히스토리 아이템 배열
 * @param {number} terminalWidth - 터미널 너비
 * @param {number} startKey - 시작 키 번호
 * @param {string} keyPrefix - 키 접두사 (예: 'static', 'initial', 'pending')
 * @returns {Object} { elements: React 엘리먼트 배열, nextKey: 다음 키 번호 }
 */
function createItemsWithBlankLines(items, terminalWidth, startKey, keyPrefix = 'static') {
    const elements = [];
    let currentKey = startKey;

    items.forEach((item, index) => {
        const nextItem = items[index + 1];
        const isLastInBatch = index === items.length - 1;

        debugLog(`[createItemsWithBlankLines] Processing item ${index}: type=${item.type}, toolName=${item.toolName || 'N/A'}`);

        // 1. 아이템 추가
        elements.push(
            React.createElement(ConversationItem, {
                key: `${keyPrefix}-${currentKey}`,
                item,
                terminalWidth,
                nextItem,
                isLastInBatch
            })
        );
        debugLog(`[createItemsWithBlankLines] Added ConversationItem with key: ${keyPrefix}-${currentKey}`);
        currentKey++;

        // 2. 빈 줄 추가 여부 확인 (shouldAddBlankLineAfter 함수 참조)
        const blankLineCheck = shouldAddBlankLineAfter(item, nextItem);
        if (blankLineCheck.shouldAdd) {
            elements.push(
                React.createElement(BlankLine, {
                    key: `${keyPrefix}-blank-${currentKey}`,
                    reason: blankLineCheck.reason,
                    afterType: item.type,
                    afterToolName: item.toolName,
                    beforeType: nextItem ? nextItem.type : null
                })
            );
            debugLog(`[createItemsWithBlankLines] Added BlankLine with key: ${keyPrefix}-blank-${currentKey}, reason: ${blankLineCheck.reason}`);
            currentKey++;
        }
    });

    debugLog(`[createItemsWithBlankLines] Total elements created: ${elements.length} (from ${items.length} items)`);
    return { elements, nextKey: currentKey };
}

// Memoized header component
const MemoizedHeader = memo(function MemoizedHeader({ version }) {
    return React.createElement(Header, { version });
});

// Memoized footer component
const MemoizedFooter = memo(function MemoizedFooter({ model, reasoningEffort }) {
    return React.createElement(Footer, { model, reasoningEffort });
});

// Helper function to format events as text for display
function formatEventAsText(event) {
    switch (event.type) {
        case 'tool_start':
            if (!event.toolName) {
                return `Tool: (unknown) ${JSON.stringify(event.args || {})}`;
            }
            const displayName = getToolDisplayName(event.toolName);
            const formattedArgs = formatToolCall(event.toolName, event.args);
            return `${displayName} ${formattedArgs}`;
        case 'tool_result':
            if (!event.toolName) {
                return JSON.stringify(event.result || {});
            }
            const formattedResult = formatToolResult(event.toolName, event.result);
            return formattedResult;
        case 'code_execution':
            return `Executing ${event.language} code:\n${event.code}`;
        case 'code_result':
            return `Exit code: ${event.exitCode}\nStdout: ${event.stdout || '(none)'}\nStderr: ${event.stderr || '(none)'}`;
        case 'iteration_start':
            return `Starting iteration ${event.iterationNumber}`;
        case 'verification_start':
            return 'Starting verification...';
        case 'verification_result':
            return `Verification: ${typeof event.result === 'string' ? event.result : JSON.stringify(event.result)}`;
        case 'mission_completed':
            return `Mission completed in ${event.iterations} iterations`;
        case 'mission_failed':
            return `Mission failed: ${event.reason}`;
        case 'rag_search':
            return `RAG search completed (context length: ${event.contextLength})`;
        case 'conversation_restored':
            return `Conversation restored (${event.messageCount} messages)`;
        default:
            return JSON.stringify(event);
    }
}

// Main app component
export function App({ onSubmit, onClearScreen, onExit, commands = [], model, version, initialHistory = [], reasoningEffort: initialReasoningEffort = null }) {
    const { stdout } = useStdout();

    // Model state for dynamic updates
    const [currentModel, setCurrentModel] = useState(model);
    const [reasoningEffort, setReasoningEffort] = useState(initialReasoningEffort);

    // Memoize terminal width to prevent re-renders on stdout changes
    const terminalWidth = useMemo(() => stdout.columns || 80, [stdout.columns]);

    // Calculate actual input width (accounting for prompt, borders, padding)
    const FRAME_OVERHEAD = 10;
    const inputWidth = useMemo(() => Math.max(terminalWidth - FRAME_OVERHEAD, 40), [terminalWidth]);

    // Transform initial history to add text fields
    const transformedInitialHistory = useMemo(() => {
        return initialHistory
            .filter(event => event.type !== 'mission_completed')
            .map(event => {
                if (event.text) {
                    return event;
                }
                if (event.type === 'code_execution' || event.type === 'code_result') {
                    return event;
                }
                return { ...event, text: formatEventAsText(event) };
            });
    }, [initialHistory]);

    const [history, setHistory] = useState(transformedInitialHistory);
    const [pendingHistory, setPendingHistory] = useState([]);
    const [isSessionRunning, setIsSessionRunning] = useState(false);
    const [sessionMessage, setSessionMessage] = useState('Processing...');
    const [approvalRequest, setApprovalRequest] = useState(null);
    const [showSetupWizard, setShowSetupWizard] = useState(false);
    const [todos, setTodos] = useState([]);

    // Static items: 메모이제이션된 React 엘리먼트들 (Static 컴포넌트 제거로 스크롤 문제 해결)
    const [staticItems, setStaticItems] = useState(() => [
        React.createElement(MemoizedHeader, { key: 'header', version })
    ]);

    // initialHistory를 staticItems에 추가 (초기 렌더링 시 한 번만)
    const initialHistoryAddedRef = useRef(false);
    const staticItemKeyCounter = useRef(0);
    useEffect(() => {
        if (!initialHistoryAddedRef.current && transformedInitialHistory.length > 0) {
            initialHistoryAddedRef.current = true;
            debugLog(`[Initial History] Loading ${transformedInitialHistory.length} items with blank lines`);
            setStaticItems(current => {
                const { elements } = createItemsWithBlankLines(
                    transformedInitialHistory,
                    terminalWidth,
                    0,
                    'initial'
                );
                debugLog(`[Initial History] Created ${elements.length} elements (items + blank lines)`);
                return [...current, ...elements];
            });
        }
    }, [transformedInitialHistory, terminalWidth]);

    // Memoize viewport to prevent buffer recreation
    const viewport = useMemo(() => ({ width: inputWidth, height: 10 }), [inputWidth]);

    // Use the hook-based TextBuffer
    const buffer = useTextBuffer({
        initialText: '',
        viewport
    });

    // Stable callbacks
    const handleSubmit = useCallback((text) => {
        // Add to history only if it's not a slash command
        if (!text.trim().startsWith('/')) {
            const userEvent = { type: 'user', text };

            // Clear todos when starting a new mission
            setTodos([]);

            // history에 추가
            setHistory(prev => [...prev, userEvent]);

            // static items에도 즉시 추가 (사용자 메시지는 즉시 고정 + 빈 줄)
            debugLog(`[User Input] Adding user input with blank line`);
            const startKey = staticItemKeyCounter.current;
            const { elements, nextKey } = createItemsWithBlankLines(
                [userEvent],
                terminalWidth,
                startKey,
                'static'
            );
            staticItemKeyCounter.current = nextKey;
            setStaticItems(current => [...current, ...elements]);
            debugLog(`[User Input] Added ${elements.length} elements (user + blank line)`);
        }

        if (onSubmit) {
            onSubmit(text);
        }
    }, [onSubmit, terminalWidth]);

    const handleClearScreen = useCallback(() => {
        setHistory([]);
        setPendingHistory([]);
        // Reset static items to only header
        setStaticItems([
            React.createElement(MemoizedHeader, { key: 'header', version })
        ]);
        // Reset key counter
        staticItemKeyCounter.current = 0;
        if (onClearScreen) {
            onClearScreen();
        }
    }, [onClearScreen, version]);

    // Hide terminal cursor to prevent double cursor issue
    useEffect(() => {
        if (stdout && stdout.write) {
            // Hide cursor (ANSI escape code)
            stdout.write('\x1B[?25l');
        }

        return () => {
            if (stdout && stdout.write) {
                // Show cursor on cleanup (ANSI escape code)
                stdout.write('\x1B[?25h');
            }
        };
    }, [stdout]);

    // Transform event for display
    const transformEvent = useCallback((event) => {
        // mission_completed는 표시하지 않음
        if (event.type === 'mission_completed') {
            return null;
        }

        // 이미 text가 있으면 그대로 반환
        if (event.text) {
            return event;
        }

        // code_execution은 그대로 반환 (별도 컴포넌트에서 렌더링)
        if (event.type === 'code_execution') {
            return event;
        }

        // code_result도 그대로 반환 (별도 컴포넌트에서 렌더링)
        if (event.type === 'code_result') {
            // 일단 항상 반환 (필터링하지 않음)
            return event;
        }

        // 도구별 UI 표시 규칙 적용
        if (event.type === 'tool_start' && event.toolName) {
            const config = getToolDisplayConfig(event.toolName);

            if (!config.show_tool_call) {
                // 도구 호출을 표시하지 않고 메시지만 추출
                if (config.extract_message_from) {
                    const message = extractMessageFromArgs(event.args, config.extract_message_from);
                    if (message) {
                        // response_message는 중간 안내 메시지로 구분
                        return { type: 'assistant_progress', text: message, toolName: event.toolName };
                    }
                }
                return null;
            }
        }

        if (event.type === 'tool_result' && event.toolName) {
            const config = getToolDisplayConfig(event.toolName);
            if (!config.show_tool_result) {
                return null;
            }
        }

        // 나머지 모든 타입은 formatEventAsText로 text 생성
        return { ...event, text: formatEventAsText(event) };
    }, []);

    /**
     * Add event to appropriate history
     *
     * ## 디버그 로깅 가이드
     *
     * 이 함수는 tool_result 누락 문제를 추적하기 위해 상세한 로그를 출력합니다.
     *
     * ### 로그 태그 설명
     *
     * - **[Event]**: 원본 이벤트 정보 (타입, toolName, timestamp)
     * - **[Transform]**: 변환된 이벤트 정보
     * - **[Session]**: 세션 실행 상태
     * - **[Session Mode]**: 세션 모드에서의 처리 과정
     * - **[Single Event]**: 쌍이 필요 없는 단일 이벤트 (assistant 등)
     * - **[Pair Matching]**: tool_result가 tool_start와 매칭되는 과정
     *   - pending 배열 상태
     *   - 매칭 시도 과정 (각 항목 체크)
     *   - 매칭 성공/실패 및 실패 원인
     * - **[Pair Completed]**: 매칭 성공 후 pair 처리
     *   - 매칭된 start와 result 정보
     *   - pending에서 제거 후 남은 항목들
     * - **[Orphaned Result]**: 매칭 실패한 result (tool_start 없음)
     * - **[Pending Add]**: pending 배열에 새 항목 추가
     *   - 추가 전 pending 배열 상태
     *   - 추가되는 항목 정보
     * - **[Tool Pair]**: pair가 static으로 이동
     * - **[Not Running]**: 세션 미실행 시 바로 static 추가
     *
     * ### 문제 추적 방법
     *
     * **tool_result가 표시되지 않는 경우**:
     *
     * 1. **이벤트 도착 확인**:
     *    - `[Event] Type: tool_result` 로그 확인
     *    - 이벤트가 도착하지 않았다면 백엔드 문제
     *
     * 2. **변환 확인**:
     *    - `[Transform] Transformed type: tool_result` 확인
     *    - null로 변환되었다면 transformEvent 함수 확인
     *
     * 3. **매칭 과정 확인**:
     *    - `[Pair Matching] tool_result arrived` 로그 확인
     *    - `Current pending count: 0`이면 tool_start가 이미 소모됨
     *    - `Pending items:` 로그에서 어떤 tool_start들이 대기 중인지 확인
     *    - `Searching for matching tool_start` 로그에서 매칭 시도 과정 확인
     *
     * 4. **매칭 실패 원인 분석**:
     *    - `✗ NO MATCH FOUND` 로그 확인
     *    - Possible reasons:
     *      - tool_start가 다른 tool_result에 의해 이미 소모됨
     *      - toolName이 다름
     *      - tool_start가 pending에 추가되지 않음
     *
     * 5. **Orphaned 처리 확인**:
     *    - `[Orphaned Result]` 로그 확인
     *    - orphaned result는 단독으로 static에 추가됨
     *
     * ### 예상 플로우 (정상 케이스)
     *
     * ```
     * [Event] Type: tool_start, ToolName: read_file
     * [Transform] Transformed type: tool_start
     * [Session Mode] Current pending count BEFORE: 0
     * [Pending Add] Adding to pending: tool_start, toolName=read_file
     * [Pending Add] Pending count after add: 1
     *
     * [Event] Type: tool_result, ToolName: read_file
     * [Transform] Transformed type: tool_result
     * [Pair Matching] tool_result arrived: toolName=read_file
     * [Pair Matching] Current pending count: 1
     * [Pair Matching] Pending items:
     *   [0] type=tool_start, toolName=read_file
     * [Pair Matching] Searching for matching tool_start...
     *   [0] Checking: type=tool_start, toolName=read_file
     * [Pair Matching] ✓ MATCH FOUND at index 0!
     * [Pair Completed] Paired start: type=tool_start, toolName=read_file
     * [Pair Completed] Paired result: type=tool_result, toolName=read_file
     * [Tool Pair] Adding pair to static items
     * ```
     */
    const addToHistory = useCallback((event) => {
        const eventTimestamp = new Date().toISOString();
        debugLog('========== ADD TO HISTORY START ==========');
        debugLog(`[Event] Timestamp: ${eventTimestamp}`);
        debugLog(`[Event] Type: ${event.type}`);
        debugLog(`[Event] ToolName: ${event.toolName || 'N/A'}`);
        debugLog(`[Event] Data (first 200 chars): ${JSON.stringify(event).substring(0, 200)}...`);

        const transformed = transformEvent(event);
        if (!transformed) {
            debugLog('[Transform] Event transformed to null - SKIPPING');
            debugLog('========== ADD TO HISTORY END (SKIPPED) ==========');
            return; // Skip null events
        }

        debugLog(`[Transform] Transformed type: ${transformed.type}`);
        debugLog(`[Transform] Transformed toolName: ${transformed.toolName || 'N/A'}`);
        const textPreview1 = transformed.text ? (typeof transformed.text === 'string' ? transformed.text.substring(0, 100) : JSON.stringify(transformed.text).substring(0, 100)) : 'N/A';
        debugLog(`[Transform] Transformed text (first 100 chars): ${textPreview1}...`);
        debugLog(`[Session] isSessionRunning: ${isSessionRunning}`);

        if (isSessionRunning) {
            setPendingHistory(prev => {
                const newType = transformed.type;
                debugLog(`[Session Mode] Processing event, newType: ${newType}`);
                debugLog(`[Session Mode] Current pending count BEFORE processing: ${prev.length}`);

                // 쌍이 필요 없는 단일 이벤트 타입들 (즉시 static으로)
                // Note: tool_start and code_execution are NOT in this list - they should wait for their result
                const singleEventTypes = [
                    'user', 'assistant', 'assistant_progress', 'system', 'error',
                    'iteration_start', 'verification_start', 'verification_result',
                    'mission_failed', 'rag_search', 'conversation_restored'
                ];

                if (singleEventTypes.includes(newType)) {
                    debugLog(`[Single Event] Single event type detected: ${newType}`);
                    debugLog(`[Single Event] This type does not need pairing - adding directly to static`);
                    debugLog(`[Single Event] ToolName: ${transformed.toolName || 'N/A'}`);
                    debugLog(`[Single Event] Adding to static items with blank line`);

                    const startKey = staticItemKeyCounter.current;
                    const { elements, nextKey } = createItemsWithBlankLines(
                        [transformed],
                        terminalWidth,
                        startKey,
                        'static'
                    );
                    staticItemKeyCounter.current = nextKey;
                    setStaticItems(current => [...current, ...elements]);
                    setHistory(hist => [...hist, transformed]);
                    debugLog(`[Single Event] Added ${elements.length} elements (item + blank line)`);
                    debugLog('========== ADD TO HISTORY END (SINGLE EVENT) ==========');
                    return prev; // 기존 pending 유지 (단일 이벤트는 독립적)
                }

                // 쌍을 완성하는 이벤트인지 확인
                // tool_result: pending에서 같은 toolName을 가진 tool_start 찾기
                // code_result: 마지막 pending이 code_execution이면 매칭
                let pairIndex = -1;
                let isPair = false;

                if (newType === 'tool_result' && transformed.toolName) {
                    debugLog(`[Pair Matching] tool_result arrived: toolName=${transformed.toolName}`);
                    debugLog(`[Pair Matching] Current pending count: ${prev.length}`);

                    // pending 배열 상태 로깅
                    if (prev.length > 0) {
                        debugLog(`[Pair Matching] Pending items:`);
                        prev.forEach((p, idx) => {
                            const textPreview2 = p.text ? (typeof p.text === 'string' ? p.text.substring(0, 50) : JSON.stringify(p.text).substring(0, 50)) : 'N/A';
                            debugLog(`  [${idx}] type=${p.type}, toolName=${p.toolName || 'N/A'}, text=${textPreview2}...`);
                        });
                    } else {
                        debugLog(`[Pair Matching] WARNING: Pending array is EMPTY - no tool_start to match!`);
                    }

                    // 뒤에서부터 같은 toolName을 가진 tool_start 찾기 (Node 14 호환)
                    debugLog(`[Pair Matching] Searching for matching tool_start (toolName=${transformed.toolName}) from end...`);
                    for (let i = prev.length - 1; i >= 0; i--) {
                        debugLog(`  [${i}] Checking: type=${prev[i].type}, toolName=${prev[i].toolName || 'N/A'}`);
                        if (prev[i].type === 'tool_start' && prev[i].toolName === transformed.toolName) {
                            pairIndex = i;
                            isPair = true;
                            debugLog(`[Pair Matching] ✓ MATCH FOUND at index ${i}!`);
                            break;
                        }
                    }

                    if (!isPair) {
                        debugLog(`[Pair Matching] ✗ NO MATCH FOUND - tool_result will be orphaned`);
                        debugLog(`[Pair Matching] Possible reasons:`);
                        debugLog(`  1. tool_start was already consumed by another tool_result`);
                        debugLog(`  2. tool_start has different toolName`);
                        debugLog(`  3. tool_start was never added to pending`);
                    }
                } else if (newType === 'code_result') {
                    debugLog(`[Pair Matching] code_result arrived`);
                    debugLog(`[Pair Matching] Current pending count: ${prev.length}`);

                    // 마지막 pending이 code_execution이면 매칭
                    const lastPending = prev.length > 0 ? prev[prev.length - 1] : null;
                    if (lastPending) {
                        debugLog(`[Pair Matching] Last pending: type=${lastPending.type}`);
                    } else {
                        debugLog(`[Pair Matching] WARNING: No pending items`);
                    }

                    if (lastPending && lastPending.type === 'code_execution') {
                        pairIndex = prev.length - 1;
                        isPair = true;
                        debugLog(`[Pair Matching] ✓ MATCH FOUND with code_execution at index ${pairIndex}`);
                    } else {
                        debugLog(`[Pair Matching] ✗ NO MATCH - last pending is not code_execution`);
                    }
                }

                // 쌍이 완료된 경우: 즉시 Static으로 이동
                if (isPair) {
                    debugLog(`[Pair Completed] Pair matched at pairIndex: ${pairIndex}`);
                    const pairedStart = prev[pairIndex];
                    debugLog(`[Pair Completed] Paired start: type=${pairedStart.type}, toolName=${pairedStart.toolName || 'N/A'}`);
                    debugLog(`[Pair Completed] Paired result: type=${transformed.type}, toolName=${transformed.toolName || 'N/A'}`);
                    const completedPair = [pairedStart, transformed];
                    const remainingPending = [...prev.slice(0, pairIndex), ...prev.slice(pairIndex + 1)];
                    debugLog(`[Pair Completed] Remaining pending count: ${remainingPending.length} (removed item at index ${pairIndex})`);
                    if (remainingPending.length > 0) {
                        debugLog(`[Pair Completed] Remaining pending items:`);
                        remainingPending.forEach((p, idx) => {
                            debugLog(`  [${idx}] type=${p.type}, toolName=${p.toolName || 'N/A'}`);
                        });
                    }

                    // Static에 즉시 추가 (빈 줄 포함)
                    const startKey = staticItemKeyCounter.current;
                    debugLog(`[Tool Pair] Adding pair to static items: ${pairedStart.type}(${pairedStart.toolName}) + ${transformed.type}`);
                    const { elements, nextKey } = createItemsWithBlankLines(
                        completedPair,
                        terminalWidth,
                        startKey,
                        'static'
                    );
                    staticItemKeyCounter.current = nextKey;
                    setStaticItems(current => [...current, ...elements]);
                    setHistory(hist => [...hist, ...completedPair]);
                    debugLog(`[Tool Pair] Added ${elements.length} elements (pair + blank lines)`);
                    debugLog('========== ADD TO HISTORY END (PAIR COMPLETED) ==========');

                    return remainingPending; // Pending에서 제거
                }

                // result 타입인데 매칭 실패 → 단독으로 즉시 static 이동 (pending 누적 방지)
                if (newType === 'tool_result' || newType === 'code_result') {
                    debugLog(`[Orphaned Result] Result without matching start: ${newType}, toolName: ${transformed.toolName || 'N/A'}`);
                    debugLog(`[Orphaned Result] This result will be displayed alone (not paired with a start)`);
                    debugLog(`[Orphaned Result] Adding to static items with blank line`);

                    const startKey = staticItemKeyCounter.current;
                    const { elements, nextKey } = createItemsWithBlankLines(
                        [transformed],
                        terminalWidth,
                        startKey,
                        'static'
                    );
                    staticItemKeyCounter.current = nextKey;
                    setStaticItems(current => [...current, ...elements]);
                    setHistory(hist => [...hist, transformed]);
                    debugLog(`[Orphaned Result] Added ${elements.length} elements (item + blank line)`);
                    debugLog('========== ADD TO HISTORY END (ORPHANED RESULT) ==========');
                    return prev; // 기존 pending 유지
                }

                // 쌍의 시작 부분 (tool_start, code_execution)은 pending에 추가
                debugLog(`[Pending Add] Adding to pending (waiting for pair): ${newType}, toolName=${transformed.toolName || 'N/A'}`);
                const textPreview3 = transformed.text ? (typeof transformed.text === 'string' ? transformed.text.substring(0, 80) : JSON.stringify(transformed.text).substring(0, 80)) : 'N/A';
                debugLog(`[Pending Add] Text: ${textPreview3}...`);
                debugLog(`[Pending Add] Current pending items BEFORE add:`);
                if (prev.length > 0) {
                    prev.forEach((p, idx) => {
                        debugLog(`  [${idx}] type=${p.type}, toolName=${p.toolName || 'N/A'}`);
                    });
                } else {
                    debugLog(`  (empty)`);
                }
                debugLog(`[Pending Add] Pending count after add: ${prev.length + 1}`);
                debugLog('========== ADD TO HISTORY END (ADDED TO PENDING) ==========');
                return [...prev, transformed];
            });
        } else {
            // 세션이 실행 중이 아닐 때는 바로 static items에 추가
            debugLog('[Not Running] Session not running - adding directly to static items with blank line');
            setHistory(prev => [...prev, transformed]);

            const startKey = staticItemKeyCounter.current;
            const { elements, nextKey } = createItemsWithBlankLines(
                [transformed],
                terminalWidth,
                startKey,
                'static'
            );
            staticItemKeyCounter.current = nextKey;
            setStaticItems(current => [...current, ...elements]);
            debugLog(`[Not Running] Added ${elements.length} elements (item + blank line)`);
            debugLog('========== ADD TO HISTORY END (NOT RUNNING) ==========');
        }
    }, [isSessionRunning, transformEvent, terminalWidth]);

    // Render a single history item (Memoized)
    const MemoizedConversationItem = React.useMemo(() =>
        React.memo(function MemoizedConversationItem({ item, terminalWidth, nextItem, itemKey }) {
            return React.createElement(ConversationItem, {
                item,
                terminalWidth,
                nextItem
            });
        })
    , []);

    const renderHistoryItem = useCallback((item, index, prefix = 'history', allItems = []) => {
        const nextItem = allItems[index + 1];
        return React.createElement(MemoizedConversationItem, {
            key: `${prefix}-${index}`,
            itemKey: `${prefix}-${index}`,
            item,
            terminalWidth,
            nextItem
        });
    }, [terminalWidth, MemoizedConversationItem]);

    // Handle session state transitions
    const handleSessionTransition = useCallback((wasRunning, isRunning) => {
        if (!wasRunning && isRunning) {
            setPendingHistory([]);
        }
        if (wasRunning && !isRunning) {
            // 세션이 끝나면 남은 pending items를 static items로 이동
            setPendingHistory(pending => {
                if (pending.length > 0) {
                    debugLog(`[Session End] Moving ${pending.length} pending items to static with blank lines`);
                    const startKey = staticItemKeyCounter.current;
                    const { elements, nextKey } = createItemsWithBlankLines(
                        pending,
                        terminalWidth,
                        startKey,
                        'static'
                    );
                    staticItemKeyCounter.current = nextKey;
                    setStaticItems(current => [...current, ...elements]);
                    setHistory(hist => [...hist, ...pending]);
                    debugLog(`[Session End] Added ${elements.length} elements from ${pending.length} pending items`);
                }
                return [];
            });
        }
    }, [terminalWidth]);

    // Listen to UI events
    useEffect(() => {
        const handleHistoryAdd = (event) => addToHistory(event);

        const handleSessionState = (event) => {
            setIsSessionRunning(prev => {
                handleSessionTransition(prev, event.isRunning);
                return event.isRunning;
            });
            setSessionMessage(event.message || 'Processing...');
        };

        const handleClearScreen = () => {
            setHistory([]);
            setPendingHistory([]);
            // Reset static items to only header
            setStaticItems([
                React.createElement(MemoizedHeader, { key: 'header', version })
            ]);
            // Reset key counter
            staticItemKeyCounter.current = 0;
        };

        const handleApprovalRequest = (event) => {
            setApprovalRequest(event);
        };

        const handleModelChanged = (event) => {
            if (event.model) {
                setCurrentModel(event.model);
            }
        };

        const handleReasoningEffortChanged = (event) => {
            if (event.reasoningEffort !== undefined) {
                setReasoningEffort(event.reasoningEffort);
            }
        };

        const handleSetupShow = () => {
            setShowSetupWizard(true);
        };

        const handleTodosUpdate = (event) => {
            if (event.todos) {
                debugLog(`[handleTodosUpdate] Updating todos: ${event.todos.length} items`);
                setTodos(event.todos);
            }
        };

        uiEvents.on('history:add', handleHistoryAdd);
        uiEvents.on('session:state', handleSessionState);
        uiEvents.on('screen:clear', handleClearScreen);
        uiEvents.on('tool:approval_request', handleApprovalRequest);
        uiEvents.on('model:changed', handleModelChanged);
        uiEvents.on('reasoning_effort:changed', handleReasoningEffortChanged);
        uiEvents.on('setup:show', handleSetupShow);
        uiEvents.on('todos:update', handleTodosUpdate);

        return () => {
            uiEvents.off('history:add', handleHistoryAdd);
            uiEvents.off('session:state', handleSessionState);
            uiEvents.off('screen:clear', handleClearScreen);
            uiEvents.off('tool:approval_request', handleApprovalRequest);
            uiEvents.off('model:changed', handleModelChanged);
            uiEvents.off('reasoning_effort:changed', handleReasoningEffortChanged);
            uiEvents.off('setup:show', handleSetupShow);
            uiEvents.off('todos:update', handleTodosUpdate);
        };
    }, [addToHistory, handleSessionTransition]);

    // 승인 요청 처리
    const handleApprovalDecision = useCallback((decision) => {
        if (approvalRequest && approvalRequest.resolve) {
            approvalRequest.resolve(decision);
        }
        setApprovalRequest(null);
    }, [approvalRequest]);

    // Setup Wizard 완료 처리
    const handleSetupComplete = useCallback(async (settings) => {
        // Setup Wizard 먼저 닫기 (렌더링 중단)
        setShowSetupWizard(false);

        const { saveSettings } = await import('../util/config.js');
        const { resetAIClients } = await import('../system/ai_request.js');
        const { getModelForProvider } = await import('../system/ai_request.js');

        // 설정 저장
        await saveSettings(settings);

        // 환경변수 업데이트
        process.env.AI_PROVIDER = settings.AI_PROVIDER;
        process.env.OPENAI_API_KEY = settings.OPENAI_API_KEY;
        process.env.OPENAI_MODEL = settings.OPENAI_MODEL;
        process.env.OPENAI_REASONING_EFFORT = settings.OPENAI_REASONING_EFFORT;

        // 클라이언트 리셋
        resetAIClients();

        // 모델 변경 사항을 UI에 반영
        const newModel = await getModelForProvider();
        setCurrentModel(newModel);

        // reasoning effort 업데이트 (OpenAI 모델인 경우)
        if (settings.AI_PROVIDER === 'openai') {
            setReasoningEffort(settings.OPENAI_REASONING_EFFORT);
        } else {
            setReasoningEffort(null);
        }

        // 설정 완료 메시지 추가
        uiEvents.addSystemMessage('✓ Setup completed! New configuration will be used.');
    }, [onClearScreen]);

    const handleSetupCancel = useCallback(() => {
        setShowSetupWizard(false);

        // 설정 취소 메시지 추가
        uiEvents.addSystemMessage('⚠ Setup cancelled.');
    }, []);

    // Setup Wizard가 표시되면 전체 화면 모드
    if (showSetupWizard) {
        return React.createElement(Box, { flexDirection: "column", padding: 1 },
            React.createElement(SetupWizard, {
                onComplete: handleSetupComplete,
                onCancel: handleSetupCancel
            })
        );
    }

    return React.createElement(Box, { flexDirection: "column", padding: 1 },
        // History area (grows to fill available space, shrinks when needed)
        React.createElement(Box, {
            flexDirection: "column",
            flexGrow: 1,
            flexShrink: 1,
            overflow: 'hidden'  // Prevent history from pushing out fixed elements
        },
            // Static items: 한 번 렌더링되면 다시는 재렌더링되지 않음
            React.createElement(Static, { items: staticItems }, (item) => item)
        ),

        // Fixed input/control area (does not shrink, stays at bottom)
        React.createElement(Box, {
            flexDirection: "column",
            flexShrink: 0,
            marginTop: 0  // Spacing between history and input area
        },
            approvalRequest ? React.createElement(ToolApprovalPrompt, {
                toolName: approvalRequest.toolName,
                args: approvalRequest.args,
                mcpToolInfo: approvalRequest.mcpToolInfo || null,
                onDecision: handleApprovalDecision
            }) : null,

            !approvalRequest && React.createElement(SessionSpinner, {
                isRunning: isSessionRunning,
                message: sessionMessage
            }),
            !approvalRequest && todos.length > 0 && React.createElement(TodoList, {
                todos: todos
            }),
            !approvalRequest && React.createElement(Input, {
                buffer,
                onSubmit: handleSubmit,
                onClearScreen: handleClearScreen,
                onExit: onExit,
                commands,
                focus: true,
                isSessionRunning
            }),
            React.createElement(MemoizedFooter, { model: currentModel, reasoningEffort })
        )
    );
}
