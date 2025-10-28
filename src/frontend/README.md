# UI System Documentation

이 디렉토리는 Ink 기반의 터미널 UI 시스템을 포함합니다.

## 구조

```
ui/
├── App.js                      # 메인 앱 진입점
├── index.js                    # UI 렌더링 진입점
├── components/                 # UI 컴포넌트
│   ├── Header.js              # 헤더 (로고)
│   ├── Footer.js              # 푸터 (상태 정보)
│   ├── ConversationItem.js    # 개별 대화 아이템
│   ├── Input.js               # 입력 컴포넌트
│   ├── SessionSpinner.js      # 세션 처리 스피너
│   ├── AutocompleteMenu.js    # 자동완성 메뉴
│   ├── BlankLine.js           # 빈 줄 컴포넌트
│   ├── FileDiffViewer.js      # 파일 diff 뷰어
│   ├── ToolApprovalPrompt.js  # 도구 승인 프롬프트
│   ├── SetupWizard.js         # 초기 설정 마법사
│   ├── HelpView.js            # 도움말 뷰
│   ├── CurrentModelView.js    # 현재 모델 뷰
│   ├── ModelListView.js       # 모델 목록 뷰
│   └── ModelUpdatedView.js    # 모델 변경 확인 뷰
├── hooks/                      # Custom hooks
│   ├── useKeypress.js         # 키보드 이벤트
│   └── useCompletion.js       # 자동완성
├── design/                     # 디자인 시스템
│   └── themeColors.js         # 테마 색상
└── utils/                      # 유틸리티
    ├── inputBuffer.js         # 입력 버퍼 (멀티라인)
    ├── outputRedirector.js    # 출력 리다이렉터
    ├── syntaxHighlighter.js   # 문법 하이라이터
    ├── markdownParser.js      # 마크다운 파서
    ├── diffUtils.js           # Diff 유틸리티
    └── renderInkComponent.js  # Ink 컴포넌트 렌더러
```

## 아키텍처

### 레이아웃 구조

```
┌──────────────────────────────────┐
│ App (Main Layout)                │
│  ├─ Header (Static)              │
│  ├─ History (Static)             │
│  ├─ SessionSpinner (Dynamic)     │
│  ├─ Input                        │
│  └─ Footer                       │
└──────────────────────────────────┘
```

## UI 상태 관리

UI 상태는 `uiEvents` 모듈을 통해 관리됩니다. 자세한 내용은 `src/system/ui_events.js`를 참조하세요.


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

### SessionSpinner
- ink-spinner 라이브러리 사용
- 경과 시간 표시 (초/분)

## 성능 최적화

1. **Static 컴포넌트**: 불변 히스토리는 Static으로 렌더링하여 리렌더링 방지
2. **Dynamic 영역**: 진행 중인 작업만 동적으로 업데이트
3. **조건부 렌더링**: 필요한 컴포넌트만 표시
