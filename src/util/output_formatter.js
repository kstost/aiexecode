// 도구 실행 결과를 사람이 읽기 쉬운 형태로 포맷팅하는 유틸리티 함수들
// fs module is imported but not used in this file

/**
 * 텍스트를 안전한 문자열로 변환
 * @param {any} text - 변환할 텍스트
 * @returns {string} 안전한 문자열
 */
export function clampOutput(text) {
    if (typeof text !== 'string') {
        if (text === null || text === undefined) {
            return '';
        }
        try {
            return String(text);
        } catch {
            return '';
        }
    }
    return text;
}

/**
 * 파일 읽기 결과에 줄 번호 추가
 * @param {Object} result - 파일 읽기 실행 결과
 * @returns {string} 줄 번호가 포함된 파일 내용
 */
export function formatReadFileStdout(result) {
    let stdout = '';
    if (result.file_lines) {
        result.file_lines.map((line, line_number) => {
            stdout += `${line_number + 1}|${line}\n`;
        });
    }
    return stdout;
}

/**
 * operation 타입별로 적절한 포맷터 선택
 * @param {string} operation - 도구 작업 타입
 * @param {Object} result - 도구 실행 결과
 * @returns {string} 포맷된 출력
 */
export function formatToolStdout(operation, result) {
    switch (operation) {
        case 'read_file':
            return formatReadFileStdout(result);
        default:
            return JSON.stringify(result, null, 2);
    }
}
