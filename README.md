# Trading Signals MCP

An MCP server that gives Claude, Cursor, LangChain and any other MCP-capable agent one-line access to the [Trading Signals Toolkit](https://trading-signals-toolkit.onrender.com): a $0.25 GO / CAUTION / NO_GO pre-trade check, a futures event-risk gate and session brief built from US government macro data (BLS, Federal Reserve, Treasury, CFTC), SEC Form 4 insider buys and cluster buys, Base token safety verdicts, and small quant calculators. There are no API keys or sign-ups: each tool call pays for itself automatically over [x402](https://www.x402.org/) in USDC on Base, from a wallet you control, with a per-call spend cap.

## Tools and prices

| Tool | Price (USDC) | What it returns |
|---|---|---|
| `pre_trade_check` | $0.25 | One GO / CAUTION / NO_GO verdict with plain reasons for ES/NQ/CL/GC/ZN: event gate + session brief + SEC insider activity (+ optional Base token verdict) |
| `event_gate` | $0.01 | safeToTrade + next high-impact US release (CPI, NFP, PPI, FOMC, Treasury auctions) |
| `session_brief` | $0.03 | Upcoming releases, latest BLS values, Treasury 2y/10y/2s10s, CFTC COT positioning, holidays, verdict |
| `token_verdict` | $0.02 | A-F verdict for a Base ERC-20: owner, proxy, liquidity, honeypot simulation, taxes |
| `insider_buys` | $0.03 | SEC Form 4 open-market insider purchases for one ticker |
| `insider_clusters` | $0.05 | Tickers with several distinct insiders buying in the last N days |
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
| `TRADING_SIGNALS_BASE_URL` | no | `https://trading-signals-toolkit.onrender.com` | API base URL |

Run it directly:

```bash
X402_PRIVATE_KEY=0xYOUR_DEDICATED_WALLET_KEY npx -y github:gdietsch/trading-signals-mcp
```

### Claude Desktop

`claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "trading-signals": {
      "command": "npx",
      "args": ["-y", "github:gdietsch/trading-signals-mcp"],
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
      "args": ["-y", "github:gdietsch/trading-signals-mcp"],
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
  -- npx -y github:gdietsch/trading-signals-mcp
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
            "args": ["-y", "github:gdietsch/trading-signals-mcp"],
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
- Keep `MAX_USD_PER_CALL` low. The default ($0.50) allows every tool; set `0.10` to block the $0.25 bundle.
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
