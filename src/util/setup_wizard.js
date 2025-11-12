// 초기 설정 마법사 - 사용자에게 API 키 및 모델 설정을 안내합니다.
import React from 'react';
import { render } from 'ink';
import { SetupWizard } from '../frontend/components/SetupWizard.js';
import { loadSettings, saveSettings, SETTINGS_FILE } from './config.js';
import chalk from 'chalk';

/**
 * 초기 설정 마법사를 실행합니다 (Ink UI 버전).
 * @returns {Promise<boolean>} 설정 완료 여부
 */
export async function runSetupWizard() {
    // 화면 클리어하고 시작
    console.clear();

    return new Promise((resolve) => {
        let result = false;

        const handleComplete = async (settings) => {
            // 설정 저장
            await saveSettings(settings);

            result = true;
            instance.unmount();

            // 화면 클리어
            console.clear();
        };

        const handleCancel = () => {
            result = false;
            instance.unmount();

            // 화면 클리어
            console.clear();
        };

        const instance = render(
            React.createElement(SetupWizard, {
                onComplete: handleComplete,
                onCancel: handleCancel
            }),
            {
                exitOnCtrlC: false,
                debug: false
            }
        );

        instance.waitUntilExit().then(() => {
            resolve(result);
        });
    });
}

/**
 * 설정이 완료되었는지 확인합니다.
 * @returns {Promise<boolean>} 설정 완료 여부
 */
export async function isConfigured() {
    const settings = await loadSettings();
    return Boolean(settings.API_KEY && settings.API_KEY.trim());
}
