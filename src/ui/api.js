/**
 * UI API - Helper functions to update UI state from external code
 *
 * This module provides a simple API for the AI agent to update the UI
 * with progress information, operations, and streaming states.
 */

let uiStateRef = null;

/**
 * Initialize the UI API with the UI state reference
 */
export function initializeUIAPI(uiState) {
    uiStateRef = uiState;
}

/**
 * Add a message to the history
 */
export function addHistoryMessage(message) {
    if (!uiStateRef) return;

    uiStateRef.setHistory(prev => [...prev, {
        id: Date.now(),
        ...message
    }]);
}

/**
 * Add a pending history item (for streaming content)
 */
export function addPendingMessage(message) {
    if (!uiStateRef) return;

    uiStateRef.setPendingHistoryItems(prev => [...prev, message]);
}

/**
 * Clear pending messages
 */
export function clearPendingMessages() {
    if (!uiStateRef) return;

    uiStateRef.setPendingHistoryItems([]);
}

/**
 * Update streaming state
 */
export function setStreamingState(state) {
    if (!uiStateRef) return;

    uiStateRef.setStreamingState(state);
}

/**
 * Set the current thought/reasoning message
 */
export function setThought(thought) {
    if (!uiStateRef) return;

    uiStateRef.setThought(thought);
}

/**
 * Set progress message
 */
export function setProgressMessage(message) {
    if (!uiStateRef) return;

    uiStateRef.setProgressMessage(message);
}

/**
 * Start a new operation
 * @param {Object} operation - { type, name, description }
 * @returns {number} operation ID
 */
export function startOperation(operation) {
    if (!uiStateRef) return null;

    const id = Date.now();
    uiStateRef.addOperation({
        ...operation,
        id,
        startTime: Date.now(),
        status: 'running'
    });

    return id;
}

/**
 * Update an existing operation
 * @param {number} id - Operation ID
 * @param {Object} updates - { status, progress, detail }
 */
export function updateOperation(id, updates) {
    if (!uiStateRef) return;

    uiStateRef.updateOperation(id, updates);
}

/**
 * Complete an operation
 * @param {number} id - Operation ID
 */
export function completeOperation(id) {
    if (!uiStateRef) return;

    uiStateRef.completeOperation(id);
}

/**
 * Add an operation with automatic completion
 * Useful for simple sequential operations
 */
export async function runOperation(operation, asyncFn) {
    const opId = startOperation(operation);

    try {
        const result = await asyncFn((updates) => {
            updateOperation(opId, updates);
        });

        completeOperation(opId);
        return result;
    } catch (error) {
        updateOperation(opId, {
            status: 'error',
            detail: error.message
        });
        throw error;
    }
}

/**
 * Clear all operations
 */
export function clearOperations() {
    if (!uiStateRef) return;

    uiStateRef.setOperations([]);
}

/**
 * Batch update multiple UI elements at once
 */
export function batchUpdate(updates) {
    if (!uiStateRef) return;

    if (updates.streamingState !== undefined) {
        setStreamingState(updates.streamingState);
    }
    if (updates.thought !== undefined) {
        setThought(updates.thought);
    }
    if (updates.progressMessage !== undefined) {
        setProgressMessage(updates.progressMessage);
    }
    if (updates.addHistory) {
        addHistoryMessage(updates.addHistory);
    }
}

// Export StreamingState enum for convenience
export { StreamingState } from './contexts/UIStateContext.js';
