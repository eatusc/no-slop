#!/usr/bin/env node
// ---------------------------------------------------------------------------
// No Slop — MCP server
// ---------------------------------------------------------------------------
// Exposes the de-slop engine as Model Context Protocol tools so any MCP client
// (Claude Code, Claude Desktop, Cursor, …) can strip AI tells from text on its
// own — no running HTTP server required. Imports src/deslop.js directly, the
// same engine that powers the app, HTTP API, and CLI.
//
// Tools:
//   • deslop      — clean text + slop score + hand-fix flags
//   • slop_score  — score only (cheap check, no rewrite)
//
// Run:      node mcp/server.mjs        (speaks MCP over stdio)
// Register: claude mcp add noslop -- node /ABS/PATH/noslop/mcp/server.mjs
// ---------------------------------------------------------------------------

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { deslop, slopScore, flagsFor } from "../src/deslop.js";

const server = new Server(
  { name: "noslop", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "deslop",
    description:
      "Strip AI-writing tells from text and return the cleaned version. Removes em-dash overload, curly quotes, emoji, filler openers, throat-clearing transitions, hype phrases, and inflated vocabulary. Also returns a 0-100 slop score and any structural 'flags' (e.g. the \"it's not X, it's Y\" antithesis pattern) that should be rewritten by hand. Run final writing through this before delivering it.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to de-slop." },
      },
      required: ["text"],
    },
  },
  {
    name: "slop_score",
    description:
      "Score how much AI slop a piece of text carries (0 = human, 100 = pure slop) without rewriting it. Use as a quick check.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to score." },
      },
      required: ["text"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const text = typeof args?.text === "string" ? args.text : "";

  if (!text.trim()) {
    return {
      isError: true,
      content: [{ type: "text", text: "Error: `text` is required and must be non-empty." }],
    };
  }

  if (name === "slop_score") {
    const s = slopScore(text);
    return {
      content: [
        {
          type: "text",
          text: `Slop score: ${s.score}/100 (${s.label})`,
        },
      ],
    };
  }

  if (name === "deslop") {
    const { text: clean, groups, total } = deslop(text);
    const s = slopScore(text);
    const flags = flagsFor(text);

    const report = {
      clean,
      slop: { score: s.score, label: s.label, signals: s.signals },
      fixes: { total, byCategory: groups },
      flags,
      words: { in: text.split(/\s+/).filter(Boolean).length, out: clean.split(/\s+/).filter(Boolean).length },
    };

    // Human-readable summary first, then the machine-readable JSON report.
    const flagLines = flags.length
      ? flags
          .map((f) => `  • ${f.label} ×${f.count} — ${f.fix}` + (f.samples?.length ? ` (e.g. "${f.samples[0]}")` : ""))
          .join("\n")
      : "  (none)";

    const summary =
      `CLEAN TEXT:\n${clean}\n\n` +
      `Slop score: ${s.score}/100 (${s.label}) · ${total} auto-fix${total === 1 ? "" : "es"} applied\n` +
      `Flags to fix by hand:\n${flagLines}`;

    return {
      content: [
        { type: "text", text: summary },
        { type: "text", text: "JSON report:\n" + JSON.stringify(report, null, 2) },
      ],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr is safe for logs; stdout is reserved for the MCP protocol.
console.error("noslop MCP server running on stdio");
