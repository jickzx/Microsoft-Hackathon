import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE IF NOT EXISTS "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "major" TEXT NOT NULL,
    "avatarUrl" TEXT NOT NULL,
    "interests" JSONB NOT NULL,
    "skills" JSONB NOT NULL,
    "wantsToBuildSkills" JSONB NOT NULL,
    "availability" JSONB NOT NULL,
    "preferences" JSONB NOT NULL,
    "questCount" INTEGER NOT NULL,
    "communicationStyle" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "QuestSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "rawUrl" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "rawText" TEXT,
    "extractionMeta" JSONB,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestSource_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Quest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "organizer" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "interests" JSONB NOT NULL,
    "skillsHelpful" JSONB NOT NULL,
    "difficulty" TEXT NOT NULL,
    "estimatedHours" JSONB NOT NULL,
    "reward" JSONB NOT NULL,
    "location" JSONB NOT NULL,
    "deadline" DATETIME,
    "eventStart" DATETIME,
    "eventEnd" DATETIME,
    "bestFor" JSONB NOT NULL,
    "eligibility" JSONB NOT NULL,
    "applyUrl" TEXT,
    "contactEmail" TEXT,
    "party" JSONB NOT NULL,
    "aiExtraction" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quest_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "QuestSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Quest_status_idx" ON "Quest" ("status")`,
  `CREATE INDEX IF NOT EXISTS "Quest_deletedAt_idx" ON "Quest" ("deletedAt")`,
  `CREATE INDEX IF NOT EXISTS "Quest_createdAt_idx" ON "Quest" ("createdAt")`,
  `CREATE TABLE IF NOT EXISTS "SavedQuest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedQuest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedQuest_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SavedQuest_studentId_questId_key" ON "SavedQuest" ("studentId", "questId")`,
  `CREATE TABLE IF NOT EXISTS "JoinedQuest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'going',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JoinedQuest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JoinedQuest_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "JoinedQuest_studentId_questId_key" ON "JoinedQuest" ("studentId", "questId")`,
  `CREATE TABLE IF NOT EXISTS "MatchRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL,
    "model" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "confidence" REAL NOT NULL,
    "interestScore" REAL NOT NULL,
    "skillScore" REAL NOT NULL,
    "availabilityScore" REAL NOT NULL,
    "difficultyScore" REAL NOT NULL,
    "rewardScore" REAL NOT NULL,
    "locationScore" REAL NOT NULL,
    "urgencyScore" REAL NOT NULL,
    "reasons" JSONB NOT NULL,
    "matchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchRecommendation_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchRecommendation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MatchRecommendation_questId_studentId_key" ON "MatchRecommendation" ("questId", "studentId")`,
  `CREATE TABLE IF NOT EXISTS "QuestParty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'forming',
    "matchScore" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestParty_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestParty_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "PartyMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fitScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'joined',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartyMember_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "QuestParty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartyMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PartyMember_partyId_studentId_key" ON "PartyMember" ("partyId", "studentId")`,
  `CREATE TABLE IF NOT EXISTS "PrepPlanItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "dueAt" DATETIME,
    "type" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrepPlanItem_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "QuestParty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrepPlanItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
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
