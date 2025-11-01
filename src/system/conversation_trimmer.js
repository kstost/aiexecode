/**
 * 대화 히스토리 trim 및 정리 유틸리티
 *
 * orchestrator와 completion_judge에서 공통으로 사용하는
 * 대화 관리 기능을 중앙집중화합니다.
 */

import { createDebugLogger } from "../util/debug_log.js";

const debugLog = createDebugLogger('conversation_trimmer.log', 'conversation_trimmer');

/**
 * 대화에서 특정 call_id와 관련된 모든 항목을 제거합니다.
 *
 * @param {Array} conversation - 대화 배열
 * @param {string} callIdToRemove - 제거할 call_id
 */
export function removeEntriesWithCallId(conversation, callIdToRemove) {
    if (!callIdToRemove || typeof callIdToRemove !== 'string') {
        return;
    }

    debugLog(`[removeEntriesWithCallId] Looking for entries with call_id: ${callIdToRemove}`);

    // 1단계: 삭제할 항목들의 인덱스를 먼저 수집 (반복 중에는 배열 수정 금지)
    const indicesToRemove = [];

    for (let i = 0; i < conversation.length; i++) {
        const entry = conversation[i];

        // call_id 속성이 있고 값이 일치하면 삭제 목록에 추가
        if (entry && entry.call_id === callIdToRemove) {
            indicesToRemove.push(i);
            debugLog(`[removeEntriesWithCallId] Marked index ${i} for removal (type: ${entry.type})`);
        }
    }

    // 2단계: 수집된 인덱스를 역순으로 삭제 (뒤에서부터 지워야 인덱스가 꼬이지 않음)
    for (let i = indicesToRemove.length - 1; i >= 0; i--) {
        const indexToRemove = indicesToRemove[i];
        conversation.splice(indexToRemove, 1);
        debugLog(`[removeEntriesWithCallId] Removed entry at index ${indexToRemove}`);
    }

    debugLog(`[removeEntriesWithCallId] Total removed: ${indicesToRemove.length} entries`);
}

/**
 * 고아(orphan) function_call_output을 제거합니다.
 *
 * 고아 output이란?
 * - function_call은 없는데 function_call_output만 남아있는 경우
 * - 예: function_call을 trim했는데 output은 뒤에 남아있는 경우
 *
 * @param {Array} conversation - 대화 배열
 */
export function cleanupOrphanOutputs(conversation) {
    debugLog(`[cleanupOrphanOutputs] Starting cleanup, conversation length: ${conversation.length}`);

    // 1단계: "어떤 function_call들이 대화에 있는가?" 파악
    const existingCallIds = new Set();

    for (const entry of conversation) {
        if (entry?.type === 'function_call' && entry.call_id) {
            existingCallIds.add(entry.call_id);
        }
    }

    debugLog(`[cleanupOrphanOutputs] Found ${existingCallIds.size} function_calls`);

    // 2단계: "고아 output 찾기" - call_id가 없거나, 대응하는 function_call이 없는 output
    const orphanIndexes = [];

    for (let i = 0; i < conversation.length; i++) {
        const entry = conversation[i];

        // output이 아니면 패스
        if (entry?.type !== 'function_call_output') {
            continue;
        }

        const outputCallId = entry.call_id;

        // call_id가 없거나, 대응하는 function_call이 없으면 고아
        const isOrphan = !outputCallId || !existingCallIds.has(outputCallId);

        if (isOrphan) {
            orphanIndexes.push(i);
            debugLog(`[cleanupOrphanOutputs] Found orphan at index ${i}, call_id: ${outputCallId}`);
        }
    }

    // 3단계: 고아들을 뒤에서부터 제거 (앞에서부터 지우면 인덱스가 밀림)
    for (let i = orphanIndexes.length - 1; i >= 0; i--) {
        const indexToRemove = orphanIndexes[i];
        conversation.splice(indexToRemove, 1);
    }

    debugLog(`[cleanupOrphanOutputs] Removed ${orphanIndexes.length} orphans. New length: ${conversation.length}`);
}

/**
 * 컨텍스트 윈도우 초과 시 대화를 줄입니다.
 * 시스템 프롬프트(인덱스 0)를 제외한 가장 오래된 항목(인덱스 1)을 제거합니다.
 *
 * @param {Array} conversation - 대화 배열
 * @returns {boolean} 제거 성공 여부
 */
export function trimConversation(conversation) {
    // 시스템 프롬프트와 최소한 하나의 항목이 필요
    if (conversation.length <= 2) {
        debugLog(`[trimConversation] Cannot trim - conversation too short (${conversation.length} entries)`);
        return false;
    }

    // 인덱스 1 (시스템 프롬프트 제외 첫 번째 항목) 선택
    const targetEntry = conversation[1];
    const targetCallId = targetEntry?.call_id;

    debugLog(`[trimConversation] Target entry at index 1: type=${targetEntry?.type}, call_id=${targetCallId}`);

    // 먼저 인덱스 1 항목 제거
    conversation.splice(1, 1);
    debugLog(`[trimConversation] Removed entry at index 1`);

    // call_id가 있으면 같은 call_id를 가진 다른 항목들도 제거
    if (targetCallId) {
        removeEntriesWithCallId(conversation, targetCallId);
    }

    debugLog(`[trimConversation] Trim completed. New conversation length: ${conversation.length}`);
    return true;
}
