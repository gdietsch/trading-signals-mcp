/**
 * Trading Signals Toolkit MCP server (stdio). Each tool calls one paid HTTP route and pays
 * automatically over x402 (USDC on Base mainnet) from the buyer's own wallet.
 *
 * Env:
 *   X402_PRIVATE_KEY   0x… private key of a DEDICATED low-balance Base wallet holding USDC (required to call tools)
 *   MAX_USD_PER_CALL   per-call spend cap in USD (default 0.50); payments above it are refused
 *   TRADING_SIGNALS_BASE_URL  API base URL (default https://trading-signals-toolkit.onrender.com)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { TOOLS, fmtPrice } from "./tools.js";

export const VERSION = "0.1.1";
export const DEFAULT_BASE_URL = "https://trading-signals-toolkit.onrender.com";
const BASE_MAINNET = "eip155:8453";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function config(env = process.env) {
  const baseUrl = (env.TRADING_SIGNALS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const capRaw = env.MAX_USD_PER_CALL;
  const cap = capRaw == null || capRaw === "" ? 0.5 : Number(capRaw);
  if (!Number.isFinite(cap) || cap <= 0) throw new Error("MAX_USD_PER_CALL must be a positive number of USD, e.g. 0.50");
  const timeoutMs = Number(env.TRADING_SIGNALS_TIMEOUT_MS || 90000);
  return { baseUrl, cap, timeoutMs, key: (env.X402_PRIVATE_KEY || "").trim() };
}

let payingFetch = null;
let payerAddress = null;
function getPayingFetch(cfg) {
  if (payingFetch) return payingFetch;
  if (!cfg.key) return null;
  const key = cfg.key.startsWith("0x") ? cfg.key : `0x${cfg.key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("X402_PRIVATE_KEY must be a 32-byte hex private key (0x + 64 hex chars)");
  const account = privateKeyToAccount(key);
  payerAddress = account.address;
  const capAtomic = BigInt(Math.round(cfg.cap * 1e6));
  payingFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: BASE_MAINNET, client: new ExactEvmScheme(account) }],
    spendControls: { maxAmountPerPayment: `$${cfg.cap}` },
    // Only ever pay USDC on Base mainnet, at or below the cap.
    policies: [
      (_v, reqs) => reqs.filter((r) => r.network === BASE_MAINNET
        && String(r.asset || "").toLowerCase() === USDC_BASE
        && BigInt(r.amount ?? r.maxAmountRequired ?? "0") <= capAtomic),
    ],
  });
  return payingFetch;
}

function text(obj, isError = false) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }], ...(isError ? { isError: true } : {}) };
}

async function callRoute(tool, args, cfg) {
  let f;
  try { f = getPayingFetch(cfg); } catch (e) { return text(`Configuration error: ${e.message}`, true); }
  if (!f) {
    return text(
      `No wallet configured. Set X402_PRIVATE_KEY to the private key of a dedicated, low-balance Base wallet holding a little USDC, then restart this MCP server. ` +
      `This tool costs ${fmtPrice(tool.price)} per call (cap: MAX_USD_PER_CALL=${cfg.cap}). Nothing was charged.`,
      true,
    );
  }
  if (tool.price > cfg.cap) {
    return text(`Refused: ${tool.name} costs ${fmtPrice(tool.price)}, above MAX_USD_PER_CALL=${cfg.cap}. Raise the cap to use it. Nothing was charged.`, true);
  }
  let url = cfg.baseUrl + tool.path;
  const init = { method: tool.method, headers: { Accept: "application/json", "User-Agent": `trading-signals-mcp/${VERSION}` } };
  const clean = Object.fromEntries(Object.entries(args || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  if (tool.method === "GET") {
    const qs = new URLSearchParams(Object.entries(clean).map(([k, v]) => [k, String(v)])).toString();
    if (qs) url += `?${qs}`;
  } else {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(clean);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  let res;
  try {
    res = await f(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    const msg = e?.name === "AbortError" ? `timed out after ${cfg.timeoutMs} ms (the API may be waking up; retry)` : String(e?.message || e);
    return text(`Request failed: ${msg}`, true);
  } finally {
    clearTimeout(timer);
  }
  const raw = await res.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw.slice(0, 2000); }
  let payment = null;
  const pr = res.headers.get("payment-response") || res.headers.get("x-payment-response");
  if (pr) {
    try {
      const d = decodePaymentResponseHeader(pr);
      payment = { success: d.success, transaction: d.transaction, network: d.network, payer: d.payer, explorer: d.transaction ? `https://basescan.org/tx/${d.transaction}` : undefined };
    } catch { /* ignore */ }
  }
  if (!res.ok) {
    if (res.status === 402) {
      return text({ error: "payment_not_completed", status: 402, message: `Payment was not accepted. Check that wallet ${payerAddress} holds USDC on Base and the price (${fmtPrice(tool.price)}) is within MAX_USD_PER_CALL=${cfg.cap}.`, detail: typeof body === "object" ? body.error ?? body : body }, true);
    }
    return text({ error: "api_error", status: res.status, charged: false, body }, true);
  }
  return text(payment ? { ...body, _payment: { priceUsd: tool.price, ...payment } } : body);
}

export function createServer(env = process.env) {
  const cfg = config(env);
  const server = new McpServer({ name: "trading-signals-mcp", version: VERSION });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: `${tool.title} (${fmtPrice(tool.price)})`,
        description: `Price: ${fmtPrice(tool.price)} USDC per call on Base, paid automatically via x402 from X402_PRIVATE_KEY. ${tool.description} Failed calls (4xx/5xx) are not charged. Informational only, not investment advice.`,
        inputSchema: tool.input,
        annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: false },
      },
      async (args) => callRoute(tool, args, cfg),
    );
  }
  return server;
}

export async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  const cfg = config();
  console.error(`trading-signals-mcp ${VERSION} ready (${TOOLS.length} tools, API ${cfg.baseUrl}, cap $${cfg.cap}/call, wallet ${cfg.key ? "configured" : "NOT configured — set X402_PRIVATE_KEY"})`);
}
