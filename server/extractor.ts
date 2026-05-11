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
  QuestCard
} from "../src/types";

const defaultImageUrl =
  "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1200&q=80";

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
      "location": { "mode": "in_person | remote | hybrid", "campus": "North Campus", "building": "" },
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

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
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

function finalizeCard(card: QuestCard, fallback?: QuestCard) {
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
  if (fallback) return questCardSchema.parse(fallback);
  throw new Error("Quest card normalization failed.");
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

  return {
    provider,
    fallbackUsed,
    sourceType: input.sourceType,
    confidence: Number(confidence.toFixed(2)),
    missingFields: unique(cards.flatMap((card) => card.aiExtraction.missingFields)),
    warnings: unique([...fileWarnings(input), ...warnings]),
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
      return "New Campus Quest";
    }
  }

  return "New Campus Quest";
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

export function extractLocally(input: ExtractQuestRequest): QuestCard[] {
  const content = [input.text, input.url, input.file?.text, input.file?.name]
    .filter(Boolean)
    .join("\n");
  const title = titleFrom(content, input.url);
  const summary = summaryFrom(content, title);
  const hours = detectHours(content);
  const interests = detectInterests(content);
  const skills = detectSkills(content);
  const now = new Date().toISOString();
  const id = `quest-${idFrom(`${title}-${content}`)}`;

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
      imageUrl: defaultImageUrl,
      source: {
        id: `src-${idFrom(content)}`,
        type: input.sourceType,
        submittedByUserId: "student-you",
        rawUrl: input.url,
        fileName: input.file?.name,
        rawText: input.text,
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
      party: { allowed: true, idealSize: 3, openSlots: 4 },
      aiExtraction: {
        confidence: 0.67,
        missingFields: ["organizer"],
        extractedAt: now,
        model: "local-quest-parser"
      },
      stats: { saves: 0, views: 1, partyRequests: 0 },
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
  if (!value || typeof value !== "object") return value;
  const payload = value as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    output?: unknown;
    result?: unknown;
  };

  const content = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text;
  if (content) return tryParseJsonFromText(content) ?? value;
  if (payload.output) return payload.output;
  if (payload.result) return payload.result;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown, fallback?: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === "string" && item.trim());
    return values.length ? values.map((item) => item.trim()) : fallback;
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : fallback;
}

function enumArray<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number][]) {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|]/)
      : [];
  const values = candidates.filter(
    (item): item is T[number] =>
      typeof item === "string" && (allowed as readonly string[]).includes(item.trim())
  );

  return values.length ? unique(values) : fallback;
}

function recordValue(value: unknown) {
  return isRecord(value) ? value : {};
}

function mergeAzureCard(card: Record<string, unknown>, localBase: QuestCard, index: number) {
  const reward = recordValue(card.reward);
  const location = recordValue(card.location);
  const estimatedHours = recordValue(card.estimatedHours);
  const party = recordValue(card.party);
  const aiExtraction = recordValue(card.aiExtraction);
  const stats = recordValue(card.stats);
  const source = recordValue(card.source);
  const now = new Date().toISOString();
  const title = stringValue(card.title, localBase.title);

  return finalizeCard(
    {
      ...localBase,
      id: stringValue(card.id, `quest-azure-${idFrom(`${title}-${index}-${now}`)}`),
      title,
      organizer: stringValue(card.organizer, localBase.organizer),
      summary: stringValue(card.summary, localBase.summary),
      description: stringValue(card.description, localBase.description),
      imageUrl: stringValue(card.imageUrl, localBase.imageUrl),
      source: {
        ...localBase.source,
        id: stringValue(source.id, localBase.source.id),
        rawUrl: optionalString(source.rawUrl, localBase.source.rawUrl),
        fileName: optionalString(source.fileName, localBase.source.fileName),
        rawText: optionalString(source.rawText, localBase.source.rawText)
      },
      status: "needs_review",
      interests: enumArray(card.interests, interestTags, localBase.interests),
      skillsHelpful: enumArray(card.skillsHelpful, skillTags, localBase.skillsHelpful),
      difficulty: enumValue(card.difficulty, questDifficulties, localBase.difficulty),
      estimatedHours: {
        min: Math.max(0, numberValue(estimatedHours.min, localBase.estimatedHours.min)),
        max: Math.max(0, numberValue(estimatedHours.max, localBase.estimatedHours.max))
      },
      reward: {
        ...localBase.reward,
        type: enumArray(reward.type, rewardTypes, localBase.reward.type),
        label: stringValue(reward.label, localBase.reward.label),
        estimatedValueUsd:
          reward.estimatedValueUsd === undefined
            ? localBase.reward.estimatedValueUsd
            : numberValue(reward.estimatedValueUsd, localBase.reward.estimatedValueUsd ?? 0)
      },
      location: {
        ...localBase.location,
        mode: enumValue(location.mode, questModes, localBase.location.mode),
        campus: optionalString(location.campus, localBase.location.campus),
        building: optionalString(location.building, localBase.location.building),
        room: optionalString(location.room, localBase.location.room),
        address: optionalString(location.address, localBase.location.address),
        onlineUrl: optionalString(location.onlineUrl, localBase.location.onlineUrl)
      },
      deadline: optionalString(card.deadline, localBase.deadline),
      eventStart: optionalString(card.eventStart, localBase.eventStart),
      eventEnd: optionalString(card.eventEnd, localBase.eventEnd),
      bestFor: stringArray(card.bestFor, localBase.bestFor),
      eligibility: stringArray(card.eligibility, localBase.eligibility),
      applyUrl: optionalString(card.applyUrl, localBase.applyUrl),
      contactEmail: optionalString(card.contactEmail, localBase.contactEmail),
      party: {
        allowed: booleanValue(party.allowed, localBase.party.allowed),
        idealSize: Math.max(1, Math.round(numberValue(party.idealSize, localBase.party.idealSize))),
        openSlots: Math.max(0, Math.round(numberValue(party.openSlots, localBase.party.openSlots)))
      },
      aiExtraction: {
        confidence: numberValue(aiExtraction.confidence, 0.86),
        missingFields: stringArray(aiExtraction.missingFields, []),
        extractedAt: stringValue(aiExtraction.extractedAt, now),
        model: stringValue(aiExtraction.model, "azure-ai")
      },
      stats: {
        saves: Math.max(0, Math.round(numberValue(stats.saves, localBase.stats.saves))),
        views: Math.max(0, Math.round(numberValue(stats.views, localBase.stats.views))),
        partyRequests: Math.max(
          0,
          Math.round(numberValue(stats.partyRequests, localBase.stats.partyRequests))
        )
      },
      createdAt: stringValue(card.createdAt, localBase.createdAt),
      updatedAt: stringValue(card.updatedAt, now)
    },
    localBase
  );
}

function normalizeAzureCards(value: unknown, input: ExtractQuestRequest): QuestCard[] {
  if (!value || typeof value !== "object") return [];
  const normalized = normalizeAzurePayload(value);
  if (!normalized || typeof normalized !== "object") return [];
  const possible = normalized as { cards?: unknown; quests?: unknown; data?: unknown };
  const cards = Array.isArray(possible.cards)
    ? possible.cards
    : Array.isArray(possible.quests)
      ? possible.quests
      : Array.isArray(possible.data)
        ? possible.data
        : [];
  const localBase = extractLocally(input)[0];

  return cards
    .filter(isRecord)
    .map((card, index) => mergeAzureCard(card, localBase, index));
}

function getAzureMode() {
  return process.env.AZURE_AI_MODE ?? "auto";
}

function getAzureEndpoint() {
  return process.env.AZURE_OPENAI_ENDPOINT ?? process.env.AZURE_AI_ENDPOINT;
}

function getAzureKey() {
  return process.env.AZURE_OPENAI_API_KEY ?? process.env.AZURE_AI_KEY;
}

function getConfiguredRoute() {
  return process.env.AZURE_AI_ROUTE || process.env.AZURE_OPENAI_ROUTE || "";
}

function joinUrl(base: string, route: string) {
  if (!route) return base;
  return `${base.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`;
}

function commonAzureHeaders(key: string) {
  const authHeader = process.env.AZURE_AI_AUTH_HEADER;
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

function buildPrompt(input: ExtractQuestRequest) {
  return [
    "You are QuestBoard's extraction engine.",
    "Extract campus opportunities from messy student-submitted material.",
    "Clean the result into practical, social, student-facing quest cards.",
    "Use ISO dates. If a field is uncertain, infer a sensible value and keep it conservative.",
    questJsonInstruction,
    "",
    `Source type: ${input.sourceType}`,
    input.url ? `URL: ${input.url}` : "",
    input.file ? `File: ${input.file.name} (${input.file.type}, ${input.file.size} bytes)` : "",
    "Content:",
    input.text || input.url || input.file?.name || ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchJsonWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.AZURE_AI_TIMEOUT_MS ?? 12000)
  );

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
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? process.env.AZURE_AI_DEPLOYMENT;
  if (!deployment) {
    throw new Error("Azure OpenAI deployment is not configured.");
  }

  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? process.env.AZURE_AI_API_VERSION ?? "2024-10-21";
  const url = joinUrl(
    endpoint,
    `/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`
  );
  const payload = await fetchJsonWithTimeout(url, {
    method: "POST",
    headers: commonAzureHeaders(key),
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            "You extract campus opportunity details into QuestBoard cards. Respond with valid JSON only."
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
  const configuredRoute = getConfiguredRoute();
  const routeCandidates = configuredRoute
    ? [configuredRoute]
    : ["", "/api/extract", "/api/quest/extract", "/api/chat/completions", "/v1/chat/completions"];
  const body = {
    task: "extract-campus-quest",
    schema: "questboard.v1",
    prompt: buildPrompt(input),
    sourceType: input.sourceType,
    text: input.text,
    url: input.url,
    file: input.file
  };
  const errors: string[] = [];

  for (const route of routeCandidates) {
    try {
      const payload = await fetchJsonWithTimeout(joinUrl(endpoint, route), {
        method: "POST",
        headers: commonAzureHeaders(key),
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
  const endpoint = process.env.AZURE_AI_ENDPOINT;
  const resolvedEndpoint = getAzureEndpoint();
  const key = getAzureKey();
  const enabled = process.env.AZURE_AI_ENABLED !== "false";

  if (!resolvedEndpoint || !key || !enabled) return null;

  const mode = getAzureMode();
  if (
    mode === "azure-openai" ||
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    process.env.AZURE_AI_DEPLOYMENT
  ) {
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
  let azureWarning = "";

  try {
    const azureCards = await extractWithAzure(input);
    if (azureCards?.length) {
      return {
        cards: azureCards,
        meta: extractionMeta("azure", false, input, azureCards, [])
      };
    }
  } catch (error) {
    azureWarning = error instanceof Error ? error.message : "Azure extraction failed";
    console.warn(azureWarning);
  }

  const localCards = extractLocally(input);

  return {
    cards: localCards,
    meta: extractionMeta("local", true, input, localCards, [
      azureWarning
        ? `Azure extraction unavailable (${azureWarning}); used local parser.`
        : "Azure extraction unavailable; used local parser."
    ])
  };
}

export async function checkAzureConnection(): Promise<AzureConnectionHealth> {
  const cacheKey = [
    getAzureEndpoint(),
    getAzureKey() ? "key-set" : "no-key",
    getAzureMode(),
    process.env.AZURE_OPENAI_DEPLOYMENT ?? process.env.AZURE_AI_DEPLOYMENT ?? "",
    getConfiguredRoute(),
    process.env.AZURE_AI_ENABLED ?? "true"
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
  const endpoint = getAzureEndpoint();
  const key = getAzureKey();
  const mode = getAzureMode();
  const checkedAt = new Date().toISOString();
  const deploymentConfigured = Boolean(
    process.env.AZURE_OPENAI_DEPLOYMENT ?? process.env.AZURE_AI_DEPLOYMENT
  );
  const routeConfigured = Boolean(getConfiguredRoute());

  if (!endpoint || !key || process.env.AZURE_AI_ENABLED === "false") {
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
        detail: "Azure OpenAI chat completion returned parseable QuestBoard JSON.",
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
      detail: "Custom Azure endpoint returned parseable QuestBoard JSON.",
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
