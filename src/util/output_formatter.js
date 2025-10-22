// 도구 실행 결과를 사람이 읽기 쉬운 형태로 포맷팅하는 유틸리티 함수들
import fs from 'fs';

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
 * 응답 메시지 포맷팅
 * @param {Object} result - 응답 메시지 결과
 * @returns {string} 포맷된 메시지
 */
export function formatResponseMessageStdout(result) {
    return result.message || '';
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
 * 특정 줄 읽기 결과 포맷팅
 * @param {Object} result - 파일 줄 읽기 실행 결과
 * @returns {string} 줄 번호와 내용
 */
export function formatReadFileLinesStdout(result) {
    let stdout = '';
    if (result.file_lines) {
        result.file_lines.map((line) => {
            stdout += `${line.line_number}|${line.line_content}\n`;
        });
    }
    return stdout;
}

/**
 * 디렉토리 목록을 DIR/FILE 형식으로 표시
 * @param {Object} result - 디렉토리 목록 실행 결과
 * @returns {string} 포맷된 디렉토리 목록
 */
export function formatListDirectoryStdout(result) {
    let stdout = '';
    if (result.directory_contents) {
        result.directory_contents.forEach((item) => {
            const typeLabel = item.is_directory ? 'DIR' : 'FILE';
            const size = item.is_directory ? '' : ` (${item.size_bytes} bytes)`;
            stdout += `${typeLabel}: ${item.name}${size}\n`;
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
        case 'response_message':
            return formatResponseMessageStdout(result);
        case 'read_file':
            return formatReadFileStdout(result);
        case 'read_file_lines':
            return formatReadFileLinesStdout(result);
        case 'list_directory':
            return formatListDirectoryStdout(result);
        default:
            return JSON.stringify(result, null, 2);
    }
}
