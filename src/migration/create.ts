import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export async function createMigration(dir: string, name: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const safeName = name.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  const filename = `${timestamp()}_${safeName}.sql`;
  const filepath = path.join(dir, filename);
  await writeFile(filepath, `-- Migration: ${safeName}\n-- Write your SQL below.\n\n`, "utf8");
  return filepath;
}
