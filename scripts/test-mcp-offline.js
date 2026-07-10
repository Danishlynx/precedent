// Offline harness (not part of the app): stubs the REST bridge, spawns the MCP
// server, and drives initialize -> tools/list -> tools/call over stdio.
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const TOKEN = 'test-token-123';

const stub = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  res.setHeader('content-type', 'application/json');
  if (req.url.startsWith('/api/decisions/search')) {
    res.end(JSON.stringify({ decisions: [{ id: 2, title: 'Use Postmark instead of SendGrid', status: 'active' }] }));
  } else if (req.url.startsWith('/api/action-items')) {
    res.end(JSON.stringify({ action_items: [{ id: 1, description: 'Migrate templates', owner_name: 'Jonas' }] }));
  } else {
    res.end(JSON.stringify({ decision: { id: 2, title: 'Use Postmark instead of SendGrid' } }));
  }
});

stub.listen(0, async () => {
  const port = stub.address().port;
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'mcp', 'server.js')], {
    env: { ...process.env, BRIDGE_URL: `http://localhost:${port}`, MCP_API_TOKEN: TOKEN },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let buf = '';
  const pending = new Map();
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
    }
  });

  const rpc = (id, method, params) =>
    new Promise((resolve) => {
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });

  const init = await rpc(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'offline-test', version: '0' },
  });
  console.log('initialize ->', init.result.serverInfo);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const tools = await rpc(2, 'tools/list', {});
  console.log('tools ->', tools.result.tools.map((t) => t.name).join(', '));

  const call = await rpc(3, 'tools/call', { name: 'search_decisions', arguments: { query: 'email vendor' } });
  console.log('search_decisions ->', call.result.content[0].text.slice(0, 120));

  const call2 = await rpc(4, 'tools/call', { name: 'list_open_action_items', arguments: {} });
  console.log('list_open_action_items ->', call2.result.content[0].text.slice(0, 120));

  const call3 = await rpc(5, 'tools/call', { name: 'get_decision', arguments: { id: 2 } });
  console.log('get_decision ->', call3.result.content[0].text.slice(0, 100));

  child.kill();
  stub.close();
  console.log('ALL MCP OFFLINE CHECKS PASSED');
  process.exit(0);
});

setTimeout(() => {
  console.error('TIMEOUT — MCP offline test did not complete');
  process.exit(1);
}, 15000);
