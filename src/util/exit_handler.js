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

    // UI 인스턴스 정리
    if (uiInstance) {
        uiInstance.unmount();
    }

    process.exit(0);
}
