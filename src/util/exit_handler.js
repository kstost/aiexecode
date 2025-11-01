import { uiEvents } from '../system/ui_events.js';

/**
 * Unified exit handler for the application
 * Handles cleanup and graceful shutdown
 */
export async function performExit(options = {}) {
    const {
        mcpIntegration = null,
        uiInstance = null,
        showMessages = true
    } = options;

    // 종료 시작 메시지
    if (showMessages) {
        const sessionID = process.app_custom?.sessionID || 'unknown';
        uiEvents.addSystemMessage(`Goodbye! Session ID: ${sessionID}`);
    }

    // MCP Integration 정리
    if (mcpIntegration) {
        await mcpIntegration.cleanup();
    }

    // UI가 메시지를 렌더링할 때까지 대기
    if (showMessages) {
        await uiEvents.waitForRender();
    }

    // UI 인스턴스 정리 전에 터미널 상태 복구
    // 이렇게 하면 React cleanup이 실행되지 않아도 터미널 상태가 복구됨
    if (process.stdout && process.stdout.write) {
        // 커서 표시 복구 (App.js:447과 동일)
        process.stdout.write('\x1B[?25h');
        // Line wrapping 복구 (index.js:54와 동일)
        process.stdout.write('\x1b[?7h');
    }

    // UI 인스턴스 정리
    if (uiInstance) {
        uiInstance.unmount();
    }

    process.exit(0);
}
