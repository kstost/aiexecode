#!/usr/bin/env node

/**
 * MCP 사용 예시 프로그램
 *
 * MCP를 사용하는 방법을 보여줍니다:
 * 1. MCP 서버 설정 불러오기
 * 2. MCP Agent 만들고 초기화하기
 * 3. 연결된 서버들로부터 사용 가능한 도구 목록 가져오기
 * 4. 도구 실행하고 결과 처리하기
 * 5. 종료할 때 연결 정리하기
 *
 * ============================================
 * MCP Agent 주요 메소드 설명
 * ============================================
 *
 * 1. mcpAgent.initialize(config)
 *    - 역할: MCP 서버들에 연결합니다
 *    - 입력: config 객체 (서버 설정 정보)
 *    - 반환: Promise (연결 완료 시 resolve)
 *    - 설명: HTTP, stdio 등 다양한 방식으로 서버 프로세스를 시작하고 연결합니다
 *
 * 2. mcpAgent.getAvailableTools()
 *    - 역할: 연결된 모든 서버가 제공하는 도구 목록을 가져옵니다
 *    - 입력: 없음
 *    - 반환: 도구 배열 [{ name, server, description, inputSchema }, ...]
 *    - 설명: AI에게 "어떤 도구들을 사용할 수 있는지" 알려주기 위한 정보를 제공합니다
 *
 * 3. mcpAgent.executeTool(toolName, args)
 *    - 역할: 특정 도구를 실행하고 결과를 받아옵니다
 *    - 입력: toolName (도구 이름 문자열), args (파라미터 객체)
 *    - 반환: { success: boolean, data: any, error?: string }
 *    - 설명: AI의 Function Calling 요청을 실제 MCP 서버 함수 호출로 변환하여 실행합니다
 *
 * 4. mcpAgent.cleanup()
 *    - 역할: 모든 MCP 서버 연결을 종료하고 리소스를 정리합니다
 *    - 입력: 없음
 *    - 반환: Promise (정리 완료 시 resolve)
 *    - 설명: 프로그램 종료 전 반드시 호출하여 프로세스와 네트워크 연결을 깔끔하게 정리합니다
 *
 * ============================================
 */

import { MCPAgentClient } from '../index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 색상 팔레트 정의
const colors = {
  cyan: chalk.rgb(198, 219, 218),      // #C6DBDA - 연한 청록색
  pink: chalk.rgb(254, 225, 232),      // #FEE1E8 - 연한 분홍색
  peach: chalk.rgb(254, 215, 195),     // #FED7C3 - 연한 복숭아색
  yellow: chalk.rgb(246, 234, 194),    // #F6EAC2 - 연한 노란색
  purple: chalk.rgb(236, 213, 227),    // #ECD5E3 - 연한 보라색
};

// Enter 키 입력을 기다리는 함수
async function waitForEnter(message = '\n계속하려면 Enter 키를 누르세요...') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  console.log('='.repeat(50));
  console.log(colors.peach.bold('MCP 사용 예시 - 시작합니다...'));
  console.log('='.repeat(50));

  // ========================================
  // [1단계] MCP 서버 설정 불러오기
  // ========================================
  // mcp_config.json 파일에는 어떤 MCP 서버들을 사용할지 정의되어 있습니다.
  // 예: context7(문서 검색), chrome-devtools(브라우저 제어) 등
  console.log(colors.cyan.bold('\n[1단계] MCP 서버 설정을 불러옵니다...'));
  console.log(colors.cyan('  설명: mcp_config.json 파일에서 연결할 서버 목록을 읽어옵니다'));
  await waitForEnter();

  const configPath = join(__dirname, 'mcp_config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  console.log(colors.cyan.bold(`  ✓ ${Object.keys(config.mcpServers).length}개의 서버 설정을 불러왔습니다`));
  Object.keys(config.mcpServers).forEach(name => {
    console.log(colors.cyan(`    - ${name}`));
  });

  // ========================================
  // [2단계] MCP Agent 생성
  // ========================================
  // MCP Agent는 여러 MCP 서버들과 통신하는 관리자입니다.
  // 이 객체를 통해 서버에 연결하고, 도구를 실행할 수 있습니다.
  console.log(colors.pink.bold('\n[2단계] MCP Agent를 만듭니다...'));
  console.log(colors.pink('  설명: MCP 서버들을 관리할 Agent 객체를 생성합니다'));
  await waitForEnter();

  const mcpAgent = new MCPAgentClient({
    logLevel: 'info',              // 로그 레벨 설정
    enableConsoleDebug: true,      // 디버그 메시지 콘솔 출력
    enableRawMessageLogging: true, // RAW 메시지 로깅 활성화
    messageLoggerOptions: {
      logDir: join(__dirname, 'log'),  // 로그 디렉토리 경로
      output: 'file',              // 파일로만 출력
      prettyPrint: true            // JSON 예쁘게 출력
    },
    clientInfo: {
      name: 'ASAN-AI-Agent',       // 클라이언트 이름
      version: '1.0.0'             // 클라이언트 버전
    }
  });
  console.log(colors.pink.bold('  ✓ MCP Agent가 만들어졌습니다'));

  // ========================================
  // [3단계] MCP 서버에 연결
  // ========================================
  // initialize()를 호출하면 설정 파일에 있는 모든 서버에 연결을 시도합니다.
  // HTTP, stdio 등 다양한 방식으로 서버와 통신할 수 있습니다.
  console.log(colors.peach.bold('\n[3단계] MCP Agent를 초기화하고 서버들에 연결합니다...'));
  console.log(colors.peach('  설명: 설정된 모든 MCP 서버에 실제로 연결합니다'));
  await waitForEnter();

  await mcpAgent.initialize(config);
  console.log(colors.peach.bold('  ✓ 모든 서버에 연결되었습니다'));

  // ========================================
  // [4단계] 사용 가능한 도구 목록 조회
  // ========================================
  // 연결된 모든 MCP 서버들이 제공하는 도구(tool)들을 가져옵니다.
  // 각 도구는 이름, 설명, 입력 파라미터 정보를 가지고 있습니다.
  console.log(colors.yellow.bold('\n[4단계] 사용 가능한 도구 목록을 가져옵니다...'));
  console.log(colors.yellow('  설명: 연결된 서버들이 제공하는 모든 도구의 목록과 스펙을 확인합니다'));
  await waitForEnter();

  const availableTools = mcpAgent.getAvailableTools();
  console.log(colors.yellow.bold(`  ✓ ${availableTools.length}개의 도구를 찾았습니다`));

  // 각 도구의 상세 정보 출력
  console.log(colors.yellow.bold('\n  각 도구의 상세 정보:'));
  availableTools.forEach((tool, index) => {
    console.log(colors.yellow.bold(`\n  [${index + 1}] ${tool.name}`));
    console.log(colors.yellow.italic(`      서버: ${tool.server}`));
    console.log(colors.yellow(`      설명: ${tool.description || '설명 없음'}`));

    if (tool.inputSchema && tool.inputSchema.properties) {
      const props = tool.inputSchema.properties;
      const required = tool.inputSchema.required || [];

      console.log(colors.yellow.bold(`      입력값:`));
      Object.entries(props).forEach(([propName, propSchema]) => {
        const isRequired = required.includes(propName) ? '(필수)' : '(선택)';
        const type = propSchema.type || '타입 미지정';
        const desc = propSchema.description || '설명 없음';

        console.log(colors.yellow(`        - ${propName} `) + (isRequired === '(필수)' ? colors.peach.bold(isRequired) : colors.cyan(isRequired)));
        console.log(colors.yellow(`          타입: `) + colors.pink(type));
        console.log(colors.yellow(`          설명: `) + colors.purple.italic(desc));

        // 추가 스키마 정보 출력
        if (propSchema.items) {
          console.log(colors.yellow(`          배열 항목 타입: `) + colors.cyan(JSON.stringify(propSchema.items)));
        }
      });

      // 전체 스키마 출력 (디버깅용)
      if (false) {
        console.log(`      전체 스키마: ${JSON.stringify(tool.inputSchema, null, 2)}`);
      }
    } else {
      console.log(colors.yellow.italic(`      입력값: 없음`));
    }
  });

  // ========================================
  // [5단계] 도구 실행 예시 - 브라우저 제어
  // ========================================
  // 실제로 MCP 도구를 실행해봅니다.
  // 여기서는 chrome-devtools 서버의 도구들을 사용하여:
  // 1) 새 페이지를 열고
  // 2) JavaScript를 실행하여 화면에 카운트다운을 표시합니다
  console.log(colors.purple.bold('\n[5단계] 도구 실행 예시...'));
  console.log(colors.purple('  설명: chrome-devtools 서버의 도구들을 사용해 브라우저를 제어합니다'));
  await waitForEnter();

  // new_page 도구 찾기
  const newPageTool = availableTools.find(tool => tool.name === 'new_page');

  if (newPageTool) {
    console.log(colors.purple.bold(`\n  [5-1] 새 페이지 열기`));
    console.log(colors.purple.italic(`  실행할 도구: ${newPageTool.name}`));
    console.log(colors.purple.italic(`  서버: ${newPageTool.server}`));

    try {
      // about:blank 페이지 열기
      console.log(colors.purple('  about:blank 페이지를 엽니다...'));

      // mcpAgent.executeTool() 함수 설명:
      // - AI가 "new_page 도구를 url: 'about:blank'로 실행해줘"라고 요청하면
      // - 이 함수가 실제로 MCP 서버에 있는 new_page 함수를 호출합니다
      // - 첫 번째 인자: 실행할 도구 이름
      // - 두 번째 인자: 도구에 전달할 파라미터 (JSON 객체)
      // - 반환값: { success: true/false, data: 결과데이터, error: 에러메시지 }
      const result = await mcpAgent.executeTool('new_page', { url: 'about:blank' });

      if (result.success) {
        console.log(colors.purple.bold('  ✓ 페이지가 열렸습니다'));
        console.log(colors.purple('  결과: ') + colors.peach(JSON.stringify(result.data, null, 2)));

        // ========================================
        // [5-2] JavaScript 실행으로 카운트다운 표시
        // ========================================
        // evaluate_script 도구를 사용하여 페이지에서 JavaScript를 실행합니다.
        // 10부터 0까지 숫자를 화면 중앙에 크게 표시합니다.
        console.log(colors.purple.bold('\n  [5-2] 페이지에 카운트다운 표시하기'));
        console.log(colors.purple('  설명: evaluate_script 도구로 페이지 내용을 동적으로 변경합니다'));
        console.log(colors.purple('  페이지에 10부터 0까지 카운트다운을 표시합니다...'));

        for (let count = 10; count >= 0; count--) {
          console.log(colors.purple.bold(`\n  현재 카운트: `) + colors.peach.bold(count));

          // JavaScript 실행으로 body에 숫자 표시
          //
          // mcpAgent.executeTool('evaluate_script', {...}) 호출 과정:
          //
          // [AI의 Function Calling 요청]
          //   AI: "evaluate_script 도구를 function: '() => {...}' 파라미터로 실행해줘"
          //        └─> 이것은 OpenAI의 Function Calling 형식으로 전달됩니다
          //
          // [Host의 도구 실행]
          //   executeTool()이 이 요청을 받아서:
          //   1. 'evaluate_script'라는 이름의 도구를 찾습니다
          //   2. MCP 서버에 실제 함수 호출을 요청합니다
          //   3. 서버가 브라우저에서 JavaScript를 실행합니다
          //   4. 실행 결과를 받아서 AI에게 다시 돌려줍니다
          //
          // [결과 반환]
          //   { success: true, data: 10, executedAt: "2024-..." }
          //   └─> AI는 이 결과를 보고 다음 행동을 결정합니다
          //
          const scriptResult = await mcpAgent.executeTool('evaluate_script', {
            function: `() => {
              document.body.innerHTML = '<div style="color:blue;display:flex;justify-content:center;align-items:center;height:100vh;font-size:200px;font-family:Arial">${count}</div>';
              return ${count};
            }`
          });

          if (scriptResult.success) {
            console.log(colors.purple.bold(`  ✓ ${count} 표시 완료`));
          } else {
            console.log(colors.pink.bold(`  ✗ 스크립트 실행 실패: `) + colors.pink(scriptResult.error));
          }

          // 0.1초 대기 (마지막 카운트에서는 대기하지 않음)
          if (count > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        console.log(colors.purple.bold('\n  ✓ 카운트다운 완료'));
      } else {
        console.log(colors.pink.bold(`  ✗ 실행 실패: `) + colors.pink(result.error));
      }
    } catch (error) {
      console.log(colors.pink.bold(`  ✗ 오류: `) + colors.pink(error.message));
    }
  } else {
    console.log(colors.purple.italic('  new_page 도구를 찾을 수 없습니다'));
    console.log(colors.purple('  사용 가능한 도구: ') + colors.yellow(availableTools.map(t => t.name).join(', ')));
  }

  // ========================================
  // [5-3] Context7 라이브러리 검색
  // ========================================
  // resolve-library-id 도구를 사용하여 라이브러리 ID를 조회합니다.
  console.log(colors.purple.bold('\n  [5-3] Context7 라이브러리 검색'));
  console.log(colors.purple('  설명: resolve-library-id 도구로 라이브러리를 검색합니다'));

  const resolveLibraryTool = availableTools.find(tool => tool.name === 'resolve-library-id');

  if (resolveLibraryTool) {
    console.log(colors.purple.italic(`  실행할 도구: ${resolveLibraryTool.name}`));
    console.log(colors.purple.italic(`  서버: ${resolveLibraryTool.server}`));

    try {
      console.log(colors.purple('  "react" 라이브러리를 검색합니다...'));

      const resolveResult = await mcpAgent.executeTool('resolve-library-id', {
        libraryName: 'react'
      });

      if (resolveResult.success) {
        console.log(colors.purple.bold('  ✓ 라이브러리 검색 완료'));
        console.log(colors.purple('  결과:'));
        console.log(colors.peach(JSON.stringify(resolveResult.data, null, 2)));
      } else {
        console.log(colors.pink.bold(`  ✗ 검색 실패: `) + colors.pink(resolveResult.error));
      }
    } catch (error) {
      console.log(colors.pink.bold(`  ✗ 오류: `) + colors.pink(error.message));
    }
  } else {
    console.log(colors.purple.italic('  resolve-library-id 도구를 찾을 수 없습니다'));
  }

  // ========================================
  // [6단계] 연결 정리 및 종료
  // ========================================
  // 프로그램을 종료하기 전에 모든 MCP 서버와의 연결을 정리합니다.
  // cleanup()을 호출하면 열려있던 모든 연결이 안전하게 닫힙니다.
  console.log(colors.cyan.bold('\n[6단계] 연결을 정리합니다...'));
  console.log(colors.cyan('  설명: 모든 MCP 서버와의 연결을 종료하고 리소스를 정리합니다'));
  await waitForEnter();

  await mcpAgent.cleanup();
  console.log(colors.cyan.bold('  ✓ 모든 연결이 종료되었습니다'));

  console.log('\n' + '='.repeat(50));
  console.log(colors.peach.bold('MCP 사용 예시 - 완료!'));
  console.log('='.repeat(50));
  console.log(colors.yellow.bold('\n요약:'));
  console.log(colors.cyan('  1. 설정 파일에서 MCP 서버 목록을 읽었습니다'));
  console.log(colors.pink('  2. MCP Agent 객체를 생성하고 서버에 연결했습니다'));
  console.log(colors.peach('  3. 연결된 서버들이 제공하는 도구 목록을 확인했습니다'));
  console.log(colors.yellow('  4. 실제로 도구를 실행하여 브라우저를 제어했습니다'));
  console.log(colors.purple('  5. Context7으로 라이브러리를 검색했습니다'));
  console.log(colors.cyan('  6. 사용을 마치고 모든 연결을 정리했습니다'));
  console.log('');
  process.exit(0);
}

// 메인 함수 실행
main().catch(error => {
  console.error(colors.pink.bold('\n❌ 치명적 오류: ') + colors.pink(error.message));
  console.error(colors.pink.italic(error.stack));
  process.exit(1);
});
