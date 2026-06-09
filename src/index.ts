import express from "express";
import cors from "cors";
import crypto from "crypto";
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
const codes = new Map<string, { clientId: string; redirectUri: string }>();
const tokens = new Map<string, string>();

const CLIENT_ID = "mcp-test-client";
const CLIENT_SECRET = "mcp-test-secret";

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
  });
});

app.get("/authorize", (req, res) => {
  const { client_id, redirect_uri, state } = req.query;
  const code = crypto.randomBytes(16).toString("hex");
  codes.set(code, {
    clientId: client_id as string,
    redirectUri: redirect_uri as string,
  });
  const redirectUrl = new URL(redirect_uri as string);
  redirectUrl.searchParams.set("code", code);
  redirectUrl.searchParams.set("state", state as string);
  res.redirect(redirectUrl.toString());
});

app.post("/token", (req, res) => {
  const { grant_type, code, client_id, client_secret } = req.body;
  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  const codeData = codes.get(code);
  if (!codeData || codeData.clientId !== client_id) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
  codes.delete(code);
  const token = crypto.randomBytes(32).toString("hex");
  tokens.set(token, client_id);
  res.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: 3600,
  });
});

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
});
