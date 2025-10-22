// 문자열 및 텍스트 포맷팅 유틸리티

/**
 * 텍스트 줄에 들여쓰기 추가
 * @param {string} content - 원본 내용
 * @param {number} indentLevel - 들여쓰기 레벨 (기본값: 0)
 * @returns {string} 들여쓰기가 적용된 내용
 */
export function indentLines(content, indentLevel = 0) {
    return content.split('\n').map(line => '   '.repeat(indentLevel) + line).join('\n');
}

/**
 * JSON 객체를 XML 형식으로 변환
 * @param {Object|string} json - 변환할 JSON 객체
 * @param {number} indentLevel - 들여쓰기 레벨 (기본값: 0)
 * @returns {string} XML 형식 문자열
 */
export function tagify(json, indentLevel = 0) {
    if (!json) return '';

    if (typeof json === 'string') {
        return indentLines(json, indentLevel);
    }

    if (json.tagname) {
        let openTag = `<${json.tagname}`;

        if (json.attr && typeof json.attr === 'object') {
            for (const [key, value] of Object.entries(json.attr)) {
                openTag += ` ${key}="${value}"`;
            }
        }

        openTag += '>';
        const closeTag = `</${json.tagname}>`;

        let result = indentLines(openTag, indentLevel) + '\n';

        if (json.children && Array.isArray(json.children)) {
            for (const child of json.children) {
                result += tagify(child, indentLevel + 1) + '\n';
            }
        }

        result += indentLines(closeTag, indentLevel);
        return result;
    }

    if (json.content) {
        return indentLines(json.content, indentLevel);
    }

    return '';
}

/**
 * 문자열을 안전한 펜스 코드 블록으로 감싸는 함수
 * @param {string} content - 감쌀 내용
 * @param {string} fencedName - 코드 블록 언어 이름
 * @returns {string} 펜스 코드 블록으로 감싼 문자열
 */
export function wrapWithSafeFence(content, fencedName) {
    // 내용 내의 최대 연속 백틱 개수 찾기
    let maxConsecutiveTicks = 0;
    let currentTicks = 0;

    for (let i = 0; i < content.length; i++) {
        if (content[i] === '`') {
            currentTicks++;
        } else {
            if (currentTicks > maxConsecutiveTicks) {
                maxConsecutiveTicks = currentTicks;
            }
            currentTicks = 0;
        }
    }
    // 마지막 연속 백틱도 확인
    if (currentTicks > maxConsecutiveTicks) {
        maxConsecutiveTicks = currentTicks;
    }

    // 기존 최대값보다 1개 더 많은 백틱으로 감싸기 (최소 3개)
    const fenceLength = Math.max(3, maxConsecutiveTicks + 1);
    const fence = '`'.repeat(fenceLength);
    return `${fence}\n${fencedName}\n${indentLines(content, 1)}\n${fence}`;
}

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
