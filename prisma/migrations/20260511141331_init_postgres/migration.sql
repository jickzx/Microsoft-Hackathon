-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestSource" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "rawUrl" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "rawText" TEXT,
    "extractionMeta" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quest" (
    "id" TEXT NOT NULL,
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
    "deadline" TIMESTAMP(3),
    "eventStart" TIMESTAMP(3),
    "eventEnd" TIMESTAMP(3),
    "bestFor" JSONB NOT NULL,
    "eligibility" JSONB NOT NULL,
    "applyUrl" TEXT,
    "contactEmail" TEXT,
    "party" JSONB NOT NULL,
    "aiExtraction" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedQuest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JoinedQuest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'going',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JoinedQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRecommendation" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL,
    "model" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "interestScore" DOUBLE PRECISION NOT NULL,
    "skillScore" DOUBLE PRECISION NOT NULL,
    "availabilityScore" DOUBLE PRECISION NOT NULL,
    "difficultyScore" DOUBLE PRECISION NOT NULL,
    "rewardScore" DOUBLE PRECISION NOT NULL,
    "locationScore" DOUBLE PRECISION NOT NULL,
    "urgencyScore" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestParty" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'forming',
    "matchScore" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyMember" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fitScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'joined',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepPlanItem" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "type" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quest_status_idx" ON "Quest"("status");

-- CreateIndex
CREATE INDEX "Quest_deletedAt_idx" ON "Quest"("deletedAt");

-- CreateIndex
CREATE INDEX "Quest_createdAt_idx" ON "Quest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedQuest_studentId_questId_key" ON "SavedQuest"("studentId", "questId");

-- CreateIndex
CREATE UNIQUE INDEX "JoinedQuest_studentId_questId_key" ON "JoinedQuest"("studentId", "questId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRecommendation_questId_studentId_key" ON "MatchRecommendation"("questId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyMember_partyId_studentId_key" ON "PartyMember"("partyId", "studentId");

-- AddForeignKey
ALTER TABLE "QuestSource" ADD CONSTRAINT "QuestSource_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "QuestSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQuest" ADD CONSTRAINT "SavedQuest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQuest" ADD CONSTRAINT "SavedQuest_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinedQuest" ADD CONSTRAINT "JoinedQuest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinedQuest" ADD CONSTRAINT "JoinedQuest_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRecommendation" ADD CONSTRAINT "MatchRecommendation_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRecommendation" ADD CONSTRAINT "MatchRecommendation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestParty" ADD CONSTRAINT "QuestParty_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestParty" ADD CONSTRAINT "QuestParty_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "QuestParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMember" ADD CONSTRAINT "PartyMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepPlanItem" ADD CONSTRAINT "PrepPlanItem_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "QuestParty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepPlanItem" ADD CONSTRAINT "PrepPlanItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
