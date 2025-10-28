/**
 * Ink UI entry point
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { OutputRedirector } from './utils/outputRedirector.js';
import { createDebugLogger } from '../util/debug_log.js';

const debugLog = createDebugLogger('ui.log', 'index');

export function startUI({ onSubmit, onClearScreen, onExit, commands = [], model = 'gpt-4', version = '1.0.0', initialHistory = [], reasoningEffort = null }) {
    debugLog(`startUI called - model: ${model}, version: ${version}, commands: ${commands.length}, initialHistory: ${initialHistory.length}`);

    // Patch console methods to prevent interference with Ink rendering
    const outputRedirector = new OutputRedirector();
    outputRedirector.patch();
    debugLog('OutputRedirector patched');

    // Disable terminal line wrapping to reduce rendering artifacts
    // This prevents the terminal from wrapping lines itself, letting Ink handle all wrapping
    process.stdout.write('\x1b[?7l');
    debugLog('Terminal line wrapping disabled');

    const { unmount, waitUntilExit } = render(
        React.createElement(App, {
            onSubmit,
            onClearScreen,
            onExit,
            commands,
            model,
            version,
            initialHistory,
            reasoningEffort
        }),
        {
            // Use patchConsole option to prevent console output from interfering
            patchConsole: false, // We're handling this manually with OutputRedirector
            // Don't exit on Ctrl+C - let the app handle it
            exitOnCtrlC: false,
            // Debug mode ON - prevents clearing terminal and preserves previous content
            debug: false
        }
    );

    debugLog('UI render completed successfully');

    // Re-enable line wrapping and restore console on cleanup
    const originalUnmount = unmount;
    const wrappedUnmount = () => {
        debugLog('wrappedUnmount called - cleaning up UI');
        // Re-enable line wrapping
        process.stdout.write('\x1b[?7h');
        outputRedirector.cleanup();
        debugLog('OutputRedirector cleanup completed');
        originalUnmount();
        debugLog('UI unmounted');
    };

    return {
        unmount: wrappedUnmount,
        waitUntilExit
    };
}
