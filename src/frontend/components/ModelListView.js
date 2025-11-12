/**
 * Model List View Component - Ink-based UI for displaying available models
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../design/themeColors.js';

export function ModelListView({ modelsByProvider }) {
    const sections = [
        React.createElement(Text, {
            key: 'header',
            bold: true,
            color: 'whiteBright'
        }, 'Available AI Models'),

        React.createElement(Text, { key: 'spacer1' }, null)
    ];

    // 모든 모델을 하나의 리스트로 통합
    const allModels = [];
    Object.keys(modelsByProvider).forEach(provider => {
        const models = modelsByProvider[provider];
        models.forEach(model => {
            allModels.push(model);
        });
    });

    // 모델 리스트 추가
    allModels.forEach((model, index) => {
        sections.push(
            React.createElement(Text, {
                key: model.id,
                color: 'white'
            }, `  • ${model.id}`)
        );
    });

    sections.push(
        React.createElement(Text, { key: 'spacer2' }, null),
        React.createElement(Text, { key: 'usage', bold: true }, 'Usage:'),
        React.createElement(Text, { key: 'usage-cmd' }, '  /model <model-id>'),
        React.createElement(Text, { key: 'usage-example', dimColor: true }, '  Example: /model gpt-5')
    );

    return React.createElement(Box, {
        flexDirection: 'column'
    }, ...sections);
}
