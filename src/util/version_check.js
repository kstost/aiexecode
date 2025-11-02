/**
 * Version check utility
 * Compares local version with remote version from GitHub
 */

import { createDebugLogger } from './debug_log.js';
import https from 'https';

const debugLog = createDebugLogger('version_check.log', 'version_check');

const REMOTE_PACKAGE_JSON_URL = 'https://raw.githubusercontent.com/kstost/aiexecode/refs/heads/main/package.json';
const TIMEOUT_MS = 5000; // 5 seconds timeout

/**
 * Fetch remote package.json from GitHub
 * @returns {Promise<Object|null>} Remote package.json object or null on error
 */
async function fetchRemotePackageJson() {
    return new Promise((resolve) => {
        const req = https.get(REMOTE_PACKAGE_JSON_URL, { timeout: TIMEOUT_MS }, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const packageJson = JSON.parse(data);
                        resolve(packageJson);
                    } catch (err) {
                        debugLog(`Failed to parse remote package.json: ${err.message}`);
                        resolve(null);
                    }
                } else {
                    debugLog(`HTTP ${res.statusCode} when fetching remote package.json`);
                    resolve(null);
                }
            });
        });

        req.on('error', (err) => {
            debugLog(`Network error when fetching remote package.json: ${err.message}`);
            resolve(null);
        });

        req.on('timeout', () => {
            debugLog('Timeout when fetching remote package.json');
            req.destroy();
            resolve(null);
        });
    });
}

/**
 * Compare two semantic versions
 * @param {string} version1 - First version (e.g., "1.0.76")
 * @param {string} version2 - Second version (e.g., "1.0.77")
 * @returns {number} -1 if version1 < version2, 0 if equal, 1 if version1 > version2
 */
function compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
        const v1 = v1parts[i] || 0;
        const v2 = v2parts[i] || 0;

        if (v1 < v2) return -1;
        if (v1 > v2) return 1;
    }

    return 0;
}

/**
 * Check for available updates
 * @param {string} currentVersion - Current local version
 * @returns {Promise<Object>} Object with { hasUpdate: boolean, remoteVersion: string|null, updateAvailable: boolean }
 */
export async function checkForUpdates(currentVersion) {
    debugLog(`Checking for updates... Current version: ${currentVersion}`);

    const remotePackageJson = await fetchRemotePackageJson();

    if (!remotePackageJson || !remotePackageJson.version) {
        debugLog('Could not fetch remote version');
        return {
            hasUpdate: false,
            remoteVersion: null,
            updateAvailable: false
        };
    }

    const remoteVersion = remotePackageJson.version;
    debugLog(`Remote version: ${remoteVersion}`);

    const comparison = compareVersions(currentVersion, remoteVersion);

    if (comparison < 0) {
        debugLog(`Update available: ${currentVersion} → ${remoteVersion}`);
        return {
            hasUpdate: true,
            remoteVersion,
            updateAvailable: true
        };
    } else {
        debugLog('No update available (local version is up to date or newer)');
        return {
            hasUpdate: false,
            remoteVersion,
            updateAvailable: false
        };
    }
}
