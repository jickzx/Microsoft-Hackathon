export type QuestSourceType =
  | "link"
  | "screenshot"
  | "poster"
  | "email"
  | "message"
  | "pdf"
  | "photo"
  | "text";

export type QuestDifficulty = "easy" | "medium" | "hard";
export type QuestMode = "in_person" | "remote" | "hybrid";
export type QuestStatus = "draft" | "needs_review" | "published" | "expired";

export type RewardType =
  | "money"
  | "credits"
  | "swag"
  | "food"
  | "networking"
  | "experience";

export type InterestTag =
  | "ai"
  | "career"
  | "climate"
  | "clubs"
  | "competitions"
  | "design"
  | "education"
  | "events"
  | "finance"
  | "gaming"
  | "health"
  | "research"
  | "robotics"
  | "social-impact"
  | "startups"
  | "volunteering"
  | "writing";

export type SkillTag =
  | "backend"
  | "community"
  | "coding"
  | "data"
  | "design"
  | "frontend"
  | "hardware"
  | "marketing"
  | "ml"
  | "photography"
  | "pitching"
  | "public-speaking"
  | "video"
  | "writing";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DayTime = "morning" | "afternoon" | "evening";

export interface QuestSource {
  id: string;
  type: QuestSourceType;
  submittedByUserId: string;
  rawUrl?: string;
  fileName?: string;
  rawText?: string;
  submittedAt: string;
}

export interface QuestCard {
  id: string;
  title: string;
  organizer: string;
  summary: string;
  description: string;
  imageUrl: string;
  source: QuestSource;
  status: QuestStatus;
  interests: InterestTag[];
  skillsHelpful: SkillTag[];
  difficulty: QuestDifficulty;
  estimatedHours: {
    min: number;
    max: number;
  };
  reward: {
    type: RewardType[];
    label: string;
    estimatedValueUsd?: number;
  };
  location: {
    mode: QuestMode;
    campus?: string;
    building?: string;
    room?: string;
    address?: string;
    onlineUrl?: string;
  };
  deadline?: string;
  eventStart?: string;
  eventEnd?: string;
  bestFor: string[];
  eligibility: string[];
  applyUrl?: string;
  contactEmail?: string;
  party: {
    allowed: boolean;
    idealSize: number;
    openSlots: number;
  };
  aiExtraction: {
    confidence: number;
    missingFields: string[];
    extractedAt: string;
    model: string;
  };
  stats: {
    saves: number;
    views: number;
    partyRequests: number;
  };
  createdAt: string;
  updatedAt: string;
}

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
  };
}

export interface ExtractQuestResponse {
  cards: QuestCard[];
  meta: {
    provider: "azure" | "local";
    fallbackUsed: boolean;
    sourceType: QuestSourceType;
    warnings: string[];
  };
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
