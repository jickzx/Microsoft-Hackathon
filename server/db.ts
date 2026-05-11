import { PrismaClient, type Prisma } from "@prisma/client";
import { recommendParties, scoreQuestForStudent } from "../src/lib/matching";
import type {
  ExtractQuestMeta,
  ExtractQuestRequest,
  MatchRecommendationMeta,
  PartyCandidateScore,
  PrepPlanItem,
  QuestCard,
  QuestMatchBreakdown,
  QuestParty,
  QuestSource,
  StudentProfile
} from "../src/types";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readJson<T>(value: Prisma.JsonValue, fallback: T): T {
  return value === null || value === undefined ? fallback : (value as T);
}

function dateOrNull(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoOrUndefined(value?: Date | null) {
  return value ? value.toISOString() : undefined;
}

function sourceFromRecord(source: {
  id: string;
  type: string;
  submittedByUserId: string;
  rawUrl: string | null;
  fileName: string | null;
  rawText: string | null;
  submittedAt: Date;
}): QuestSource {
  return {
    id: source.id,
    type: source.type as QuestSource["type"],
    submittedByUserId: source.submittedByUserId,
    rawUrl: source.rawUrl ?? undefined,
    fileName: source.fileName ?? undefined,
    rawText: source.rawText ?? undefined,
    submittedAt: source.submittedAt.toISOString()
  };
}

function questFromRecord(quest: Prisma.QuestGetPayload<{ include: { source: true } }>): QuestCard {
  return {
    id: quest.id,
    title: quest.title,
    organizer: quest.organizer,
    summary: quest.summary,
    description: quest.description,
    imageUrl: quest.imageUrl,
    source: sourceFromRecord(quest.source),
    status: quest.status as QuestCard["status"],
    interests: readJson(quest.interests, []) as QuestCard["interests"],
    skillsHelpful: readJson(quest.skillsHelpful, []) as QuestCard["skillsHelpful"],
    difficulty: quest.difficulty as QuestCard["difficulty"],
    estimatedHours: readJson(quest.estimatedHours, { min: 1, max: 3 }),
    reward: readJson(quest.reward, { type: ["experience"], label: "Campus experience" }),
    location: readJson(quest.location, { mode: "in_person" }),
    deadline: isoOrUndefined(quest.deadline),
    eventStart: isoOrUndefined(quest.eventStart),
    eventEnd: isoOrUndefined(quest.eventEnd),
    bestFor: readJson(quest.bestFor, []),
    eligibility: readJson(quest.eligibility, []),
    applyUrl: quest.applyUrl ?? undefined,
    contactEmail: quest.contactEmail ?? undefined,
    party: readJson(quest.party, { allowed: false, idealSize: 2, openSlots: 0 }),
    aiExtraction: readJson(quest.aiExtraction, {
      confidence: 0.5,
      missingFields: [],
      extractedAt: quest.createdAt.toISOString(),
      model: "azure"
    }),
    stats: readJson(quest.stats, { saves: 0, views: 0, partyRequests: 0 }),
    createdAt: quest.createdAt.toISOString(),
    updatedAt: quest.updatedAt.toISOString()
  };
}

export function studentFromRecord(student: Prisma.StudentGetPayload<object>): StudentProfile {
  return {
    id: student.id,
    email: student.email ?? undefined,
    name: student.name,
    year: student.year as StudentProfile["year"],
    major: student.major,
    avatarUrl: student.avatarUrl,
    interests: readJson(student.interests, []) as StudentProfile["interests"],
    skills: readJson(student.skills, []) as StudentProfile["skills"],
    wantsToBuildSkills: readJson(
      student.wantsToBuildSkills,
      []
    ) as StudentProfile["wantsToBuildSkills"],
    availability: readJson(student.availability, {
      weeklyHours: 6,
      preferredDays: [],
      preferredTimes: []
    }),
    preferences: readJson(student.preferences, {
      maxDifficulty: "medium",
      modes: ["in_person", "hybrid"],
      rewardTypes: ["experience"],
      maxHoursPerQuest: 8
    }),
    questCount: student.questCount,
    communicationStyle: student.communicationStyle as StudentProfile["communicationStyle"]
  };
}

function sourceCreateData(quest: QuestCard) {
  return {
    id: quest.source.id,
    type: quest.source.type,
    submittedByUserId: quest.source.submittedByUserId,
    rawUrl: quest.source.rawUrl ?? null,
    fileName: quest.source.fileName ?? null,
    fileType: null,
    fileSize: null,
    rawText: quest.source.rawText ?? null,
    extractionMeta: json({
      provider: "azure",
      confidence: quest.aiExtraction.confidence,
      missingFields: quest.aiExtraction.missingFields
    }),
    submittedAt: new Date(quest.source.submittedAt)
  };
}

function questWriteData(quest: QuestCard) {
  return {
    id: quest.id,
    title: quest.title,
    organizer: quest.organizer,
    summary: quest.summary,
    description: quest.description,
    imageUrl: quest.imageUrl,
    sourceId: quest.source.id,
    status: quest.status,
    interests: json(quest.interests),
    skillsHelpful: json(quest.skillsHelpful),
    difficulty: quest.difficulty,
    estimatedHours: json(quest.estimatedHours),
    reward: json(quest.reward),
    location: json(quest.location),
    deadline: dateOrNull(quest.deadline),
    eventStart: dateOrNull(quest.eventStart),
    eventEnd: dateOrNull(quest.eventEnd),
    bestFor: json(quest.bestFor),
    eligibility: json(quest.eligibility),
    applyUrl: quest.applyUrl ?? null,
    contactEmail: quest.contactEmail ?? null,
    party: json(quest.party),
    aiExtraction: json(quest.aiExtraction),
    stats: json(quest.stats),
    createdAt: new Date(quest.createdAt),
    updatedAt: new Date(quest.updatedAt)
  };
}

export async function ensureDatabaseSeeded() {
  await prisma.student.count();
}

export async function listStudents() {
  const records = await prisma.student.findMany({ orderBy: { name: "asc" } });
  return records.map(studentFromRecord);
}

export async function findStudent(studentId: string) {
  const record = await prisma.student.findUnique({ where: { id: studentId } });
  return record ? studentFromRecord(record) : null;
}

export async function listQuests() {
  const records = await prisma.quest.findMany({
    where: { deletedAt: null, status: "published" },
    include: { source: true },
    orderBy: { createdAt: "desc" }
  });

  return records.map(questFromRecord);
}

export async function getQuest(questId: string) {
  const record = await prisma.quest.findFirst({
    where: { id: questId, deletedAt: null },
    include: { source: true }
  });
  return record ? questFromRecord(record) : null;
}

export async function getUserState(studentId: string) {
  const [saved, joined, parties] = await Promise.all([
    prisma.savedQuest.findMany({ where: { studentId }, select: { questId: true } }),
    prisma.joinedQuest.findMany({ where: { studentId }, select: { questId: true, status: true } }),
    listPartiesForStudent(studentId)
  ]);

  return {
    savedQuestIds: saved.map((item) => item.questId),
    joinedQuestIds: joined.map((item) => item.questId),
    joinedQuestStatuses: Object.fromEntries(joined.map((item) => [item.questId, item.status])),
    parties
  };
}

export async function saveSourceFromExtraction(
  input: ExtractQuestRequest,
  sourceId: string,
  meta: ExtractQuestMeta,
  submittedByUserId: string
) {
  const now = new Date();
  await prisma.questSource.upsert({
    where: { id: sourceId },
    update: {
      type: input.sourceType,
      submittedByUserId,
      rawUrl: input.url || null,
      fileName: input.file?.name ?? null,
      fileType: input.file?.type ?? null,
      fileSize: input.file?.size ? Math.round(input.file.size) : null,
      rawText: input.text ?? input.scrapedPage?.text ?? null,
      extractionMeta: json(meta),
      submittedAt: now
    },
    create: {
      id: sourceId,
      type: input.sourceType,
      submittedByUserId,
      rawUrl: input.url || null,
      fileName: input.file?.name ?? null,
      fileType: input.file?.type ?? null,
      fileSize: input.file?.size ? Math.round(input.file.size) : null,
      rawText: input.text ?? input.scrapedPage?.text ?? null,
      extractionMeta: json(meta),
      submittedAt: now
    }
  });
}

export async function publishQuest(quest: QuestCard) {
  await prisma.questSource.upsert({
    where: { id: quest.source.id },
    update: sourceCreateData(quest),
    create: sourceCreateData(quest)
  });

  const data = {
    ...questWriteData({
      ...quest,
      status: "published",
      updatedAt: new Date().toISOString()
    }),
    deletedAt: null
  };

  const record = await prisma.quest.upsert({
    where: { id: quest.id },
    update: data,
    create: data,
    include: { source: true }
  });
  return questFromRecord(record);
}

export async function updateQuest(questId: string, quest: QuestCard) {
  const record = await prisma.quest.update({
    where: { id: questId },
    data: {
      ...questWriteData({
        ...quest,
        id: questId,
        updatedAt: new Date().toISOString()
      }),
      deletedAt: null
    },
    include: { source: true }
  });
  return questFromRecord(record);
}

export async function deleteQuest(questId: string) {
  await prisma.quest.update({
    where: { id: questId },
    data: { status: "expired", deletedAt: new Date() }
  });
}

export async function setSavedQuest(studentId: string, questId: string, saved: boolean) {
  if (saved) {
    await prisma.savedQuest.upsert({
      where: { studentId_questId: { studentId, questId } },
      update: {},
      create: { studentId, questId }
    });
  } else {
    await prisma.savedQuest.deleteMany({ where: { studentId, questId } });
  }
  await syncQuestActionStats(questId);
  return getUserState(studentId);
}

export async function setJoinedQuest(
  studentId: string,
  questId: string,
  joined: boolean,
  status = "going"
) {
  if (joined) {
    await prisma.joinedQuest.upsert({
      where: { studentId_questId: { studentId, questId } },
      update: { status },
      create: { studentId, questId, status }
    });
  } else {
    await prisma.joinedQuest.deleteMany({ where: { studentId, questId } });
  }
  await syncQuestActionStats(questId);
  return getUserState(studentId);
}

async function syncQuestActionStats(questId: string) {
  const [quest, saves, joins] = await Promise.all([
    prisma.quest.findUnique({ where: { id: questId }, select: { stats: true } }),
    prisma.savedQuest.count({ where: { questId } }),
    prisma.joinedQuest.count({ where: { questId } })
  ]);
  if (!quest) return;

  const currentStats = readJson(quest.stats, { saves: 0, views: 0, partyRequests: 0 });
  await prisma.quest.update({
    where: { id: questId },
    data: {
      stats: json({
        ...currentStats,
        saves,
        partyRequests: joins
      })
    }
  });
}

export async function upsertMatchRecommendations(
  matches: QuestMatchBreakdown[],
  meta: MatchRecommendationMeta
) {
  for (const match of matches) {
    await prisma.matchRecommendation.upsert({
      where: {
        questId_studentId: {
          questId: match.questId,
          studentId: match.studentId
        }
      },
      update: {
        provider: meta.provider,
        fallbackUsed: meta.fallbackUsed,
        model: meta.model,
        total: match.total,
        confidence: meta.confidence,
        interestScore: match.interestScore,
        skillScore: match.skillScore,
        availabilityScore: match.availabilityScore,
        difficultyScore: match.difficultyScore,
        rewardScore: match.rewardScore,
        locationScore: match.locationScore,
        urgencyScore: match.urgencyScore,
        reasons: json(match.reasons),
        matchedAt: new Date(meta.matchedAt)
      },
      create: {
        questId: match.questId,
        studentId: match.studentId,
        provider: meta.provider,
        fallbackUsed: meta.fallbackUsed,
        model: meta.model,
        total: match.total,
        confidence: meta.confidence,
        interestScore: match.interestScore,
        skillScore: match.skillScore,
        availabilityScore: match.availabilityScore,
        difficultyScore: match.difficultyScore,
        rewardScore: match.rewardScore,
        locationScore: match.locationScore,
        urgencyScore: match.urgencyScore,
        reasons: json(match.reasons),
        matchedAt: new Date(meta.matchedAt)
      }
    });
  }
}

function partyResponseFromRecord(
  record: Prisma.QuestPartyGetPayload<{
    include: { quest: { include: { source: true } }; members: { include: { student: true } }; prepPlan: true };
  }>
) {
  const memberIds = record.members.map((member) => member.studentId);
  const prepPlan: PrepPlanItem[] = record.prepPlan.map((item) => ({
    id: item.id,
    title: item.title,
    ownerUserId: item.ownerUserId ?? undefined,
    dueAt: isoOrUndefined(item.dueAt),
    type: item.type as PrepPlanItem["type"],
    done: item.done
  }));

  return {
    id: record.id,
    questId: record.questId,
    memberIds,
    status: record.status as QuestParty["status"],
    matchScore: record.matchScore,
    reasons: readJson(record.reasons, []),
    prepPlan,
    createdAt: record.createdAt.toISOString(),
    quest: questFromRecord(record.quest),
    members: record.members.map((member) => studentFromRecord(member.student))
  };
}

export async function listPartiesForStudent(studentId: string) {
  const records = await prisma.questParty.findMany({
    where: { members: { some: { studentId } } },
    include: {
      quest: { include: { source: true } },
      members: { include: { student: true }, orderBy: { createdAt: "asc" } },
      prepPlan: { orderBy: { createdAt: "asc" } }
    },
    orderBy: { updatedAt: "desc" }
  });

  return records.map(partyResponseFromRecord);
}

export async function createPartyFromRecommendation(
  quest: QuestCard,
  recommendation: PartyCandidateScore,
  creatorId: string
) {
  const students = await listStudents();
  const record = await prisma.questParty.create({
    data: {
      questId: quest.id,
      creatorId,
      status: recommendation.memberIds.length >= quest.party.idealSize ? "active" : "forming",
      matchScore: recommendation.total,
      reasons: json(recommendation.reasons),
      members: {
        create: recommendation.memberIds.map((studentId) => {
          const member = students.find((student) => student.id === studentId);
          return {
            studentId,
            fitScore: member ? scoreQuestForStudent(quest, member).total : null,
            status: "joined"
          };
        })
      },
      prepPlan: {
        create: recommendation.prepPlan.map((item) => ({
          id: `${quest.id}-${Date.now()}-${item.id}`,
          title: item.title,
          ownerUserId: item.ownerUserId ?? null,
          dueAt: dateOrNull(item.dueAt),
          type: item.type,
          done: item.done
        }))
      }
    },
    include: {
      quest: { include: { source: true } },
      members: { include: { student: true }, orderBy: { createdAt: "asc" } },
      prepPlan: { orderBy: { createdAt: "asc" } }
    }
  });

  await setJoinedQuest(creatorId, quest.id, true);
  await syncQuestActionStats(quest.id);
  return partyResponseFromRecord(record);
}

export async function joinParty(partyId: string, studentId: string) {
  await prisma.partyMember.upsert({
    where: { partyId_studentId: { partyId, studentId } },
    update: { status: "joined" },
    create: { partyId, studentId, status: "joined" }
  });
  const party = await prisma.questParty.findUniqueOrThrow({
    where: { id: partyId },
    include: {
      quest: { include: { source: true } },
      members: { include: { student: true }, orderBy: { createdAt: "asc" } },
      prepPlan: { orderBy: { createdAt: "asc" } }
    }
  });
  await setJoinedQuest(studentId, party.questId, true);
  return partyResponseFromRecord(party);
}

export async function leaveParty(partyId: string, studentId: string) {
  const party = await prisma.questParty.findUniqueOrThrow({ where: { id: partyId } });
  await prisma.partyMember.deleteMany({ where: { partyId, studentId } });
  await setJoinedQuest(studentId, party.questId, false);
  await syncQuestActionStats(party.questId);
}

export async function updatePrepItem(partyId: string, itemId: string, done: boolean) {
  const item = await prisma.prepPlanItem.update({
    where: { id: itemId },
    data: { done }
  });
  return {
    id: item.id,
    title: item.title,
    ownerUserId: item.ownerUserId ?? undefined,
    dueAt: isoOrUndefined(item.dueAt),
    type: item.type as PrepPlanItem["type"],
    done: item.done
  };
}
