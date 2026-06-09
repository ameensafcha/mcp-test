import express from "express";
import cors from "cors";
import crypto from "crypto";
import { z } from "zod";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BASE_URL = process.env.RENDER_EXTERNAL_URL || `https://mcp-test-0gft.onrender.com`;

const codes = new Map<string, { clientId: string; redirectUri: string; codeChallenge: string }>();
const tokens = new Map<string, string>();

app.get("/.well-known/oauth-protected-resource", (req, res) => {
  res.json({
    resource: BASE_URL,
    authorization_servers: [BASE_URL],
    scopes_supported: ["mcp:tools"],
    bearer_methods_supported: ["header"],
  });
});

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint: `${BASE_URL}/token`,
    registration_endpoint: `${BASE_URL}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp:tools", "offline_access"],
    client_id_metadata_document_supported: true,
  });
});

app.post("/register", (req, res) => {
  const clientId = crypto.randomUUID();
  res.json({
    client_id: clientId,
    client_name: req.body.client_name || "Claude",
    redirect_uris: req.body.redirect_uris || ["https://claude.ai/api/mcp/auth_callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
});

app.get("/authorize", (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.query;
  const code = crypto.randomBytes(16).toString("hex");
  codes.set(code, {
    clientId: client_id as string,
    redirectUri: redirect_uri as string,
    codeChallenge: code_challenge as string,
  });
  const redirectUrl = new URL(redirect_uri as string);
  redirectUrl.searchParams.set("code", code);
  redirectUrl.searchParams.set("state", state as string);
  res.redirect(redirectUrl.toString());
});

app.post("/token", (req, res) => {
  const { grant_type, code, client_id, code_verifier } = req.body;
  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  const codeData = codes.get(code);
  if (!codeData || codeData.clientId !== client_id) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
  if (code_verifier) {
    const expectedChallenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
    if (expectedChallenge !== codeData.codeChallenge) {
      res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
      return;
    }
  }
  codes.delete(code);
  const accessToken = crypto.randomBytes(32).toString("hex");
  tokens.set(accessToken, client_id as string);
  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: crypto.randomBytes(32).toString("hex"),
    scope: "mcp:tools",
  });
});

app.post("/token/refresh", (req, res) => {
  const accessToken = crypto.randomBytes(32).toString("hex");
  tokens.set(accessToken, req.body.client_id as string);
  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: crypto.randomBytes(32).toString("hex"),
    scope: "mcp:tools",
  });
});

function verifyAuth(req: express.Request): boolean {
  return true; // TEMPORARY: Bypass auth for testing
  // const auth = req.headers.authorization;
  // if (!auth || !auth.startsWith("Bearer ")) return false;
  // return tokens.has(auth.slice(7));
}

app.all("/mcp", async (req, res) => {
  if (!verifyAuth(req)) {
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource", scope="mcp:tools"`);
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    res.write("event: endpoint\ndata: /mcp\n\n");
    return;
  }
  if (req.method === "POST") {
    const body = req.body;
    if (body.method === "initialize") {
      res.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "mcp-test-server", version: "1.0.0" },
        },
      });
      return;
    }
    if (body.method === "notifications/initialized") {
      res.status(202).end();
      return;
    }
    if (body.method === "tools/list") {
      res.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            { name: "echo", description: "Echo a message back", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
            { name: "add", description: "Add two numbers", inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] } },
            { name: "greet", description: "Greet someone", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
          ],
        },
      });
      return;
    }
    if (body.method === "tools/call") {
      const { name, arguments: args } = body.params;
      let result: string;
      if (name === "echo") result = `Echo: ${args.message}`;
      else if (name === "add") result = `${args.a} + ${args.b} = ${args.a + args.b}`;
      else if (name === "greet") result = `Hello, ${args.name}! 👋`;
      else { res.status(400).json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Tool not found" } }); return; }
      res.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: result }] },
      });
      return;
    }
    res.status(200).json({ jsonrpc: "2.0", id: body.id, result: {} });
    return;
  }
  res.status(405).end();
});

app.get("/", (req, res) => {
  res.json({ name: "MCP Test Server", version: "1.0.0", mcp_endpoint: `${BASE_URL}/mcp` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MCP Test Server running on ${BASE_URL}`));
