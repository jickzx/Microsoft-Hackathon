import type { EventProfileMatchBreakdown, EventUserProfile } from "../types";

const EVENT_PROFILE_SCORE_WEIGHTS = {
  career: 0.22,
  skills: 0.2,
  goals: 0.18,
  role: 0.12,
  experience: 0.1,
  education: 0.06,
  hobbies: 0.12
} as const;

const stopWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "build",
  "for",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with"
]);

const tokenGroups = {
  ai: ["ai", "artificial", "intelligence", "llm", "ml", "machine", "learning", "openai"],
  business: ["business", "commercial", "go-to-market", "market", "sales", "strategy"],
  community: ["community", "impact", "nonprofit", "social", "volunteer"],
  data: ["analytics", "analysis", "data", "metrics", "sql", "visualisation", "visualization"],
  design: ["brand", "design", "figma", "product", "prototype", "ui", "ux"],
  education: ["course", "education", "learning", "student", "teaching", "training"],
  engineering: ["backend", "code", "coding", "developer", "engineering", "frontend", "software"],
  finance: ["accounting", "finance", "fintech", "investment", "trading"],
  health: ["care", "health", "healthcare", "medical", "wellbeing"],
  leadership: ["founder", "lead", "leadership", "manager", "organiser", "organizer"],
  research: ["experiment", "lab", "paper", "research", "science"],
  startup: ["founder", "startup", "venture", "entrepreneurship"],
  sustainability: ["climate", "environment", "green", "sustainability"]
} as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function splitTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function rawTokens(values: string | readonly string[]) {
  const list = Array.isArray(values) ? values : [values];
  return new Set(list.flatMap(splitTokens));
}

function expandedTokens(values: string | readonly string[]) {
  const tokens = rawTokens(values);
  for (const [group, aliases] of Object.entries(tokenGroups)) {
    if (aliases.some((alias) => tokens.has(alias))) tokens.add(group);
  }
  return tokens;
}

function overlap(a: Set<string>, b: Set<string>) {
  return [...a].filter((token) => b.has(token));
}

function similarity(aValues: string | readonly string[], bValues: string | readonly string[]) {
  const a = expandedTokens(aValues);
  const b = expandedTokens(bValues);
  if (a.size === 0 && b.size === 0) return 0.5;
  if (a.size === 0 || b.size === 0) return 0.2;

  const shared = overlap(a, b).length;
  const dice = (2 * shared) / (a.size + b.size);
  const coverage = shared / Math.min(a.size, b.size);
  return clamp01(dice * 0.68 + coverage * 0.32);
}

function coverage(needValues: string | readonly string[], supportValues: string | readonly string[]) {
  const needs = expandedTokens(needValues);
  const support = expandedTokens(supportValues);
  if (needs.size === 0 || support.size === 0) return 0.2;
  return clamp01(overlap(needs, support).length / needs.size);
}

function bestItemSimilarity(aValues: readonly string[], bValues: readonly string[]) {
  if (!aValues.length || !bValues.length) return 0.2;

  return Math.max(
    ...aValues.flatMap((aValue) => bValues.map((bValue) => similarity(aValue, bValue)))
  );
}

function parseExperienceYears(value: string) {
  const lower = value.toLowerCase();
  if (/no\s+experience|none/.test(lower)) return 0;

  const explicitYears = lower.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/);
  if (explicitYears) return Number(explicitYears[1]);

  if (/intern|placement|student/.test(lower)) return 0.5;
  if (/entry|junior|graduate/.test(lower)) return 1.5;
  if (/mid|associate/.test(lower)) return 4;
  if (/senior|lead|manager|founder/.test(lower)) return 7;
  if (/director|head|principal/.test(lower)) return 10;
  return null;
}

function scoreExperience(a: EventUserProfile, b: EventUserProfile) {
  const aYears = parseExperienceYears(a.workExperience);
  const bYears = parseExperienceYears(b.workExperience);

  if (aYears !== null && bYears !== null) {
    const gap = Math.abs(aYears - bYears);
    if (gap <= 1) return 1;
    if (gap <= 3) return 0.88;
    if (gap <= 7) return 0.78;
    return 0.62;
  }

  return similarity([a.workExperience, a.role], [b.workExperience, b.role]);
}

function matchingValues(source: readonly string[], target: readonly string[]) {
  const targetTokens = expandedTokens(target);
  return source.filter((value) => overlap(expandedTokens(value), targetTokens).length > 0);
}

function humanize(value: string) {
  return value
    .split("-")
    .join(" ")
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstName(profile: EventUserProfile) {
  return profile.name.split(/\s+/)[0] || profile.name;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function list(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function buildReasons(anchor: EventUserProfile, candidate: EventUserProfile) {
  const sharedCareers = matchingValues(anchor.careerInterests, candidate.careerInterests);
  const sharedSkills = matchingValues(anchor.skills, candidate.skills);
  const sharedHobbies = matchingValues(anchor.hobbies, candidate.hobbies);
  const candidateSkillsForAnchor = matchingValues(candidate.skills, [
    ...anchor.goals,
    ...anchor.careerInterests
  ]);
  const anchorSkillsForCandidate = matchingValues(anchor.skills, [
    ...candidate.goals,
    ...candidate.careerInterests
  ]);
  const reasons: string[] = [];

  if (sharedCareers.length) {
    reasons.push(`Shared career interest in ${humanize(sharedCareers[0])}`);
  }
  if (sharedSkills.length) {
    reasons.push(`Both bring ${list(sharedSkills.slice(0, 2).map(humanize))}`);
  }
  if (candidateSkillsForAnchor.length) {
    reasons.push(
      `${firstName(candidate)} can help with ${humanize(candidateSkillsForAnchor[0])}`
    );
  }
  if (anchorSkillsForCandidate.length) {
    reasons.push(`You can help with their ${humanize(anchorSkillsForCandidate[0])} goals`);
  }
  if (sharedHobbies.length) {
    reasons.push(`Easy icebreaker around ${humanize(sharedHobbies[0])}`);
  }
  if (
    reasons.length < 2 &&
    similarity(
      [anchor.role, anchor.courseOrJobTitle],
      [candidate.role, candidate.courseOrJobTitle]
    ) > 0.45
  ) {
    reasons.push(`Similar ${humanize(anchor.role)} context`);
  }

  return unique(reasons).slice(0, 4);
}

function buildConversationStarters(anchor: EventUserProfile, candidate: EventUserProfile) {
  const sharedHobbies = matchingValues(anchor.hobbies, candidate.hobbies);
  const sharedCareers = matchingValues(anchor.careerInterests, candidate.careerInterests);
  const candidateSkill = candidate.skills[0];
  const candidateGoal = candidate.goals[0];

  return unique([
    sharedCareers[0]
      ? `Ask ${firstName(candidate)} what they want to build in ${humanize(sharedCareers[0])}.`
      : "",
    candidateSkill ? `Compare how ${candidateSkill} shows up in your work.` : "",
    candidateGoal ? `Ask what would make ${humanize(candidateGoal)} successful for them.` : "",
    sharedHobbies[0] ? `Start with your shared interest in ${humanize(sharedHobbies[0])}.` : ""
  ]).slice(0, 3);
}

export function scoreEventProfileMatch(
  anchor: EventUserProfile,
  candidate: EventUserProfile
): EventProfileMatchBreakdown {
  const careerScore = clamp01(
    similarity(
      [anchor.role, anchor.courseOrJobTitle, ...anchor.careerInterests],
      [candidate.role, candidate.courseOrJobTitle, ...candidate.careerInterests]
    ) *
      0.55 +
      bestItemSimilarity(anchor.careerInterests, candidate.careerInterests) * 0.45
  );
  const directSkillScore = clamp01(
    similarity(anchor.skills, candidate.skills) * 0.4 +
      bestItemSimilarity(anchor.skills, candidate.skills) * 0.6
  );
  const complementarySkillScore =
    (Math.max(
      coverage([...anchor.goals, ...anchor.careerInterests], candidate.skills),
      bestItemSimilarity([...anchor.goals, ...anchor.careerInterests], candidate.skills)
    ) +
      Math.max(
        coverage([...candidate.goals, ...candidate.careerInterests], anchor.skills),
        bestItemSimilarity([...candidate.goals, ...candidate.careerInterests], anchor.skills)
      )) /
    2;
  const skillScore = clamp01(directSkillScore * 0.45 + complementarySkillScore * 0.55);
  const goalScore = clamp01(
    similarity([...anchor.goals, ...anchor.careerInterests], [
      ...candidate.goals,
      ...candidate.careerInterests
    ]) *
      0.55 +
      bestItemSimilarity(
        [...anchor.goals, ...anchor.careerInterests],
        [...candidate.goals, ...candidate.careerInterests]
      ) *
        0.45
  );
  const roleScore = clamp01(
    similarity([anchor.role, anchor.courseOrJobTitle], [
      candidate.role,
      candidate.courseOrJobTitle
    ]) *
      0.6 +
      bestItemSimilarity(
        [anchor.role, anchor.courseOrJobTitle],
        [candidate.role, candidate.courseOrJobTitle]
      ) *
        0.4
  );
  const experienceScore = scoreExperience(anchor, candidate);
  const educationScore = similarity(
    [anchor.highestEducation, anchor.courseOrJobTitle],
    [candidate.highestEducation, candidate.courseOrJobTitle]
  );
  const hobbyScore = clamp01(
    similarity(anchor.hobbies, candidate.hobbies) * 0.7 +
      bestItemSimilarity(anchor.hobbies, candidate.hobbies) * 0.3
  );

  const total = Math.round(
    100 *
      (careerScore * EVENT_PROFILE_SCORE_WEIGHTS.career +
        skillScore * EVENT_PROFILE_SCORE_WEIGHTS.skills +
        goalScore * EVENT_PROFILE_SCORE_WEIGHTS.goals +
        roleScore * EVENT_PROFILE_SCORE_WEIGHTS.role +
        experienceScore * EVENT_PROFILE_SCORE_WEIGHTS.experience +
        educationScore * EVENT_PROFILE_SCORE_WEIGHTS.education +
        hobbyScore * EVENT_PROFILE_SCORE_WEIGHTS.hobbies)
  );

  return {
    profileId: anchor.id,
    candidateId: candidate.id,
    eventId: anchor.eventId,
    total,
    careerScore: round2(careerScore),
    skillScore: round2(skillScore),
    goalScore: round2(goalScore),
    roleScore: round2(roleScore),
    experienceScore: round2(experienceScore),
    educationScore: round2(educationScore),
    hobbyScore: round2(hobbyScore),
    reasons: buildReasons(anchor, candidate),
    conversationStarters: buildConversationStarters(anchor, candidate)
  };
}

export function recommendLocalEventProfileMatches(
  profiles: EventUserProfile[],
  profileId: string,
  limit = 5
) {
  const anchor = profiles.find((profile) => profile.id === profileId);
  if (!anchor) return [];

  return profiles
    .filter((profile) => profile.id !== profileId && profile.eventId === anchor.eventId)
    .map((profile) => scoreEventProfileMatch(anchor, profile))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
