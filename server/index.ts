import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { createServer as createViteServer } from "vite";
import type { Request, Response } from "express";
import { currentStudent } from "../src/data/seed";
import { recommendParties } from "../src/lib/matching";
import { questCardSchema, questSourceTypeSchema } from "../src/types";
import type { ExtractQuestRequest, QuestCard } from "../src/types";
import {
  createPartyFromRecommendation,
  deleteQuest,
  ensureDatabaseSeeded,
  findStudent,
  getQuest,
  getUserState,
  joinParty,
  leaveParty,
  listPartiesForStudent,
  listQuests,
  listStudents,
  publishQuest,
  saveSourceFromExtraction,
  setJoinedQuest,
  setSavedQuest,
  updatePrepItem,
  updateQuest,
  upsertMatchRecommendations
} from "./db";
import { checkAzureConnection, extractQuestCards } from "./extractor";
import { recommendQuestMatches } from "./matcher";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({
  path: [path.join(projectRoot, ".env.local"), path.join(projectRoot, ".env")]
});

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

const maxInlineFileBytes = Number(process.env.EXTRACT_INLINE_FILE_BYTES ?? 4 * 1024 * 1024);

const extractSchema = z.object({
  sourceType: questSourceTypeSchema,
  text: z.string().optional(),
  url: z.string().url().optional().or(z.literal("")),
  file: z
    .object({
      name: z.string(),
      type: z.string(),
      size: z.number(),
      text: z.string().optional(),
      base64: z.string().optional(),
      dataUrl: z.string().optional(),
      truncated: z.boolean().optional()
    })
    .optional()
});

function buildExtractBody(request: Request) {
  const maybeTextFile =
    request.file?.mimetype.startsWith("text/") || request.file?.mimetype === "application/json";
  const inlineFile =
    request.file && request.file.size <= maxInlineFileBytes
      ? request.file.buffer.toString("base64")
      : undefined;
  const fileText = maybeTextFile ? request.file?.buffer.toString("utf8") : undefined;

  return {
    sourceType: request.body.sourceType,
    text: request.body.text || fileText || undefined,
    url: request.body.url,
    file: request.file
      ? {
          name: request.file.originalname,
          type: request.file.mimetype,
          size: request.file.size,
          text: fileText,
          base64: inlineFile,
          dataUrl:
            inlineFile && request.file.mimetype.startsWith("image/")
              ? `data:${request.file.mimetype};base64,${inlineFile}`
              : undefined,
          truncated: request.file.size > maxInlineFileBytes
        }
      : undefined
  };
}

function parseExtractInput(request: Request, response: Response) {
  const parsed = extractSchema.safeParse(buildExtractBody(request));
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid request",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return null;
  }

  const input = parsed.data as ExtractQuestRequest;
  if (!input.text && !input.url && !input.file) {
    response.status(400).json({
      error: "Invalid request",
      details: ["Provide text, url, or a file."]
    });
    return null;
  }

  return input;
}

const matchSchema = z.object({
  studentId: z.string().optional(),
  questIds: z.array(z.string()).optional()
});

const questParamsSchema = z.object({
  questId: z.string().min(1)
});

const userQuestParamsSchema = z.object({
  userId: z.string().min(1),
  questId: z.string().min(1)
});

const createPartySchema = z.object({
  questId: z.string().min(1),
  studentId: z.string().optional(),
  memberIds: z.array(z.string()).optional()
});

const partyParamsSchema = z.object({
  partyId: z.string().min(1)
});

const prepParamsSchema = z.object({
  partyId: z.string().min(1),
  itemId: z.string().min(1)
});

const prepBodySchema = z.object({
  done: z.boolean()
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT ?? process.env.AZURE_AI_ENDPOINT;
  const azureKey = process.env.AZURE_OPENAI_API_KEY ?? process.env.AZURE_AI_KEY;

  response.json({
    ok: true,
    azureConfigured: Boolean(azureEndpoint && azureKey)
  });
});

app.get("/api/azure/health", async (_request, response) => {
  response.json(await checkAzureConnection());
});

app.get("/api/users", async (_request, response) => {
  response.json({
    users: await listStudents(),
    currentUserId: currentStudent.id
  });
});

app.get("/api/users/:userId/state", async (request, response) => {
  const userId = String(request.params.userId);
  const student = await findStudent(userId);
  if (!student) {
    response.status(404).json({ error: "Student not found" });
    return;
  }

  response.json(await getUserState(userId));
});

app.get("/api/users/:userId/parties", async (request, response) => {
  const userId = String(request.params.userId);
  const student = await findStudent(userId);
  if (!student) {
    response.status(404).json({ error: "Student not found" });
    return;
  }

  response.json({ parties: await listPartiesForStudent(userId) });
});

app.get("/api/quests", async (_request, response) => {
  const quests = await listQuests();
  response.json({ quests });
});

app.post("/api/quests", async (request, response) => {
  const parsed = questCardSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid quest card",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  response.status(201).json({ quest: await publishQuest(parsed.data) });
});

app.patch("/api/quests/:questId", async (request, response) => {
  const params = questParamsSchema.safeParse(request.params);
  const parsed = questCardSchema.safeParse(request.body);
  if (!params.success || !parsed.success) {
    response.status(400).json({
      error: "Invalid quest update",
      details: [
        ...(params.success ? [] : params.error.issues.map((issue) => issue.message)),
        ...(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message))
      ]
    });
    return;
  }

  response.json({ quest: await updateQuest(params.data.questId, parsed.data) });
});

app.delete("/api/quests/:questId", async (request, response) => {
  const params = questParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid quest id" });
    return;
  }

  await deleteQuest(params.data.questId);
  response.status(204).end();
});

app.post("/api/extract", upload.single("file"), async (request, response) => {
  const input = parseExtractInput(request, response);
  if (!input) return;

  const extraction = await extractQuestCards(input);
  const sourceId = extraction.cards[0]?.source.id;
  if (sourceId) await saveSourceFromExtraction(input, sourceId, extraction.meta);
  response.json({
    ...extraction,
    meta: {
      ...extraction.meta,
      sourceId
    }
  });
});

app.post("/api/quests/import", upload.single("file"), async (request, response) => {
  const input = parseExtractInput(request, response);
  if (!input) return;

  const extraction = await extractQuestCards(input);
  const sourceId = extraction.cards[0]?.source.id;
  if (sourceId) await saveSourceFromExtraction(input, sourceId, extraction.meta);
  const cards = await Promise.all(extraction.cards.map((quest) => publishQuest(quest)));

  response.status(201).json({
    ...extraction,
    cards,
    meta: {
      ...extraction.meta,
      sourceId,
      cardCount: cards.length
    }
  });
});

app.post("/api/users/:userId/saved-quests/:questId", async (request, response) => {
  const params = userQuestParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid user or quest id" });
    return;
  }

  response.json(await setSavedQuest(params.data.userId, params.data.questId, true));
});

app.delete("/api/users/:userId/saved-quests/:questId", async (request, response) => {
  const params = userQuestParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid user or quest id" });
    return;
  }

  response.json(await setSavedQuest(params.data.userId, params.data.questId, false));
});

app.post("/api/users/:userId/joined-quests/:questId", async (request, response) => {
  const params = userQuestParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid user or quest id" });
    return;
  }

  response.json(await setJoinedQuest(params.data.userId, params.data.questId, true));
});

app.delete("/api/users/:userId/joined-quests/:questId", async (request, response) => {
  const params = userQuestParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid user or quest id" });
    return;
  }

  response.json(await setJoinedQuest(params.data.userId, params.data.questId, false));
});

app.post("/api/matches/recommend", async (request, response) => {
  const parsed = matchSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid request",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  const studentId = parsed.data.studentId ?? "student-you";
  const student = await findStudent(studentId);
  if (!student) {
    response.status(404).json({ error: "Student not found" });
    return;
  }

  const quests = await listQuests();
  const selectedQuestIds = new Set(parsed.data.questIds ?? []);
  const selectedQuests = selectedQuestIds.size
    ? quests.filter((quest) => selectedQuestIds.has(quest.id))
    : quests;

  const result = await recommendQuestMatches(selectedQuests, student);
  await upsertMatchRecommendations(result.matches, result.meta);
  response.json(result);
});

app.post("/api/parties/recommend", async (request, response) => {
  const questId = String(request.body.questId ?? "");
  const studentId = String(request.body.studentId ?? "student-you");
  const [quest, studentList] = await Promise.all([getQuest(questId), listStudents()]);

  if (!quest) {
    response.status(404).json({ error: "Quest not found" });
    return;
  }

  response.json({
    parties: recommendParties(quest, studentList, studentId),
    students: studentList
  });
});

app.post("/api/parties", async (request, response) => {
  const parsed = createPartySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid party request",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  const studentId = parsed.data.studentId ?? currentStudent.id;
  const [quest, studentList] = await Promise.all([getQuest(parsed.data.questId), listStudents()]);
  if (!quest) {
    response.status(404).json({ error: "Quest not found" });
    return;
  }

  const recommendations = recommendParties(quest, studentList, studentId);
  const requestedMembers = parsed.data.memberIds?.join("|");
  const recommendation =
    recommendations.find((item) => item.memberIds.join("|") === requestedMembers) ??
    recommendations[0];

  if (!recommendation) {
    response.status(400).json({ error: "No party recommendation available for this quest." });
    return;
  }

  response.status(201).json({
    party: await createPartyFromRecommendation(quest, recommendation, studentId)
  });
});

app.post("/api/parties/:partyId/join", async (request, response) => {
  const params = partyParamsSchema.safeParse(request.params);
  const studentId = String(request.body.studentId ?? currentStudent.id);
  if (!params.success) {
    response.status(400).json({ error: "Invalid party id" });
    return;
  }

  response.json({ party: await joinParty(params.data.partyId, studentId) });
});

app.delete("/api/parties/:partyId/leave", async (request, response) => {
  const params = partyParamsSchema.safeParse(request.params);
  const studentId = String(request.body.studentId ?? currentStudent.id);
  if (!params.success) {
    response.status(400).json({ error: "Invalid party id" });
    return;
  }

  await leaveParty(params.data.partyId, studentId);
  response.status(204).end();
});

app.patch("/api/parties/:partyId/prep/:itemId", async (request, response) => {
  const params = prepParamsSchema.safeParse(request.params);
  const body = prepBodySchema.safeParse(request.body);
  if (!params.success || !body.success) {
    response.status(400).json({ error: "Invalid prep item update" });
    return;
  }

  response.json({
    item: await updatePrepItem(params.data.partyId, params.data.itemId, body.data.done)
  });
});

async function start() {
  await ensureDatabaseSeeded();
  const port = Number(process.env.PORT ?? 4173);
  const server = http.createServer(app);

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(projectRoot, "dist", "client")));
    app.get("/{*splat}", (_request, response) => {
      response.sendFile(path.join(projectRoot, "dist", "client", "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { hmr: { server }, middlewareMode: true },
      appType: "spa",
      root: projectRoot
    });
    app.use(vite.middlewares);
  }

  server.listen(port, () => {
    console.log(`QuestBoard running on http://localhost:${port}`);
  });
}

void start();
