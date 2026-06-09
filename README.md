# MCP Test Server

Claude ke liye generic test MCP server - local ya remote (Render) pe deploy karke use kar sakte ho.

## Tools

| Tool | Input | Description |
|------|-------|-------------|
| `echo` | `message: string` | Message wapas bhejta hai |
| `add` | `a: number, b: number` | Do numbers ka sum |
| `greet` | `name: string` | Greeting deta hai |

## Local Setup (Claude Desktop)

```bash
cd mcp-test
npm install
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "test-server": {
      "command": "npx",
      "args": ["tsx", "S:\\testing\\mimi\\mcp-test\\src\\index.ts"]
    }
  }
}
```

## Remote Setup (Render)

### Deploy

1. GitHub pe push karo:

```bash
git init
git add .
git commit -m "initial mcp server"
git remote add origin https://github.com/YOUR-USERNAME/mcp-test.git
git push -u origin main
```

2. [render.com](https://render.com) pe **New Web Service** banao
3. GitHub repo connect karo
4. Settings:

| Field | Value |
|-------|-------|
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Instance Type | `Free` |

5. Deploy karo, URL milega jaise: `https://mcp-test-server-xxxx.onrender.com`

### Claude Connect Karo

1. [claude.ai](https://claude.ai) pe Settings → Connectors jao
2. "Add custom connector" pe click karo
3. URL dalo: `https://mcp-test-server-xxxx.onrender.com/sse`
4. Save karo

Mobile app pe same connector automatically dikhega.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sse` | GET | SSE connection |
| `/messages?sessionId=x` | POST | MCP messages |
| `/` | GET | Server info |

## Tech Stack

- TypeScript
- Express
- @modelcontextprotocol/sdk
