import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { createServer as createViteServer } from "vite";
import type { Request, Response } from "express";
import { seedQuests, students } from "../src/data/seed";
import { recommendParties } from "../src/lib/matching";
import { questCardSchema, questSourceTypeSchema } from "../src/types";
import type { ExtractQuestRequest, QuestCard } from "../src/types";
import { checkAzureConnection, extractQuestCards } from "./extractor";
import { recommendQuestMatches } from "./matcher";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local"), override: true });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

const quests: QuestCard[] = [...seedQuests];
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
    text: [request.body.text, fileText].filter(Boolean).join("\n") || undefined,
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

function publishExtractedQuests(cards: QuestCard[]) {
  const publishedAt = new Date().toISOString();
  const published = cards.map((quest) => ({
    ...quest,
    status: "published" as const,
    updatedAt: publishedAt
  }));

  for (const quest of [...published].reverse()) {
    const existingIndex = quests.findIndex((candidate) => candidate.id === quest.id);
    if (existingIndex >= 0) quests.splice(existingIndex, 1);
    quests.unshift(quest);
  }

  return published;
}

const matchSchema = z.object({
  studentId: z.string().optional(),
  questIds: z.array(z.string()).optional()
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    azureConfigured: Boolean(process.env.AZURE_AI_ENDPOINT && process.env.AZURE_AI_KEY)
  });
});

app.get("/api/azure/health", async (_request, response) => {
  response.json(await checkAzureConnection());
});

app.get("/api/quests", (_request, response) => {
  response.json({ quests });
});

app.post("/api/quests", (request, response) => {
  const parsed = questCardSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid quest card",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  const quest = parsed.data;
  quests.unshift({
    ...quest,
    status: "published",
    updatedAt: new Date().toISOString()
  });
  response.status(201).json({ quest: quests[0] });
});

app.post("/api/extract", upload.single("file"), async (request, response) => {
  const input = parseExtractInput(request, response);
  if (!input) return;

  response.json(await extractQuestCards(input));
});

app.post("/api/quests/import", upload.single("file"), async (request, response) => {
  const input = parseExtractInput(request, response);
  if (!input) return;

  const extraction = await extractQuestCards(input);
  const cards = publishExtractedQuests(extraction.cards);

  response.status(201).json({
    ...extraction,
    cards,
    meta: {
      ...extraction.meta,
      cardCount: cards.length
    }
  });
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
  const student = students.find((candidate) => candidate.id === studentId);
  if (!student) {
    response.status(404).json({ error: "Student not found" });
    return;
  }

  const selectedQuestIds = new Set(parsed.data.questIds ?? []);
  const selectedQuests = selectedQuestIds.size
    ? quests.filter((quest) => selectedQuestIds.has(quest.id))
    : quests;

  response.json(await recommendQuestMatches(selectedQuests, student));
});

app.post("/api/parties/recommend", (request, response) => {
  const questId = String(request.body.questId ?? "");
  const studentId = String(request.body.studentId ?? "student-you");
  const quest = quests.find((candidate) => candidate.id === questId);

  if (!quest) {
    response.status(404).json({ error: "Quest not found" });
    return;
  }

  response.json({
    parties: recommendParties(quest, students, studentId),
    students
  });
});

async function start() {
  const port = Number(process.env.PORT ?? 4173);

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(projectRoot, "dist", "client")));
    app.get("/{*splat}", (_request, response) => {
      response.sendFile(path.join(projectRoot, "dist", "client", "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: projectRoot
    });
    app.use(vite.middlewares);
  }

  app.listen(port, () => {
    console.log(`QuestBoard running on http://localhost:${port}`);
  });
}

void start();
