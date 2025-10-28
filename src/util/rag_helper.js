// RAG(검색 증강 생성) 데이터베이스에 실행 기록을 저장하기 위한 유틸리티 함수들

/**
 * 개별 도구 호출을 마크다운 형식으로 구조화
 * @param {Object} params - 도구 호출 정보
 * @param {number} params.stepIndex - 단계 번호
 * @param {string} params.toolName - 도구 이름
 * @param {string} params.operation - 작업 타입
 * @param {Object} params.argument - 도구 인자
 * @param {string} params.stdout - 표준 출력
 * @param {string} params.stderr - 표준 에러
 * @returns {string} 마크다운 형식의 도구 호출 기록
 */
export function buildToolHistoryEntry({ stepIndex, toolName, operation, argument, stdout, stderr }) {
    let argumentText = '';
    try {
        argumentText = JSON.stringify(argument ?? null, null, 2);
    } catch {
        argumentText = String(argument ?? '');
    }

    const stdoutBlock = stdout ? `\n\`\`\`\n${stdout}\n\`\`\`` : '\n(empty)';
    const stderrBlock = stderr ? `\n\`\`\`\n${stderr}\n\`\`\`` : '\n(empty)';

    return [
        `### Tool Invocation #${stepIndex}`,
        `- Tool: \`${toolName ?? 'unknown'}\``,
        `- Operation: \`${operation ?? 'unknown'}\``,
        `- Arguments:\n\`\`\`json\n${argumentText}\n\`\`\``,
        `- STDOUT:${stdoutBlock}`,
        `- STDERR:${stderrBlock}`
    ].join('\n');
}

/**
 * 실행 단계 전체를 RAG용 페이로드로 구조화
 * @param {Object} params - 실행 단계 정보
 * @param {string} params.mission - 전체 미션
 * @param {string} params.subMission - 서브 미션
 * @param {number} params.iteration - 반복 횟수
 * @param {number} params.stepIndex - 단계 번호
 * @param {Object} params.execResult - 실행 결과
 * @param {string} params.rawStdout - 원본 표준 출력
 * @param {string} params.rawStderr - 원본 표준 에러
 * @returns {string} 마크다운 형식의 실행 기록
 */
export function buildExecutionRagPayload({ mission, subMission, iteration, stepIndex, execResult, rawStdout, rawStderr }) {
    const name = execResult?.more_info?.name ?? 'unknown';
    const operation = execResult?.more_info?.type ?? 'unknown';
    const content = execResult?.more_info?.content ?? '';

    return `
---
# Execution Step Log

## Mission Context
- Full Mission: ${mission}
- Sub Mission: ${subMission}
- Iteration: ${iteration}
- Step Index: ${stepIndex}

## Tool Invocation
- Function Name: ${name}
- Operation Type: ${operation}

## Input Payload
\`\`\`
${content || '(no content provided)'}
\`\`\`

## Raw STDOUT
${rawStdout ? `\n\`\`\`\n${rawStdout}\n\`\`\`` : '(empty)'}

## Raw STDERR
${rawStderr ? `\n\`\`\`\n${rawStderr}\n\`\`\`` : '(empty)'}

## Exit Code
${typeof execResult?.code === 'number' ? execResult.code : 'unknown'}
---
`.trim();
}

/**
 * 실행 단계를 RAG 데이터베이스에 저장
 * @param {Object} params - 저장 정보
 * @param {Object} params.retriever - RAG Retriever 인스턴스
 * @param {string} params.mission - 전체 미션
 * @param {string} params.subMission - 서브 미션
 * @param {number} params.iteration - 반복 횟수
 * @param {number} params.stepIndex - 단계 번호
 * @param {Object} params.execResult - 실행 결과
 * @param {string} params.rawStdout - 원본 표준 출력
 * @param {string} params.rawStderr - 원본 표준 에러
 * @returns {Promise<string>} RAG 벡터 키
 */
export async function storeExecutionStepInRag({ retriever, mission, subMission, iteration, stepIndex, execResult, rawStdout, rawStderr }) {
    const vectorKey = `step_${iteration}_${stepIndex}_${Date.now()}`;
    const payload = buildExecutionRagPayload({ mission, subMission, iteration, stepIndex, execResult, rawStdout, rawStderr });
    await retriever.addContent('mission_results', vectorKey, payload);
    return vectorKey;
}
