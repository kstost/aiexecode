/**
 * Output Helper - UI 이벤트 발생
 */

import { uiEvents } from './ui_events.js';

export function logSystem(message) {
    uiEvents.addSystemMessage(message);
}

export function logError(message) {
    uiEvents.addErrorMessage(message);
}

export function logAssistantMessage(message) {
    uiEvents.addAssistantMessage(message);
}

export function logToolCall(toolName, args) {
    uiEvents.startToolExecution(toolName, args);
}

export function logToolResult(toolName, stdout, originalResult = null, toolInput = null, fileSnapshot = null) {
    uiEvents.addToolResult(toolName, { stdout, originalResult, fileSnapshot }, toolInput);
}

export function logCodeExecution(language, code) {
    uiEvents.startCodeExecution(language, code);
}

export function logCodeResult(stdout, stderr, exitCode) {
    uiEvents.addCodeResult(stdout, stderr, exitCode);
}

export function logIteration(iterationNumber) {
    // Suppressed: iteration messages not shown to user
    // uiEvents.startIteration(iterationNumber);
}

export function logMissionComplete() {
    uiEvents.missionCompleted(0);
}

export function logConversationRestored(count) {
    uiEvents.conversationRestored(count);
}
