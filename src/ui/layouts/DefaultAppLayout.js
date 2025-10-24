/**
 * DefaultAppLayout - Main application layout
 */

import React from 'react';
import { Box } from 'ink';
import { MainContent } from '../components/MainContent.js';
import { Composer } from '../components/Composer.js';
import { Notifications } from '../components/Notifications.js';
import { Footer } from '../components/Footer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAppContext } from '../contexts/AppContext.js';

export function DefaultAppLayout({ onSubmit, onClearScreen, commands, buffer }) {
    const uiState = useUIState();
    const appContext = useAppContext();

    return React.createElement(Box, {
        flexDirection: "column",
        padding: 0,
        ref: uiState.rootUiRef
    },
        React.createElement(MainContent),
        React.createElement(Notifications),
        React.createElement(Composer, {
            onSubmit,
            onClearScreen,
            commands,
            buffer
        }),
        React.createElement(Footer, { model: appContext.model })
    );
}
