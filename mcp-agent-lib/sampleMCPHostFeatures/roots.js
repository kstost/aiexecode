import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MCPMessageLogger, attachLoggerToTransport } from '../src/mcp_message_logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class RootsHost {
  constructor() {
    this.client = null;
    this.logDir = path.join(__dirname, 'log');

    // 로그 폴더 초기화
    if (fs.existsSync(this.logDir)) fs.rmSync(this.logDir, { recursive: true, force: true });
    fs.mkdirSync(this.logDir, { recursive: true });
    console.log(`✓ Log directory initialized: ${this.logDir}`);

    // 동적으로 변경 가능한 roots 목록
    this.currentRoots = [
      {
        uri: `file://${path.join(__dirname, '..')}`,
        name: 'Project Root'
      },
      {
        uri: `file://${path.join(os.homedir(), '.aiexe')}`,
        name: 'Home Directory'
      }
    ];
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
    attachLoggerToTransport(transport, 'roots-server', logger);

    this.client = new Client({
      name: 'roots-host',
      version: '1.0.0',
    }, {
      capabilities: { roots: { listChanged: true } }
    });

    this._setupRootsHandler();
    await this.client.connect(transport);

    console.log('✓ Successfully connected to server');
    return this.client;
  }

  _setupRootsHandler() {
    // Roots 요청 핸들러 설정
    this.client.setRequestHandler(ListRootsRequestSchema, async (request) => {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📥 Roots 요청 받음 (서버가 클라이언트에게 roots 목록을 요청)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      console.log('📤 응답할 Roots:');
      this.currentRoots.forEach((root, idx) => {
        console.log(`  ${idx + 1}. ${root.name}: ${root.uri}`);
      });
      console.log();

      return { roots: this.currentRoots };
    });
  }

  updateRoots(newRoots) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 Roots 목록 변경');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('이전 Roots:');
    this.currentRoots.forEach((root, idx) => {
      console.log(`  ${idx + 1}. ${root.name}: ${root.uri}`);
    });

    this.currentRoots = newRoots;

    console.log('\n새 Roots:');
    this.currentRoots.forEach((root, idx) => {
      console.log(`  ${idx + 1}. ${root.name}: ${root.uri}`);
    });
    console.log();
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

  async sendRootsListChanged() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📢 클라이언트 → 서버: roots/list_changed notification 전송');
    console.log('   (서버에게 roots 목록이 변경되었음을 알림)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    await this.client.sendRootsListChanged();
    console.log('✓ Notification 전송 완료\n');
  }
}

async function main() {
  const host = new RootsHost();

  try {
    await host.connect({
      command: '../sampleFastMCPServerRootsRequest/venv/bin/python',
      args: ['../sampleFastMCPServerRootsRequest/server.py']
    });

    console.log('\n📚 Available tools:');
    (await host.listTools()).forEach(t => console.log(`  - ${t.name}: ${t.description}`));

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Example 1: 초기 roots 목록 조회');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    await host.callTool('list_accessible_roots', {});

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Example 2: count_files_in_root (index=1)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    await host.callTool('count_files_in_root', { root_index: 1 });

    // Roots 목록 변경 시나리오
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Example 3: Roots 목록 변경 및 알림 전송');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Roots 목록 변경
    const newRoots = [
      {
        uri: `file://${path.join(__dirname, '..')}`,
        name: 'Project Root'
      },
      {
        uri: `file://${path.join(__dirname)}`,
        name: 'Sample Features Directory'
      },
      {
        uri: `file://${os.tmpdir()}`,
        name: 'Temp Directory'
      }
    ];
    host.updateRoots(newRoots);

    // 서버에 roots 변경 알림
    await host.sendRootsListChanged();

    // 약간의 지연 후 서버가 다시 roots를 조회하도록 도구 호출
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Example 4: 변경된 roots 목록 재조회');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    await host.callTool('list_accessible_roots', {});

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Example 5: 새 root 파일 개수 조회 (index=2)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    await host.callTool('count_files_in_root', { root_index: 2 });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await host.disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(console.error);

export { RootsHost };
