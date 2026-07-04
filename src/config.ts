export type ServerConfig = {
  baseUrl: string;
  apiToken: string;
  requestTimeoutMs: number;
  codeTimeoutMs: number;
};

export function loadConfig(): ServerConfig {
  return {
    baseUrl: process.env.COOLIFY_BASE_URL ?? "",
    apiToken: process.env.COOLIFY_API_TOKEN ?? "",
    requestTimeoutMs: parsePositiveInt(process.env.COOLIFY_REQUEST_TIMEOUT_MS, 30_000),
    codeTimeoutMs: parsePositiveInt(process.env.COOLIFY_CODE_TIMEOUT_MS, 15_000),
  };
}

export function requireExecuteConfig(config: ServerConfig): void {
  const missing = [];
  if (!config.baseUrl) missing.push("COOLIFY_BASE_URL");
  if (!config.apiToken) missing.push("COOLIFY_API_TOKEN");

  if (missing.length > 0) {
    throw new Error(`Missing required execute configuration: ${missing.join(", ")}`);
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
