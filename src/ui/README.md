# UI System Documentation

이 디렉토리는 Ink 기반의 터미널 UI 시스템을 포함합니다.

## 구조

```
ui/
├── App.js                      # 메인 앱 진입점 (Context 제공)
├── index.js                    # UI 렌더링 진입점
├── api.js                      # UI 상태 업데이트 API
├── example-usage.js            # API 사용 예제
├── contexts/                   # React Context 시스템
│   ├── AppContext.js          # 전역 앱 상태
│   ├── UIStateContext.js      # UI 상태 관리
│   └── StreamingContext.js    # 스트리밍 상태
├── layouts/                    # 레이아웃 컴포넌트
│   └── DefaultAppLayout.js    # 기본 레이아웃
├── components/                 # UI 컴포넌트
│   ├── Header.js              # 헤더 (로고)
│   ├── Footer.js              # 푸터 (상태 정보)
│   ├── MainContent.js         # 메인 컨텐츠 (Static + Dynamic)
│   ├── HistoryDisplay.js      # 히스토리 표시 (이전 버전)
│   ├── HistoryItemDisplay.js  # 개별 히스토리 아이템
│   ├── InputPrompt.js         # 입력 프롬프트
│   ├── Composer.js            # 입력 영역 + 로딩 표시
│   ├── Notifications.js       # 알림/경고 표시
│   ├── LoadingIndicator.js    # 로딩 인디케이터
│   ├── StreamingIndicator.js  # 스트리밍 애니메이션
│   ├── AgenticProgressDisplay.js  # 에이전틱 작업 진행 표시
│   └── SuggestionsDisplay.js  # 자동완성 제안
├── hooks/                      # Custom hooks
│   ├── useKeypress.js         # 키보드 이벤트
│   └── useCompletion.js       # 자동완성
├── themes/                     # 테마 시스템
│   └── semantic-tokens.js     # 색상 토큰
└── utils/                      # 유틸리티
    └── text-buffer.js         # 텍스트 버퍼 (멀티라인)
```

## 아키텍처

### Context 시스템

**AppContext**: 전역 애플리케이션 상태
- version, model, buffer, commands, callbacks

**UIStateContext**: UI 상태 관리
- history, pendingHistoryItems
- streamingState, operations
- layout dimensions (mainAreaWidth, terminalHeight)

**StreamingContext**: 실시간 스트리밍 상태 전달

### 레이아웃 구조

```
┌──────────────────────────────────┐
│ MainContent (Static + Dynamic)   │
│  ├─ Header (Static)              │
│  ├─ History (Static)             │
│  └─ Pending Items (Dynamic)      │
├──────────────────────────────────┤
│ Notifications                    │
├──────────────────────────────────┤
│ Composer                         │
│  ├─ LoadingIndicator             │
│  ├─ AgenticProgressDisplay       │
│  └─ InputPrompt                  │
├──────────────────────────────────┤
│ Footer                           │
└──────────────────────────────────┘
```

### StreamingState

```javascript
StreamingState = {
    Idle: 'idle',                    // 대기 중
    Responding: 'responding',        // AI 응답 중
    WaitingForConfirmation: 'waiting_for_confirmation',
    Executing: 'executing',          // 작업 실행 중
    Completed: 'completed',          // 완료
    Error: 'error'                   // 에러
}
```

## UI API 사용법

### 기본 사용

```javascript
import {
    StreamingState,
    setStreamingState,
    setThought,
    addHistoryMessage
} from './ui/api.js';

// AI가 생각 중일 때
setStreamingState(StreamingState.Responding);
setThought('코드 구조를 분석하고 있습니다...');

// 완료 후 메시지 추가
setStreamingState(StreamingState.Completed);
addHistoryMessage({
    type: 'assistant',
    text: '분석이 완료되었습니다!'
});
```

### 작업 진행 표시

```javascript
import { startOperation, updateOperation, completeOperation } from './ui/api.js';

// 작업 시작
const opId = startOperation({
    type: 'reading',        // thinking, analyzing, reading, writing, editing, executing, etc.
    name: '파일 읽기',
    description: 'src/ 디렉토리 분석 중'
});

// 진행 상황 업데이트
updateOperation(opId, {
    progress: 50,
    detail: 'components/ 처리 중...'
});

// 작업 완료
completeOperation(opId);
```

### 자동 작업 관리

```javascript
import { runOperation } from './ui/api.js';

await runOperation({
    type: 'building',
    name: '프로젝트 빌드',
    description: 'npm run build'
}, async (update) => {
    update({ progress: 25, detail: 'TypeScript 컴파일 중...' });
    await buildStep1();

    update({ progress: 75, detail: '번들링 중...' });
    await buildStep2();

    update({ progress: 100, detail: '완료!' });
});
```

### 배치 업데이트

```javascript
import { batchUpdate } from './ui/api.js';

batchUpdate({
    streamingState: StreamingState.Executing,
    thought: '최선의 접근 방법을 고민 중...',
    progressMessage: '요구사항 분석 중',
    addHistory: {
        type: 'system',
        text: '분석 시작...'
    }
});
```

## 작업 타입 (operation types)

| Type | Icon | Description |
|------|------|-------------|
| `thinking` | 🤔 | 생각/추론 중 |
| `analyzing` | 🔍 | 분석 중 |
| `reading` | 📖 | 파일 읽기 |
| `writing` | ✏️ | 파일 쓰기 |
| `editing` | 📝 | 파일 편집 |
| `executing` | ⚙️ | 명령 실행 |
| `building` | 🔨 | 빌드 |
| `testing` | 🧪 | 테스트 |
| `debugging` | 🐛 | 디버깅 |
| `searching` | 🔎 | 검색 |
| `planning` | 📋 | 계획 수립 |

## 메시지 타입

| Type | Icon | Color | Usage |
|------|------|-------|-------|
| `user` | `>` | Accent | 사용자 입력 |
| `assistant` | `◆` | Info | AI 응답 |
| `system` | `ℹ` | Secondary | 시스템 메시지 |
| `error` | `✗` | Error | 에러 메시지 |
| `tool` | `⚙` | Success | 도구 실행 결과 |
| `thinking` | `💭` | Link | AI 사고 과정 |

## 애니메이션

### Spinner
- 속도: 80ms per frame
- 프레임: `['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']`

### Dots
- 속도: 400ms per frame
- 프레임: `['.  ', '.. ', '...', '   ']`

## 성능 최적화

1. **Static 컴포넌트**: 불변 히스토리는 Static으로 렌더링하여 리렌더링 방지
2. **Dynamic 영역**: 진행 중인 작업만 동적으로 업데이트
3. **조건부 렌더링**: 필요한 컴포넌트만 표시

## 예제

자세한 사용 예제는 `example-usage.js` 파일을 참고하세요.
