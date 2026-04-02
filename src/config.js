import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.resolve(process.cwd(), "config", "reservations.json");

export function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(raw);
}

export function getConfigPath() {
  return CONFIG_PATH;
}
