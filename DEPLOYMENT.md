# Agent Office - Server Deployment Guide

Quick guide for deploying Agent Office server with Web UI using Docker.

## Prerequisites

- Docker and Docker Compose installed
- Port 8080 (Web UI), 3100 (HTTP API), 3101 (WebSocket) available

## Quick Start

### Option 1: Using pre-built images (recommended)

1. Create a directory and download the compose file:

```bash
mkdir agent-office && cd agent-office
curl -O https://raw.githubusercontent.com/einord/agent-office/main/docker-compose.yml
```

2. **IMPORTANT:** Create a config file (must exist before starting):

```bash
cat > config.json << 'EOF'
{
  "users": [
    { "key": "your-api-key-here", "displayName": "Your Name" }
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

3. Update docker-compose.yml to mount the config:

```yaml
# Under backend service, update volumes:
volumes:
  - ./config.json:/app/config.json:ro
```

4. Start the services:

```bash
docker compose up -d
```

5. Access the UI at `http://your-server:8080`

### Option 2: Build from source

```bash
git clone https://github.com/einord/agent-office.git
cd agent-office
docker compose up -d --build
```

## Configuration

### Backend config (config.json)

```json
{
  "users": [
    { "key": "api-key-1", "displayName": "User 1" },
    { "key": "api-key-2", "displayName": "User 2" }
  ],
  "server": {
    "httpPort": 3100,
    "wsPort": 3101
  },
  "tokenExpirySeconds": 86400,
  "inactivityTimeoutSeconds": 60
}
```

### Ports

| Port | Service | Description |
|------|---------|-------------|
| 8080 | Web UI | Godot web interface |
| 3100 | Backend HTTP | REST API for CLI clients |
| 3101 | Backend WS | WebSocket for real-time updates |

## CLI Client Setup

On developer machines, install and run the CLI:

```bash
# Via npm
npm install -g agent-office
agent-office --server-url http://your-server:3100 --api-key your-api-key

# Or via Docker
docker run --rm -it \
  -v ~/.claude:/root/.claude:ro \
  -e AGENT_OFFICE_SERVER_URL=http://your-server:3100 \
  -e AGENT_OFFICE_API_KEY=your-api-key \
  ghcr.io/einord/agent-office/cli:latest
```

## Reverse Proxy (optional)

If using a reverse proxy like Traefik or nginx in front:

### nginx example

```nginx
server {
    listen 80;
    server_name agent-office.example.com;

    # Web UI
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket for CLI clients (direct backend access)
    location /ws {
        proxy_pass http://localhost:3101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Troubleshooting

### Check service status

```bash
docker compose ps
docker compose logs -f
```

### Verify backend health

```bash
curl http://localhost:3100/health
```

### Verify web UI

```bash
curl -I http://localhost:8080/health
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   CLI Client    │────▶│    Backend      │
│  (developer PC) │     │  :3100 (HTTP)   │
└─────────────────┘     │  :3101 (WS)     │
                        └────────┬────────┘
                                 │
┌─────────────────┐              │
│    Web UI       │◀─────────────┘
│    :8080        │  (internal docker network)
│  (nginx+godot)  │
└─────────────────┘
```
