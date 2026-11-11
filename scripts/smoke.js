/**
 * Smoke test (spends nothing): starts the MCP server over stdio, lists tools, and checks that
 * (1) with no key a tool returns a clear error, (2) the spend cap refuses pricier tools,
 * (3) with a throwaway UNFUNDED key the payment is rejected cleanly (no crash).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { generatePrivateKey } from "viem/accounts";
import { readFileSync } from "node:fs";

let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };

async function withServer(env, fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["bin/trading-signals-mcp.js"], env: { PATH: process.env.PATH, ...env }, stderr: "pipe" });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);
  try { return await fn(client); } finally { await client.close(); }
}

await withServer({}, async (c) => {
  const { tools } = await c.listTools();
  check(tools.length === 18, `lists ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);
  check(tools.every((t) => /^Price: \$\d/.test(t.description)), "every tool description states its price");
  const ai = tools.find((t) => t.name === "ai_trade_brief");
  check(ai && /^Price: \$0\.08/.test(ai.description) && ai.inputSchema?.required?.includes("symbol"), "ai_trade_brief is listed at $0.08 with required symbol");
  const pkgVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  check(c.getServerVersion()?.version === pkgVersion, `server reports package version ${c.getServerVersion()?.version} (package.json ${pkgVersion})`);
  const r = await c.callTool({ name: "event_gate", arguments: { window: 30 } });
  check(r.isError && /X402_PRIVATE_KEY/.test(r.content[0].text), `no key → clear error: "${r.content[0].text.slice(0, 90)}…"`);
});

await withServer({ X402_PRIVATE_KEY: generatePrivateKey(), MAX_USD_PER_CALL: "0.05" }, async (c) => {
  const r = await c.callTool({ name: "pre_trade_check", arguments: { symbol: "ES" } });
  check(r.isError && /above MAX_USD_PER_CALL/.test(r.content[0].text), `cap 0.05 refuses $0.10 bundle: "${r.content[0].text.slice(0, 80)}…"`);
});

if (process.env.SMOKE_NETWORK !== "0") {
  await withServer({ X402_PRIVATE_KEY: generatePrivateKey() }, async (c) => {
    const r = await c.callTool({ name: "event_gate", arguments: { window: 30 } });
    const t = r.content[0].text;
    check(r.isError && /payment|402|insufficient|balance/i.test(t), `unfunded throwaway wallet → clean payment error: "${t.replace(/\s+/g, " ").slice(0, 140)}…"`);
  });
}

console.log(fail ? `\n${fail} FAILURES` : "\nALL OK");
process.exit(fail ? 1 : 0);
