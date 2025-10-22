/**
 * Example usage of the UI API
 *
 * This file demonstrates how to use the UI API to update the interface
 * during agentic coding operations.
 */

import {
    StreamingState,
    addHistoryMessage,
    setStreamingState,
    setThought,
    setProgressMessage,
    startOperation,
    updateOperation,
    completeOperation,
    runOperation,
    batchUpdate
} from './api.js';

/**
 * Example: Simple progress update
 */
export async function exampleSimpleProgress() {
    // Start responding
    setStreamingState(StreamingState.Responding);
    setThought('Analyzing the code structure...');

    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Update thought
    setThought('Planning the implementation...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Complete
    setStreamingState(StreamingState.Completed);
    addHistoryMessage({
        type: 'assistant',
        text: 'Analysis complete! Here\'s what I found...'
    });
}

/**
 * Example: Multi-step operation with detailed progress
 */
export async function exampleDetailedOperations() {
    setStreamingState(StreamingState.Executing);

    // Operation 1: Reading files
    const readOpId = startOperation({
        type: 'reading',
        name: 'Reading source files',
        description: 'Analyzing codebase structure'
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    updateOperation(readOpId, {
        progress: 50,
        detail: 'Processing src/components...'
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    completeOperation(readOpId);

    // Operation 2: Analyzing
    const analyzeOpId = startOperation({
        type: 'analyzing',
        name: 'Analyzing dependencies',
        description: 'Checking import relationships'
    });

    await new Promise(resolve => setTimeout(resolve, 1500));
    completeOperation(analyzeOpId);

    // Operation 3: Writing code
    const writeOpId = startOperation({
        type: 'writing',
        name: 'Writing new component',
        description: 'Creating Button.js'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    completeOperation(writeOpId);

    setStreamingState(StreamingState.Completed);
    addHistoryMessage({
        type: 'assistant',
        text: 'Successfully created the new component!'
    });
}

/**
 * Example: Using runOperation helper
 */
export async function exampleAutoOperation() {
    setStreamingState(StreamingState.Executing);

    await runOperation({
        type: 'building',
        name: 'Building project',
        description: 'Running npm run build'
    }, async (update) => {
        // Simulate build steps
        update({ progress: 25, detail: 'Compiling TypeScript...' });
        await new Promise(resolve => setTimeout(resolve, 1000));

        update({ progress: 50, detail: 'Bundling assets...' });
        await new Promise(resolve => setTimeout(resolve, 1000));

        update({ progress: 75, detail: 'Optimizing output...' });
        await new Promise(resolve => setTimeout(resolve, 1000));

        update({ progress: 100, detail: 'Build complete!' });
    });

    setStreamingState(StreamingState.Completed);
    addHistoryMessage({
        type: 'assistant',
        text: 'Build completed successfully!'
    });
}

/**
 * Example: Batch updates
 */
export async function exampleBatchUpdate() {
    batchUpdate({
        streamingState: StreamingState.Responding,
        thought: 'Thinking about the best approach...',
        progressMessage: 'Analyzing requirements',
        addHistory: {
            type: 'system',
            text: 'Starting analysis...'
        }
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    batchUpdate({
        streamingState: StreamingState.Completed,
        thought: null,
        progressMessage: null,
        addHistory: {
            type: 'assistant',
            text: 'Analysis complete!'
        }
    });
}

/**
 * Example: Error handling
 */
export async function exampleErrorHandling() {
    const opId = startOperation({
        type: 'testing',
        name: 'Running tests',
        description: 'npm test'
    });

    try {
        await new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('Test failed: timeout')), 1000);
        });

        completeOperation(opId);
    } catch (error) {
        updateOperation(opId, {
            status: 'error',
            detail: error.message
        });

        addHistoryMessage({
            type: 'error',
            text: `Test failed: ${error.message}`
        });
    }
}
