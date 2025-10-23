/**
 * AppContext - Global application state
 */

import React, { createContext, useContext } from 'react';
import { createDebugLogger } from '../../util/debug_log.js';

const debugLog = createDebugLogger('ui_contexts.log', 'AppContext');

const AppContext = createContext(null);

export function AppProvider({ children, value }) {
    debugLog('AppProvider initialized');
    return React.createElement(AppContext.Provider, { value }, children);
}

export function useAppContext() {
    const context = useContext(AppContext);
    if (!context) {
        debugLog('ERROR: useAppContext called outside AppProvider');
        throw new Error('useAppContext must be used within AppProvider');
    }
    debugLog('useAppContext accessed successfully');
    return context;
}
