/**
 * UIStateContext - UI state management
 */

import React, { createContext, useContext, useState, useRef } from 'react';

const UIStateContext = createContext(null);

export const StreamingState = {
    Idle: 'idle',
    Responding: 'responding',
    WaitingForConfirmation: 'waiting_for_confirmation',
    Executing: 'executing',
    Completed: 'completed',
    Error: 'error'
};

export function UIStateProvider({ children, initialState = {} }) {
    const [history, setHistory] = useState(initialState.history || []);
    const [pendingHistoryItems, setPendingHistoryItems] = useState([]);
    const [streamingState, setStreamingState] = useState(StreamingState.Idle);
    const [currentOperation, setCurrentOperation] = useState(null);
    const [progressMessage, setProgressMessage] = useState('');
    const [thought, setThought] = useState('');
    const [mainAreaWidth, setMainAreaWidth] = useState(process.stdout.columns || 80);
    const [terminalHeight, setTerminalHeight] = useState(process.stdout.rows || 24);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [operations, setOperations] = useState([]);
    const [isSessionRunning, setIsSessionRunning] = useState(false);
    const [sessionMessage, setSessionMessage] = useState('Processing...');
    const [historyRemountKey, setHistoryRemountKey] = useState(0);

    const rootUiRef = useRef(null);
    const mainControlsRef = useRef(null);

    const value = {
        // History
        history,
        setHistory,
        pendingHistoryItems,
        setPendingHistoryItems,

        // Streaming state
        streamingState,
        setStreamingState,
        currentOperation,
        setCurrentOperation,
        progressMessage,
        setProgressMessage,
        thought,
        setThought,

        // Operations tracking
        operations,
        setOperations,
        addOperation: (operation) => {
            setOperations(prev => [...prev, {
                ...operation,
                id: Date.now(),
                startTime: Date.now(),
                status: 'running'
            }]);
        },
        updateOperation: (id, updates) => {
            setOperations(prev => prev.map(op =>
                op.id === id ? { ...op, ...updates } : op
            ));
        },
        completeOperation: (id) => {
            setOperations(prev => prev.map(op =>
                op.id === id ? { ...op, status: 'completed', endTime: Date.now() } : op
            ));
        },

        // Layout
        mainAreaWidth,
        setMainAreaWidth,
        terminalHeight,
        setTerminalHeight,
        rootUiRef,
        mainControlsRef,

        // Timer
        elapsedTime,
        setElapsedTime,

        // Session state
        isSessionRunning,
        setIsSessionRunning,
        sessionMessage,
        setSessionMessage,

        // History remount key for Static component optimization
        historyRemountKey,
        setHistoryRemountKey,
    };

    return React.createElement(UIStateContext.Provider, { value }, children);
}

export function useUIState() {
    const context = useContext(UIStateContext);
    if (!context) {
        throw new Error('useUIState must be used within UIStateProvider');
    }
    return context;
}
