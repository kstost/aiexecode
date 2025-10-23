/**
 * Main App component
 * Optimized to prevent unnecessary re-renders and screen flickering
 */

import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { Box, Text, Newline, useStdout, Static } from 'ink';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { InputPrompt } from './components/InputPrompt.js';
import { SessionSpinner } from './components/SessionSpinner.js';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import { useTextBuffer } from './utils/text-buffer.js';
import { uiEvents } from '../system/ui_events.js';
import { getToolDisplayConfig, extractMessageFromArgs, formatToolCall, formatToolResult, getToolDisplayName } from '../system/tool_registry.js';
import { ToolApprovalPrompt } from './components/ToolApprovalPrompt.js';
import { SetupWizard } from './components/SetupWizard.js';

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
            setStaticItems(current => {
                const newItems = [...current];
                transformedInitialHistory.forEach((item, index) => {
                    const nextItem = transformedInitialHistory[index + 1];
                    newItems.push(
                        React.createElement(HistoryItemDisplay, {
                            key: `initial-${index}`,
                            item,
                            terminalWidth,
                            nextItem
                        })
                    );
                });
                return newItems;
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

            // history에 추가
            setHistory(prev => [...prev, userEvent]);

            // static items에도 즉시 추가 (사용자 메시지는 즉시 고정)
            const itemKey = staticItemKeyCounter.current++;
            setStaticItems(current => [
                ...current,
                React.createElement(HistoryItemDisplay, {
                    key: `static-${itemKey}`,
                    item: userEvent,
                    terminalWidth,
                    nextItem: null
                })
            ]);
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
                        return { type: 'assistant', text: message };
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

    // Add event to appropriate history
    const addToHistory = useCallback((event) => {
        const transformed = transformEvent(event);
        if (!transformed) return; // Skip null events

        if (isSessionRunning) {
            setPendingHistory(prev => {
                const newType = transformed.type;

                // 쌍이 필요 없는 단일 이벤트 타입들 (즉시 static으로)
                const singleEventTypes = [
                    'user', 'assistant', 'system', 'error',
                    'tool_start', 'code_execution',  // 도구/코드 실행 메시지도 즉시 표시
                    'iteration_start', 'verification_start', 'verification_result',
                    'mission_failed', 'rag_search', 'conversation_restored'
                ];

                if (singleEventTypes.includes(newType)) {
                    const itemKey = staticItemKeyCounter.current++;
                    setStaticItems(current => [
                        ...current,
                        React.createElement(HistoryItemDisplay, {
                            key: `static-${itemKey}`,
                            item: transformed,
                            terminalWidth,
                            nextItem: null
                        })
                    ]);
                    setHistory(hist => [...hist, transformed]);
                    return prev; // 기존 pending 유지 (단일 이벤트는 독립적)
                }

                // 쌍을 완성하는 이벤트인지 확인
                // tool_result: pending에서 같은 toolName을 가진 tool_start 찾기
                // code_result: 마지막 pending이 code_execution이면 매칭
                let pairIndex = -1;
                let isPair = false;

                if (newType === 'tool_result' && transformed.toolName) {
                    // 뒤에서부터 같은 toolName을 가진 tool_start 찾기 (Node 14 호환)
                    for (let i = prev.length - 1; i >= 0; i--) {
                        if (prev[i].type === 'tool_start' && prev[i].toolName === transformed.toolName) {
                            pairIndex = i;
                            isPair = true;
                            break;
                        }
                    }
                } else if (newType === 'code_result') {
                    // 마지막 pending이 code_execution이면 매칭
                    const lastPending = prev.length > 0 ? prev[prev.length - 1] : null;
                    if (lastPending && lastPending.type === 'code_execution') {
                        pairIndex = prev.length - 1;
                        isPair = true;
                    }
                }

                // 쌍이 완료된 경우: 즉시 Static으로 이동
                if (isPair) {
                    const pairedStart = prev[pairIndex];
                    const completedPair = [pairedStart, transformed];
                    const remainingPending = [...prev.slice(0, pairIndex), ...prev.slice(pairIndex + 1)];

                    // Static에 즉시 추가
                    const startKey = staticItemKeyCounter.current;
                    setStaticItems(current => [
                        ...current,
                        ...completedPair.map((item, index) => {
                            const nextItem = completedPair[index + 1];
                            return React.createElement(HistoryItemDisplay, {
                                key: `static-${startKey + index}`,
                                item,
                                terminalWidth,
                                nextItem
                            });
                        })
                    ]);
                    staticItemKeyCounter.current += completedPair.length;
                    setHistory(hist => [...hist, ...completedPair]);

                    return remainingPending; // Pending에서 제거
                }

                // result 타입인데 매칭 실패 → 단독으로 즉시 static 이동 (pending 누적 방지)
                if (newType === 'tool_result' || newType === 'code_result') {
                    const itemKey = staticItemKeyCounter.current++;
                    setStaticItems(current => [
                        ...current,
                        React.createElement(HistoryItemDisplay, {
                            key: `static-${itemKey}`,
                            item: transformed,
                            terminalWidth,
                            nextItem: null
                        })
                    ]);
                    setHistory(hist => [...hist, transformed]);
                    return prev; // 기존 pending 유지
                }

                // 쌍의 시작 부분 (tool_start, code_execution)은 pending에 추가
                return [...prev, transformed];
            });
        } else {
            // 세션이 실행 중이 아닐 때는 바로 static items에 추가
            setHistory(prev => [...prev, transformed]);
            const itemKey = staticItemKeyCounter.current++;
            setStaticItems(current => [
                ...current,
                React.createElement(HistoryItemDisplay, {
                    key: `static-${itemKey}`,
                    item: transformed,
                    terminalWidth,
                    nextItem: null
                })
            ]);
        }
    }, [isSessionRunning, transformEvent, terminalWidth]);

    // Render a single history item (Memoized)
    const MemoizedHistoryItem = React.useMemo(() =>
        React.memo(function MemoizedHistoryItem({ item, terminalWidth, nextItem, itemKey }) {
            return React.createElement(HistoryItemDisplay, {
                item,
                terminalWidth,
                nextItem
            });
        })
    , []);

    const renderHistoryItem = useCallback((item, index, prefix = 'history', allItems = []) => {
        const nextItem = allItems[index + 1];
        return React.createElement(MemoizedHistoryItem, {
            key: `${prefix}-${index}`,
            itemKey: `${prefix}-${index}`,
            item,
            terminalWidth,
            nextItem
        });
    }, [terminalWidth, MemoizedHistoryItem]);

    // Handle session state transitions
    const handleSessionTransition = useCallback((wasRunning, isRunning) => {
        if (!wasRunning && isRunning) {
            setPendingHistory([]);
        }
        if (wasRunning && !isRunning) {
            // 세션이 끝나면 남은 pending items를 static items로 이동
            setPendingHistory(pending => {
                if (pending.length > 0) {
                    const startKey = staticItemKeyCounter.current;
                    setStaticItems(current => [
                        ...current,
                        ...pending.map((item, index) => {
                            const nextItem = pending[index + 1];
                            return React.createElement(HistoryItemDisplay, {
                                key: `static-${startKey + index}`,
                                item,
                                terminalWidth,
                                nextItem
                            });
                        })
                    ]);
                    staticItemKeyCounter.current += pending.length;
                    setHistory(hist => [...hist, ...pending]);
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

        uiEvents.on('history:add', handleHistoryAdd);
        uiEvents.on('session:state', handleSessionState);
        uiEvents.on('screen:clear', handleClearScreen);
        uiEvents.on('tool:approval_request', handleApprovalRequest);
        uiEvents.on('model:changed', handleModelChanged);
        uiEvents.on('reasoning_effort:changed', handleReasoningEffortChanged);
        uiEvents.on('setup:show', handleSetupShow);

        return () => {
            uiEvents.off('history:add', handleHistoryAdd);
            uiEvents.off('session:state', handleSessionState);
            uiEvents.off('screen:clear', handleClearScreen);
            uiEvents.off('tool:approval_request', handleApprovalRequest);
            uiEvents.off('model:changed', handleModelChanged);
            uiEvents.off('reasoning_effort:changed', handleReasoningEffortChanged);
            uiEvents.off('setup:show', handleSetupShow);
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
        process.env.ANTHROPIC_API_KEY = settings.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_MODEL = settings.ANTHROPIC_MODEL;

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
            React.createElement(Static, { items: staticItems }, (item) => item),

            // Pending items (currently being processed)
            pendingHistory.length > 0 && React.createElement(Box, {
                flexDirection: "column",
                marginTop: 1  // Add spacing between static and pending items
            },
                pendingHistory.map((item, index) => renderHistoryItem(item, index, 'pending', pendingHistory))
            )
        ),

        // Fixed input/control area (does not shrink, stays at bottom)
        React.createElement(Box, {
            flexDirection: "column",
            flexShrink: 0,
            marginTop: 1  // Spacing between history and input area
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
            !approvalRequest && React.createElement(InputPrompt, {
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
