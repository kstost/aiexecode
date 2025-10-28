/**
 * Path Helper - 경로 관련 유틸리티 함수
 */

import { relative } from 'path';

/**
 * 절대경로를 현재 작업 디렉토리 기준 상대경로로 변환
 * UI 표시용으로만 사용 (내부 로직에서는 항상 절대경로 사용)
 * 
 * @param {string} absolutePath - 절대경로
 * @returns {string} 상대경로
 */
export function toDisplayPath(absolutePath) {
    if (!absolutePath) return '';
    
    const cwd = process.cwd();
    const relativePath = relative(cwd, absolutePath);
    
    // 상위 디렉토리로 가는 경우나 절대경로가 더 짧으면 절대경로 반환
    if (relativePath.startsWith('..') || relativePath.length >= absolutePath.length) {
        return absolutePath;
    }
    
    return relativePath;
}

