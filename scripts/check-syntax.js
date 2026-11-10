/** "Build" check: this package ships plain ESM (no compile step), so verify every file parses and imports resolve. */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
const files = ["bin/trading-signals-mcp.js", ...readdirSync("src").map((f) => `src/${f}`)];
for (const f of files) execFileSync(process.execPath, ["--check", f], { stdio: "inherit" });
const { TOOLS } = await import("../src/tools.js");
await import("../src/server.js");
console.log(`build ok: ${files.length} files, ${TOOLS.length} tools`);
