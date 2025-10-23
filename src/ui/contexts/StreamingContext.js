/**
 * StreamingContext - Real-time streaming state
 */

import React, { createContext, useContext } from 'react';
import { createDebugLogger } from '../../util/debug_log.js';

const debugLog = createDebugLogger('ui_contexts.log', 'StreamingContext');

const StreamingContext = createContext(null);

export const StreamingContextProvider = StreamingContext.Provider;

export function useStreaming() {
    const context = useContext(StreamingContext);
    debugLog('useStreaming accessed');
    return context;
}

export { StreamingContext };
