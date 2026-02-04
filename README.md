# Agent Office

Real-time monitoring system for Claude AI agent sessions with a visual web interface.

## What is it?

Agent Office tracks your Claude Code sessions and displays them in a shared web UI. Perfect for teams who want to see what their AI agents are working on.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Developer 1    │     │     Server      │     │    Web UI       │
│  CLI Client     │────▶│    Backend      │◀────│   (Browser)     │
└─────────────────┘     │  + Web UI       │     └─────────────────┘
                        └─────────────────┘
┌─────────────────┐            ▲
│  Developer 2    │            │
│  CLI Client     │────────────┘
└─────────────────┘
```

## Server Installation

### 1. Create project directory

```bash
mkdir agent-office && cd agent-office
```

### 2. Create config.json

```bash
cat > config.json << 'EOF'
{
  "users": [
    { "key": "your-api-key-1", "displayName": "Alice" },
    { "key": "your-api-key-2", "displayName": "Bob" }
  ],
  "server": {
    "httpPort": 3100,
    "wsPort": 3101
  },
  "tokenExpirySeconds": 86400,
  "inactivityTimeoutSeconds": 60
}
EOF
```

### 3. Create docker-compose.yml

```bash
cat > docker-compose.yml << 'EOF'
name: agent-office-server

services:
  backend:
    container_name: agent-office-backend
    image: ghcr.io/einord/agent-office/backend:latest
    ports:
      - "3100:3100"
      - "3101:3101"
    volumes:
      - ./config.json:/app/config.json:ro
    restart: unless-stopped

  web-ui:
    container_name: agent-office-web
    image: ghcr.io/einord/agent-office/web-ui:latest
    ports:
      - "8080:80"
    depends_on:
      - backend
    restart: unless-stopped
EOF
```

### 4. Start the server

```bash
docker compose up -d
```

The web UI is now available at `http://your-server:8080`

## CLI Client Installation

Run on each developer machine that uses Claude Code:

### Option 1: Docker (recommended)

```bash
docker run -d \
  -v ~/.claude:/root/.claude:ro \
  -e AGENT_OFFICE_SERVER_URL=http://your-server:3100 \
  -e AGENT_OFFICE_API_KEY=your-api-key \
  --name agent-office-cli \
  --restart unless-stopped \
  ghcr.io/einord/agent-office/cli:latest
```

### Option 2: Using docker-compose

Create a `docker-compose.yml` on the developer machine:

```yaml
name: agent-office-cli

services:
  cli:
    container_name: agent-office-cli
    image: ghcr.io/einord/agent-office/cli:latest
    volumes:
      - ~/.claude:/root/.claude:ro
    environment:
      - AGENT_OFFICE_SERVER_URL=http://your-server:3100
      - AGENT_OFFICE_API_KEY=your-api-key
    restart: unless-stopped
```

Then run:

```bash
docker compose up -d
```

## Configuration

### Server config.json

| Field | Description |
|-------|-------------|
| `users` | Array of users with `key` (API key) and `displayName` |
| `server.httpPort` | HTTP API port (default: 3100) |
| `server.wsPort` | WebSocket port (default: 3101) |
| `tokenExpirySeconds` | Session token lifetime (default: 86400 = 24h) |
| `inactivityTimeoutSeconds` | Agent timeout (default: 60) |

### CLI environment variables

| Variable | Description |
|----------|-------------|
| `AGENT_OFFICE_SERVER_URL` | Backend server URL (e.g., `http://server:3100`) |
| `AGENT_OFFICE_API_KEY` | Your API key from config.json |
| `CLAUDE_CONFIG_DIR` | Custom claude directory (default: `~/.claude`) |

## Ports

| Port | Service | Description |
|------|---------|-------------|
| 8080 | Web UI | Browser interface |
| 3100 | Backend HTTP | REST API for CLI clients |
| 3101 | Backend WS | WebSocket for real-time updates |

## Updating

```bash
# On server
docker compose pull
docker compose up -d

# On client machines
docker pull ghcr.io/einord/agent-office/cli:latest
docker restart agent-office-cli
```

## License

MIT
