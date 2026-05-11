import { recommendLocalEventProfileMatches } from "../src/lib/profileMatching";
import type {
  EventProfileMatchBreakdown,
  EventProfileMatchResponse,
  EventUserProfile
} from "../src/types";
import { azureConfig, azureHeaders } from "./env";

const profileMatchJsonInstruction = `Return JSON only with this shape:
{
  "matches": [
    {
      "profileId": "student-you",
      "candidateId": "student-priya",
      "eventId": "microsoft-hackathon-2026",
      "total": 88,
      "careerScore": 0.9,
      "skillScore": 0.84,
      "goalScore": 0.8,
      "roleScore": 0.72,
      "experienceScore": 0.88,
      "educationScore": 0.7,
      "hobbyScore": 0.55,
      "reasons": ["Shared interest in AI product", "Complementary design and ML skills"],
      "conversationStarters": ["Ask Priya what makes an AI prototype reliable."]
    }
  ]
}`;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
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
  const payload = asRecord(value);
  if (!payload) return value;

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const content = message?.content ?? firstChoice?.text;

  if (typeof content === "string") return tryParseJsonFromText(content) ?? value;
  if (payload.output) return payload.output;
  if (payload.result) return payload.result;
  if (payload.data) return payload.data;
  return value;
}

function normalizeTotal(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(clamp(numeric <= 1 ? numeric * 100 : numeric, 0, 100));
}

function normalizeComponent(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return round2(clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1));
}

function normalizeList(value: unknown, fallback: string[]) {
  const normalized = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : typeof value === "string" && value.trim()
      ? [value.trim()]
      : [];

  return (normalized.length ? normalized : fallback).slice(0, 4);
}

function compactProfile(profile: EventUserProfile) {
  return {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    workExperience: profile.workExperience,
    highestEducation: profile.highestEducation,
    courseOrJobTitle: profile.courseOrJobTitle,
    careerInterests: profile.careerInterests,
    skills: profile.skills,
    goals: profile.goals,
    hobbies: profile.hobbies
  };
}

function buildPrompt(
  anchor: EventUserProfile,
  candidates: EventUserProfile[],
  localMatches: EventProfileMatchBreakdown[],
  limit: number
) {
  return [
    "You are QuestBoard's event attendee matchmaking engine.",
    "Match one event attendee with the strongest people to meet at the same event.",
    "Use only profile details the attendees entered: name, role, work experience, highest education, course or job title, career interests, skills, goals, and hobbies.",
    "Prioritize useful introductions: shared career direction, complementary skills, compatible goals, relevant experience gaps for mentoring, and natural hobby icebreakers.",
    "Do not use protected traits or infer sensitive attributes.",
    "Keep reasons and conversation starters short, practical, and attendee-facing.",
    `Return up to ${limit} matches, ordered from strongest to weakest.`,
    profileMatchJsonInstruction,
    "",
    "Anchor profile:",
    JSON.stringify(compactProfile(anchor), null, 2),
    "",
    "Candidate profiles:",
    JSON.stringify(candidates.map(compactProfile), null, 2),
    "",
    "Deterministic baseline scores to calibrate against:",
    JSON.stringify(localMatches, null, 2)
  ].join("\n");
}

function joinUrl(base: string, route: string) {
  return `${base.replace(/\/+$/, "")}/${route.replace(/^\/+/, "")}`;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit) {
  const config = azureConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  const response = await fetch(url, {
    ...init,
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Azure profile match request failed with HTTP ${response.status}`);
  }

  if (!contentType.includes("application/json")) {
    const parsed = tryParseJsonFromText(text);
    if (parsed) return parsed;
    throw new Error(`Azure profile match response was ${contentType || "non-JSON"}`);
  }

  return JSON.parse(text);
}

function normalizeAzureMatches(
  value: unknown,
  profiles: EventUserProfile[],
  profileId: string,
  limit: number
) {
  const localMatches = recommendLocalEventProfileMatches(profiles, profileId, limit);
  const localByCandidate = new Map(localMatches.map((match) => [match.candidateId, match]));
  const normalized = normalizeAzurePayload(value);
  const payload = asRecord(normalized);
  if (!payload) return [];

  const possibleMatches =
    payload.matches ?? payload.recommendations ?? payload.people ?? payload.profiles ?? payload.data;
  if (!Array.isArray(possibleMatches)) return [];

  const azureByCandidate = new Map<string, EventProfileMatchBreakdown>();

  for (const item of possibleMatches) {
    const raw = asRecord(item);
    const candidateId = String(
      raw?.candidateId ?? raw?.candidateProfileId ?? raw?.personId ?? raw?.id ?? ""
    );
    const local = localByCandidate.get(candidateId);
    if (!raw || !local) continue;

    azureByCandidate.set(candidateId, {
      profileId,
      candidateId,
      eventId: local.eventId,
      total: normalizeTotal(raw.total ?? raw.score ?? raw.matchScore, local.total),
      careerScore: normalizeComponent(raw.careerScore ?? raw.career, local.careerScore),
      skillScore: normalizeComponent(raw.skillScore ?? raw.skills, local.skillScore),
      goalScore: normalizeComponent(raw.goalScore ?? raw.goals, local.goalScore),
      roleScore: normalizeComponent(raw.roleScore ?? raw.role, local.roleScore),
      experienceScore: normalizeComponent(
        raw.experienceScore ?? raw.experience,
        local.experienceScore
      ),
      educationScore: normalizeComponent(
        raw.educationScore ?? raw.education,
        local.educationScore
      ),
      hobbyScore: normalizeComponent(raw.hobbyScore ?? raw.hobbies, local.hobbyScore),
      reasons: normalizeList(raw.reasons ?? raw.explanations ?? raw.rationale, local.reasons),
      conversationStarters: normalizeList(
        raw.conversationStarters ?? raw.icebreakers ?? raw.openers,
        local.conversationStarters
      )
    });
  }

  if (azureByCandidate.size === 0) return [];

  return localMatches
    .map((match) => azureByCandidate.get(match.candidateId) ?? match)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

async function matchWithAzureOpenAI(
  profiles: EventUserProfile[],
  profileId: string,
  limit: number
) {
  const config = azureConfig();
  if (
    !config.enabled ||
    process.env.AZURE_MATCH_ENABLED === "false" ||
    process.env.AZURE_PROFILE_MATCH_ENABLED === "false" ||
    !config.endpoint ||
    !config.key ||
    !config.deployment
  ) {
    return null;
  }

  const anchor = profiles.find((profile) => profile.id === profileId);
  if (!anchor) return null;

  const candidates = profiles.filter(
    (profile) => profile.id !== profileId && profile.eventId === anchor.eventId
  );
  const localMatches = recommendLocalEventProfileMatches(profiles, profileId, limit);
  if (!candidates.length || !localMatches.length) return [];

  const payload = await fetchJsonWithTimeout(
    joinUrl(
      config.endpoint,
      `/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`
    ),
    {
      method: "POST",
      headers: azureHeaders(config.key),
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You match event attendees for high-value networking introductions. Respond with valid JSON only."
          },
          {
            role: "user",
            content: buildPrompt(anchor, candidates, localMatches, limit)
          }
        ],
        temperature: 0.2,
        max_tokens: 2200,
        response_format: { type: "json_object" }
      })
    }
  );

  return normalizeAzureMatches(payload, profiles, profileId, limit);
}

function confidenceFor(matches: EventProfileMatchBreakdown[]) {
  if (matches.length === 0) return 0;
  return round2(matches.reduce((sum, match) => sum + match.total / 100, 0) / matches.length);
}

function localResponse(
  profiles: EventUserProfile[],
  profileId: string,
  limit: number,
  warning?: string
): EventProfileMatchResponse {
  const anchor = profiles.find((profile) => profile.id === profileId);
  if (!anchor) throw new Error("Profile not found for event matchmaking.");

  const matches = recommendLocalEventProfileMatches(profiles, profileId, limit);
  return {
    matches,
    meta: {
      provider: "local",
      fallbackUsed: true,
      eventId: anchor.eventId,
      profileId,
      profileCount: profiles.filter((profile) => profile.eventId === anchor.eventId).length,
      confidence: confidenceFor(matches),
      warnings: [
        warning
          ? `Azure profile matching unavailable (${warning}); used local profile scoring.`
          : "Azure profile matching unavailable; used local profile scoring."
      ],
      model: "local-event-profile-matcher",
      matchedAt: new Date().toISOString()
    }
  };
}

export async function recommendEventProfileMatches(
  profiles: EventUserProfile[],
  profileId: string,
  limit = 5
): Promise<EventProfileMatchResponse> {
  const anchor = profiles.find((profile) => profile.id === profileId);
  if (!anchor) throw new Error("Profile not found for event matchmaking.");

  try {
    const azureMatches = await matchWithAzureOpenAI(profiles, profileId, limit);
    if (azureMatches?.length) {
      return {
        matches: azureMatches,
        meta: {
          provider: "azure",
          fallbackUsed: false,
          eventId: anchor.eventId,
          profileId,
          profileCount: profiles.filter((profile) => profile.eventId === anchor.eventId).length,
          confidence: confidenceFor(azureMatches),
          warnings: [],
          model: azureConfig().deployment ?? "azure-openai-profile-matcher",
          matchedAt: new Date().toISOString()
        }
      };
    }
  } catch (error) {
    return localResponse(
      profiles,
      profileId,
      limit,
      error instanceof Error ? error.message : "Azure profile matching failed"
    );
  }

  return localResponse(profiles, profileId, limit);
}
