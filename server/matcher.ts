import { scoreQuestForStudent } from "../src/lib/matching";
import type {
  MatchRecommendationMeta,
  MatchRecommendationResponse,
  QuestCard,
  QuestMatchBreakdown,
  StudentProfile
} from "../src/types";

const matchJsonInstruction = `Return JSON only with this shape:
{
  "matches": [
    {
      "questId": "quest-001",
      "studentId": "student-you",
      "total": 87,
      "interestScore": 0.91,
      "skillScore": 0.76,
      "availabilityScore": 0.82,
      "difficultyScore": 1,
      "rewardScore": 0.75,
      "locationScore": 1,
      "urgencyScore": 0.7,
      "reasons": ["Matches AI and Design interests", "Good way to build ML"]
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

function normalizeReasons(raw: Record<string, unknown>, fallback: string[]) {
  const rawReasons = raw.reasons ?? raw.explanations ?? raw.rationale;
  const reasons = Array.isArray(rawReasons)
    ? rawReasons.filter((reason): reason is string => typeof reason === "string")
    : typeof rawReasons === "string"
      ? [rawReasons]
      : [];

  return (reasons.length ? reasons : fallback).slice(0, 4);
}

function compactStudent(student: StudentProfile) {
  return {
    id: student.id,
    year: student.year,
    major: student.major,
    interests: student.interests,
    skills: student.skills,
    wantsToBuildSkills: student.wantsToBuildSkills,
    availability: student.availability,
    preferences: student.preferences,
    questCount: student.questCount,
    communicationStyle: student.communicationStyle
  };
}

function compactQuest(quest: QuestCard) {
  return {
    id: quest.id,
    title: quest.title,
    organizer: quest.organizer,
    summary: quest.summary,
    interests: quest.interests,
    skillsHelpful: quest.skillsHelpful,
    difficulty: quest.difficulty,
    estimatedHours: quest.estimatedHours,
    reward: quest.reward,
    location: quest.location,
    deadline: quest.deadline,
    eventStart: quest.eventStart,
    eventEnd: quest.eventEnd,
    bestFor: quest.bestFor,
    party: quest.party
  };
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

function getConfiguredMatchRoute() {
  return process.env.AZURE_MATCH_ROUTE || "";
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

function buildPrompt(quests: QuestCard[], student: StudentProfile) {
  return [
    "You are QuestBoard's side quest matching engine.",
    "Rank campus opportunities for a student using their interests, skills, preferred rewards, availability, location modes, and appetite for difficulty.",
    "Score exact interests highly, but also credit adjacent interests and skills the student wants to build.",
    "Keep reasons short, practical, and student-facing.",
    matchJsonInstruction,
    "",
    "Student:",
    JSON.stringify(compactStudent(student), null, 2),
    "",
    "Quests:",
    JSON.stringify(quests.map(compactQuest), null, 2)
  ].join("\n");
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
    throw new Error(`Azure match request failed with HTTP ${response.status}`);
  }

  if (!contentType.includes("application/json")) {
    const parsed = tryParseJsonFromText(text);
    if (parsed) return parsed;
    throw new Error(`Azure match response was ${contentType || "non-JSON"}`);
  }

  return JSON.parse(text);
}

function normalizeAzureMatches(
  value: unknown,
  quests: QuestCard[],
  student: StudentProfile
): QuestMatchBreakdown[] {
  const normalized = normalizeAzurePayload(value);
  const payload = asRecord(normalized);
  if (!payload) return [];

  const possibleMatches = payload.matches ?? payload.recommendations ?? payload.quests ?? payload.data;
  if (!Array.isArray(possibleMatches)) return [];

  const localByQuest = new Map(
    quests.map((quest) => [quest.id, scoreQuestForStudent(quest, student)])
  );
  const azureByQuest = new Map<string, QuestMatchBreakdown>();

  for (const item of possibleMatches) {
    const raw = asRecord(item);
    const questId = String(raw?.questId ?? raw?.quest_id ?? raw?.id ?? "");
    const local = localByQuest.get(questId);
    if (!raw || !local) continue;

    azureByQuest.set(questId, {
      questId,
      studentId: student.id,
      total: normalizeTotal(raw.total ?? raw.score ?? raw.matchScore, local.total),
      interestScore: normalizeComponent(
        raw.interestScore ?? raw.interestsScore ?? raw.interests,
        local.interestScore
      ),
      skillScore: normalizeComponent(raw.skillScore ?? raw.skillsScore ?? raw.skills, local.skillScore),
      availabilityScore: normalizeComponent(
        raw.availabilityScore ?? raw.availability,
        local.availabilityScore
      ),
      difficultyScore: normalizeComponent(
        raw.difficultyScore ?? raw.difficulty,
        local.difficultyScore
      ),
      rewardScore: normalizeComponent(raw.rewardScore ?? raw.reward, local.rewardScore),
      locationScore: normalizeComponent(raw.locationScore ?? raw.location, local.locationScore),
      urgencyScore: normalizeComponent(raw.urgencyScore ?? raw.urgency, local.urgencyScore),
      reasons: normalizeReasons(raw, local.reasons)
    });
  }

  if (azureByQuest.size === 0) return [];
  return quests.map((quest) => azureByQuest.get(quest.id) ?? localByQuest.get(quest.id)!);
}

async function matchWithAzureOpenAI(quests: QuestCard[], student: StudentProfile) {
  const endpoint = getAzureEndpoint();
  const key = getAzureKey();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? process.env.AZURE_AI_DEPLOYMENT;
  if (!endpoint || !key || !deployment) return null;

  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION ?? process.env.AZURE_AI_API_VERSION ?? "2024-10-21";
  const payload = await fetchJsonWithTimeout(
    joinUrl(
      endpoint,
      `/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`
    ),
    {
      method: "POST",
      headers: commonAzureHeaders(key),
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You match students to campus side quests. Respond with valid JSON only."
          },
          {
            role: "user",
            content: buildPrompt(quests, student)
          }
        ],
        temperature: 0.2,
        max_tokens: 2200,
        response_format: { type: "json_object" }
      })
    }
  );

  return normalizeAzureMatches(payload, quests, student);
}

async function matchWithCustomAzure(quests: QuestCard[], student: StudentProfile) {
  const endpoint = process.env.AZURE_AI_ENDPOINT;
  const key = getAzureKey();
  if (!endpoint || !key) return null;

  const configuredRoute = getConfiguredMatchRoute();
  const routeCandidates = configuredRoute
    ? [configuredRoute]
    : [
        "/api/matches/recommend",
        "/api/sidequests/recommend",
        "/api/match",
        "/api/recommendations",
        ""
      ];
  const body = {
    task: "match-side-quests",
    schema: "questboard.match.v1",
    prompt: buildPrompt(quests, student),
    student: compactStudent(student),
    quests: quests.map(compactQuest)
  };
  const errors: string[] = [];

  for (const route of routeCandidates) {
    try {
      const payload = await fetchJsonWithTimeout(joinUrl(endpoint, route), {
        method: "POST",
        headers: commonAzureHeaders(key),
        body: JSON.stringify(body)
      });
      const matches = normalizeAzureMatches(payload, quests, student);
      if (matches.length) return matches;
      errors.push(`${route || "/"} returned no matches`);
    } catch (error) {
      errors.push(error instanceof Error ? `${route || "/"}: ${error.message}` : `${route || "/"} failed`);
    }
  }

  throw new Error(errors.slice(0, 3).join("; "));
}

async function matchWithAzure(quests: QuestCard[], student: StudentProfile) {
  if (process.env.AZURE_MATCH_ENABLED === "false" || process.env.AZURE_AI_ENABLED === "false") {
    return null;
  }

  const mode = getAzureMode();
  if (
    mode === "azure-openai" ||
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    process.env.AZURE_AI_DEPLOYMENT
  ) {
    return matchWithAzureOpenAI(quests, student);
  }

  return matchWithCustomAzure(quests, student);
}

function confidenceFor(matches: QuestMatchBreakdown[]) {
  if (matches.length === 0) return 0;
  return round2(matches.reduce((sum, match) => sum + match.total / 100, 0) / matches.length);
}

function localResponse(
  quests: QuestCard[],
  student: StudentProfile,
  warning?: string
): MatchRecommendationResponse {
  const matches = quests.map((quest) => scoreQuestForStudent(quest, student));
  const meta: MatchRecommendationMeta = {
    provider: "local",
    fallbackUsed: true,
    studentId: student.id,
    questCount: matches.length,
    confidence: confidenceFor(matches),
    warnings: [
      warning
        ? `Azure matching unavailable (${warning}); used local side quest scoring.`
        : "Azure matching unavailable; used local side quest scoring."
    ],
    model: "local-side-quest-matcher",
    matchedAt: new Date().toISOString()
  };

  return { matches, meta };
}

export async function recommendQuestMatches(
  quests: QuestCard[],
  student: StudentProfile
): Promise<MatchRecommendationResponse> {
  let azureWarning = "";

  try {
    const azureMatches = await matchWithAzure(quests, student);
    if (azureMatches?.length) {
      return {
        matches: azureMatches,
        meta: {
          provider: "azure",
          fallbackUsed: false,
          studentId: student.id,
          questCount: azureMatches.length,
          confidence: confidenceFor(azureMatches),
          warnings: [],
          model:
            process.env.AZURE_OPENAI_DEPLOYMENT ??
            process.env.AZURE_AI_DEPLOYMENT ??
            "azure-side-quest-matcher",
          matchedAt: new Date().toISOString()
        }
      };
    }
  } catch (error) {
    azureWarning = error instanceof Error ? error.message : "Azure matching failed";
    console.warn(azureWarning);
  }

  return localResponse(quests, student, azureWarning);
}
