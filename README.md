# FastTun - A Simple Reverse TCP Tunnel

Ever wanted to host a game server at home without complex port forwarding?

This project provides a simple and effective way to expose a local TCP service (like a game server) running behind a NAT to the internet, using a Virtual Dedicated Server (VDS) as a public relay.

## The Concept: Reverse Tunneling

The technique used here is called a **Reverse Tunnel**.

Unlike traditional port forwarding where you configure your router to direct incoming traffic to a specific machine, a reverse tunnel works by initiating an outbound connection from your firewalled local machine to a publicly accessible server (your VDS).

This outbound connection is then kept alive and used as a "tunnel" to relay traffic. When someone connects to your VDS on a public port, the VDS sends a signal through the tunnel, telling your local machine to connect to the local game server. All data is then passed back and forth through this tunnel, making your local server accessible to the world without any router configuration.

## How It Works in Practice

1.  **`vds_server.js` (Run on your VDS):** This script listens for two types of connections:
    *   A private "tunnel" connection from your local PC.
    *   Public connections from clients (e.g., game players).
2.  **`local_client.js` (Run on your local PC):** This script establishes a persistent, authenticated connection to the `vds_server.js`, creating the reverse tunnel.
3.  **Traffic Flow:** When a player connects to the VDS, the VDS server uses the tunnel to notify the local client. The local client then opens a direct connection to your local game server. All traffic is then relayed between the player and the game server through the VDS, effectively making your local game server publicly accessible via the VDS's IP address.

## Setup

### 1. Configure Environment Variables

Create a `.env` file in the root of the project and add the following variables:

```env
# --- Shared Variables ---
# The port on the VDS for the tunnel connection (must be the same for both server and client)
VDS_TUNNEL_PORT=7878
# A secret key to authenticate the tunnel connection (must be the same for both server and client)
SECRET_KEY=change_this_to_a_very_secret_key

# --- VDS Server Variables ---
# The public port on the VDS that players will connect to
VDS_PUBLIC_PORT=7777

# --- Local Client Variables ---
# The IP address of your VDS
VDS_HOST=your_vds_ip_address
# The port your game server is running on locally
LOCAL_GAME_PORT=8080
```

**IMPORTANT:**
*   Replace `your_vds_ip_address` with the actual public IP of your VDS.
*   Change the `SECRET_KEY` to something long and random.
*   Adjust `VDS_PUBLIC_PORT` and `LOCAL_GAME_PORT` to match your game server's ports.

### 2. Install Dependencies

Make sure you have Node.js and pnpm installed. Then run:

```bash
pnpm install
```

## Running the Tunnel

1.  **On your VDS:**
    Start the server script. It's recommended to use a process manager like `pm2` to keep it running permanently.

    ```bash
    node vds_server.js
    ```
    You should see:
    ```
    Tunnel server listening on port 7878
    Game server listening on port 7777
    ```

2.  **On your Local PC (with the game server):**
    Start the client script.

    ```bash
    node local_client.js
    ```
    You should see:
    ```
    Connecting to VDS tunnel at your_vds_ip_address:7878...
    ```

Once the local client connects and authenticates with the VDS server, the tunnel is active. Players can now connect to `your_vds_ip_address:7777` to play on your local server.
