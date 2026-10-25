[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/minte-app-untun-mcp-badge.png)](https://mseep.ai/app/minte-app-untun-mcp)

# Untun MCP - Secure Tunnels for Local Servers [![NPM Version](https://img.shields.io/npm/v/@minte-app/untun-mcp.svg)](https://www.npmjs.com/package/@minte-app/untun-mcp) [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[![LightNow capabilities](https://lightnow.ai/badge/io.github.minte-app/untun-mcp)](https://lightnow.ai/servers/io.github.minte-app/untun-mcp)

## ❌ Without Untun MCP
Local development can be frustrating when you need to expose your server to the internet:

- ❌ Complex tunnel setup and command-line arguments
- ❌ Hard to track which tunnels are running across different terminal sessions
- ❌ No easy way to manage multiple tunnels from a single interface

## ✅ With Untun MCP
Untun MCP creates and manages secure tunnels directly from your AI assistant:

- 1️⃣ Simply tell your AI assistant to create a tunnel
- 2️⃣ Get a public URL within seconds
- 3️⃣ Manage all your tunnels with simple natural language commands

No complex CLI commands to remember. No more lost tunnels. Easy management of multiple tunnels.

## ⚠️ Disclaimer
This project uses the [untun](https://github.com/unjs/untun) package from npm but is **not** officially affiliated with, endorsed by, or connected to Cloudflare or UnJS. This is an independent, community-developed MCP wrapper around the untun CLI tool.

## 🛠️ Getting Started

### Requirements
- Node.js >= v18.0.0
- MCP-compatible client (Cursor, Claude Desktop, VS Code, etc.)
- `untun` CLI tool (installed automatically as needed)

### Install in Cursor
Go to: `Settings` -> `Cursor Settings` -> `MCP` -> `Add new global MCP server`

Paste the following configuration into your Cursor `~/.cursor/mcp.json` file:

```json
{
  "mcpServers": {
    "untun": {
      "command": "npx",
      "args": ["-y", "@minte-app/untun-mcp@latest"]
    }
  }
}
```

### Install in VS Code
[Install in VS Code (npx)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%7B%22name%22%3A%22untun%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40minte-app%2Funtun-mcp%40latest%22%5D%7D)

Add this to your VS Code MCP config file:

```json
{
  "servers": {
    "Untun": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@minte-app/untun-mcp@latest"]
    }
  }
}
```

### Installing via Smithery

To install Untun Secure Tunnel Manager for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@minte-app/untun-mcp):

```bash
npx -y @smithery/cli install @minte-app/untun-mcp --client claude
```

### Install in Claude Desktop
Add this to your Claude Desktop `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "Untun": {
      "command": "npx",
      "args": ["-y", "@minte-app/untun-mcp@latest"]
    }
  }
}
```

## 🔨 How to Use

Ask your AI assistant to create a tunnel with natural language:

```
Create a tunnel to my localhost:3000 server
```

Check your running tunnels:

```
Show me all my active tunnels
```

Stop a specific tunnel:

```
Stop the tunnel to localhost:3000
```

## Available Tools

- `start_tunnel`: Creates a secure tunnel from a public internet address to your local server
  - `url` (required): The local URL to expose (e.g., http://localhost:3000)
  - `name` (optional): Custom name for the tunnel

- `stop_tunnel`: Stops a running tunnel or all local tunnels
  - `name` (optional): Name of a specific tunnel to stop

- `list_tunnels`: Lists all active tunnels including their status and details

## Troubleshooting

### Tunnel Not Starting
If your tunnel doesn't start, try these steps:

1. Make sure your local server is running
2. Check if there's already a tunnel running for that port
3. Use `list_tunnels` to check the status of all tunnels

### Remote Tunnels
Tunnels are tracked by hostname. If you see "remote" tunnels that can't be stopped, they are likely running on another machine. You'll need to stop them from the original machine.

## Development

Clone the project and install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

## License
MIT 