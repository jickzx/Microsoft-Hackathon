import crypto from "node:crypto";
import {
  interestTags,
  questCardSchema,
  questDifficulties,
  questModes,
  rewardTypes,
  skillTags
} from "../src/types";
import type {
  AzureConnectionHealth,
  ExtractQuestRequest,
  ExtractQuestResponse,
  QuestCard,
  ScrapedPage
} from "../src/types";
import { azureConfig, azureHeaders, requireAzureConfig } from "./env";

const scrapeMaxTextChars = Number(process.env.QUEST_SCRAPE_TEXT_CHARS ?? 9000);
const scrapeTimeoutMs = Number(process.env.QUEST_SCRAPE_TIMEOUT_MS ?? 8000);
const scrapeMaxContentBytes = Number(process.env.QUEST_SCRAPE_MAX_BYTES ?? 900_000);
const healthCacheTtlMs = Number(process.env.AZURE_HEALTH_CACHE_MS ?? 5 * 60 * 1000);
let azureHealthCache:
  | {
      key: string;
      expiresAt: number;
      value: AzureConnectionHealth;
    }
  | null = null;

const interestKeywords = {
  ai: ["ai", "machine learning", "ml", "openai", "copilot", "chatbot"],
  career: ["career", "alumni", "resume", "internship", "job"],
  climate: ["climate", "sustainability", "waste", "energy", "emissions"],
  clubs: ["club", "society", "committee"],
  competitions: ["competition", "challenge", "hackathon", "case", "jam"],
  design: ["design", "ux", "poster", "brand", "graphics", "canva"],
  education: ["study", "revision", "tutor", "learning", "education"],
  events: ["event", "showcase", "night", "festival", "broadcast"],
  finance: ["finance", "investment", "market", "company", "case"],
  gaming: ["game", "esports", "stream", "broadcast"],
  health: ["health", "patient", "clinic", "medical", "care"],
  research: ["research", "lab", "analysis", "study"],
  robotics: ["robot", "sensor", "hardware", "autonomous"],
  "social-impact": ["volunteer", "community", "service", "impact", "nonprofit"],
  startups: ["startup", "founder", "pitch", "microgrant", "grant"],
  volunteering: ["volunteer", "service", "mural", "crew"],
  writing: ["write", "blog", "article", "copy", "proposal"]
} as const;

const skillKeywords = {
  backend: ["api", "backend", "server", "database"],
  community: ["community", "volunteer", "outreach", "service"],
  coding: ["code", "coding", "build", "developer"],
  data: ["data", "analysis", "spreadsheet", "market"],
  design: ["design", "ux", "poster", "graphics", "canva", "prototype"],
  frontend: ["frontend", "react", "website", "ui", "interface"],
  hardware: ["hardware", "sensor", "robot", "chassis", "wiring"],
  marketing: ["marketing", "social", "promotion", "campaign"],
  ml: ["ml", "machine learning", "ai model", "classification"],
  photography: ["photo", "photograph", "camera"],
  pitching: ["pitch", "present", "demo", "judges"],
  "public-speaking": ["speaking", "present", "host", "moderate"],
  video: ["video", "stream", "broadcast", "highlight"],
  writing: ["write", "proposal", "copy", "summary", "blog"]
} as const;

const questJsonInstruction = `Return JSON only with this shape:
{
  "cards": [
    {
      "id": "stable id if known",
      "title": "short opportunity title",
      "organizer": "club or department",
      "summary": "one sentence",
      "description": "clear student-facing detail",
      "imageUrl": "optional representative image URL",
      "interests": ["ai", "design", "events"],
      "skillsHelpful": ["frontend", "writing"],
      "difficulty": "easy | medium | hard",
      "estimatedHours": { "min": 2, "max": 6 },
      "reward": { "type": ["experience"], "label": "reward summary", "estimatedValueUsd": 0 },
      "location": { "mode": "in_person | remote | hybrid", "campus": "North Campus", "building": "", "address": "optional full address or online link" },
      "deadline": "2026-05-17T23:59:00Z",
      "eventStart": "optional ISO datetime",
      "eventEnd": "optional ISO datetime",
      "bestFor": ["specific student audience"],
      "eligibility": ["eligibility note"],
      "applyUrl": "optional URL",
      "contactEmail": "optional email",
      "party": { "allowed": true, "idealSize": 3, "openSlots": 4 },
      "aiExtraction": { "confidence": 0.87, "missingFields": [], "model": "azure" }
    }
  ]
}`;

function idFrom(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 10);
}

function includesAny(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectInterests(text: string) {
  const lower = text.toLowerCase();
  return Object.entries(interestKeywords)
    .filter(([, keywords]) => includesAny(lower, keywords))
    .map(([interest]) => interest)
    .slice(0, 5) as QuestCard["interests"];
}

function detectSkills(text: string) {
  const lower = text.toLowerCase();
  return Object.entries(skillKeywords)
    .filter(([, keywords]) => includesAny(lower, keywords))
    .map(([skill]) => skill)
    .slice(0, 6) as QuestCard["skillsHelpful"];
}

function detectReward(text: string): QuestCard["reward"] {
  const lower = text.toLowerCase();
  const rewardTypes: QuestCard["reward"]["type"] = [];
  const moneyMatch = text.match(/(?:\$|\u00a3|usd\s*)(\d{2,5})/i);

  if (moneyMatch || lower.includes("paid") || lower.includes("prize")) {
    rewardTypes.push("money");
  }
  if (lower.includes("credit") || lower.includes("service hours")) {
    rewardTypes.push("credits");
  }
  if (lower.includes("swag") || lower.includes("merch")) {
    rewardTypes.push("swag");
  }
  if (lower.includes("pizza") || lower.includes("lunch") || lower.includes("dinner")) {
    rewardTypes.push("food");
  }
  if (lower.includes("mentor") || lower.includes("alumni") || lower.includes("network")) {
    rewardTypes.push("networking");
  }
  if (rewardTypes.length === 0 || lower.includes("experience")) {
    rewardTypes.push("experience");
  }

  const label = moneyMatch
    ? `$${moneyMatch[1]} reward or funding`
    : lower.includes("lunch")
      ? "Lunch and campus experience"
      : lower.includes("pizza")
        ? "Pizza, credit, and experience"
        : "Campus experience and useful connections";

  return {
    type: [...new Set(rewardTypes)],
    label,
    estimatedValueUsd: moneyMatch ? Number(moneyMatch[1]) : undefined
  };
}

function detectHours(text: string) {
  const hourRange = text.match(/(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*(?:hrs?|hours?)/i);
  if (hourRange) {
    return { min: Number(hourRange[1]), max: Number(hourRange[2]) };
  }

  const single = text.match(/(\d{1,2})\s*(?:hrs?|hours?)/i);
  if (single) {
    const hours = Number(single[1]);
    return { min: Math.max(1, hours - 1), max: hours };
  }

  return { min: 2, max: 6 };
}

function detectDifficulty(hours: { min: number; max: number }, text: string) {
  const lower = text.toLowerCase();
  if (hours.max >= 12 || lower.includes("advanced") || lower.includes("lab")) {
    return "hard" as const;
  }
  if (hours.max >= 7 || lower.includes("prototype") || lower.includes("pitch")) {
    return "medium" as const;
  }
  return "easy" as const;
}

function detectDeadline(text: string) {
  const iso = text.match(/\b(2026-\d{2}-\d{2})\b/);
  if (iso) return `${iso[1]}T23:59:00Z`;

  const now = new Date();
  const monthDay = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})\b/i
  );
  if (monthDay) {
    const parsed = new Date(
      `${monthDay[1]} ${monthDay[2]}, ${now.getUTCFullYear()} 23:59:00 UTC`
    );
    if (parsed.getTime() < now.getTime()) parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const lower = text.toLowerCase();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayIndex = weekdays.findIndex((day) => lower.includes(day));
  if (weekdayIndex >= 0) {
    const date = new Date(now);
    const daysAhead = (weekdayIndex - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + daysAhead);
    date.setHours(23, 59, 0, 0);
    return date.toISOString();
  }
  if (lower.includes("tomorrow")) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(23, 59, 0, 0);
    return date.toISOString();
  }
  if (lower.includes("this weekend")) {
    const date = new Date(now);
    const saturday = 6;
    const daysAhead = (saturday - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + daysAhead);
    date.setHours(23, 59, 0, 0);
    return date.toISOString();
  }
  return undefined;
}

function detectLocation(text: string): QuestCard["location"] {
  const lower = text.toLowerCase();

  if (lower.includes("remote") || lower.includes("online")) {
    return { mode: "remote", onlineUrl: undefined };
  }

  const buildingMatch = text.match(
    /\b(?:at|in)\s+([A-Z][A-Za-z ]+(?:Hall|Hub|Lab|Center|Centre|School|Union|Studio|Room)\b(?:\s+[A-Z]?\d{1,3})?)/i
  );

  return {
    mode: lower.includes("hybrid") ? "hybrid" : "in_person",
    campus: lower.includes("engineering") ? "Engineering Campus" : "North Campus",
    building: buildingMatch?.[1]?.trim()
  };
}

function detectApplyUrl(text: string, explicitUrl?: string) {
  if (explicitUrl) return explicitUrl;
  const match = text.match(/\bhttps?:\/\/[^\s<>"')]+/i);
  return match?.[0]?.replace(/[.,;!?]+$/, "");
}

function detectContactEmail(text: string) {
  return text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function scrapedPagesFrom(input: ExtractQuestRequest): ScrapedPage[] {
  return input.scrapedPages?.length
    ? input.scrapedPages
    : input.scrapedPage
      ? [input.scrapedPage]
      : [];
}

function sourceUrlFromInput(input: ExtractQuestRequest) {
  return scrapedPagesFrom(input)[0]?.finalUrl ?? input.url;
}

function scrapedTextFromInput(input: ExtractQuestRequest) {
  return scrapedPagesFrom(input)
    .map((page) => page.text)
    .filter(Boolean)
    .join("\n\n");
}

function sourceTextFromInput(input: ExtractQuestRequest) {
  return [input.text, scrapedTextFromInput(input)].filter(Boolean).join("\n\n") || undefined;
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength = scrapeMaxTextChars) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n[truncated]` : value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };

  return value.replace(
    /&(#(\d+)|#x([\da-f]+)|amp|apos|gt|lt|nbsp|quot);/gi,
    (match, entity: string, decimal?: string, hex?: string) => {
      if (decimal) return String.fromCodePoint(Number(decimal));
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      return named[entity.toLowerCase()] ?? match;
    }
  );
}

function cleanText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function extractHtmlAttribute(tag: string, name: string) {
  const match = tag.match(
    new RegExp(`${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value ? decodeHtmlEntities(value.trim()) : undefined;
}

function metaContent(html: string, names: string[]) {
  for (const name of names) {
    const tag = html.match(
      new RegExp(
        `<meta\\b(?=[^>]*(?:name|property)\\s*=\\s*["']${escapeRegExp(name)}["'])[^>]*>`,
        "i"
      )
    )?.[0];
    const content = tag ? extractHtmlAttribute(tag, "content") : undefined;
    if (content) return cleanText(content);
  }
  return undefined;
}

function absolutizeUrl(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function htmlToPlainText(html: string) {
  return cleanText(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(article|div|h[1-6]|li|p|section|td|th|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function schemaValueToText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(schemaValueToText).filter(Boolean).join("; ");
  if (!isRecord(value)) return "";

  return [
    value.name,
    value.headline,
    value.description,
    value.streetAddress,
    value.addressLocality,
    value.addressRegion,
    value.postalCode,
    value.url
  ]
    .map(schemaValueToText)
    .filter(Boolean)
    .join(", ");
}

function collectSchemaRecords(value: unknown, records: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSchemaRecords(item, records));
    return records;
  }
  if (!isRecord(value)) return records;

  records.push(value);
  collectSchemaRecords(value["@graph"], records);
  collectSchemaRecords(value.mainEntity, records);
  collectSchemaRecords(value.event, records);
  return records;
}

function recordTypes(record: Record<string, unknown>) {
  const rawType = record["@type"];
  const values = Array.isArray(rawType) ? rawType : [rawType];
  return values.filter((item): item is string => typeof item === "string");
}

function schemaEventLines(record: Record<string, unknown>) {
  const types = recordTypes(record).map((type) => type.toLowerCase());
  const looksEventLike =
    types.some((type) => ["event", "jobposting", "course", "educationevent"].includes(type)) ||
    Boolean(record.startDate || record.endDate || record.eventStatus);

  if (!looksEventLike) return [];

  return [
    ["Name", record.name ?? record.headline],
    ["Description", record.description],
    ["Start", record.startDate],
    ["End", record.endDate],
    ["Location", record.location],
    ["Organizer", record.organizer],
    ["Audience", record.audience],
    ["Offer", record.offers],
    ["URL", record.url]
  ]
    .map(([label, value]) => {
      const text = schemaValueToText(value);
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean);
}

function structuredEventText(html: string) {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const lines: string[] = [];

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(decodeHtmlEntities(block[1]));
      for (const record of collectSchemaRecords(parsed)) {
        lines.push(...schemaEventLines(record));
      }
    } catch {
      continue;
    }
  }

  return unique(lines).join("\n");
}

function scrapedPageFromHtml(html: string, finalUrl: string) {
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = metaContent(html, ["description", "og:description", "twitter:description"]);
  const imageUrl = absolutizeUrl(metaContent(html, ["og:image", "twitter:image"]), finalUrl);
  const structured = structuredEventText(html);
  const pageText = htmlToPlainText(html);
  const text = truncateText(
    [
      title ? `Page title: ${title}` : "",
      description ? `Page description: ${description}` : "",
      structured ? `Structured event data:\n${structured}` : "",
      pageText ? `Visible page text:\n${pageText}` : ""
    ]
      .filter(Boolean)
      .join("\n\n")
  );

  return {
    finalUrl,
    title: title || undefined,
    description,
    imageUrl,
    text,
    warnings: [] as string[]
  };
}

function isBlockedScrapeHost(hostname: string) {
  const lower = hostname.toLowerCase();
  return (
    lower === "localhost" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower.endsWith(".local") ||
    /^127\./.test(lower) ||
    /^10\./.test(lower) ||
    /^192\.168\./.test(lower) ||
    /^169\.254\./.test(lower) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(lower)
  );
}

async function scrapeEventPage(url: string) {
  const warnings: string[] = [];
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return { warnings: ["Link scraping skipped because the URL is invalid."] };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { warnings: ["Link scraping only supports http and https event pages."] };
  }

  if (isBlockedScrapeHost(parsed.hostname)) {
    return { warnings: ["Link scraping skipped for private or local network addresses."] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), scrapeTimeoutMs);

  try {
    const response = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html, text/plain;q=0.9, */*;q=0.5",
        "User-Agent": "Side Quest event extractor"
      }
    });

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      return { warnings: [`Link scraping failed with HTTP ${response.status}.`] };
    }

    if (contentLength > scrapeMaxContentBytes) {
      return {
        warnings: [
          `Link page is larger than the ${scrapeMaxContentBytes} byte scraping limit.`
        ]
      };
    }

    if (!/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) {
      return {
        warnings: [`Link content type ${contentType || "unknown"} is not an event page.`]
      };
    }

    const raw = await response.text();
    const finalUrl = response.url || parsed.toString();
    const page = /text\/plain/i.test(contentType)
      ? {
          finalUrl,
          text: truncateText(cleanText(raw)),
          warnings: [] as string[]
        }
      : scrapedPageFromHtml(raw, finalUrl);

    if (!page.text) {
      warnings.push("Link page did not contain readable event text.");
    }

    return {
      page: {
        ...page,
        warnings
      },
      warnings
    };
  } catch (error) {
    return {
      warnings: [
        error instanceof Error
          ? `Link scraping failed: ${error.message}`
          : "Link scraping failed."
      ]
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isInlineImageInput(input: ExtractQuestRequest) {
  return Boolean(input.file?.dataUrl?.startsWith("data:image/"));
}

function normalizeUrlCandidate(value: string) {
  const trimmed = value.trim().replace(/[)\].,;!?]+$/, "");
  if (!trimmed) return undefined;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function extractUrlsFromText(text: string) {
  const matches = text.match(
    /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:luma\.com|lu\.ma|eventbrite\.[a-z.]+|meetup\.com|forms\.office\.com|forms\.gle|bit\.ly|tinyurl\.com|linktr\.ee)\/[^\s<>"']+/gi
  );

  return unique((matches ?? []).map((match) => normalizeUrlCandidate(match) ?? ""));
}

function imageContextPrompt(input: ExtractQuestRequest) {
  return [
    "Inspect this uploaded campus event image, poster, or screenshot before Side Quest extracts the final marketplace card.",
    "Return JSON only with this shape:",
    '{ "visibleText": "all readable poster text", "urls": ["https://..."], "emails": ["name@example.edu"], "eventHints": { "title": "", "organizer": "", "date": "", "time": "", "location": "", "applyUrl": "", "contact": "" } }',
    "Capture every readable title, organizer, date, time, location, price/reward, eligibility note, sponsor, registration instruction, URL, email, QR label, and social handle.",
    "Only include URLs that are printed or visibly readable in the image. Do not invent a QR destination if the destination is not readable.",
    input.file ? `File: ${input.file.name} (${input.file.type}, ${input.file.size} bytes)` : "",
    input.url ? `User supplied URL: ${input.url}` : "",
    input.text ? `User supplied context: ${input.text}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function imageContextText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return compactWhitespace(String(value));
  if (Array.isArray(value)) return value.map(imageContextText).filter(Boolean).join("; ");
  if (!isRecord(value)) return "";

  return Object.entries(value)
    .map(([key, item]) => {
      const text: string = imageContextText(item);
      return text ? `${key}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeImageInspection(value: unknown) {
  const normalized = normalizeAzurePayload(value);
  if (!isRecord(normalized)) return null;

  const visibleText = imageContextText(normalized.visibleText ?? normalized.text ?? normalized.ocr);
  const eventHints = imageContextText(normalized.eventHints ?? normalized.details ?? normalized.event);
  const emails = stringArray(normalized.emails, []);
  const urlValues = [
    ...stringArray(normalized.urls, []),
    ...stringArray(normalized.links, []),
    ...stringArray(normalized.possibleUrls, []),
    imageContextText(recordValue(normalized.eventHints).applyUrl),
    ...extractUrlsFromText(visibleText),
    ...extractUrlsFromText(eventHints)
  ];
  const urls = unique(urlValues.map((url) => normalizeUrlCandidate(url) ?? ""));
  const text = truncateText(
    [
      visibleText ? `Visible image text:\n${visibleText}` : "",
      eventHints ? `Azure image event hints:\n${eventHints}` : "",
      urls.length ? `Links found in image:\n${urls.join("\n")}` : "",
      emails.length ? `Emails found in image:\n${emails.join("\n")}` : ""
    ]
      .filter(Boolean)
      .join("\n\n"),
    5000
  );

  return { text, urls };
}

async function inspectImageWithAzure(input: ExtractQuestRequest) {
  if (!isInlineImageInput(input)) return null;

  const config = requireAzureConfig();
  if (!config.deployment) return null;

  const url = joinUrl(
    config.endpoint,
    `/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`
  );
  const payload = await fetchJsonWithTimeout(url, {
    method: "POST",
    headers: azureHeaders(config.key),
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            "You are an Azure vision extraction pass for Side Quest. Respond with valid JSON only."
        },
        {
          role: "user",
          content: [
            { type: "text", text: imageContextPrompt(input) },
            { type: "image_url", image_url: { url: input.file!.dataUrl! } }
          ]
        }
      ],
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: "json_object" }
    })
  });

  return normalizeImageInspection(payload);
}

async function prepareExtractionInput(input: ExtractQuestRequest) {
  let prepared = input;
  const warnings: string[] = [];
  const imageUrls: string[] = [];

  if (isInlineImageInput(input)) {
    try {
      const imageInspection = await inspectImageWithAzure(input);
      if (imageInspection?.text) {
        prepared = {
          ...prepared,
          text: [prepared.text, imageInspection.text].filter(Boolean).join("\n\n")
        };
      }
      if (imageInspection?.urls.length) imageUrls.push(...imageInspection.urls);
      if (!prepared.url && imageInspection?.urls[0]) {
        prepared = { ...prepared, url: imageInspection.urls[0] };
        warnings.push(`Azure image scan found an event link and queued it for scraping.`);
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Azure image scan could not run before scraping: ${error.message}`
          : "Azure image scan could not run before scraping."
      );
    }
  }

  const urls = new Set<string>();
  for (const candidate of [
    prepared.url,
    ...(prepared.text ? extractUrlsFromText(prepared.text) : []),
    ...imageUrls
  ]) {
    if (!candidate) continue;
    const normalized = normalizeUrlCandidate(candidate);
    if (normalized) urls.add(normalized);
  }

  if (urls.size === 0) return { input: prepared, warnings };

  const results = await Promise.all(Array.from(urls).map((url) => scrapeEventPage(url)));
  const scrapedPages = results.map((result) => result.page).filter((page): page is ScrapedPage => Boolean(page));
  const scrapeWarnings = results.flatMap((result) => result.warnings);

  return {
    input: {
      ...prepared,
      scrapedPages,
      scrapedPage: scrapedPages[0]
    },
    warnings: [...warnings, ...scrapeWarnings]
  };
}

function missingFieldsFor(card: QuestCard) {
  return unique([
    ...card.aiExtraction.missingFields,
    !card.organizer || card.organizer === "Campus submitter" ? "organizer" : "",
    !card.deadline ? "deadline" : "",
    !card.applyUrl && !card.contactEmail ? "applyUrl or contactEmail" : "",
    card.location.mode !== "remote" && !card.location.building && !card.location.address
      ? "location detail"
      : "",
    card.reward.label ? "" : "reward"
  ]);
}

function finalizeCard(card: QuestCard) {
  const audited = {
    ...card,
    aiExtraction: {
      ...card.aiExtraction,
      confidence: Math.max(0, Math.min(1, card.aiExtraction.confidence)),
      missingFields: missingFieldsFor(card)
    }
  };
  const parsed = questCardSchema.safeParse(audited);

  if (parsed.success) return parsed.data;
  throw new Error("Side quest card normalization failed.");
}

function sourceImageUrl(input: ExtractQuestRequest) {
  const pageWithImage = scrapedPagesFrom(input).find((page) => page.imageUrl);
  if (pageWithImage?.imageUrl) return pageWithImage.imageUrl;

  const sourceUrl = sourceUrlFromInput(input);
  if (sourceUrl) {
    try {
      const domain = new URL(sourceUrl).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
    } catch {
      return "/favicon.svg";
    }
  }
  return "/favicon.svg";
}

function fileWarnings(input: ExtractQuestRequest) {
  return input.file?.truncated
    ? [
        `${input.file.name} exceeded the inline extraction limit, so Azure received file metadata but not the full file payload.`
      ]
    : [];
}

function extractionMeta(
  provider: ExtractQuestResponse["meta"]["provider"],
  fallbackUsed: boolean,
  input: ExtractQuestRequest,
  cards: QuestCard[],
  warnings: string[]
): ExtractQuestResponse["meta"] {
  const confidence =
    cards.length === 0
      ? 0
      : cards.reduce((total, card) => total + card.aiExtraction.confidence, 0) / cards.length;
  const scrapedPages = scrapedPagesFrom(input);

  return {
    provider,
    fallbackUsed,
    sourceType: input.sourceType,
    sourceUrl: sourceUrlFromInput(input),
    scrapedPageCount: scrapedPages.length,
    confidence: Number(confidence.toFixed(2)),
    missingFields: unique(cards.flatMap((card) => card.aiExtraction.missingFields)),
    warnings: unique([
      ...fileWarnings(input),
      ...scrapedPages.flatMap((page) => page.warnings),
      ...warnings
    ]),
    cardCount: cards.length
  };
}

function titleFrom(text: string, url?: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstGoodLine =
    lines.find((line) => line.length >= 8 && line.length <= 90) ?? lines[0];
  if (firstGoodLine) {
    return firstGoodLine
      .replace(/^(subject:|title:|event:)\s*/i, "")
      .replace(/[.!?]+$/, "")
      .slice(0, 90);
  }

  if (url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return "New Campus Side Quest";
    }
  }

  return "New Campus Side Quest";
}

function summaryFrom(text: string, title: string) {
  const sentence =
    text
      .replace(title, "")
      .split(/[.!?\n]/)
      .map((part) => part.trim())
      .find((part) => part.length > 30) ?? text.trim();

  return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence;
}

function contentFromInput(input: ExtractQuestRequest) {
  const scrapedContent = scrapedPagesFrom(input).flatMap((page) => [
    page.title ? `Page title: ${page.title}` : "",
    page.description ? `Page description: ${page.description}` : "",
    page.text
  ]);

  return [
    input.text,
    ...scrapedContent,
    input.url,
    input.file?.text,
    input.file?.name
  ]
    .filter(Boolean)
    .join("\n");
}

function baseCardFromInput(input: ExtractQuestRequest): QuestCard[] {
  const content = contentFromInput(input);
  const title = titleFrom(content, input.url);
  const summary = summaryFrom(content, title);
  const hours = detectHours(content);
  const interests = detectInterests(content);
  const skills = detectSkills(content);
  const now = new Date().toISOString();
  const id = `quest-${idFrom(`${title}-${content}`)}`;
  const applyUrl = detectApplyUrl(content, sourceUrlFromInput(input));

  return [
    finalizeCard({
      id,
      title,
      organizer: "Campus submitter",
      summary,
      description:
        content.length > 80
          ? content
          : `${summary} Add organizer notes, eligibility, and application details before publishing.`,
      imageUrl: sourceImageUrl(input),
      source: {
        id: `src-${idFrom(content)}`,
        type: input.sourceType,
        submittedByUserId: input.submittedByUserId ?? "system",
        rawUrl: input.url,
        fileName: input.file?.name,
        rawText: sourceTextFromInput(input),
        submittedAt: now
      },
      status: "needs_review",
      interests: interests.length ? interests : ["events", "career"],
      skillsHelpful: skills.length ? skills : ["writing", "community"],
      difficulty: detectDifficulty(hours, content),
      estimatedHours: hours,
      reward: detectReward(content),
      location: detectLocation(content),
      deadline: detectDeadline(content),
      bestFor: [
        "students looking for a clear next step",
        "people who prefer small teams"
      ],
      eligibility: ["Check organizer details before applying"],
      applyUrl,
      contactEmail: detectContactEmail(content),
      party: { allowed: true, idealSize: 3, openSlots: 4 },
      aiExtraction: {
        confidence: 0.1,
        missingFields: ["organizer"],
        extractedAt: now,
        model: "azure-normalized"
      },
      stats: { saves: 0, views: 0, partyRequests: 0 },
      createdAt: now,
      updatedAt: now
    })
  ];
}

function tryParseJsonFromText(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeAzurePayload(value: unknown) {
  if (typeof value === "string") return tryParseJsonFromText(value) ?? value;
  if (!value || typeof value !== "object") return value;
  const payload = value as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    output?: unknown;
    output_text?: unknown;
    result?: unknown;
  };

  const content = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text;
  if (content) return normalizeAzurePayload(content);
  if (payload.output_text) return normalizeAzurePayload(payload.output_text);
  if (payload.output) return normalizeAzurePayload(payload.output);
  if (payload.result) return normalizeAzurePayload(payload.result);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`Azure extraction did not return ${fieldName}.`);
}

function stringValue(value: unknown, defaultValue: string) {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}

function optionalString(value: unknown, defaultValue?: string) {
  return typeof value === "string" && value.trim() ? value.trim() : defaultValue;
}

function dateStringValue(value: unknown) {
  const candidate = optionalString(value);
  if (!candidate) return undefined;

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return undefined;

  const staleCutoff = Date.now() - 24 * 60 * 60 * 1000;
  return parsed.getTime() < staleCutoff ? undefined : candidate;
}

function numberValue(value: unknown, defaultValue: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function requiredNumber(value: unknown, fieldName: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(number)) return number;
  throw new Error(`Azure extraction did not return ${fieldName}.`);
}

function booleanValue(value: unknown, defaultValue: boolean) {
  return typeof value === "boolean" ? value : defaultValue;
}

function stringArray(value: unknown, defaultValue: string[]) {
  if (Array.isArray(value)) {
    const values = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
    return values.length ? values.map((item) => item.trim()) : defaultValue;
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return defaultValue;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`Azure extraction did not return ${fieldName}.`);
  }
  const trimmed = value.trim();
  if ((allowed as readonly string[]).includes(trimmed)) return trimmed as T[number];
  throw new Error(`Azure extraction returned unsupported ${fieldName}: ${trimmed}.`);
}

function enumArray<T extends readonly string[]>(value: unknown, allowed: T, fieldName: string) {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|]/)
      : [];
  const values = candidates
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item): item is T[number] => (allowed as readonly string[]).includes(item));

  if (values.length) return [...new Set(values)] as T[number][];
  throw new Error(`Azure extraction did not return valid ${fieldName}.`);
}

function recordValue(value: unknown) {
  return isRecord(value) ? value : {};
}

function azureCardFromRecord(card: Record<string, unknown>, input: ExtractQuestRequest, index: number) {
  const reward = recordValue(card.reward);
  const location = recordValue(card.location);
  const estimatedHours = recordValue(card.estimatedHours);
  const party = recordValue(card.party);
  const aiExtraction = recordValue(card.aiExtraction);
  const stats = recordValue(card.stats);
  const source = recordValue(card.source);
  const now = new Date().toISOString();
  const title = requiredString(card.title, "title");
  const sourceText = sourceTextFromInput(input);
  const sourceUrl = sourceUrlFromInput(input);
  const sourceId = stringValue(source.id, `src-${idFrom(`${sourceUrl ?? sourceText ?? title}-${index}`)}`);
  const rawModel = stringValue(aiExtraction.model, azureConfig().deployment ?? "azure-ai");
  const model = rawModel.toLowerCase().includes("local")
    ? azureConfig().deployment ?? "azure-ai"
    : rawModel;
  const minHours = Math.max(0, requiredNumber(estimatedHours.min, "estimatedHours.min"));
  const maxHours = Math.max(minHours, requiredNumber(estimatedHours.max, "estimatedHours.max"));

  return finalizeCard({
    id: stringValue(card.id, `quest-azure-${idFrom(`${sourceUrl ?? ""}-${title}-${index}`)}`),
    title,
    organizer: requiredString(card.organizer, "organizer"),
    summary: requiredString(card.summary, "summary"),
    description: requiredString(card.description, "description"),
    imageUrl: optionalString(card.imageUrl, sourceImageUrl(input))!,
    source: {
      id: sourceId,
      type: input.sourceType,
      submittedByUserId: input.submittedByUserId ?? "system",
      rawUrl: optionalString(source.rawUrl, sourceUrl),
      fileName: optionalString(source.fileName, input.file?.name),
      rawText: optionalString(source.rawText, sourceText),
      submittedAt: stringValue(source.submittedAt, now)
    },
    status: "needs_review",
    interests: enumArray(card.interests, interestTags, "interests"),
    skillsHelpful: enumArray(card.skillsHelpful, skillTags, "skillsHelpful"),
    difficulty: enumValue(card.difficulty, questDifficulties, "difficulty"),
    estimatedHours: {
      min: minHours,
      max: maxHours
    },
    reward: {
      type: enumArray(reward.type, rewardTypes, "reward.type"),
      label: requiredString(reward.label, "reward.label"),
      estimatedValueUsd:
        reward.estimatedValueUsd === undefined
          ? undefined
          : Math.max(0, numberValue(reward.estimatedValueUsd, 0))
    },
    location: {
      mode: enumValue(location.mode, questModes, "location.mode"),
      campus: optionalString(location.campus),
      building: optionalString(location.building),
      room: optionalString(location.room),
      address: optionalString(location.address),
      onlineUrl: optionalString(location.onlineUrl)
    },
    deadline: dateStringValue(card.deadline),
    eventStart: dateStringValue(card.eventStart),
    eventEnd: dateStringValue(card.eventEnd),
    bestFor: stringArray(card.bestFor, []),
    eligibility: stringArray(card.eligibility, []),
    applyUrl: optionalString(card.applyUrl, sourceUrl),
    contactEmail: optionalString(card.contactEmail),
    party: {
      allowed: booleanValue(party.allowed, true),
      idealSize: Math.max(1, Math.round(numberValue(party.idealSize, 3))),
      openSlots: Math.max(0, Math.round(numberValue(party.openSlots, 3)))
    },
    aiExtraction: {
      confidence: numberValue(aiExtraction.confidence, 0.86),
      missingFields: stringArray(aiExtraction.missingFields, []),
      extractedAt: stringValue(aiExtraction.extractedAt, now),
      model
    },
    stats: {
      saves: Math.max(0, Math.round(numberValue(stats.saves, 0))),
      views: Math.max(0, Math.round(numberValue(stats.views, 0))),
      partyRequests: Math.max(0, Math.round(numberValue(stats.partyRequests, 0)))
    },
    createdAt: stringValue(card.createdAt, now),
    updatedAt: stringValue(card.updatedAt, now)
  });
}

function normalizeAzureCards(value: unknown, input: ExtractQuestRequest): QuestCard[] {
  if (!value) return [];
  const normalized = normalizeAzurePayload(value);
  if (!normalized || typeof normalized !== "object") return [];
  const possible = normalized as { cards?: unknown; quests?: unknown; data?: unknown };
  const data = normalizeAzurePayload(possible.data);
  const nestedData = isRecord(data) ? data : undefined;
  let cards: unknown[] = [];

  if (Array.isArray(normalized)) cards = normalized;
  else if (Array.isArray(possible.cards)) cards = possible.cards;
  else if (Array.isArray(possible.quests)) cards = possible.quests;
  else if (Array.isArray(possible.data)) cards = possible.data;
  else if (Array.isArray(nestedData?.cards)) cards = nestedData.cards;
  else if (Array.isArray(nestedData?.quests)) cards = nestedData.quests;
  else if (Array.isArray(nestedData?.data)) cards = nestedData.data;
  return cards
    .filter(isRecord)
    .map((card, index) => azureCardFromRecord(card, input, index));
}

function joinUrl(base: string, route: string) {
  if (!route) return base;
  return `${base.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`;
}

function buildPrompt(input: ExtractQuestRequest) {
  const now = new Date();

  return [
    "You are Side Quest's extraction engine.",
    "Extract campus opportunities from messy student-submitted material.",
    "Clean the result into practical, social, student-facing side quest cards.",
    "Only create cards for campus events, gigs, projects, challenges, volunteering, club activities, research opportunities, or student competitions.",
    "Ignore navigation, ads, generic website copy, and unrelated pages.",
    `Current date: ${now.toISOString()} (${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })} Europe/London).`,
    "Resolve relative dates like Friday, tomorrow, next week, or tonight against the current date above, and never invent past dates for upcoming opportunities.",
    "Use ISO dates. If a field is uncertain, infer a sensible future value and keep it conservative.",
    "The user may provide a combination of an image, a link, and text. Synthesize all provided information to create the most accurate side quest card.",
    "If Azure image inspection found a link and the scraped page is present, prefer the scraped event page for dates, location, registration URL, and organizer details.",
    "If the scraped page and image conflict, keep the image text as supporting context but use the official page as the source of truth.",
    questJsonInstruction,
    "",
    `Source type: ${input.sourceType}`,
    input.url ? `URL: ${input.url}` : "",
    ...scrapedPagesFrom(input).map(
      (page) => `Scraped event page (${page.finalUrl}):\n${page.text}`
    ),
    input.file ? `File: ${input.file.name} (${input.file.type}, ${input.file.size} bytes)` : "",
    input.file?.dataUrl?.startsWith("data:image/")
      ? "Attached image: read all visible text, dates, locations, QR/link text, and organizer details from the screenshot or poster."
      : "",
    "Additional Text Content:",
    input.text || "",
    "",
    "Instructions for specific fields:",
    "- Title: Clear, catchy title.",
    "- Organizer: The club, department, or person hosting.",
    "- Summary: One sentence overview.",
    "- Description: Detailed information for students.",
    "- Date and time: ISO format for deadline and event start/end.",
    "- Location: Mode (in_person/remote/hybrid), campus, building, and full address or online URL.",
    "- Reward: Type and label (e.g., 'Paid', 'Pizza', 'Experience').",
    "- Apply URL: Direct link to apply or register.",
    "- Contact: Email or contact method."
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchJsonWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), azureConfig().timeoutMs);

  const response = await fetch(url, {
    ...init,
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!response.ok) {
    const error = new Error(`Azure request failed with HTTP ${response.status}`);
    Object.assign(error, { status: response.status, body: text.slice(0, 400) });
    throw error;
  }

  if (!contentType.includes("application/json")) {
    const parsed = tryParseJsonFromText(text);
    if (parsed) return parsed;
    throw new Error(`Azure response was ${contentType || "non-JSON"}`);
  }

  return JSON.parse(text);
}

async function extractWithAzureOpenAI(input: ExtractQuestRequest, endpoint: string, key: string) {
  const deployment = azureConfig().deployment;
  if (!deployment) {
    throw new Error("Azure OpenAI deployment is not configured.");
  }

  const apiVersion = azureConfig().apiVersion;
  const url = joinUrl(
    endpoint,
    `/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`
  );
  const payload = await fetchJsonWithTimeout(url, {
    method: "POST",
    headers: azureHeaders(key),
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            "You extract campus opportunity details into Side Side quest cards. Respond with valid JSON only."
        },
        {
          role: "user",
          content: input.file?.dataUrl?.startsWith("data:image/")
            ? [
                { type: "text", text: buildPrompt(input) },
                { type: "image_url", image_url: { url: input.file.dataUrl } }
              ]
            : buildPrompt(input)
        }
      ],
      temperature: 0.2,
      max_tokens: 1800,
      response_format: { type: "json_object" }
    })
  });

  return normalizeAzureCards(payload, input);
}

async function extractWithCustomAzure(input: ExtractQuestRequest, endpoint: string, key: string) {
  const configuredRoute = azureConfig().route;
  const routeCandidates = configuredRoute
    ? [configuredRoute]
    : ["", "/api/extract", "/api/quest/extract", "/api/chat/completions", "/v1/chat/completions"];
  const body = {
    task: "extract-campus-quest",
    schema: "side-quest.v1",
    prompt: buildPrompt(input),
    sourceType: input.sourceType,
    text: input.text,
    url: input.url,
    scrapedPage: input.scrapedPage,
    scrapedPages: input.scrapedPages,
    file: input.file
  };
  const errors: string[] = [];

  for (const route of routeCandidates) {
    try {
      const payload = await fetchJsonWithTimeout(joinUrl(endpoint, route), {
        method: "POST",
        headers: azureHeaders(key),
        body: JSON.stringify(body)
      });
      const cards = normalizeAzureCards(payload, input);
      if (cards.length) return cards;
      errors.push(`${route || "/"} returned no cards`);
    } catch (error) {
      errors.push(error instanceof Error ? `${route || "/"}: ${error.message}` : `${route || "/"} failed`);
    }
  }

  throw new Error(errors.slice(0, 3).join("; "));
}

async function extractWithAzure(input: ExtractQuestRequest) {
  const config = requireAzureConfig();
  const endpoint = process.env.AZURE_AI_ENDPOINT;
  const resolvedEndpoint = config.endpoint;
  const key = config.key;

  if (config.mode === "azure-openai" || config.deployment) {
    return extractWithAzureOpenAI(input, resolvedEndpoint, key);
  }

  if (endpoint) {
    return extractWithCustomAzure(input, endpoint, key);
  }

  return null;
}

export async function extractQuestCards(
  input: ExtractQuestRequest
): Promise<ExtractQuestResponse> {
  const prepared = await prepareExtractionInput(input);
  const azureCards = await extractWithAzure(prepared.input);

  if (!azureCards?.length) {
    throw new Error("Azure extraction returned no side quest cards.");
  }

  return {
    cards: azureCards,
    meta: extractionMeta("azure", false, prepared.input, azureCards, prepared.warnings)
  };
}

export async function checkAzureConnection(): Promise<AzureConnectionHealth> {
  const config = azureConfig();
  const cacheKey = [
    config.endpoint,
    config.key ? "key-set" : "no-key",
    config.mode,
    config.deployment ?? "",
    config.route,
    String(config.enabled)
  ].join("|");
  const now = Date.now();

  if (azureHealthCache?.key === cacheKey && azureHealthCache.expiresAt > now) {
    return azureHealthCache.value;
  }

  const value = await checkAzureConnectionUncached();
  azureHealthCache = {
    key: cacheKey,
    expiresAt: now + healthCacheTtlMs,
    value
  };
  return value;
}

async function checkAzureConnectionUncached(): Promise<AzureConnectionHealth> {
  const config = azureConfig();
  const endpoint = config.endpoint;
  const key = config.key;
  const mode = config.mode;
  const checkedAt = new Date().toISOString();
  const deploymentConfigured = Boolean(config.deployment);
  const routeConfigured = Boolean(config.route);

  if (!endpoint || !key || !config.enabled) {
    return {
      configured: false,
      reachable: false,
      mode,
      status: "not_configured",
      deploymentConfigured,
      routeConfigured,
      detail:
        "Set AZURE_AI_ENDPOINT/AZURE_AI_KEY for a custom Azure gateway, or AZURE_OPENAI_ENDPOINT/AZURE_OPENAI_API_KEY plus AZURE_OPENAI_DEPLOYMENT for Azure OpenAI.",
      checkedAt
    };
  }

  let endpointHost: string | undefined;
  try {
    endpointHost = new URL(endpoint).host;
  } catch {
    return {
      configured: true,
      reachable: false,
      mode,
      status: "unreachable",
      deploymentConfigured,
      routeConfigured,
      detail: "AZURE_AI_ENDPOINT is not a valid URL.",
      checkedAt
    };
  }

  if (mode === "azure-openai" || deploymentConfigured) {
    try {
      await extractWithAzureOpenAI(
        {
          sourceType: "text",
          text: "Campus AI Society poster: AI Study Buddy Hack Night, May 17 deadline, 4 hours, Innovation Hub, mentor feedback."
        },
        endpoint,
        key
      );
      return {
        configured: true,
        reachable: true,
        mode: "azure-openai",
        status: "ready",
        endpointHost,
        deploymentConfigured,
        routeConfigured,
        detail: "Azure OpenAI chat completion returned parseable Side Quest JSON.",
        checkedAt
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Azure OpenAI check failed.";
      return {
        configured: true,
        reachable: false,
        mode: "azure-openai",
        status: detail.includes("401") || detail.includes("403") ? "auth_failed" : "unreachable",
        endpointHost,
        deploymentConfigured,
        routeConfigured,
        detail,
        checkedAt
      };
    }
  }

  try {
    const response = await fetch(endpoint, { method: "GET" });
    const text = await response.text();
    const looksLikePortal =
      text.includes("UO OpenAI Portal") ||
      text.includes("Account/Login") ||
      text.includes("Use a local account to log in");

    if (looksLikePortal && !routeConfigured) {
      return {
        configured: true,
        reachable: true,
        mode,
        status: "portal_login_required",
        endpointHost,
        deploymentConfigured,
        routeConfigured,
        detail:
          "Endpoint is reachable, but it serves the UO OpenAI Portal login UI. Configure AZURE_AI_ROUTE or Azure OpenAI deployment values for server-to-server extraction.",
        checkedAt
      };
    }

    if (!routeConfigured) {
      return {
        configured: true,
        reachable: response.ok,
        mode,
        status: "route_not_configured",
        endpointHost,
        deploymentConfigured,
        routeConfigured,
        detail:
          "Endpoint is reachable, but no extraction route or deployment is configured. Set AZURE_AI_ROUTE for a custom app service route.",
        checkedAt
      };
    }
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      mode,
      status: "unreachable",
      endpointHost,
      deploymentConfigured,
      routeConfigured,
      detail: error instanceof Error ? error.message : "Azure endpoint is unreachable.",
      checkedAt
    };
  }

  try {
    await extractWithCustomAzure(
      {
        sourceType: "text",
        text: "Campus AI Society poster: AI Study Buddy Hack Night, May 17 deadline, 4 hours, Innovation Hub, mentor feedback."
      },
      endpoint,
      key
    );
    return {
      configured: true,
      reachable: true,
      mode,
      status: "ready",
      endpointHost,
      deploymentConfigured,
      routeConfigured,
      detail: "Custom Azure endpoint returned parseable Side Quest JSON.",
      checkedAt
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Custom Azure route check failed.";
    return {
      configured: true,
      reachable: false,
      mode,
      status: detail.includes("401") || detail.includes("403") ? "auth_failed" : "unknown",
      endpointHost,
      deploymentConfigured,
      routeConfigured,
      detail,
      checkedAt
    };
  }
}
