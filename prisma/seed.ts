import { PrismaClient, type Prisma } from "@prisma/client";
import { currentStudent, seedQuests, students } from "../src/data/seed";
import { recommendParties } from "../src/lib/matching";
import type { QuestCard } from "../src/types";

const prisma = new PrismaClient();

const legacyCampusDemoQuestIds = [
  "quest-001",
  "quest-002",
  "quest-003",
  "quest-004",
  "quest-005",
  "quest-006",
  "quest-007",
  "quest-008"
];

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function dateOrNull(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sourceData(quest: QuestCard) {
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
      provider: quest.aiExtraction.model.startsWith("azure") ? "azure" : "local",
      confidence: quest.aiExtraction.confidence,
      missingFields: quest.aiExtraction.missingFields
    }),
    submittedAt: new Date(quest.source.submittedAt)
  };
}

function questData(quest: QuestCard) {
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
    deletedAt: null,
    createdAt: new Date(quest.createdAt),
    updatedAt: new Date(quest.updatedAt)
  };
}

async function seedStudents() {
  for (const student of students) {
    await prisma.student.upsert({
      where: { id: student.id },
      update: {
        name: student.name,
        year: student.year,
        major: student.major,
        avatarUrl: student.avatarUrl,
        interests: json(student.interests),
        skills: json(student.skills),
        wantsToBuildSkills: json(student.wantsToBuildSkills),
        availability: json(student.availability),
        preferences: json(student.preferences),
        questCount: student.questCount,
        communicationStyle: student.communicationStyle
      },
      create: {
        id: student.id,
        name: student.name,
        year: student.year,
        major: student.major,
        avatarUrl: student.avatarUrl,
        interests: json(student.interests),
        skills: json(student.skills),
        wantsToBuildSkills: json(student.wantsToBuildSkills),
        availability: json(student.availability),
        preferences: json(student.preferences),
        questCount: student.questCount,
        communicationStyle: student.communicationStyle
      }
    });
  }
}

async function seedQuestsAndSources() {
  for (const quest of seedQuests) {
    const source = sourceData(quest);
    await prisma.questSource.upsert({
      where: { id: source.id },
      update: source,
      create: source
    });

    const data = questData(quest);
    await prisma.quest.upsert({
      where: { id: quest.id },
      update: data,
      create: data
    });
  }

  await prisma.quest.updateMany({
    where: {
      id: { in: legacyCampusDemoQuestIds },
      deletedAt: null
    },
    data: {
      status: "expired",
      deletedAt: new Date()
    }
  });
}

async function seedActions() {
  for (const questId of seedQuests.slice(0, 2).map((quest) => quest.id)) {
    await prisma.savedQuest.upsert({
      where: { studentId_questId: { studentId: currentStudent.id, questId } },
      update: {},
      create: { studentId: currentStudent.id, questId }
    });
  }

  for (const questId of seedQuests.slice(0, 2).map((quest) => quest.id)) {
    await prisma.joinedQuest.upsert({
      where: { studentId_questId: { studentId: currentStudent.id, questId } },
      update: { status: "going" },
      create: { studentId: currentStudent.id, questId, status: "going" }
    });
  }
}

async function seedParties() {
  for (const quest of seedQuests.filter((candidate) => candidate.party.allowed).slice(0, 2)) {
    const recommendation = recommendParties(quest, students, currentStudent.id)[0];
    if (!recommendation) continue;

    const partyId = `party-${quest.id}`;
    await prisma.questParty.upsert({
      where: { id: partyId },
      update: {
        status: "forming",
        matchScore: recommendation.total,
        reasons: json(recommendation.reasons)
      },
      create: {
        id: partyId,
        questId: quest.id,
        creatorId: currentStudent.id,
        status: "forming",
        matchScore: recommendation.total,
        reasons: json(recommendation.reasons)
      }
    });

    for (const memberId of recommendation.memberIds) {
      await prisma.partyMember.upsert({
        where: { partyId_studentId: { partyId, studentId: memberId } },
        update: { status: "joined" },
        create: {
          partyId,
          studentId: memberId,
          fitScore: null,
          status: "joined"
        }
      });
    }

    for (const item of recommendation.prepPlan) {
      await prisma.prepPlanItem.upsert({
        where: { id: `${partyId}-${item.id}` },
        update: {
          title: item.title,
          ownerUserId: item.ownerUserId ?? null,
          dueAt: dateOrNull(item.dueAt),
          type: item.type,
          done: item.done
        },
        create: {
          id: `${partyId}-${item.id}`,
          partyId,
          title: item.title,
          ownerUserId: item.ownerUserId ?? null,
          dueAt: dateOrNull(item.dueAt),
          type: item.type,
          done: item.done
        }
      });
    }
  }
}

async function main() {
  await seedStudents();
  await seedQuestsAndSources();
  await seedActions();
  await seedParties();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
