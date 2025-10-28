/**
 * Output Redirector - Redirects console output to prevent interfering with Ink rendering
 */

import util from 'util';
import { createDebugLogger } from '../../util/debug_log.js';

const debugLog = createDebugLogger('ui_utils.log', 'OutputRedirector');

export class OutputRedirector {
    constructor() {
        debugLog('OutputRedirector constructor called');
        this.originalConsoleLog = console.log;
        this.originalConsoleWarn = console.warn;
        this.originalConsoleError = console.error;
        this.originalConsoleDebug = console.debug;
        this.originalConsoleInfo = console.info;
    }

    patch() {
        debugLog('OutputRedirector patching console methods');
        // Redirect console methods to stderr to prevent interference with Ink's stdout rendering
        console.log = this.patchConsoleMethod(this.originalConsoleError);
        console.warn = this.patchConsoleMethod(this.originalConsoleError);
        console.error = this.patchConsoleMethod(this.originalConsoleError);
        console.debug = this.patchConsoleMethod(this.originalConsoleError);
        console.info = this.patchConsoleMethod(this.originalConsoleInfo);
        debugLog('OutputRedirector patch completed');
    }

    cleanup() {
        debugLog('OutputRedirector cleanup called');
        console.log = this.originalConsoleLog;
        console.warn = this.originalConsoleWarn;
        console.error = this.originalConsoleError;
        console.debug = this.originalConsoleDebug;
        console.info = this.originalConsoleInfo;
        debugLog('OutputRedirector cleanup completed');
    }

    patchConsoleMethod(originalMethod) {
        return (...args) => {
            // Format and redirect to stderr
            originalMethod.apply(console, args);
        };
    }
}
