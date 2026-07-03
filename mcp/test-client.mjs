// ---------------------------------------------------------------------------
// No Slop — MCP test client
// Spawns mcp/server.mjs and drives it over the real MCP stdio protocol:
// lists tools, then runs a batch of AI-slop samples through the `deslop` tool.
// ---------------------------------------------------------------------------
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLES = [
  {
    label: "Hype + antithesis + emoji",
    text: "It's not just a tool, it's a revolution. 🚀 In today's fast-paced world, our seamless platform leverages cutting-edge AI to deliver a myriad of game-changing features.",
  },
  {
    label: "Throat-clearing / filler",
    text: "Furthermore, it is important to note that, at the end of the day, we must delve into the intricate tapestry of synergy to truly unlock our potential.",
  },
  {
    label: "Corporate launch slop",
    text: "We are thrilled to announce that our innovative, robust solution empowers users to elevate their experience and unlock their full potential like never before.",
  },
  {
    label: "Resume-speak slop",
    text: "As a passionate, results-driven engineer, I leverage cutting-edge technologies to architect robust, scalable solutions that drive meaningful impact across the organization.",
  },
];

const transport = new StdioClientTransport({
  command: "node",
  args: [path.join(__dirname, "server.mjs")],
});

const client = new Client({ name: "noslop-test", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("Tools advertised by the server:");
for (const t of tools) console.log(`  • ${t.name} — ${t.description.slice(0, 70)}…`);
console.log("\n" + "=".repeat(78) + "\n");

for (const s of SAMPLES) {
  const res = await client.callTool({ name: "deslop", arguments: { text: s.text } });
  // First content block is the human-readable summary (CLEAN + score + flags).
  console.log(`### ${s.label}`);
  console.log(`BEFORE: ${s.text}\n`);
  console.log(res.content[0].text);
  console.log("\n" + "-".repeat(78) + "\n");
}

await client.close();
