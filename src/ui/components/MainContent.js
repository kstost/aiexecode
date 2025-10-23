/**
 * MainContent - Displays history and pending items with Static optimization
 */

import React, { useMemo } from 'react';
import { Box, Static } from 'ink';
import { Header } from './Header.js';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAppContext } from '../contexts/AppContext.js';
import { createDebugLogger } from '../../util/debug_log.js';

const debugLog = createDebugLogger('ui_components.log', 'MainContent');

export const MainContent = React.memo(function MainContent() {
    debugLog('MainContent rendering');
    const appContext = useAppContext();
    const uiState = useUIState();

    const { history, pendingHistoryItems, mainAreaWidth, historyRemountKey } = uiState;
    debugLog(`MainContent - history: ${history.length}, pending: ${pendingHistoryItems.length}, width: ${mainAreaWidth}`);

    // Memoize static items to prevent re-creation on every render
    const staticItems = useMemo(() => {
        debugLog(`MainContent - rebuilding staticItems with ${history.length} history items`);
        return [
        React.createElement(Header, {
            key: "app-header",
            version: appContext.version
        }),
        ...history.map((item, index) =>
            React.createElement(HistoryItemDisplay, {
                key: item.id || `history-${index}`,
                item,
                isPending: false,
                terminalWidth: mainAreaWidth
            })
        )
    ];
    }, [history, mainAreaWidth, appContext.version]);

    return React.createElement(React.Fragment, null,
        // Static area for immutable history with key for controlled remounting
        React.createElement(Static, {
            key: historyRemountKey || 0,
            items: staticItems
        }, (item) => item),

        // Dynamic area for pending/streaming content
        React.createElement(Box, {
            flexDirection: "column",
            width: mainAreaWidth
        },
            pendingHistoryItems.map((item, index) =>
                React.createElement(HistoryItemDisplay, {
                    key: `pending-${index}`,
                    item,
                    isPending: true,
                    terminalWidth: mainAreaWidth
                })
            )
        )
    );
});
