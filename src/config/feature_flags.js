/**
 * Feature Flags Configuration
 * 기능 활성화/비활성화를 제어하는 플래그들을 관리합니다.
 */

/**
 * Anthropic 제공자 활성화 여부
 *
 * true: Anthropic(Claude) 모델을 사용자 인터페이스에 표시하고 사용 가능
 * false: Anthropic 관련 기능을 사용자 인터페이스에서 숨김 (구현은 보존됨)
 *
 * 이 플래그는 사용자가 접하는 UI, 명령어, 설정 화면 등에만 영향을 미치며,
 * 실제 API 호출 및 내부 구현 코드는 모두 보존됩니다.
 */
export const ENABLE_ANTHROPIC_PROVIDER = false;

/**
 * 에러 메시지 상세도 설정
 *
 * 'concise': 간결한 에러 메시지만 표시 (기본값)
 * 'verbose': 상세한 에러 정보 표시 (코드, 스택 트레이스, 전체 에러 객체 등)
 */
export const ERROR_VERBOSITY = 'concise';

export default {
  ENABLE_ANTHROPIC_PROVIDER,
  ERROR_VERBOSITY
};
