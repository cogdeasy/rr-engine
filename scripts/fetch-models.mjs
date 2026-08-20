#!/usr/bin/env node
/**
 * Caches the official Rolls-Royce Discover Engines GLB models into
 * apps/web/public/models for offline development. The files are Rolls-Royce
 * property and are gitignored — never commit them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/web/public/models");

const MODELS = {
  "trent-1000-ten.glb":
    "https://engines-cms.rolls-royce.com/uploads/BD_2034_T1000_Ten_Marketing_V01_09_85b79de810.glb",
  "trent-7000.glb":
    "https://engines-cms.rolls-royce.com/uploads/BD_2034_T7000_Marketing_V02_7_5d4d4884aa.glb",
  "trent-xwb.glb":
    "https://engines-cms.rolls-royce.com/uploads/BD_2034_XWB_Marketing_V01_7_12cf2a0c90.glb",
  "ultrafan.glb":
    "https://engines-cms.rolls-royce.com/uploads/BD_2034_Ultrafan_Marketing_V02_2_fc9d472dc4.glb",
};

await mkdir(outDir, { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${res.status} ${res.statusText}`);
  await writeFile(join(outDir, name), Buffer.from(await res.arrayBuffer()));
  console.log(`cached ${name}`);
}
