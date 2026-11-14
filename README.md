# Trading Signals MCP

An MCP server that gives Claude, Cursor, LangChain and any other MCP-capable agent one-line access to the [Trading Signals Toolkit](https://signals.incomefather.com): a $0.10 GO / CAUTION / NO_GO pre-trade check, a futures event-risk gate, session brief and macro event study built from US government macro data (BLS, Federal Reserve, Treasury, CFTC), SEC Form 4 insider buys and cluster buys, Base token safety verdicts, and small quant calculators. Each tool call pays for itself automatically over [x402](https://www.x402.org/) in USDC on Base, from a wallet you control, with a per-call spend cap. You can also try the HTTP API with a free API key (100 calls/month, no card) from the [pricing page](https://signals.incomefather.com/pricing).

Copy-paste quickstarts (curl, JavaScript and Python x402 clients, Claude Desktop / Cursor / Cline configs, LangChain, OpenAI Agents SDK): [gdietsch/trading-signals-examples](https://github.com/gdietsch/trading-signals-examples). Guides: [signals.incomefather.com/guides](https://signals.incomefather.com/guides).

## Hosted remote server (no install, no wallet)

The same 21 tools are also served as a remote MCP server (Streamable HTTP):

```
https://signals.incomefather.com/mcp
```

- **No key:** small anonymous daily allowance (AI trade brief 1 per day).
- **Free key** (100 calls/month, no card) or Starter/Pro key from [/pricing](https://signals.incomefather.com/pricing): send `Authorization: Bearer tsk_…`, or append `?key=tsk_…` to the URL in clients that can't set headers.

Cursor / Claude Code / Windsurf (`mcp.json`):

```json
{
  "mcpServers": {
    "trading-signals": {
      "url": "https://signals.incomefather.com/mcp",
      "headers": { "Authorization": "Bearer tsk_your_key" }
    }
  }
}
```

Claude (web/desktop): Settings → Connectors → Add custom connector → `https://signals.incomefather.com/mcp`. ChatGPT: Settings → Apps & Connectors → Advanced settings → Developer mode → Create → same URL, no authentication. [Privacy](https://signals.incomefather.com/privacy) · [Terms](https://signals.incomefather.com/terms)

**Grok Build:** this repo is a Grok Build plugin (`.grok-plugin/plugin.json` and `.mcp.json`). It connects to the hosted MCP above. No install and no wallet. The local `npx -y x402-trading-signals-mcp` path in [Setup](#setup) is a separate, optional alternative that pays per call from your own USDC wallet; it is not auto-started by the plugin, because it needs `X402_PRIVATE_KEY` in your client environment.

**Cursor:** `.cursor-plugin/plugin.json` and `mcp.json` package the same hosted MCP for the official Cursor Marketplace. The Grok Build files above are unchanged.

The local package below pays per call over x402 from your own wallet instead.

## Tools and prices

| Tool | Price (USDC) | What it returns |
|---|---|---|
| `ai_trade_brief` | $0.08 | AI-written structured brief for ES/NQ/CL/GC/ZN from the toolkit's own data: bias, confidence, key levels, risks, catalysts (ET), trade-plan notes, GO/CAUTION/NO_GO tradeability. Not charged if the AI is unavailable |
| `pre_trade_check` | $0.10 | One GO / CAUTION / NO_GO verdict with plain reasons for ES/NQ/CL/GC/ZN: event gate + session brief + SEC insider activity (+ optional Base token verdict) |
| `event_gate` | $0.01 | safeToTrade + next high-impact US release (CPI, NFP, PPI, FOMC, Treasury auctions) |
| `event_study` | $0.02 | What happened last time: ES/NQ/RTY/ZN moves +5/+15/+30/+60 min after the last N CPI, jobs, FOMC, PPI, retail sales, GDP or PCE releases, percentiles, max adverse move and a suggested stop width |
| `session_brief` | $0.03 | Upcoming releases, latest BLS values, Treasury 2y/10y/2s10s, CFTC COT positioning, holidays, verdict |
| `token_verdict` | $0.01 | Call before buying a Base ERC-20: safe / caution / avoid + A-F with honeypot simulation and taxes, owner/mint/proxy/blacklist/pause flags, liquidity and LP lock, top-10 holders, launch snipers and bundles |
| `solana_token_verdict` | $0.01 | Call before buying a Solana mint: safe / caution / avoid + A-F with mint and freeze authority, Token-2022 traps, liquidity and LP lock, live sell test, top-10 holders, creator stake and linked insider (sniper/bundle) wallets |
| `whale_flow` | $0.02 | Are big wallets buying or dumping a Base or Solana token? Large DEX trades (1-24h) in the top 3 pools: whale buy/sell USD, net flow, accumulation / distribution signal, hourly flow, largest trades, top accumulators and distributors. No CEX in/outflows |
| `wallet_pay_readiness` | $0.01 | Can this Base or Solana wallet pay a USDC amount? Balances, canPay (x402 / direct transfer), shortfalls, USDC blacklist or frozen flags, wallet type and open token approvals, with ok / review / cannot_pay |
| `sanctions_screen` | $0.01 | OFAC sanctions screen for a crypto address (any chain) and/or a name (fuzzy score): clear / match / possible_match with matched SDN or Consolidated entries, list publish date and sources. Informational, not legal advice |
| `insider_buys` | $0.01 | SEC Form 4 open-market insider purchases for one ticker |
| `insider_clusters` | $0.02 | Tickers with several distinct insiders buying in the last N days |
| `sec_13f_holdings` | $0.02 | Latest SEC 13F holdings for a fund manager (CIK or name): top positions, value, % of portfolio and quarter-over-quarter new / added / trimmed / exited |
| `sec_13f_holders` | $0.02 | Which notable fund managers (Berkshire, Pershing Square, Bridgewater and ~24 more) hold a stock, with quarter-over-quarter change |
| `token_pre_trade` | $0.015 | One GO / CAUTION / STOP answer before buying a Solana or Base token: token verdict + OFAC screen of the counterparty wallet and token authorities + wallet pay-readiness, cheaper than the separate calls |
| `cot_screener` | $0.02 | Weekly CFTC COT positioning across 45 futures markets: large-speculator net, % of open interest, weekly change, 3-year percentile, crowded long / short flags, biggest shifts |
| `treasury_desk` | $0.01 | US rates snapshot: Treasury par curve with 2s10s / 3m10y / 5s30s and 1d/1w/1m changes, upcoming auctions with ET close times, recent results with bid-to-cover and dealer share vs prior auctions |
| `vwap_bands` | $0.005 | VWAP + standard-deviation bands from your bars |
| `opening_range` | $0.005 | Opening range, breakout state and targets from your bars |
| `atr_stop` | $0.005 | Wilder ATR, stop price and position size |
| `backtest_opening_range_breakout` | $0.02 | Opening-range-breakout backtest on your bars |

Failed calls (bad input, upstream outage) return an error and are **not charged**.

## Setup

You need Node.js 18.17+ and a **dedicated** Base wallet private key holding a few dollars of USDC on Base mainnet (no ETH needed; the facilitator pays gas).

| Env var | Required | Default | Meaning |
|---|---|---|---|
| `X402_PRIVATE_KEY` | yes (to call tools) | – | 0x-prefixed private key of the paying wallet |
| `MAX_USD_PER_CALL` | no | `0.50` | Hard cap per call; anything pricier is refused before signing |
| `TRADING_SIGNALS_BASE_URL` | no | `https://signals.incomefather.com` | API base URL |

Run it directly:

```bash
X402_PRIVATE_KEY=0xYOUR_DEDICATED_WALLET_KEY npx -y x402-trading-signals-mcp
```

### Claude Desktop

`claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "trading-signals": {
      "command": "npx",
      "args": ["-y", "x402-trading-signals-mcp"],
      "env": {
        "X402_PRIVATE_KEY": "0xYOUR_DEDICATED_WALLET_KEY",
        "MAX_USD_PER_CALL": "0.50"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "trading-signals": {
      "command": "npx",
      "args": ["-y", "x402-trading-signals-mcp"],
      "env": {
        "X402_PRIVATE_KEY": "0xYOUR_DEDICATED_WALLET_KEY",
        "MAX_USD_PER_CALL": "0.50"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add trading-signals \
  --env X402_PRIVATE_KEY=0xYOUR_DEDICATED_WALLET_KEY \
  --env MAX_USD_PER_CALL=0.50 \
  -- npx -y x402-trading-signals-mcp
```

### LangChain (langchain-mcp-adapters)

```python
# pip install langchain-mcp-adapters langgraph "langchain[anthropic]"
import asyncio, os
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

async def main():
    client = MultiServerMCPClient({
        "trading-signals": {
            "command": "npx",
            "args": ["-y", "x402-trading-signals-mcp"],
            "transport": "stdio",
            "env": {**os.environ, "X402_PRIVATE_KEY": os.environ["X402_PRIVATE_KEY"], "MAX_USD_PER_CALL": "0.50"},
        }
    })
    tools = await client.get_tools()
    agent = create_react_agent("anthropic:claude-sonnet-4-5", tools)
    out = await agent.ainvoke({"messages": "Run a pre-trade check for NQ with ticker NVDA."})
    print(out["messages"][-1].content)

asyncio.run(main())
```

## How payment works

Each tool calls one HTTPS route. The API answers `402 Payment Required` with the exact USDC amount; this server signs an EIP-3009 `transferWithAuthorization` for that amount (only USDC on Base mainnet, only up to `MAX_USD_PER_CALL`) and retries. Paid results include a `_payment` field with the settlement transaction and a BaseScan link. Without `X402_PRIVATE_KEY` the server still starts and lists its tools; calling one returns a clear "no wallet configured" error and charges nothing.

## Security

- **Use a dedicated, low-balance wallet.** Create a fresh wallet just for this, fund it with only what you are willing to spend (for example $2–$5 of USDC on Base), and never use a key that holds other funds.
- The key stays on your machine: it is read from the environment, used only to sign payment authorizations locally, and never sent to the API or logged.
- Keep `MAX_USD_PER_CALL` low. The default ($0.50) allows every tool; set `0.05` to block the $0.10 bundle.
- Your MCP client config file now contains a private key: don't commit or share it.

## Development

```bash
npm install
npm run build   # syntax/import check (plain ESM, no compile step)
npm test        # starts the server over stdio, lists tools, checks unpaid/capped errors (spends nothing)
```

## Disclaimer

Informational only, not investment advice. Data comes from public sources (US government agencies, SEC EDGAR, Base mainnet) and may be delayed, incomplete or wrong. You are responsible for your own trading decisions and for the funds in the wallet you configure.

MIT License.
