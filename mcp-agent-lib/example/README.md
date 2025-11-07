# MCP Agent Client - 예제 모음

이 디렉토리는 MCP Agent Client 라이브러리의 사용법을 보여주는 예제 코드들을 포함하고 있습니다.

## 📚 예제 목록

### 1️⃣ 기본 사용법 (`01-basic-usage.js`)
MCP Agent Client의 가장 기본적인 사용 방법을 배웁니다.
- 클라이언트 생성 및 초기화
- 서버 연결
- 도구 목록 조회 및 실행
- 상태 확인
- 연결 해제

```bash
node 01-basic-usage.js
```

**핵심 개념:**
- `new MCPAgentClient(options)` - 클라이언트 생성
- `client.initialize(config)` - 서버 연결
- `client.getAvailableTools()` - 도구 목록 조회
- `client.executeTool(name, args)` - 도구 실행
- `client.disconnect()` - 연결 해제

---

### 2️⃣ 빠른 시작 (`02-quick-start.js`)
가장 간단하게 시작하는 방법을 보여줍니다.
- `quickStart()` 함수로 한 줄에 초기화

```bash
node 02-quick-start.js
```

**핵심 개념:**
- `quickStart(config, options)` - 원스텝 초기화

---

### 3️⃣ HTTP 서버 연결 (`03-http-server.js`)
로컬 stdio 서버가 아닌 원격 HTTP/HTTPS 서버에 연결하는 방법입니다.
- HTTP/HTTPS 서버 연결
- Bearer 토큰 인증
- 헤더 설정

```bash
node 03-http-server.js
```

**핵심 개념:**
- `type: 'http'` - HTTP 전송 방식
- `headers` - 인증 헤더 설정
- 서버별 도구 조회

---

### 4️⃣ 다중 서버 연결 (`04-multiple-servers.js`)
여러 MCP 서버를 동시에 사용하는 방법입니다.
- 여러 서버 동시 연결 (stdio, HTTP, SSE)
- 서버별 도구 분류
- 자동 서버 검색으로 도구 실행
- 리소스 및 프롬프트 조회

```bash
node 04-multiple-servers.js
```

**핵심 개념:**
- `mcpServers` 객체에 여러 서버 정의
- `getServerTools(serverName)` - 특정 서버 도구만 조회
- `callTool(serverName, toolName, args)` - 서버 지정 실행
- `executeTool(toolName, args)` - 자동 서버 검색

---

### 5️⃣ 에러 처리 및 재시도 (`05-error-handling.js`)
강력한 에러 처리와 자동 재시도 메커니즘을 활용합니다.
- 자동 재시도 설정
- 타임아웃 처리
- 이벤트 기반 에러 모니터링
- 서버 연결 상태 추적

```bash
node 05-error-handling.js
```

**핵심 개념:**
- `timeout`, `retries` 옵션
- `client.on('serverError')` - 에러 이벤트
- `client.on('serverDisconnected')` - 연결 해제 이벤트
- `client.on('serverStatusChange')` - 상태 변경 이벤트
- 호출별 커스텀 타임아웃/재시도

---

### 6️⃣ 리소스와 프롬프트 (`06-resources-and-prompts.js`)
도구 외에도 리소스(Resources)와 프롬프트(Prompts)를 사용하는 방법입니다.
- 리소스 목록 조회 및 읽기
- 프롬프트 목록 조회 및 실행
- URI 기반 리소스 접근

```bash
node 06-resources-and-prompts.js
```

**핵심 개념:**
- `getAvailableResources()` - 리소스 목록
- `readResource(uri)` - 리소스 읽기
- `getAvailablePrompts()` - 프롬프트 목록
- `executePrompt(name, args)` - 프롬프트 실행

---

### 7️⃣ 고급 설정 (`07-advanced-configuration.js`)
모든 설정 옵션과 고급 기능을 다룹니다.
- 전체 설정 옵션 상세 설명
- 환경변수를 통한 설정
- 보안 강화 설정
- 커스텀 로깅
- 메모리 관리
- 안전한 JSON 처리

```bash
node 07-advanced-configuration.js
```

**핵심 개념:**
- 모든 `MCPAgentClient` 옵션
- 환경변수 (`MCP_*`)
- `secureLog()` - 보안 로깅
- `safeJsonStringify()`, `safeJsonParse()` - 안전한 JSON
- `performMemoryCleanup()` - 메모리 정리
- `getServerCapabilities()` - 서버 기능 조회

---

### 8️⃣ 실전 예제: AI 챗봇 (`08-real-world-chatbot.js`)
MCP Agent Client를 활용한 실제 AI 챗봇 구현 예제입니다.
- 대화형 인터페이스
- 의도 파싱 (Intent Recognition)
- 파일 시스템, GitHub, 메모리 등 다양한 도구 통합
- 대화 히스토리 관리

```bash
node 08-real-world-chatbot.js
```

**핵심 개념:**
- 실전 애플리케이션 구조
- 여러 MCP 서버 통합
- 사용자 의도에 따른 도구 선택
- 에러 처리 및 사용자 피드백

---

## 🚀 시작하기

### 1. 의존성 설치

```bash
cd ..
npm install
```

### 2. 예제 실행

각 예제는 독립적으로 실행할 수 있습니다:

```bash
node example/01-basic-usage.js
node example/02-quick-start.js
# ... 등등
```

### 3. 실제 MCP 서버 연결

예제를 실제로 작동시키려면 MCP 서버가 필요합니다. 다음 중 하나를 사용할 수 있습니다:

**공식 MCP 서버들:**

```bash
# 파일 시스템 서버
npx -y @modelcontextprotocol/server-filesystem /tmp

# GitHub 서버
npx -y @modelcontextprotocol/server-github

# 메모리/메모장 서버
npx -y @modelcontextprotocol/server-memory
```

**설정 예시:**

```javascript
{
  mcpServers: {
    'filesystem': {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
    }
  }
}
```

---

## 📖 학습 순서 추천

1. **초보자:**
   - `02-quick-start.js` - 가장 빠르게 시작
   - `01-basic-usage.js` - 기본 개념 이해
   - `03-http-server.js` - HTTP 서버 연결

2. **중급자:**
   - `04-multiple-servers.js` - 다중 서버 활용
   - `05-error-handling.js` - 안정적인 애플리케이션
   - `06-resources-and-prompts.js` - 전체 기능 활용

3. **고급자:**
   - `07-advanced-configuration.js` - 모든 설정 마스터
   - `08-real-world-chatbot.js` - 실전 애플리케이션

---

## 🔧 주요 API 요약

### 클라이언트 생성
```javascript
import { MCPAgentClient, quickStart } from '../index.js';

// 방법 1: 수동 생성
const client = new MCPAgentClient(options);
await client.initialize(config);

// 방법 2: 빠른 시작
const client = await quickStart(config, options);
```

### 도구(Tools) 사용
```javascript
// 전체 도구 목록
const tools = client.getAvailableTools();

// 서버별 도구 목록
const tools = client.getServerTools('serverName');

// 도구 실행 (자동 서버 검색)
const result = await client.executeTool('toolName', { arg: 'value' });

// 도구 실행 (서버 지정)
const result = await client.callTool('serverName', 'toolName', { arg: 'value' });
```

### 리소스(Resources) 사용
```javascript
// 리소스 목록
const resources = client.getAvailableResources();

// 리소스 읽기
const content = await client.readResource('uri://resource');
const content = await client.readResourceFromServer('serverName', 'uri://resource');
```

### 프롬프트(Prompts) 사용
```javascript
// 프롬프트 목록
const prompts = client.getAvailablePrompts();

// 프롬프트 실행
const result = await client.executePrompt('promptName', { arg: 'value' });
const result = await client.getPrompt('serverName', 'promptName', { arg: 'value' });
```

### 상태 관리
```javascript
// 전체 상태
const status = client.getStatus();

// 서버 기능
const caps = client.getServerCapabilities('serverName');

// 연결 해제
await client.disconnect();
await client.cleanup(); // 메모리 정리 포함
```

### 이벤트 리스닝
```javascript
client.on('serverError', (serverName, error) => { ... });
client.on('serverDisconnected', (serverName) => { ... });
client.on('serverStatusChange', ({ serverName, status }) => { ... });
```

---

## 🛡️ 보안 고려사항

MCP Agent Client는 다음 보안 기능을 내장하고 있습니다:

- ✅ **명령어 화이트리스트**: `allowedCommands`로 실행 가능한 명령어 제한
- ✅ **인자 검증**: 위험한 셸 문자 자동 차단
- ✅ **Prototype Pollution 방지**: JSON 파싱 시 자동 검사
- ✅ **민감 정보 보호**: 로그에서 자동으로 토큰/비밀번호 제거
- ✅ **응답 크기 제한**: DoS 공격 방지

자세한 내용은 `07-advanced-configuration.js`를 참고하세요.

---

## 🐛 문제 해결

### 서버 연결 실패
```
❌ Failed to connect to server
```
→ 서버 명령어와 경로를 확인하세요. `allowedCommands`에 등록되어 있는지 확인하세요.

### 도구를 찾을 수 없음
```
도구 'xxx'을 제공하는 서버를 찾을 수 없습니다
```
→ `client.getAvailableTools()`로 사용 가능한 도구를 먼저 확인하세요.

### 타임아웃 발생
```
Server readiness timeout
```
→ `timeout`, `serverReadyTimeout` 옵션을 늘려보세요.

---

## 📝 라이선스

이 예제들은 메인 프로젝트와 동일한 라이선스를 따릅니다.

---

## 🤝 기여하기

더 나은 예제나 사용 사례가 있다면 PR을 보내주세요!

---

**Happy Coding! 🚀**
