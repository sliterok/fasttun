require('dotenv').config();
const net = require('net');
const { v4: uuidv4 } = require('uuid');

const {
  VDS_TUNNEL_PORT,
  VDS_PUBLIC_PORT,
  SECRET_KEY
} = process.env;

if (!VDS_TUNNEL_PORT || !VDS_PUBLIC_PORT || !SECRET_KEY) {
  console.error('Error: Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

let tunnelConnection = null;
const gameClients = new Map();

// Server for the local client
const tunnelServer = net.createServer((socket) => {
  console.log('A client is trying to connect to the tunnel...');

  socket.once('data', (authKey) => {
    if (authKey.toString().trim() !== SECRET_KEY) {
      console.log('Authentication failed. Closing connection.');
      socket.end();
      return;
    }

    console.log('Local client authenticated successfully.');
    tunnelConnection = socket;

    let buffer = '';
    tunnelConnection.on('data', (data) => {
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

        const gameSocket = gameClients.get(connId);
        if (!gameSocket) {
          // Connection might have been closed already.
          continue;
        }

        if (eventType === 'data') {
          const payload = parts.slice(2).join(':');
          gameSocket.write(Buffer.from(payload, 'base64'));
        } else if (eventType === 'close') {
          gameSocket.end();
          gameClients.delete(connId);
        }
      }
    });

    tunnelConnection.on('close', () => {
      console.log('Tunnel connection closed.');
      tunnelConnection = null;
      gameClients.forEach(sock => sock.end());
      gameClients.clear();
    });

    tunnelConnection.on('error', (err) => {
      console.error('Tunnel connection error:', err.message);
    });
  });

  socket.on('error', (err) => {
    console.error('Tunnel server socket error:', err.message);
  });
});

// Server for game clients
const gameServer = net.createServer((gameSocket) => {
  if (!tunnelConnection) {
    console.log('Game client connected, but tunnel is not established. Rejecting.');
    gameSocket.end();
    return;
  }

  const connId = uuidv4();
  gameClients.set(connId, gameSocket);
  console.log(`Game client ${connId} connected.`);
  
  tunnelConnection.write(`${connId}:new\n`);

  gameSocket.on('data', (data) => {
    if(tunnelConnection) {
      const payload = data.toString('base64');
      tunnelConnection.write(`${connId}:data:${payload}\n`);
    }
  });

  gameSocket.on('close', () => {
    console.log(`Game client ${connId} disconnected.`);
    if(tunnelConnection && !tunnelConnection.destroyed) {
      tunnelConnection.write(`${connId}:close\n`);
    }
    gameClients.delete(connId);
  });

  gameSocket.on('error', (err) => {
    console.error(`Error on game socket ${connId}:`, err.message);
    if(tunnelConnection && !tunnelConnection.destroyed) {
      tunnelConnection.write(`${connId}:close\n`);
    }
    gameClients.delete(connId);
  });
});

tunnelServer.listen(VDS_TUNNEL_PORT, () => {
  console.log(`Tunnel server listening on port ${VDS_TUNNEL_PORT}`);
});

gameServer.listen(VDS_PUBLIC_PORT, () => {
  console.log(`Game server listening on port ${VDS_PUBLIC_PORT}`);
});