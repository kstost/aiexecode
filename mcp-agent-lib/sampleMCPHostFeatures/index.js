import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPMessageLogger, attachLoggerToTransport } from '../src/mcp_message_logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class MCPHostExample {
  constructor() {
    this.clients = {};
    this.transports = {};
    this.loggers = {};
    this.logDir = path.join(__dirname, 'log');

    // 로그 폴더 초기화
    if (fs.existsSync(this.logDir)) fs.rmSync(this.logDir, { recursive: true, force: true });
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  async connectToServer(serverName, serverConfig) {
    if (this.clients[serverName]) {
      return this.clients[serverName];
    }

    if (!serverConfig?.command) {
      throw new Error(`Invalid server config for '${serverName}'`);
    }

    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
    });
    this.transports[serverName] = transport;

    const logger = new MCPMessageLogger({
      enabled: true,
      output: 'file',
      logDir: this.logDir,
      prettyPrint: true
    });
    this.loggers[serverName] = logger;
    attachLoggerToTransport(transport, serverName, logger);

    const client = new Client({
      name: 'mcp-host-example',
      version: '1.0.0',
    }, { capabilities: {} });
    this.clients[serverName] = client;

    await client.connect(transport);
    return client;
  }

  async disconnect(serverName = null) {
    if (serverName) {
      if (this.clients[serverName]) {
        await this.clients[serverName].close();
        if (this.loggers[serverName]) this.loggers[serverName].close();

        delete this.clients[serverName];
        delete this.transports[serverName];
        delete this.loggers[serverName];
      }
    } else {
      for (const name of Object.keys(this.clients)) {
        await this.disconnect(name);
      }
    }
  }

  getClient(serverName) {
    return this.clients[serverName] || null;
  }

  getConnectedServers() {
    return Object.keys(this.clients);
  }

  async listTools(serverName) {
    const client = this.getClient(serverName);
    if (!client) throw new Error(`Server '${serverName}' not connected`);
    return (await client.listTools()).tools;
  }

  async callTool(serverName, toolName, args = {}) {
    const client = this.getClient(serverName);
    if (!client) throw new Error(`Server '${serverName}' not connected`);
    return await client.callTool({ name: toolName, arguments: args });
  }
}

async function main() {
  const host = new MCPHostExample();

  try {
    // simple-calculator 서버 접속
    console.log('Connecting to simple-calculator...');
    await host.connectToServer('simple-calculator', {
      command: '../sampleFastMCPServer/venv/bin/python',
      args: ['../sampleFastMCPServer/server.py']
    });
    console.log('✓ Connected to simple-calculator');

    // chrome-devtools 서버 접속
    console.log('\nConnecting to chrome-devtools...');
    await host.connectToServer('chrome-devtools', {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp@latest']
    });
    console.log('✓ Connected to chrome-devtools');

    console.log('\nConnected servers:', host.getConnectedServers());

    // simple-calculator 도구 사용
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[simple-calculator 도구 사용]');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n📚 Available tools:');
    const calcTools = await host.listTools('simple-calculator');
    calcTools.forEach(t => console.log(`  - ${t.name}: ${t.description}`));

    console.log('\n🔧 Calling add(10, 20)...');
    const addResult = await host.callTool('simple-calculator', 'add', { a: 10, b: 20 });
    console.log('✅ Result:', addResult);

    // chrome-devtools 도구 사용
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[chrome-devtools 도구 사용]');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log('\n📚 Available tools:');
    const chromeTools = await host.listTools('chrome-devtools');
    chromeTools.forEach(t => console.log(`  - ${t.name}: ${t.description}`));

    console.log('\n🔧 Opening new page...');
    const pageResult = await host.callTool('chrome-devtools', 'new_page', { url: 'about:blank' });
    console.log('✅ Page opened:', pageResult);

    console.log('\n🔧 Running countdown script...');
    for (let count = 10; count >= 0; count--) {
      console.log(`  Displaying: ${count}`);
      await host.callTool('chrome-devtools', 'evaluate_script', {
        function: `() => {
          document.body.innerHTML = '<div style="color:blue;display:flex;justify-content:center;align-items:center;height:100vh;font-size:200px;font-family:Arial">${count}</div>';
          return ${count};
        }`
      });
      if (count > 0) await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('✅ Countdown complete');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('\nDisconnecting...');
    await host.disconnect();
    console.log('✓ Disconnected');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(console.error);

export { MCPHostExample };
