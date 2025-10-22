/**
 * Utility to render Ink components and return output as string
 */

import React from 'react';
import { render } from 'ink';
import { PassThrough } from 'stream';

export function renderInkComponent(component) {
    return new Promise((resolve) => {
        let output = '';

        // PassThrough stream을 사용하여 Ink의 stdout 요구사항 충족
        const stream = new PassThrough();
        stream.on('data', (chunk) => {
            output += chunk.toString();
        });

        const instance = render(component, {
            stdout: stream,
            exitOnCtrlC: false,
            patchConsole: false
        });

        // Ink 컴포넌트가 렌더링된 후 unmount하고 결과 반환
        setImmediate(() => {
            instance.unmount();
            // 약간의 지연을 주어 모든 데이터가 stream에 기록되도록 함
            setTimeout(() => {
                resolve(output);
            }, 50);
        });
    });
}
