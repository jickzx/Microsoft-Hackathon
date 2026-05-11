import { z } from "zod";

export const questSourceTypes = [
  "link",
  "screenshot",
  "poster",
  "email",
  "message",
  "pdf",
  "photo",
  "text"
] as const;

export const questDifficulties = ["easy", "medium", "hard"] as const;
export const questModes = ["in_person", "remote", "hybrid"] as const;
export const questStatuses = ["draft", "needs_review", "published", "expired"] as const;
export const rewardTypes = [
  "money",
  "credits",
  "swag",
  "food",
  "networking",
  "experience"
] as const;
export const interestTags = [
  "ai",
  "career",
  "climate",
  "clubs",
  "competitions",
  "design",
  "education",
  "events",
  "finance",
  "gaming",
  "health",
  "research",
  "robotics",
  "social-impact",
  "startups",
  "volunteering",
  "writing"
] as const;
export const skillTags = [
  "backend",
  "community",
  "coding",
  "data",
  "design",
  "frontend",
  "hardware",
  "marketing",
  "ml",
  "photography",
  "pitching",
  "public-speaking",
  "video",
  "writing"
] as const;

export const questSourceTypeSchema = z.enum(questSourceTypes);
export const questDifficultySchema = z.enum(questDifficulties);
export const questModeSchema = z.enum(questModes);
export const questStatusSchema = z.enum(questStatuses);
export const rewardTypeSchema = z.enum(rewardTypes);
export const interestTagSchema = z.enum(interestTags);
export const skillTagSchema = z.enum(skillTags);

export type QuestSourceType = z.infer<typeof questSourceTypeSchema>;
export type QuestDifficulty = z.infer<typeof questDifficultySchema>;
export type QuestMode = z.infer<typeof questModeSchema>;
export type QuestStatus = z.infer<typeof questStatusSchema>;
export type RewardType = z.infer<typeof rewardTypeSchema>;
export type InterestTag = z.infer<typeof interestTagSchema>;
export type SkillTag = z.infer<typeof skillTagSchema>;

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DayTime = "morning" | "afternoon" | "evening";

export const questSourceSchema = z.object({
  id: z.string(),
  type: questSourceTypeSchema,
  submittedByUserId: z.string(),
  rawUrl: z.string().optional(),
  fileName: z.string().optional(),
  rawText: z.string().optional(),
  submittedAt: z.string()
});

export const questCardSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  organizer: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().min(1),
  imageUrl: z.string().min(1),
  source: questSourceSchema,
  status: questStatusSchema,
  interests: z.array(interestTagSchema),
  skillsHelpful: z.array(skillTagSchema),
  difficulty: questDifficultySchema,
  estimatedHours: z.object({
    min: z.number().min(0),
    max: z.number().min(0)
  }),
  reward: z.object({
    type: z.array(rewardTypeSchema),
    label: z.string().min(1),
    estimatedValueUsd: z.number().optional()
  }),
  location: z.object({
    mode: questModeSchema,
    campus: z.string().optional(),
    building: z.string().optional(),
    room: z.string().optional(),
    address: z.string().optional(),
    onlineUrl: z.string().optional()
  }),
  deadline: z.string().optional(),
  eventStart: z.string().optional(),
  eventEnd: z.string().optional(),
  bestFor: z.array(z.string()),
  eligibility: z.array(z.string()),
  applyUrl: z.string().optional(),
  contactEmail: z.string().optional(),
  party: z.object({
    allowed: z.boolean(),
    idealSize: z.number().int().min(1),
    openSlots: z.number().int().min(0)
  }),
  aiExtraction: z.object({
    confidence: z.number().min(0).max(1),
    missingFields: z.array(z.string()),
    extractedAt: z.string(),
    model: z.string()
  }),
  stats: z.object({
    saves: z.number().int().min(0),
    views: z.number().int().min(0),
    partyRequests: z.number().int().min(0)
  }),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type QuestSource = z.infer<typeof questSourceSchema>;
export type QuestCard = z.infer<typeof questCardSchema>;

export interface StudentProfile {
  id: string;
  name: string;
  year: "freshman" | "sophomore" | "junior" | "senior" | "masters" | "phd";
  major: string;
  avatarUrl: string;
  interests: InterestTag[];
  skills: SkillTag[];
  wantsToBuildSkills: SkillTag[];
  availability: {
    weeklyHours: number;
    preferredDays: Weekday[];
    preferredTimes: DayTime[];
  };
  preferences: {
    maxDifficulty: QuestDifficulty;
    modes: QuestMode[];
    rewardTypes: RewardType[];
    maxHoursPerQuest: number;
  };
  questCount: number;
  communicationStyle: "async" | "planner" | "live-collab" | "low-pressure";
}

export interface PrepPlanItem {
  id: string;
  title: string;
  ownerUserId?: string;
  dueAt?: string;
  type: "research" | "draft" | "build" | "practice" | "submit" | "meet";
  done: boolean;
}

export interface QuestParty {
  id: string;
  questId: string;
  memberIds: string[];
  status: "forming" | "active" | "completed" | "cancelled";
  matchScore: number;
  reasons: string[];
  prepPlan: PrepPlanItem[];
  createdAt: string;
}

export interface QuestMatchBreakdown {
  questId: string;
  studentId: string;
  total: number;
  interestScore: number;
  skillScore: number;
  availabilityScore: number;
  difficultyScore: number;
  rewardScore: number;
  locationScore: number;
  urgencyScore: number;
  reasons: string[];
}

export interface PartyCandidateScore {
  questId: string;
  memberIds: string[];
  total: number;
  averageQuestFit: number;
  sharedInterestScore: number;
  complementarySkillScore: number;
  availabilityOverlapScore: number;
  sizeScore: number;
  reasons: string[];
  prepPlan: PrepPlanItem[];
}

export interface ExtractQuestRequest {
  sourceType: QuestSourceType;
  text?: string;
  url?: string;
  file?: {
    name: string;
    type: string;
    size: number;
    text?: string;
    base64?: string;
    dataUrl?: string;
    truncated?: boolean;
  };
}

export interface ExtractQuestMeta {
  provider: "azure" | "local";
  fallbackUsed: boolean;
  sourceType: QuestSourceType;
  confidence: number;
  missingFields: string[];
  warnings: string[];
  cardCount: number;
}

export interface ExtractQuestResponse {
  cards: QuestCard[];
  meta: ExtractQuestMeta;
}

export interface AzureConnectionHealth {
  configured: boolean;
  reachable: boolean;
  mode: string;
  status:
    | "ready"
    | "not_configured"
    | "portal_login_required"
    | "route_not_configured"
    | "auth_failed"
    | "unreachable"
    | "unknown";
  endpointHost?: string;
  deploymentConfigured: boolean;
  routeConfigured: boolean;
  detail: string;
  checkedAt: string;
}
