#!/usr/bin/env node
/**
 * Dev-loop helper for docker-compose.yml: brings the Node-RED test stack up
 * and restarts its container whenever the bind-mounted node code actually
 * changes.
 *
 * Deliberately not `docker compose watch`: its sync step writes into the
 * same paths this project bind-mounts, and since a bind mount reflects a
 * container-side write straight back to the host, that retriggers the same
 * watcher and restart-loops.
 *
 * Restarting the container itself was also observed to produce spurious fs
 * events on these bind-mounted host paths (Docker Desktop's bind-mount sync
 * layer touching them, not an actual content change), which would otherwise
 * retrigger this script into an identical loop. So a restart is only ever
 * fired when a content hash of the watched files actually changed, not on
 * every raw fs event -- fs.watch is only used to know *when* to check.
 */

import { spawn } from "node:child_process";
import { watch, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const WATCH_PATHS = ["packages/cookidoo-api-js/dist", "packages/node-red-cookidoo/nodes"];
// A single tsup rebuild (see the cookidoo-api-js "dev" script) writes several
// files as separate fs events spread over ~1s (JS/CJS immediately, the
// slower .d.ts a few hundred ms later), so this needs to comfortably outlast
// that burst -- too short and one source edit triggers several checks.
const DEBOUNCE_MS = 1500;

function fingerprintDir(dir, hash) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // dir briefly missing mid-rebuild (tsup cleans before writing)
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      fingerprintDir(full, hash);
    } else if (entry.isFile()) {
      hash.update(relative(process.cwd(), full));
      try {
        hash.update(readFileSync(full));
      } catch {
        // file briefly gone/mid-write; the next debounced check will settle
      }
    }
  }
}

function fingerprint() {
  const hash = createHash("sha1");
  for (const path of WATCH_PATHS) fingerprintDir(path, hash);
  return hash.digest("hex");
}

function run(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", args, { stdio: "inherit" });
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`docker ${args.join(" ")} exited with ${code}`)),
    );
    proc.on("error", reject);
  });
}

let lastFingerprint = fingerprint();
let checking = false;

async function checkAndRestart() {
  if (checking) return;
  checking = true;
  try {
    const current = fingerprint();
    if (current === lastFingerprint) return;
    console.log("[watch-node-red] content changed, restarting node-red...");
    await run(["compose", "restart", "node-red"]);
    // Re-fingerprint *after* the restart so any fs noise the restart itself
    // causes on these bind-mounted paths is absorbed here, not treated as
    // yet another real change on the next check.
    lastFingerprint = fingerprint();
  } catch (err) {
    console.error("[watch-node-red]", err.message);
  } finally {
    checking = false;
  }
}

let debounceTimer = null;
function scheduleCheck() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(checkAndRestart, DEBOUNCE_MS);
}

await run(["compose", "up", "-d"]);
lastFingerprint = fingerprint();

for (const path of WATCH_PATHS) {
  watch(path, { recursive: true }, scheduleCheck);
  console.log(`[watch-node-red] watching ${path}`);
}

console.log("[watch-node-red] ready -- open http://localhost:1880 (Ctrl+C to stop)");
