/**
 * Semantic color tokens for theming
 */

export const defaultTheme = {
    text: {
        primary: '#E0E0E0',
        secondary: '#888888',
        accent: '#00A8FF',
        link: '#00D9FF',
    },
    background: {
        default: '#1E1E1E',
        highlight: '#2D2D2D',
    },
    border: {
        default: '#444444',
        focused: '#00A8FF',
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
};

export const lightTheme = {
    text: {
        primary: '#1E1E1E',
        secondary: '#666666',
        accent: '#0066CC',
        link: '#0080FF',
    },
    background: {
        default: '#FFFFFF',
        highlight: '#F5F5F5',
    },
    border: {
        default: '#CCCCCC',
        focused: '#0066CC',
    },
    ui: {
        symbol: '#999999',
        gradient: ['#0080FF', '#6B4FBB'],
    },
    status: {
        error: '#CC0044',
        warning: '#CC8800',
        success: '#00CC66',
        info: '#0066CC',
    },
};

let currentTheme = defaultTheme;

export function setTheme(theme) {
    currentTheme = theme;
}

export function getTheme() {
    return currentTheme;
}

export const theme = new Proxy({}, {
    get(target, prop) {
        return currentTheme[prop];
    }
});
