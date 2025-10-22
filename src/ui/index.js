/**
 * Ink UI entry point
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { ConsolePatcher } from './utils/ConsolePatcher.js';

export function startUI({ onSubmit, onClearScreen, onExit, commands = [], model = 'gpt-4', version = '1.0.0', initialHistory = [], reasoningEffort = null }) {
    // Patch console methods to prevent interference with Ink rendering
    const consolePatcher = new ConsolePatcher();
    consolePatcher.patch();

    // Disable terminal line wrapping to reduce rendering artifacts
    // This prevents the terminal from wrapping lines itself, letting Ink handle all wrapping
    process.stdout.write('\x1b[?7l');

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
            patchConsole: false, // We're handling this manually with ConsolePatcher
            // Don't exit on Ctrl+C - let the app handle it
            exitOnCtrlC: false,
            // Debug mode ON - prevents clearing terminal and preserves previous content
            debug: false
        }
    );

    // Re-enable line wrapping and restore console on cleanup
    const originalUnmount = unmount;
    const wrappedUnmount = () => {
        // Re-enable line wrapping
        process.stdout.write('\x1b[?7h');
        consolePatcher.cleanup();
        originalUnmount();
    };

    return {
        unmount: wrappedUnmount,
        waitUntilExit
    };
}
