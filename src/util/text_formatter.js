// 문자열 및 텍스트 포맷팅 유틸리티

/**
 * 긴 텍스트를 제한하고 생략 표시를 추가하는 함수
 * @param {string} text - 원본 텍스트
 * @param {number} maxLength - 최대 길이 (기본값: 500000000)
 * @param {string} omitMessage - 생략 메시지
 * @returns {string} 제한된 길이의 텍스트
 */
export function truncateWithOmit(text, maxLength = 500000000, omitMessage = "\n\n... (omitting long output) ...\n\n") {
    if (!text || typeof text !== 'string') return text;

    // JSON 파싱 시도 - 유효한 JSON이면 그대로 반환
    try {
        JSON.parse(text);
        return text;
    } catch (e) {
        // JSON이 아니면 계속 진행
    }

    if (text.length <= maxLength) return text;

    // 앞부분과 뒷부분을 보여주기 위해 길이를 나누기
    const omitMsgLength = omitMessage.length;
    const availableLength = maxLength - omitMsgLength;
    const frontLength = Math.floor(availableLength * 0.7); // 앞부분 70%
    const backLength = availableLength - frontLength; // 뒷부분 30%

    const frontPart = text.substring(0, frontLength);
    const backPart = text.substring(text.length - backLength);

    return frontPart + omitMessage + backPart;
}
