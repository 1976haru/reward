#!/usr/bin/env node
/**
 * Health check script — checks /api/health and exits 0 on success, 1 on failure.
 *
 * Usage:
 *   node scripts/health-check.js
 *   PORT=3001 node scripts/health-check.js
 *   HEALTH_URL=http://example.com:3001/api/health node scripts/health-check.js
 *
 * No external dependencies — uses Node built-ins only so this can run inside
 * a minimal Docker image without devDependencies installed.
 *
 * 패키지는 ESM(`"type": "module"`)이므로 ESM import 사용.
 */

import http from "node:http";
import https from "node:https";

const port = Number(process.env.PORT || 3001);
const host = process.env.HEALTH_HOST || "127.0.0.1";
const reqPath = process.env.HEALTH_PATH || "/api/health";
const explicitUrl = process.env.HEALTH_URL || "";
const timeoutMs = Number(process.env.HEALTH_TIMEOUT_MS || 5000);

const url = explicitUrl || `http://${host}:${port}${reqPath}`;
const lib = url.startsWith("https://") ? https : http;

const req = lib.get(url, { timeout: timeoutMs }, (res) => {
  let body = "";
  res.setEncoding("utf8");
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => {
    const ok = res.statusCode === 200;
    try {
      const parsed = JSON.parse(body);
      if (ok && parsed && parsed.ok === true) {
        console.log(`[health] OK ${url} — service=${parsed.service ?? "?"} port=${parsed.port ?? "?"}`);
        process.exit(0);
      }
      console.error(`[health] FAIL ${url} — status=${res.statusCode} body=${body.slice(0, 200)}`);
      process.exit(1);
    } catch {
      console.error(`[health] FAIL ${url} — status=${res.statusCode} non-json body=${body.slice(0, 200)}`);
      process.exit(1);
    }
  });
});

req.on("timeout", () => {
  console.error(`[health] TIMEOUT after ${timeoutMs}ms — ${url}`);
  req.destroy(new Error("timeout"));
  process.exit(1);
});

req.on("error", (err) => {
  console.error(`[health] ERROR ${url} — ${err.message}`);
  process.exit(1);
});
