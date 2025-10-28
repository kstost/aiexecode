/**
 * Theme Colors - Color definitions for theming
 */

const defaultTheme = {
    text: {
        primary: '#E0E0E0',
        secondary: '#888888',
        accent: '#3fbe96',
        link: '#3fbe96',
    },
    background: {
        default: '#1E1E1E',
        highlight: '#2D2D2D',
    },
    border: {
        default: '#333333',
        focused: '#333333',
    },
    ui: {
        symbol: '#666666',
        gradient: ['#00D9FF', '#7B68EE'],
    },
    status: {
        error: '#FF0055',
        warning: '#FFAA00',
        success: '#00FF88',
        info: '#00A8FF',
    },
    brand: {
        dark: '#418972',
        light: '#3fbe96',
    },
};

const currentTheme = defaultTheme;

export const theme = new Proxy({}, {
    get(target, prop) {
        return currentTheme[prop];
    }
});
