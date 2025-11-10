/**
 * Example 4: Multi-turn Conversation
 *
 * 여러 턴에 걸친 대화 예제
 */

import { UnifiedLLMClient } from '../src/index.js';

async function simpleConversation() {
  console.log('=== Simple Multi-turn Conversation ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const messages = [];

  // Turn 1
  messages.push({ role: 'user', content: 'Hi! My name is Alice.' });

  let response = await client.chat({
    model: 'gpt-4o-mini',
    messages: messages,
    max_tokens: 100
  });

  messages.push(response.choices[0].message);
  console.log('Turn 1:');
  console.log('User: Hi! My name is Alice.');
  console.log('Assistant:', response.choices[0].message.content);

  // Turn 2
  messages.push({ role: 'user', content: 'What is my name?' });

  response = await client.chat({
    model: 'gpt-4o-mini',
    messages: messages,
    max_tokens: 100
  });

  messages.push(response.choices[0].message);
  console.log('\nTurn 2:');
  console.log('User: What is my name?');
  console.log('Assistant:', response.choices[0].message.content);

  // Turn 3
  messages.push({ role: 'user', content: 'Tell me a fun fact about that name.' });

  response = await client.chat({
    model: 'gpt-4o-mini',
    messages: messages,
    max_tokens: 150
  });

  console.log('\nTurn 3:');
  console.log('User: Tell me a fun fact about that name.');
  console.log('Assistant:', response.choices[0].message.content);
}

async function conversationWithContext() {
  console.log('\n\n=== Conversation with Context ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  // 시스템 메시지로 컨텍스트 설정
  const messages = [
    {
      role: 'system',
      content: 'You are a helpful programming tutor. Explain concepts clearly and provide code examples.'
    }
  ];

  const questions = [
    'What is a closure in JavaScript?',
    'Can you show me an example?',
    'What are common use cases for closures?'
  ];

  for (const question of questions) {
    messages.push({ role: 'user', content: question });

    const response = await client.chat({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 300
    });

    const answer = response.choices[0].message.content;
    messages.push(response.choices[0].message);

    console.log(`Q: ${question}`);
    console.log(`A: ${answer}\n`);
    console.log('-'.repeat(60) + '\n');
  }
}

async function conversationWithToolCalls() {
  console.log('=== Conversation with Tool Calls ===\n');

  const client = new UnifiedLLMClient({
    apiKey: process.env.OPENAI_API_KEY
  });

  const tools = [{
    type: 'function',
    function: {
      name: 'search_docs',
      description: 'Search documentation for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  }];

  const messages = [
    { role: 'user', content: 'I need help with React hooks' }
  ];

  // Turn 1: LLM이 검색 도구 호출
  let response = await client.chat({
    model: 'gpt-4o-mini',
    messages: messages,
    tools: tools,
    max_tokens: 200
  });

  messages.push(response.choices[0].message);
  console.log('Turn 1: LLM decides to search docs');

  if (response.choices[0].message.tool_calls) {
    const toolCall = response.choices[0].message.tool_calls[0];
    console.log(`Tool call: ${toolCall.function.name}`);
    console.log(`Arguments: ${toolCall.function.arguments}`);

    // 검색 결과 (mock)
    const searchResult = {
      title: 'React Hooks Documentation',
      summary: 'Hooks let you use state and other React features without writing a class.'
    };

    // Turn 2: 검색 결과 전달
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(searchResult)
    });

    response = await client.chat({
      model: 'gpt-4o-mini',
      messages: messages,
      tools: tools,
      max_tokens: 300
    });

    console.log('\nTurn 2: Final answer with search results');
    console.log('Assistant:', response.choices[0].message.content);
  }
}

async function main() {
  try {
    await simpleConversation();
    await conversationWithContext();
    await conversationWithToolCalls();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
