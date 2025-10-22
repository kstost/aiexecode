/**
 * AppContext - Global application state
 */

import React, { createContext, useContext } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children, value }) {
    return React.createElement(AppContext.Provider, { value }, children);
}

export function useAppContext() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within AppProvider');
    }
    return context;
}
