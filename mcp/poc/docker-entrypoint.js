/**
 * MCP Forge Docker entrypoint.
 * Starts the admin platform service and the retail demo MCP service.
 */
const { spawn } = require('child_process');

const rootDir = __dirname;
const serverPort = process.env.SERVER_PORT || '3100';
const demoPort = process.env.DEMO_PORT || '3458';

console.log('[MCP Forge] starting services');
console.log('admin service:', serverPort);
console.log('demo service:', demoPort);

const server = spawn('node', ['server/server.js'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, PORT: serverPort }
});

const demoServer = spawn('node', ['demo-server/server.js'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, PORT: demoPort }
});

function shutdown(signal) {
  console.log(`[MCP Forge] received ${signal}, shutting down`);
  server.kill('SIGTERM');
  demoServer.kill('SIGTERM');
  setTimeout(() => process.exit(0), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.on('exit', code => {
  console.log('[admin service] exited with code', code);
  demoServer.kill();
});

demoServer.on('exit', code => {
  console.log('[demo service] exited with code', code);
  server.kill();
});
