# Agent Office

Real-time monitoring and synchronization system for tracking Claude AI agent sessions.

## Overview

Agent Office is a multi-component system that monitors Claude Code sessions in real-time, displays agent activity visually, and synchronizes agent state across components via a backend server and WebSocket communication.

### Key Features

- **Real-time Session Monitoring** - Track active Claude Code sessions with live updates
- **Activity Detection** - Automatically detect what tools agents are using (reading, writing, running commands, etc.)
- **Token Usage Tracking** - Monitor token consumption with visual progress bars
- **Server Synchronization** - Optionally sync agent state to a backend for multi-client coordination
- **WebSocket Support** - Real-time communication with visualization clients (e.g., Godot)
- **Beautiful Terminal UI** - Clean, informative display using the blessed library

## Architecture

```
agent-office/
├── cli/                    # Real-time CLI monitor
├── backend/                # REST API + WebSocket server
├── gui/                    # Godot GUI client (in development)
└── packages/               # Shared packages
```

### Components

| Component | Description |
|-----------|-------------|
| **CLI** | Terminal-based monitor that tracks Claude sessions |
| **Backend** | Express server with REST API and WebSocket for agent management |
| **GUI** | Godot-based visual client (embryonic) |

## Requirements

- **Node.js** >= 18
- **pnpm** (package manager)
- **macOS/Linux** (uses `ps` and `lsof` commands)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/einord/agent-office.git
cd agent-office
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Build the project

```bash
# Build all packages
pnpm build

# Or build individually
cd cli && npm run build
cd backend && npm run build
```

## Quick Start

### Running the CLI Monitor

```bash
# Start the CLI monitor (without server sync)
pnpm start

# Or from the cli directory
cd cli && npm start
```

The CLI will automatically:
1. Scan for running Claude Code processes
2. Read session data from `~/.claude/projects/`
3. Display real-time activity and token usage
4. Update every 5 seconds

### Running with Server Synchronization

First, start the backend server:

```bash
cd backend
npm run dev
```

Then start the CLI with server connection:

```bash
# Using command-line arguments
pnpm start -- --server-url http://localhost:3100 --api-key your-api-key

# Or using environment variables
export AGENT_OFFICE_SERVER_URL=http://localhost:3100
export AGENT_OFFICE_API_KEY=your-api-key
pnpm start
```

## Configuration

### Backend Configuration

Create or edit `backend/config.json`:

```json
{
  "users": [
    {
      "key": "your-api-key-here",
      "displayName": "Your Name"
    }
  ],
  "server": {
    "httpPort": 3100,
    "wsPort": 3101
  },
  "tokenExpirySeconds": 86400
}
```

### CLI Options

| Option | Environment Variable | Description |
|--------|---------------------|-------------|
| `--server-url` | `AGENT_OFFICE_SERVER_URL` | Backend server URL |
| `--api-key` | `AGENT_OFFICE_API_KEY` | API key for authentication |

## Development

### Running in Development Mode

```bash
# CLI with hot reload
cd cli && npm run dev

# Backend with hot reload
cd backend && npm run dev
```

### Project Scripts

**Root workspace:**
```bash
pnpm dev          # Start CLI in dev mode
pnpm build        # Build CLI for distribution
pnpm start        # Run CLI
```

**CLI:**
```bash
npm run dev       # Compile and run with test server
npm run build     # Compile TypeScript
npm run start     # Run compiled CLI
```

**Backend:**
```bash
npm run dev       # Run with hot-reload (tsx)
npm run build     # Compile TypeScript
npm run start     # Run compiled backend
```

## API Reference

### Authentication

```http
POST /auth
Content-Type: application/json

{
  "apiKey": "your-api-key"
}
```

Returns a JWT token for authenticated requests.

### Agent Endpoints

All agent endpoints require `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/agents` | List all agents for the authenticated user |
| `GET` | `/agents/:id` | Get a specific agent |
| `POST` | `/agents` | Create a new agent |
| `PUT` | `/agents/:id` | Update agent activity |
| `DELETE` | `/agents/:id` | Remove an agent |

### Health Check

```http
GET /health
```

Returns server health status.

## Agent States & Activities

### States
- `WORKING` - Agent is actively performing tasks
- `IDLE` - Agent is waiting/idle
- `LEAVING` - Agent is exiting

### Activities
`thinking`, `working`, `coding`, `reading`, `writing`, `done`, `idle`, `waiting`, `paused`, `leaving`, `offline`, `disconnected`

## Activity Detection

The CLI automatically detects agent activity based on tool usage:

| Tool | Activity |
|------|----------|
| `Read` | reading |
| `Edit`, `Write` | writing |
| `Bash` | running_command |
| `Glob`, `Grep`, `WebSearch` | searching |
| `Task` | spawning_agent |
| `WebFetch` | fetching |

## WebSocket Protocol

The backend communicates with visualization clients via WebSocket on port 3101.

### Messages from Backend
- `spawn_agent` - Create new agent visualization
- `update_agent` - Update agent state
- `remove_agent` - Remove agent from scene

### Messages to Backend
- `ack` - Acknowledge receipt
- `agent_removed` - Confirm agent removal

## Tech Stack

- **Language:** TypeScript (ES2022)
- **Runtime:** Node.js
- **Package Manager:** pnpm (workspaces)
- **CLI UI:** blessed
- **Backend:** Express + WebSocket (ws)
- **Build:** TypeScript Compiler (tsc)

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Repository

https://github.com/einord/agent-office
