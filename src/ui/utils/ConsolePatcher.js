/**
 * Console patcher to prevent console output from interfering with Ink rendering
 */

import util from 'util';

export class ConsolePatcher {
    constructor() {
        this.originalConsoleLog = console.log;
        this.originalConsoleWarn = console.warn;
        this.originalConsoleError = console.error;
        this.originalConsoleDebug = console.debug;
        this.originalConsoleInfo = console.info;
    }

    patch() {
        // Redirect console methods to stderr to prevent interference with Ink's stdout rendering
        console.log = this.patchConsoleMethod(this.originalConsoleError);
        console.warn = this.patchConsoleMethod(this.originalConsoleError);
        console.error = this.patchConsoleMethod(this.originalConsoleError);
        console.debug = this.patchConsoleMethod(this.originalConsoleError);
        console.info = this.patchConsoleMethod(this.originalConsoleError);
    }

    cleanup() {
        console.log = this.originalConsoleLog;
        console.warn = this.originalConsoleWarn;
        console.error = this.originalConsoleError;
        console.debug = this.originalConsoleDebug;
        console.info = this.originalConsoleInfo;
    }

    patchConsoleMethod(originalMethod) {
        return (...args) => {
            // Format and redirect to stderr
            originalMethod.apply(console, args);
        };
    }
}
