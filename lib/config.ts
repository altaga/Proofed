import { readFileSync } from "node:fs";
import path from "node:path";

export type ProjectConfig = {
  name: string;
  slug: string;
  tagline: string;
  venueName: string;
  currency: string;
  pickupTimeoutMinutes: number;
  stockReservationMinutes: number;
  llmModel: string;
  llmBaseUrl: string;
};

let cached: ProjectConfig | null = null;

export function getProjectConfig(): ProjectConfig {
  if (cached) return cached;
  const file = path.join(process.cwd(), "project.config.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as ProjectConfig;
  if (!raw.name || !raw.slug || !raw.venueName || !raw.currency) {
    throw new Error("project.config.json is missing required fields");
  }
  const defaults = {
    pickupTimeoutMinutes: 30,
    stockReservationMinutes: 15,
    llmModel: "MiniMax-M3",
    llmBaseUrl: "https://api.minimax.io/v1",
    tagline: "Authorize now. Capture only after proof of handover.",
  };
  cached = { ...defaults, ...raw };
  return cached;
}

export function resetProjectConfigCache() {
  cached = null;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function envFlag(name: string): boolean {
  return Boolean(process.env[name]);
}
