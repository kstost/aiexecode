import { UnifiedLLMClient } from './src/LLMClient/client.js';

async function testGeminiJsonSchema() {
  console.log('Testing Gemini with json_schema...\n');

  // Read API key from environment or use placeholder
  const apiKey = process.env.GEMINI_API_KEY || 'your-api-key-here';

  const client = new UnifiedLLMClient({
    provider: 'gemini',
    apiKey: apiKey,
    model: 'gemini-2.5-flash',
    logDir: '/Users/kst/.aiexe/payload_LLM_log'
  });

  const request = {
    model: 'gemini-2.5-flash',
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'What is 2+2? Answer in JSON with a field "result".' }]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'math_result',
        schema: {
          type: 'object',
          properties: {
            result: {
              type: 'number',
              description: 'The result of the calculation'
            }
          },
          required: ['result'],
          additionalProperties: false
        }
      }
    },
    temperature: 0
  };

  try {
    const response = await client.response(request);

    console.log('Response ID:', response.id);
    console.log('Status:', response.status);
    console.log('Model:', response.model);
    console.log('\ntext.format:', JSON.stringify(response.text.format, null, 2));
    console.log('\nOutput Text:', response.output_text);
    console.log('\nOutput Array:');
    console.log(JSON.stringify(response.output, null, 2));

    // Try to parse the output_text as JSON
    try {
      const parsed = JSON.parse(response.output_text);
      console.log('\n✓ Successfully parsed as JSON:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('\n✗ Failed to parse as JSON:', e.message);
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

testGeminiJsonSchema();
