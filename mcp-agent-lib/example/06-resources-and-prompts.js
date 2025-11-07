#!/usr/bin/env node

/**
 * 리소스와 프롬프트 사용 예제
 *
 * MCP 서버의 도구(Tools) 외에도 리소스(Resources)와 프롬프트(Prompts)를
 * 사용하는 방법을 보여줍니다.
 *
 * - Resources: 파일, 데이터, 문서 등을 읽을 수 있는 URI 기반 리소스
 * - Prompts: 미리 정의된 프롬프트 템플릿
 */

import { MCPAgentClient } from '../index.js';

async function main() {
  const client = new MCPAgentClient({
    logLevel: 'info',
    enableConsoleDebug: true
  });

  try {
    await client.initialize({
      mcpServers: {
        'content-server': {
          type: 'stdio',
          command: 'node',
          args: ['content-server.js']
        }
      }
    });

    // ========================================
    // 1. 리소스(Resources) 사용하기
    // ========================================

    console.log('📄 리소스 목록 조회...\n');

    // 모든 서버의 리소스 목록
    const allResources = client.getAvailableResources();
    console.log(`총 ${allResources.length}개의 리소스 발견:`);
    allResources.forEach(resource => {
      console.log(`\n- ${resource.name}`);
      console.log(`  서버: ${resource.serverName}`);
      console.log(`  URI: ${resource.uri}`);
      if (resource.description) {
        console.log(`  설명: ${resource.description}`);
      }
      if (resource.mimeType) {
        console.log(`  타입: ${resource.mimeType}`);
      }
    });

    // 리소스 읽기 - 방법 1: URI로 자동 검색
    if (allResources.length > 0) {
      console.log('\n📖 리소스 읽기 (자동 서버 검색)...');
      const resourceUri = allResources[0].uri;

      try {
        const content = await client.readResource(resourceUri);
        console.log(`\n✅ ${resourceUri} 내용:`);
        console.log(`타입: ${content.mimeType}`);
        console.log(`데이터: ${content.data?.substring(0, 200)}...`);
      } catch (error) {
        console.error(`❌ 리소스 읽기 실패: ${error.message}`);
      }
    }

    // 리소스 읽기 - 방법 2: 특정 서버에서 읽기
    if (allResources.length > 0) {
      console.log('\n📖 리소스 읽기 (특정 서버 지정)...');
      const resource = allResources[0];

      try {
        const content = await client.readResourceFromServer(
          resource.serverName,
          resource.uri
        );
        console.log(`✅ 읽기 성공: ${content.uri}`);
      } catch (error) {
        console.error(`❌ 실패: ${error.message}`);
      }
    }

    // ========================================
    // 2. 프롬프트(Prompts) 사용하기
    // ========================================

    console.log('\n\n💬 프롬프트 목록 조회...\n');

    // 모든 서버의 프롬프트 목록
    const allPrompts = client.getAvailablePrompts();
    console.log(`총 ${allPrompts.length}개의 프롬프트 발견:`);
    allPrompts.forEach(prompt => {
      console.log(`\n- ${prompt.name}`);
      console.log(`  서버: ${prompt.serverName}`);
      if (prompt.description) {
        console.log(`  설명: ${prompt.description}`);
      }
      if (prompt.arguments && prompt.arguments.length > 0) {
        console.log(`  인자:`);
        prompt.arguments.forEach(arg => {
          console.log(`    - ${arg.name}: ${arg.description || '(설명 없음)'}`);
          console.log(`      필수: ${arg.required ? '예' : '아니오'}`);
        });
      }
    });

    // 프롬프트 실행 - 방법 1: 이름으로 자동 검색
    if (allPrompts.length > 0) {
      console.log('\n🎯 프롬프트 실행 (자동 서버 검색)...');
      const promptName = allPrompts[0].name;

      try {
        const result = await client.executePrompt(promptName, {
          // 프롬프트에 필요한 인자 전달
          // 예: { topic: 'AI', style: 'formal' }
        });
        console.log(`\n✅ ${promptName} 실행 결과:`);
        console.log(result);
      } catch (error) {
        console.error(`❌ 프롬프트 실행 실패: ${error.message}`);
      }
    }

    // 프롬프트 실행 - 방법 2: 특정 서버에서 실행
    if (allPrompts.length > 0) {
      console.log('\n🎯 프롬프트 실행 (특정 서버 지정)...');
      const prompt = allPrompts[0];

      try {
        const result = await client.getPrompt(
          prompt.serverName,
          prompt.name,
          {
            // 프롬프트 인자
            customParam: 'value'
          }
        );
        console.log(`✅ 실행 성공`);
        console.log(result);
      } catch (error) {
        console.error(`❌ 실패: ${error.message}`);
      }
    }

    // ========================================
    // 3. 통합 정보 조회
    // ========================================

    console.log('\n\n📊 서버별 기능 요약:\n');
    const status = client.getStatus();

    for (const [serverName, serverStatus] of Object.entries(status.servers)) {
      console.log(`${serverName}:`);
      console.log(`  상태: ${serverStatus.status}`);
      console.log(`  도구: ${serverStatus.toolCount}개`);

      // 해당 서버의 리소스 수
      const serverResources = allResources.filter(r => r.serverName === serverName);
      console.log(`  리소스: ${serverResources.length}개`);

      // 해당 서버의 프롬프트 수
      const serverPrompts = allPrompts.filter(p => p.serverName === serverName);
      console.log(`  프롬프트: ${serverPrompts.length}개`);
    }

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
