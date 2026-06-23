// IPv6-to-localhost proxy for Supabase DB connection
// Use: node proxy-supabase.mjs
import net from 'node:net';
import tls from 'node:tls';

const REMOTE_HOST = '2406:da1a:314:7100:2cf5:9fad:1fda:7795';
const REMOTE_PORT = 5432;
const LOCAL_PORT = 15432;

const server = net.createServer((localSocket) => {
  console.log(`[proxy] Local connection from ${localSocket.remoteAddress}:${localSocket.remotePort}`);

  const remoteSocket = net.connect({
    host: REMOTE_HOST,
    port: REMOTE_PORT,
    family: 6,
  }, () => {
    console.log('[proxy] Connected to remote');
    localSocket.pipe(remoteSocket);
    remoteSocket.pipe(localSocket);
  });

  remoteSocket.on('error', (err) => {
    console.log(`[proxy] Remote error: ${err.message}`);
    localSocket.destroy();
  });

  localSocket.on('error', (err) => {
    console.log(`[proxy] Local error: ${err.message}`);
    remoteSocket.destroy();
  });
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`[proxy] Listening on 127.0.0.1:${LOCAL_PORT} -> [${REMOTE_HOST}]:${REMOTE_PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[proxy] Shutting down');
  server.close();
  process.exit(0);
});
