# No Slop — MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
No Slop de-slop engine as tools any MCP client (Claude Code, Claude Desktop, Cursor)
can call directly. It imports [`src/deslop.js`](../src/deslop.js) — the same engine
behind the app, HTTP API, and CLI — so **no running server is required**.

## Tools

| Tool | Input | Returns |
|------|-------|---------|
| `deslop` | `{ text }` | Cleaned text + slop score + hand-fix flags + a JSON report |
| `slop_score` | `{ text }` | A 0–100 slop score (no rewrite) |

## Install & register

```bash
npm install                      # installs @modelcontextprotocol/sdk
# Claude Code (available in every project):
claude mcp add -s user noslop -- node /ABSOLUTE/PATH/noslop/mcp/server.mjs
```

For Claude Desktop / Cursor, add to the client's MCP config:

```jsonc
{
  "mcpServers": {
    "noslop": { "command": "node", "args": ["/ABSOLUTE/PATH/noslop/mcp/server.mjs"] }
  }
}
```

Restart the client, then just ask: *"run my draft through noslop before you show me."*

## Test it without a client

```bash
node mcp/test-client.mjs          # spawns the server, runs slop samples through it
```

## How it works

`server.mjs` speaks MCP over **stdio** (stdout is the protocol channel; logs go to
stderr). It advertises the tools via `ListTools`, handles `CallTool`, and calls the
pure `deslop()` / `slopScore()` / `flagsFor()` functions. The `flags` it returns are
the structural tells (the "it's not X, it's Y" antithesis family) the engine won't
auto-rewrite — a human (or the calling model) should fix those by hand.
