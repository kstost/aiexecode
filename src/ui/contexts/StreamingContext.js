/**
 * StreamingContext - Real-time streaming state
 */

import React, { createContext, useContext } from 'react';

const StreamingContext = createContext(null);

export const StreamingContextProvider = StreamingContext.Provider;

export function useStreaming() {
    return useContext(StreamingContext);
}

export { StreamingContext };
