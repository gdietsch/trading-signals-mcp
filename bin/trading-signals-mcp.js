#!/usr/bin/env node
import { main } from "../src/server.js";

main().catch((e) => {
  console.error(`trading-signals-mcp failed to start: ${e?.message || e}`);
  process.exit(1);
});
