/**
 * BlankLine - Explicit blank line component
 *
 * ## 설계 철학
 *
 * 이 컴포넌트는 UI 히스토리 아이템 사이의 빈 줄을 명시적으로 표현합니다.
 *
 * ### 기존 방식의 문제점 (marginBottom 사용)
 * 1. **불변성 문제**: Static 컴포넌트는 한 번 렌더링되면 다시 렌더링되지 않음
 *    - user 입력이 추가될 때는 다음 요소(tool_start)가 아직 없어서 nextItem=null
 *    - 나중에 tool_start가 추가되어도 이미 렌더링된 user는 업데이트되지 않음
 *    - 결과: user의 marginBottom이 영원히 잘못된 값으로 고정됨
 *
 * 2. **복잡한 조건 로직**: 각 요소가 "다음 요소가 무엇인지"에 따라 margin을 결정
 *    - 예측하기 어렵고 디버깅이 어려움
 *    - 코드 유지보수 시 실수하기 쉬움
 *
 * ### 새로운 방식 (BlankLine 컴포넌트)
 * 1. **명시성**: 빈 줄이 필요한 곳에 명시적으로 BlankLine 컴포넌트 추가
 * 2. **독립성**: 각 히스토리 아이템은 margin=0으로 독립적으로 렌더링
 * 3. **불변성 호환**: Static의 불변 특성과 충돌하지 않음
 *    - user와 BlankLine이 함께 추가됨
 *    - 나중에 tool_start가 추가되어도 user는 영향받지 않음
 * 4. **디버깅 용이**: 로그에서 "BlankLine added after user input" 같은 메시지로 추적
 *
 * ## 간격 규칙 (shouldAddBlankLineAfter 함수 참조)
 *
 * 빈 줄이 추가되는 경우:
 * - user 입력 뒤: 항상
 * - assistant 응답 뒤: 항상
 * - tool_result 뒤: 항상
 * - tool_start 뒤: 다음이 tool_result가 아닐 때만
 * - code_execution 뒤: 다음이 code_result가 아닐 때만
 * - code_result 뒤: 항상
 * - system, error 등 기타 뒤: 항상
 *
 * ## Props
 * @param {string} reason - 빈 줄이 추가된 이유 (예: "after user input")
 * @param {string} afterType - 이전 아이템의 타입 (예: "user", "tool_start")
 * @param {string} afterToolName - 이전 아이템이 tool일 경우 tool 이름
 * @param {string} beforeType - 다음 아이템의 타입 (없으면 null)
 */

import React from 'react';
import { Text } from 'ink';
import { createDebugLogger } from '../../util/debug_log.js';

const debugLog = createDebugLogger('ui_components.log', 'BlankLine');

export function BlankLine({ reason, afterType, afterToolName, beforeType }) {
    // 디버그 모드에서만 빈 줄 정보 로깅
    React.useEffect(() => {
        debugLog(`[BlankLine] Rendered - reason: ${reason}, after: ${afterType}${afterToolName ? `(${afterToolName})` : ''}, before: ${beforeType || 'N/A'}`);
    }, []);

    // 빈 줄은 공백 문자를 포함한 Text로 렌더링
    // Ink의 flexDirection: 'column'에서 각 컴포넌트는 한 줄씩 차지하므로
    // Text(' ')는 한 줄의 빈 줄로 렌더링됨
    return React.createElement(Text, null, '　');
}
