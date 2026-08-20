/**
 * Creates a placeholder page for every module declared in the registry that
 * does not yet have a page file. Safe to re-run: existing pages are untouched.
 *
 *   node scripts/generate-placeholders.mjs
 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = await readFile(join(root, "apps/web/src/lib/modules.ts"), "utf8");

const modules = [
  ...registry.matchAll(
    /id:\s*"([^"]+)",\s*group:\s*"[^"]+",\s*label:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g,
  ),
].map((m) => ({ id: m[1], label: m[2], href: m[3] }));

let created = 0;
for (const module of modules) {
  if (module.href === "/") continue;
  // Dynamic engine route is owned by the engine-detail module.
  const routePath = module.href.startsWith("/engines/EN-") ? "/engines/[engineId]" : module.href;
  const dir = join(root, "apps/web/src/app", routePath.replace(/^\//, ""));
  const file = join(dir, "page.tsx");
  try {
    await access(file);
    continue;
  } catch {
    // not present — create it
  }
  await mkdir(dir, { recursive: true });
  await writeFile(
    file,
    `import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata = { title: ${JSON.stringify(module.label)} };

export default function Page() {
  return <ModulePlaceholder moduleId=${JSON.stringify(module.id)} />;
}
`,
    "utf8",
  );
  created += 1;
}

console.log(`generated ${created} placeholder page(s) from ${modules.length} declared modules`);
