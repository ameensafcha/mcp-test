import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const app = express();
app.use(cors());
app.use(express.json());

const server = new McpServer({
  name: "mcp-test-server",
  version: "1.0.0",
});

server.tool("echo", { message: z.string() }, async ({ message }) => ({
  content: [{ type: "text", text: `Echo: ${message}` }],
}));

server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: "text", text: `${a} + ${b} = ${a + b}` }],
}));

server.tool("greet", { name: z.string() }, async ({ name }) => ({
  content: [{ type: "text", text: `Hello, ${name}! 👋` }],
}));

server.resource("info", "test://info", async () => ({
  contents: [
    {
      uri: "test://info",
      text: JSON.stringify({
        name: "mcp-test-server",
        version: "1.0.0",
        tools: ["echo", "add", "greet"],
      }),
    },
  ],
}));

const transports = new Map<string, SSEServerTransport>();

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);
  res.on("close", () => transports.delete(transport.sessionId));
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: "Invalid session" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.get("/", (req, res) => {
  res.json({
    name: "MCP Test Server",
    version: "1.0.0",
    endpoints: { sse: "/sse", messages: "/messages" },
    tools: ["echo", "add", "greet"],
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Test Server running on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});
