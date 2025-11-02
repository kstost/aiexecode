/**
 * Header component with ASCII art logo
 */

import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { theme } from '../design/themeColors.js';

// const ASCII_LOGO = `
//        d8888 8888888 8888888888 Y88b   d88P 8888888888                      888          
//       d88888   888   888         Y88b d88P  888                             888          
//      d88P888   888   888          Y88o88P   888                             888          
//     d88P 888   888   8888888       Y888P    8888888    .d8888b .d88b.   .d88888  .d88b.  
//    d88P  888   888   888           d888b    888       d88P"   d88""88b d88" 888 d8P  Y8b 
//   d88P   888   888   888          d88888b   888       888     888  888 888  888 88888888 
//  d8888888888   888   888         d88P Y88b  888       Y88b.   Y88..88P Y88b 888 Y8b.     
// d88P     888 8888888 8888888888 d88P   Y88b 8888888888 "Y8888P "Y88P"   "Y88888  "Y8888  
// `;

export function Header({ version = '1.0.0', updateInfo = null }) {
    const ASCII_LOGO = `
    ▞▀▖▜▘▛▀▘▌ ▌▛▀▘        ▌
    ▙▄▌▐ ▙▄ ▝▞ ▙▄ ▞▀▖▞▀▖▞▀▌▞▀▖
    ▌ ▌▐ ▌  ▞▝▖▌  ▌ ▖▌ ▌▌ ▌▛▀
    ▘ ▘▀▘▀▀▘▘ ▘▀▀▘▝▀ ▝▀ ▝▀▘▝▀▘
    by 코드깎는노인
    `.split('\n').map(line => line.trim()).join("\n");
    return React.createElement(Box, { flexDirection: "column", marginBottom: 1, marginLeft: 2 },
        React.createElement(Text, { color: theme.brand.light }, ASCII_LOGO),
        React.createElement(Box, { justifyContent: "flex-left" },
            React.createElement(Text, { color: theme.text.secondary }, `AIEXEcode v${version}`),
            updateInfo && updateInfo.updateAvailable && React.createElement(Text, null,
                React.createElement(Text, { color: '#666666' }, ' → '),
                React.createElement(Text, { color: theme.status.warning }, `v${updateInfo.remoteVersion}`),
                React.createElement(Text, null, ' available ('),
                React.createElement(Text, { color: '#FFD700' }, 'npm install aiexecode -g'),
                React.createElement(Text, null, ')')
            )
        )
    );
}
