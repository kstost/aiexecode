/**
 * UI Event Emitter
 *
 * session.js와 UI 간의 통신을 위한 이벤트 시스템
 */

import { EventEmitter } from 'events';

class UIEventEmitter extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // 많은 리스너를 허용
    }

    /**
     * AI 메시지 추가
     */
    addAssistantMessage(text) {
        this.emit('history:add', {
            type: 'assistant',
            text,
            timestamp: Date.now()
        });
    }

    /**
     * 시스템 메시지 추가
     */
    addSystemMessage(text) {
        this.emit('history:add', {
            type: 'system',
            text,
            timestamp: Date.now()
        });
    }

    /**
     * 에러 메시지 추가
     */
    addErrorMessage(text) {
        this.emit('history:add', {
            type: 'error',
            text,
            timestamp: Date.now()
        });
    }

    /**
     * 도구 실행 시작
     */
    startToolExecution(toolName, args) {
        this.emit('history:add', {
            type: 'tool_start',
            toolName,
            args,
            timestamp: Date.now()
        });
    }

    /**
     * 도구 실행 결과
     */
    addToolResult(toolName, result, toolInput = null) {
        this.emit('history:add', {
            type: 'tool_result',
            toolName,
            result,
            toolInput,
            timestamp: Date.now()
        });
    }

    /**
     * 코드 실행 시작
     */
    startCodeExecution(language, code) {
        this.emit('history:add', {
            type: 'code_execution',
            language,
            code,
            timestamp: Date.now()
        });
    }

    /**
     * 코드 실행 결과
     */
    addCodeResult(stdout, stderr, exitCode) {
        this.emit('history:add', {
            type: 'code_result',
            stdout,
            stderr,
            exitCode,
            timestamp: Date.now()
        });
    }

    /**
     * 반복 시작 알림
     */
    startIteration(iterationNumber) {
        this.emit('history:add', {
            type: 'iteration_start',
            iterationNumber,
            timestamp: Date.now()
        });
    }

    /**
     * 미션 완료
     */
    missionCompleted(iterations) {
        this.emit('history:add', {
            type: 'mission_completed',
            iterations,
            timestamp: Date.now()
        });
    }

    /**
     * 대화 복원 알림
     */
    conversationRestored(messageCount) {
        this.emit('history:add', {
            type: 'conversation_restored',
            messageCount,
            timestamp: Date.now()
        });
    }

    /**
     * 세션 시작
     */
    sessionStart(message = 'Processing...') {
        this.emit('session:state', {
            isRunning: true,
            message,
            timestamp: Date.now()
        });
    }

    /**
     * 세션 종료
     */
    sessionEnd() {
        this.emit('session:state', {
            isRunning: false,
            message: '',
            timestamp: Date.now()
        });
    }

    /**
     * 화면 정리
     */
    clearScreen() {
        this.emit('screen:clear', {
            timestamp: Date.now()
        });
    }

    /**
     * 메시지가 UI에 렌더링될 때까지 대기
     * @returns {Promise<void>} UI가 다음 렌더 사이클을 완료할 때 resolve되는 Promise
     */
    waitForRender() {
        return new Promise((resolve) => {
            // 이벤트 리스너가 처리되고 React가 렌더링할 시간을 보장
            // setImmediate를 사용하여 현재 이벤트 루프 사이클이 완료된 후 실행
            setImmediate(() => {
                // 한 번 더 기다려서 React의 렌더링이 완료되도록 보장
                setImmediate(resolve);
            });
        });
    }

    /**
     * 도구 승인 요청
     */
    requestToolApproval(toolName, args, mcpToolInfo = null) {
        return new Promise((resolve) => {
            this.emit('tool:approval_request', {
                toolName,
                args,
                mcpToolInfo,
                resolve,
                timestamp: Date.now()
            });
        });
    }

    /**
     * 세션 중단 요청
     */
    requestSessionInterrupt() {
        this.emit('session:interrupt', {
            timestamp: Date.now()
        });
    }

    /**
     * Reasoning Effort 변경 알림
     */
    reasoningEffortChanged(reasoningEffort) {
        this.emit('reasoning_effort:changed', {
            reasoningEffort,
            timestamp: Date.now()
        });
    }

    /**
     * MCP 서버 브라우저 표시
     */
    showMCPBrowser(servers, toolsByServer) {
        return new Promise((resolve) => {
            this.emit('mcp:browser_show', {
                servers,
                toolsByServer,
                resolve,
                timestamp: Date.now()
            });
        });
    }

    /**
     * Todo 리스트 업데이트
     */
    updateTodos(todos) {
        this.emit('todos:update', {
            todos,
            timestamp: Date.now()
        });
    }
}

// 전역 인스턴스
export const uiEvents = new UIEventEmitter();
