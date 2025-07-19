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

  tunnel.on('data', (data) => {
    const message = data.toString();
    const [connId, eventType, payload] = message.split(':');

    if (eventType === 'new') {
      console.log(`Received new connection signal for ${connId}.`);
      const localSocket = net.createConnection({ port: LOCAL_GAME_PORT }, () => {
        localConnections.set(connId, localSocket);
        console.log(`Established local connection for ${connId}.`);
      });

      localSocket.on('data', (localData) => {
        const dataPayload = localData.toString('base64');
        tunnel.write(`${connId}:data:${dataPayload}`);
      });

      localSocket.on('close', () => {
        console.log(`Local connection for ${connId} closed.`);
        tunnel.write(`${connId}:close`);
        localConnections.delete(connId);
      });

      localSocket.on('error', (err) => {
        console.error(`Error on local socket ${connId}:`, err.message);
        tunnel.write(`${connId}:close`);
        localConnections.delete(connId);
      });
    } else if (eventType === 'data') {
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