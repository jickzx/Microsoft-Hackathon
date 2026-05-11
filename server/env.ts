import fs from "node:fs";
import path from "node:path";

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^['"]|['"]$/g, "").trim() || undefined;
}

function readSecretFile(fileName: string | undefined) {
  const cleaned = clean(fileName);
  if (!cleaned) return undefined;

  const filePath = path.isAbsolute(cleaned) ? cleaned : path.resolve(process.cwd(), cleaned);
  if (!fs.existsSync(filePath)) return undefined;

  const content = fs.readFileSync(filePath, "utf8").trim();
  const assignment = content.match(/(?:apiKey|key|AZURE_OPENAI_API_KEY)\s*[:=]\s*["']([^"']+)["']/);
  return clean(assignment?.[1] ?? content);
}

export function envValue(name: string) {
  return clean(process.env[name]);
}

export function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = envValue(name);
    if (value) return value;
  }
  return undefined;
}

export function azureConfig() {
  const openAiEndpoint = envValue("AZURE_OPENAI_ENDPOINT");
  const aiEndpoint = envValue("AZURE_AI_ENDPOINT");
  const endpoint = openAiEndpoint ?? aiEndpoint;
  const openAiKey =
    envValue("AZURE_OPENAI_API_KEY") ?? readSecretFile(envValue("AZURE_OPENAI_API_KEY_FILE"));
  const key = openAiEndpoint ? openAiKey : envValue("AZURE_AI_KEY") ?? openAiKey;
  const deployment = openAiEndpoint
    ? firstEnv("AZURE_OPENAI_DEPLOYMENT", "AZURE_AI_DEPLOYMENT")
    : firstEnv("AZURE_AI_DEPLOYMENT", "AZURE_OPENAI_DEPLOYMENT");
  const apiVersion = openAiEndpoint
    ? firstEnv("AZURE_OPENAI_API_VERSION", "AZURE_AI_API_VERSION")
    : firstEnv("AZURE_AI_API_VERSION", "AZURE_OPENAI_API_VERSION");

  return {
    enabled: envValue("AZURE_AI_ENABLED") !== "false",
    endpoint,
    key,
    mode: envValue("AZURE_AI_MODE") ?? "auto",
    deployment,
    apiVersion: apiVersion ?? "2024-10-21",
    route: firstEnv("AZURE_AI_ROUTE", "AZURE_OPENAI_ROUTE") ?? "",
    matchRoute: envValue("AZURE_MATCH_ROUTE") ?? "",
    authHeader: envValue("AZURE_AI_AUTH_HEADER"),
    timeoutMs: Number(envValue("AZURE_AI_TIMEOUT_MS") ?? 12000)
  };
}

export function requireAzureConfig() {
  const config = azureConfig();
  if (!config.enabled) {
    throw new Error("Azure AI is disabled.");
  }
  if (!config.endpoint || !config.key) {
    throw new Error("Azure AI endpoint and key are required.");
  }
  return config;
}

export function azureHeaders(key: string) {
  const authHeader = azureConfig().authHeader;
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (authHeader && authHeader.toLowerCase() !== "auto") {
    headers[authHeader] = authHeader.toLowerCase() === "authorization" ? `Bearer ${key}` : key;
  } else {
    headers["Ocp-Apim-Subscription-Key"] = key;
    headers["api-key"] = key;
    headers["x-functions-key"] = key;
  }

  return headers;
}
