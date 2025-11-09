import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MCPMessageLogger, attachLoggerToTransport } from '../src/mcp_message_logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getUserInput(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

class ElicitationHost {
  constructor() {
    this.client = null;
    this.logDir = path.join(__dirname, 'log');

    // 로그 폴더 초기화
    if (fs.existsSync(this.logDir)) fs.rmSync(this.logDir, { recursive: true, force: true });
    fs.mkdirSync(this.logDir, { recursive: true });
    console.log(`✓ Log directory initialized: ${this.logDir}`);
  }

  async connect(serverConfig) {
    console.log('Connecting to MCP server...');

    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
    });

    const logger = new MCPMessageLogger({
      enabled: true,
      output: 'both',
      logDir: this.logDir,
      prettyPrint: true
    });
    attachLoggerToTransport(transport, 'elicitation-server', logger);

    this.client = new Client({
      name: 'elicitation-host',
      version: '1.0.0',
    }, {
      capabilities: { elicitation: {} }
    });

    this._setupElicitationHandler();
    await this.client.connect(transport);

    console.log('✓ Successfully connected to server');
    return this.client;
  }

  _setupElicitationHandler() {
    this.client.setRequestHandler(ElicitRequestSchema, async (request) => {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📥 Elicitation:', request.params.message);
      console.log('스키마:', JSON.stringify(request.params.requestedSchema, null, 2));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      const { properties = {}, required = [] } = request.params.requestedSchema || {};
      const data = {};

      // 사용자 입력 받기
      for (const [key, prop] of Object.entries(properties)) {
        const input = await getUserInput(`${prop.description || key}${required.includes(key) ? ' (필수)' : ' (선택)'}: `);

        if (input || required.includes(key)) {
          if (prop.type === 'number' || prop.type === 'integer') {
            data[key] = parseFloat(input);
          } else if (prop.type === 'boolean') {
            data[key] = ['true', 'yes', '1', 'y'].includes(input.toLowerCase());
          } else {
            data[key] = input;
          }
        }
      }

      // 확인
      const confirm = await getUserInput('\n실행하시겠습니까? (yes/no/cancel): ');
      const action = ['yes', 'y'].includes(confirm.toLowerCase()) ? 'accept'
                   : ['no', 'n'].includes(confirm.toLowerCase()) ? 'decline'
                   : 'cancel';

      console.log(`\n📤 응답: action=${action}, content=${JSON.stringify(data)}\n`);

      return { action, content: action === 'accept' ? data : undefined };
    });
  }

  async disconnect() {
    if (this.client) {
      console.log('Disconnecting...');
      await this.client.close();
      console.log('✓ Disconnected');
    }
  }

  async listTools() {
    return (await this.client.listTools()).tools;
  }

  async callTool(toolName, args) {
    console.log(`\n🔧 ${toolName}(${JSON.stringify(args)})`);
    const result = await this.client.callTool({ name: toolName, arguments: args });
    console.log(`✅ Result:`, result);
    return result;
  }
}

async function main() {
  const host = new ElicitationHost();

  try {
    await host.connect({
      command: '../sampleFastMCPServerElicitationRequest/venv/bin/python',
      args: ['../sampleFastMCPServerElicitationRequest/server.py']
    });

    console.log('\n📚 Available tools:');
    (await host.listTools()).forEach(t => console.log(`  - ${t.name}: ${t.description}`));

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Example 1: add_with_confirmation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    await host.callTool('add_with_confirmation', { a: 10, b: 20 });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Example 2: greet_user');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    await host.callTool('greet_user', {});

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await host.disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(console.error);

export { ElicitationHost };
