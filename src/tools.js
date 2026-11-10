/** Tool catalog: one MCP tool per paid Trading Signals Toolkit route. Prices are USD per call (USDC on Base). */
import { z } from "zod";

const SYMBOL = z.enum(["ES", "NQ", "CL", "GC", "ZN"]).describe("Futures root: ES (E-mini S&P 500), NQ (E-mini Nasdaq-100), CL (WTI crude), GC (gold), ZN (10-year T-note)");
const WINDOW = z.number().int().min(1).max(240).optional().describe("Look-ahead window in minutes (1-240, default 30)");
const BAR = z.union([
  z.object({ t: z.union([z.string(), z.number()]), o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number() }),
  z.array(z.union([z.string(), z.number()])).length(6),
]);
const BARS = z.array(BAR).min(2).max(5000).describe("OHLCV bars, oldest first: {t (ISO-8601 or epoch s/ms), o, h, l, c, v} or [t,o,h,l,c,v]. Max 5000.");
const TZ = z.string().optional().describe("IANA timezone for sessions (default America/New_York)");

export const TOOLS = [
  {
    name: "pre_trade_check",
    price: 0.25,
    method: "GET",
    path: "/bundle/pre-trade-check",
    title: "Pre-Trade Check (bundle)",
    description: "One GO / CAUTION / NO_GO answer with plain reasons before trading a futures contract: event-risk gate + session brief (US macro calendar, Treasury yields, CFTC positioning, holidays) + SEC Form 4 insider activity (for `ticker`, else top market-wide insider clusters) + optional Base token verdict (`token`).",
    input: {
      symbol: SYMBOL,
      window: WINDOW,
      ticker: z.string().max(10).optional().describe("Optional US equity ticker (e.g. AAPL): adds its SEC insider buys"),
      token: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Optional Base ERC-20 token address: adds an A-F token safety verdict"),
    },
  },
  {
    name: "event_gate",
    price: 0.01,
    method: "GET",
    path: "/futures/event-gate",
    title: "Event-Risk Gate",
    description: "safeToTrade verdict plus the next high-impact US release (BLS CPI/NFP/PPI, FOMC, Treasury auctions) within a minutes window. US public-domain agency data.",
    input: { window: WINDOW },
  },
  {
    name: "session_brief",
    price: 0.03,
    method: "GET",
    path: "/futures/session-brief",
    title: "Futures Session Brief",
    description: "Session brief for ES/NQ/CL/GC/ZN: upcoming US high-impact releases with ET times and minutes-to, latest/prior BLS values, Treasury 2y/10y/2s10s with daily change, CFTC COT net positioning with 3y percentile, holiday/early-close flags, and a safeToTrade verdict.",
    input: { symbol: SYMBOL, window: WINDOW },
  },
  {
    name: "token_verdict",
    price: 0.02,
    method: "GET",
    path: "/base/token-verdict",
    title: "Base Token Verdict",
    description: "A-F safety verdict for a Base ERC-20: metadata and supply, owner/renounced, upgradeable-proxy check, Uniswap/Aerodrome liquidity vs WETH/USDC, buy→sell honeypot simulation with taxes, known-holder concentration. Read from Base mainnet.",
    input: { address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("Base ERC-20 token contract address") },
  },
  {
    name: "insider_buys",
    price: 0.03,
    method: "GET",
    path: "/sec/insider-buys",
    title: "SEC Insider Buys (ticker)",
    description: "SEC Form 4 open-market insider purchases (code P) for one ticker: insider, role, shares, price, value, dates, per-insider totals and a cluster flag. From SEC EDGAR.",
    input: {
      ticker: z.string().max(10).describe("US equity ticker, e.g. AAPL or BRK-B"),
      days: z.number().int().min(1).max(90).optional().describe("Lookback in days (1-90, default 30)"),
    },
  },
  {
    name: "insider_clusters",
    price: 0.05,
    method: "GET",
    path: "/sec/insider-clusters",
    title: "SEC Insider Cluster Buys (market-wide)",
    description: "Listed tickers where several distinct insiders made open-market purchases (Form 4 code P) in the last N days, with buyers, roles, totals and VWAP. From SEC EDGAR.",
    input: {
      days: z.number().int().min(1).max(14).optional().describe("Lookback by filing date (1-14, default 7)"),
      minBuyers: z.number().int().min(2).max(10).optional().describe("Minimum distinct insider buyers (2-10, default 3)"),
    },
  },
  {
    name: "vwap_bands",
    price: 0.005,
    method: "POST",
    path: "/quant/vwap-bands",
    title: "VWAP + Bands",
    description: "VWAP with standard-deviation bands from your OHLCV bars (session-anchored or full), z-score and band position.",
    input: {
      bars: BARS,
      anchor: z.enum(["session", "all"]).optional().describe("session (reset each tz date, default) or all"),
      bands: z.array(z.number().positive()).max(5).optional().describe("Band multipliers, default [1, 2]"),
      tz: TZ,
      includeSeries: z.boolean().optional().describe("Return the last 500 VWAP points"),
    },
  },
  {
    name: "opening_range",
    price: 0.005,
    method: "POST",
    path: "/quant/orb",
    title: "Opening Range",
    description: "Opening range (first N minutes) high/low/size for the latest session in your bars, breakout state, first breakout and 1x/2x extension targets.",
    input: {
      bars: BARS,
      minutes: z.number().int().min(1).max(240).optional().describe("Opening range minutes (default 15)"),
      sessionStart: z.string().optional().describe("HH:MM in tz (default 09:30)"),
      sessionEnd: z.string().optional().describe("HH:MM in tz (default 16:00)"),
      tz: TZ,
    },
  },
  {
    name: "atr_stop",
    price: 0.005,
    method: "POST",
    path: "/quant/atr-stop",
    title: "ATR Stop + Position Size",
    description: "Wilder ATR, ATR-multiple stop price and position size from account risk %.",
    input: {
      bars: BARS,
      period: z.number().int().min(1).max(500).optional().describe("ATR period (default 14)"),
      multiplier: z.number().positive().optional().describe("Stop = ATR × multiplier (default 2)"),
      side: z.enum(["long", "short"]).optional(),
      entry: z.number().optional().describe("Entry price (default last close)"),
      accountSize: z.number().positive().optional().describe("Account equity"),
      riskPct: z.number().positive().max(100).optional().describe("% of account risked (default 1)"),
      pointValue: z.number().positive().optional().describe("$ per point per contract (ES = 50)"),
    },
  },
  {
    name: "backtest_opening_range_breakout",
    price: 0.02,
    method: "POST",
    path: "/quant/backtest-orb",
    title: "Opening-Range-Breakout Backtest",
    description: "Opening-range-breakout backtest on your intraday bars: trades, win rate, avg R, total R, profit factor, max drawdown, exits, long/short split and recent trades.",
    input: {
      bars: BARS,
      minutes: z.number().int().min(1).max(240).optional().describe("Opening range minutes (default 15)"),
      rr: z.number().positive().optional().describe("Target in R multiples (default 2)"),
      stop: z.enum(["opposite", "mid"]).optional(),
      direction: z.enum(["both", "long", "short"]).optional(),
      costPerTrade: z.number().min(0).optional().describe("Cost in points per trade"),
      sessionStart: z.string().optional(),
      sessionEnd: z.string().optional(),
      tz: TZ,
    },
  },
];

export const fmtPrice = (usd) => `$${usd < 0.01 ? usd.toFixed(3) : usd.toFixed(2)}`;
