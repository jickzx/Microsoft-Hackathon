import type { DiscordIntegrationHealth, ExtractQuestRequest } from "../src/types";
import { discordConfig } from "./env";

const discordApiBase = "https://discord.com/api/v10";
const discordTimeoutMs = Number(process.env.DISCORD_TIMEOUT_MS ?? 8000);

function withTimeout() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), discordTimeoutMs);

  return {
    signal: controller.signal,
    done: () => clearTimeout(timeout)
  };
}

function discordHeaders(botToken: string) {
  return {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json"
  };
}

function parseDiscordMessageUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!["discord.com", "www.discord.com", "canary.discord.com", "ptb.discord.com"].includes(url.hostname)) {
      return null;
    }

    const [channelsSegment, _guildId, channelId, messageId] = url.pathname
      .split("/")
      .filter(Boolean);
    if (channelsSegment !== "channels" || !channelId || !messageId) return null;

    return { channelId, messageId };
  } catch {
    return null;
  }
}

async function fetchDiscordJson<T>(path: string, botToken: string) {
  const timeout = withTimeout();
  const response = await fetch(`${discordApiBase}${path}`, {
    headers: discordHeaders(botToken),
    signal: timeout.signal
  }).finally(timeout.done);

  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Discord request failed with HTTP ${response.status}`);
    Object.assign(error, { status: response.status, body: text.slice(0, 400) });
    throw error;
  }

  return JSON.parse(text) as T;
}

export async function checkDiscordConnection(): Promise<DiscordIntegrationHealth> {
  const config = discordConfig();
  const configured = config.botConfigured || config.oauthConfigured;
  const base = {
    configured,
    botConfigured: config.botConfigured,
    oauthConfigured: config.oauthConfigured,
    applicationId: config.clientId,
    redirectUriConfigured: Boolean(config.redirectUri),
    checkedAt: new Date().toISOString()
  };

  if (!configured) {
    return {
      ...base,
      reachable: false,
      status: "not_configured",
      detail: "Discord keys are not configured."
    };
  }

  if (!config.botToken) {
    return {
      ...base,
      reachable: false,
      status: "not_configured",
      detail: "Discord OAuth keys are configured; add a bot token to import message links."
    };
  }

  try {
    const user = await fetchDiscordJson<{ username?: string }>("/users/@me", config.botToken);
    return {
      ...base,
      reachable: true,
      status: "ready",
      detail: user.username ? `Bot online as ${user.username}.` : "Discord bot is online."
    };
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : undefined;

    return {
      ...base,
      reachable: false,
      status: status === 401 || status === 403 ? "auth_failed" : "unreachable",
      detail:
        status === 401 || status === 403
          ? "Discord rejected the configured bot token."
          : error instanceof Error
            ? error.message
            : "Discord could not be reached."
    };
  }
}

export async function enrichWithDiscordMessage(input: ExtractQuestRequest): Promise<ExtractQuestRequest> {
  if (input.sourceType !== "message") return input;

  const messageRef = parseDiscordMessageUrl(input.url);
  if (!messageRef) return input;

  const config = discordConfig();
  if (!config.botToken) {
    throw new Error("Discord bot token is required to import Discord message links.");
  }

  const message = await fetchDiscordJson<{
    content?: string;
    timestamp?: string;
    author?: { username?: string; global_name?: string };
    embeds?: {
      title?: string;
      description?: string;
      url?: string;
      fields?: { name?: string; value?: string }[];
    }[];
    attachments?: { filename?: string; url?: string; content_type?: string }[];
  }>(`/channels/${messageRef.channelId}/messages/${messageRef.messageId}`, config.botToken);

  const authorName = message.author?.global_name ?? message.author?.username;
  const embedText = (message.embeds ?? []).flatMap((embed) => [
    embed.title ? `Embed title: ${embed.title}` : "",
    embed.description ? `Embed description: ${embed.description}` : "",
    embed.url ? `Embed URL: ${embed.url}` : "",
    ...(embed.fields ?? []).map((field) =>
      [field.name, field.value].filter(Boolean).join(": ")
    )
  ]);
  const attachmentText = (message.attachments ?? []).map((attachment) =>
    [
      "Attachment",
      attachment.filename,
      attachment.content_type ? `(${attachment.content_type})` : "",
      attachment.url
    ]
      .filter(Boolean)
      .join(" ")
  );

  const discordText = [
    `Discord message: ${input.url}`,
    authorName ? `Author: ${authorName}` : "",
    message.timestamp ? `Posted at: ${message.timestamp}` : "",
    message.content,
    ...embedText,
    ...attachmentText
  ]
    .filter(Boolean)
    .join("\n");

  if (!discordText.trim()) {
    throw new Error("Discord message did not include readable text, embeds, or attachments.");
  }

  return {
    ...input,
    text: [input.text, discordText].filter(Boolean).join("\n\n")
  };
}
