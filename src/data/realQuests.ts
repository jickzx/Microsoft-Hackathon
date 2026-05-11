import rawSideQuestData from "./side_quest_uk_seed_opportunities_may_2026.json";
import type { InterestTag, QuestCard, QuestMode, RewardType, SkillTag } from "../types";

type SeedQuest = (typeof rawSideQuestData.quests)[number];

const generatedAt = rawSideQuestData.metadata.generated_at;

const categoryImages: Record<string, string> = {
  hackathon:
    "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80",
  hackathon_conference:
    "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
  workshop_networking:
    "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80",
  networking:
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80",
  careers_event:
    "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80",
  internship:
    "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
  spring_insight:
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
  spring_week_tracker:
    "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80",
  opportunity_tracker:
    "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=1200&q=80"
};

const interestRules: { tag: InterestTag; terms: string[] }[] = [
  { tag: "ai", terms: ["ai", "genai", "machine learning", "ml"] },
  { tag: "career", terms: ["career", "internship", "graduate", "spring", "insight"] },
  { tag: "climate", terms: ["climate", "sustainability", "environment"] },
  { tag: "competitions", terms: ["hackathon", "competition", "challenge", "case"] },
  { tag: "design", terms: ["design", "ux", "product"] },
  { tag: "education", terms: ["education", "student", "campus"] },
  { tag: "events", terms: ["event", "meetup", "conference", "networking", "forum"] },
  { tag: "finance", terms: ["finance", "banking", "investment", "accountancy", "regulation"] },
  { tag: "health", terms: ["health", "medical", "patient"] },
  { tag: "research", terms: ["research", "academic", "analyst"] },
  { tag: "social-impact", terms: ["impact", "inclusive", "accessibility", "public sector"] },
  { tag: "startups", terms: ["startup", "founder", "venture", "entrepreneur"] },
  { tag: "writing", terms: ["writing", "policy"] }
];

const skillRules: { tag: SkillTag; terms: string[] }[] = [
  { tag: "backend", terms: ["backend", "api", "server", "developer tools"] },
  { tag: "community", terms: ["community", "networking", "organiser", "organizer"] },
  { tag: "coding", terms: ["coding", "software", "developer", "hackathon", "build"] },
  { tag: "data", terms: ["data", "analytics", "analyst", "finance", "research", "risk"] },
  { tag: "design", terms: ["design", "ux", "prototype", "accessibility"] },
  { tag: "frontend", terms: ["frontend", "web", "prototype", "product"] },
  { tag: "marketing", terms: ["marketing", "startup", "growth"] },
  { tag: "ml", terms: ["ai", "genai", "machine learning", "ml"] },
  { tag: "pitching", terms: ["pitch", "founder", "demo", "presentation"] },
  { tag: "public-speaking", terms: ["conference", "presentation", "talk", "pitch"] },
  { tag: "writing", terms: ["application", "policy", "cv", "cover letter", "research"] }
];

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function textForQuest(quest: SeedQuest) {
  return [
    quest.title,
    quest.category,
    quest.source_platform,
    quest.summary,
    quest.eligibility_notes,
    ...quest.interest_tags,
    ...quest.best_for,
    ...(quest.reward ?? []),
    ...(quest.quest_party?.matching_criteria ?? []),
    ...(quest.quest_party?.prep_plan ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function deriveTags<T extends string>(
  quest: SeedQuest,
  rules: { tag: T; terms: string[] }[],
  fallback: T[]
) {
  const text = textForQuest(quest);
  const matches = rules
    .filter((rule) => rule.terms.some((term) => text.includes(term)))
    .map((rule) => rule.tag);
  return unique(matches).slice(0, 5).length ? unique(matches).slice(0, 5) : fallback;
}

function modeForQuest(quest: SeedQuest): QuestMode {
  const mode = quest.location.mode;
  if (mode === "hybrid" || mode === "in_person_or_hybrid") return "hybrid";
  if (mode === "tracker" || mode === "online" || mode === "remote" || mode === "uk_wide") {
    return "remote";
  }
  return "in_person";
}

function rewardForQuest(quest: SeedQuest): QuestCard["reward"] {
  const text = [...(quest.reward ?? []), quest.compensation?.label, quest.cost?.label]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const types: RewardType[] = [];
  if (quest.compensation || text.includes("paid") || text.includes("prize") || text.includes("funding")) {
    types.push("money");
  }
  if (text.includes("network")) types.push("networking");
  if (text.includes("food") || text.includes("catering") || text.includes("breakfast")) types.push("food");
  if (text.includes("swag") || text.includes("merch")) types.push("swag");
  types.push("experience");

  const moneyAmount = quest.compensation?.amount ?? undefined;
  return {
    type: unique(types),
    label: quest.reward?.join(", ") || quest.compensation?.label || "Career experience",
    estimatedValueUsd: moneyAmount ? Math.round(moneyAmount * 1.25) : undefined
  };
}

function hoursForQuest(quest: SeedQuest): QuestCard["estimatedHours"] {
  const hours = quest.time_commitment.estimated_hours;
  if (!hours) return { min: 1, max: 3 };
  if (hours <= 3) return { min: 1, max: Math.ceil(hours) };
  return { min: Math.max(1, Math.floor(hours * 0.7)), max: Math.ceil(hours) };
}

function partySize(quest: SeedQuest) {
  const values = quest.quest_party?.recommended_party_size.match(/\d+/g)?.map(Number) ?? [2];
  return Math.max(...values);
}

function statusForQuest(quest: SeedQuest): QuestCard["status"] {
  return quest.status === "registration_closed_watchlist" ? "expired" : "published";
}

function descriptionForQuest(quest: SeedQuest) {
  const statusLabel =
    quest.status === "open"
      ? "Open at verification time"
      : quest.status === "watchlist"
        ? "Watchlist item"
        : "Registration closed watchlist";
  const prepPlan = quest.quest_party?.prep_plan?.length
    ? `\n\nQuest party prep: ${quest.quest_party.prep_plan.join(" ")}`
    : "";

  return [
    quest.summary,
    `Source: ${quest.source_platform}. ${statusLabel}.`,
    quest.deadline_text,
    quest.eligibility_notes,
    quest.cost?.label ? `Cost: ${quest.cost.label}.` : undefined,
    quest.compensation?.label ? `Compensation: ${quest.compensation.label}.` : undefined
  ]
    .filter(Boolean)
    .join(" ")
    .concat(prepPlan);
}

function locationForQuest(quest: SeedQuest): QuestCard["location"] {
  const cityOrVenue = [quest.location.city, quest.location.venue].filter(Boolean).join(" / ");
  return {
    mode: modeForQuest(quest),
    campus: quest.location.city ?? quest.location.country ?? undefined,
    building: quest.location.venue ?? undefined,
    address: quest.location.address ?? (cityOrVenue ? cityOrVenue : undefined),
    onlineUrl: modeForQuest(quest) === "remote" ? quest.source_url : undefined
  };
}

function questStats(index: number, quest: SeedQuest): QuestCard["stats"] {
  const difficultyBase = quest.difficulty === "hard" ? 36 : quest.difficulty === "medium" ? 28 : 18;
  const statusBoost = quest.status === "open" ? 80 : quest.status === "watchlist" ? 35 : 8;
  return {
    saves: difficultyBase + (index % 17),
    views: statusBoost + 120 + index * 11,
    partyRequests: Math.max(2, Math.round((difficultyBase + statusBoost) / 5))
  };
}

function difficultyForQuest(quest: SeedQuest): QuestCard["difficulty"] {
  if (quest.difficulty === "easy" || quest.difficulty === "medium" || quest.difficulty === "hard") {
    return quest.difficulty;
  }
  return "medium";
}

function toQuestCard(quest: SeedQuest, index: number): QuestCard {
  const createdAt = new Date(new Date(generatedAt).getTime() + index * 1000).toISOString();
  const interests = deriveTags(quest, interestRules, ["events"]);
  const skillsHelpful = deriveTags(quest, skillRules, ["community", "writing"]);

  return {
    id: quest.id,
    title: quest.title,
    organizer: quest.source_platform,
    summary: quest.summary,
    description: descriptionForQuest(quest),
    imageUrl: categoryImages[quest.category] ?? categoryImages.careers_event,
    source: {
      id: `src-${quest.id}`,
      type: "link",
      submittedByUserId: "student-you",
      rawUrl: quest.source_url,
      rawText: quest.summary,
      submittedAt: createdAt
    },
    status: statusForQuest(quest),
    interests,
    skillsHelpful,
    difficulty: difficultyForQuest(quest),
    estimatedHours: hoursForQuest(quest),
    reward: rewardForQuest(quest),
    location: locationForQuest(quest),
    deadline: quest.deadline_datetime ?? undefined,
    eventStart: quest.start_datetime ?? undefined,
    eventEnd: quest.end_datetime ?? undefined,
    bestFor: quest.best_for,
    eligibility: [quest.eligibility_notes, quest.deadline_text].filter(Boolean) as string[],
    applyUrl: quest.source_url,
    party: {
      allowed: quest.status !== "registration_closed_watchlist",
      idealSize: partySize(quest),
      openSlots: quest.status === "open" ? 8 + (index % 6) : 3 + (index % 4)
    },
    aiExtraction: {
      confidence: quest.verification.confidence === "high" ? 0.93 : 0.76,
      missingFields: [
        ...(quest.deadline_datetime ? [] : ["deadline"]),
        ...(quest.end_datetime ? [] : ["eventEnd"])
      ],
      extractedAt: `${quest.verification.checked_at}T12:00:00.000Z`,
      model: "side-quest-real-seed-import"
    },
    stats: questStats(index, quest),
    createdAt,
    updatedAt: createdAt
  };
}

export const seedQuests: QuestCard[] = rawSideQuestData.quests.map(toQuestCard);
