require('dotenv').config();
const net = require('net');

const {
  VDS_HOST,
  VDS_TUNNEL_PORT,
  LOCAL_GAME_PORT,
  SECRET_KEY
} = process.env;

if (!VDS_HOST || !VDS_TUNNEL_PORT || !LOCAL_GAME_PORT || !SECRET_KEY) {
  console.error('Error: Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

const localConnections = new Map();

function connectToTunnel() {
  console.log(`Connecting to VDS tunnel at ${VDS_HOST}:${VDS_TUNNEL_PORT}...`);

  const tunnel = net.createConnection({ host: VDS_HOST, port: VDS_TUNNEL_PORT }, () => {
    console.log('Connected to VDS tunnel. Authenticating...');
    tunnel.write(SECRET_KEY);
  });

  let buffer = '';
  tunnel.on('data', (data) => {
    buffer += data.toString();
    let boundary;
    while ((boundary = buffer.indexOf('\n')) !== -1) {
      const message = buffer.substring(0, boundary);
      buffer = buffer.substring(boundary + 1);

      const parts = message.split(':');
      if (parts.length < 2) {
        console.error('Received malformed message from tunnel:', message);
        continue;
      }
      const connId = parts[0];
      const eventType = parts[1];

      if (eventType === 'new') {
        console.log(`Received new connection signal for ${connId}.`);
        const localSocket = net.createConnection({ port: LOCAL_GAME_PORT }, () => {
          localConnections.set(connId, localSocket);
          console.log(`Established local connection for ${connId}.`);
        });

        localSocket.on('data', (localData) => {
          if (!tunnel.destroyed) {
            const dataPayload = localData.toString('base64');
            tunnel.write(`${connId}:data:${dataPayload}\n`);
          }
        });

        localSocket.on('close', () => {
          console.log(`Local connection for ${connId} closed.`);
          if (!tunnel.destroyed) {
            tunnel.write(`${connId}:close\n`);
          }
          localConnections.delete(connId);
        });

        localSocket.on('error', (err) => {
          console.error(`Error on local socket ${connId}:`, err.message);
          if (!tunnel.destroyed) {
            tunnel.write(`${connId}:close\n`);
          }
          localConnections.delete(connId);
        });
      } else if (eventType === 'data') {
        if (parts.length < 3) {
          console.error('Received malformed data message from tunnel:', message);
          continue;
        }
        const payload = parts.slice(2).join(':');
        const localSocket = localConnections.get(connId);
        if (localSocket) {
          localSocket.write(Buffer.from(payload, 'base64'));
        }
      } else if (eventType === 'close') {
        console.log(`Received close signal for ${connId}.`);
        const localSocket = localConnections.get(connId);
        if (localSocket) {
          localSocket.end();
          localConnections.delete(connId);
        }
      }
    }
  });

  tunnel.on('close', () => {
    console.log('Disconnected from VDS tunnel. Reconnecting in 5 seconds...');
    localConnections.forEach(sock => sock.end());
    localConnections.clear();
    setTimeout(connectToTunnel, 5000);
  });

  tunnel.on('error', (err) => {
    console.error('Tunnel connection error:', err.message);
  });
}

connectToTunnel();