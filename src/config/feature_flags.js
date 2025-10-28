/**
 * Feature Flags Configuration
 * 기능 활성화/비활성화를 제어하는 플래그들을 관리합니다.
 */

/**
 * 에러 메시지 상세도 설정
 *
 * 'concise': 간결한 에러 메시지만 표시 (기본값)
 * 'verbose': 상세한 에러 정보 표시 (코드, 스택 트레이스, 전체 에러 객체 등)
 */
export const ERROR_VERBOSITY = 'concise';

export default {
  ERROR_VERBOSITY
};
