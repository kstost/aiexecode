/**
 * Debug Configuration
 * 디버깅 관련 설정을 관리합니다.
 *
 * 디버그 로그는 실행 모드에 따라 자동으로 활성화됩니다:
 * - 개발 모드 (node index.js): 로그 기록
 * - 프로덕션 모드 (aiexecode 명령): 로그 비활성화
 *
 * process.env.IS_DEVELOPMENT로 자동 감지됩니다. (index.js에서 설정)
 */
