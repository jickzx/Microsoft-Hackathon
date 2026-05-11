import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { createServer as createViteServer } from "vite";
import type { NextFunction, Request, Response } from "express";
import { recommendParties } from "../src/lib/matching";
import { questCardSchema, questSourceTypeSchema } from "../src/types";
import type { ExtractQuestRequest, QuestCard } from "../src/types";
import {
  authenticateStudent,
  clearSessionCookie,
  createSession,
  createStudentAccount,
  deleteSession,
  readSessionCookie,
  setSessionCookie,
  studentForSession
} from "./auth";
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
import { azureConfig } from "./env";
import { checkAzureConnection, extractQuestCards } from "./extractor";
import { recommendQuestMatches } from "./matcher";
import { importVerifiedSources, verifiedSourceUrls } from "./sources";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

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

const eventParamsSchema = z.object({
  eventId: z.string().min(1)
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

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const signupSchema = authSchema.extend({
  name: z.string().min(2),
  major: z.string().min(2),
  year: z.enum(["freshman", "sophomore", "junior", "senior", "masters", "phd"])
});

const importSourcesSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(12).optional()
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

interface AuthenticatedRequest extends Request {
  auth?: Awaited<ReturnType<typeof studentForSession>>;
}

async function attachAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  request.auth = await studentForSession(readSessionCookie(request.headers.cookie));
  next();
}

function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  if (!request.auth?.student) {
    response.status(401).json({ error: "Sign in required." });
    return;
  }
  next();
}

function ensureCurrentUser(request: AuthenticatedRequest, response: Response, userId: string) {
  if (userId !== request.auth!.student.id) {
    response.status(403).json({ error: "Cannot access another user's data." });
    return false;
  }
  return true;
}

app.use(attachAuth);

app.get("/api/health", (_request, response) => {
  const azure = azureConfig();

  response.json({
    ok: true,
    azureConfigured: Boolean(azure.endpoint && azure.key)
  });
});

app.get("/api/azure/health", async (_request, response) => {
  response.json(await checkAzureConnection());
});

app.get("/api/auth/me", (request: AuthenticatedRequest, response) => {
  response.json({
    authenticated: Boolean(request.auth?.student),
    user: request.auth?.student ?? null
  });
});

app.post("/api/auth/signup", async (request, response) => {
  const parsed = signupSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid signup details",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  const student = await createStudentAccount(parsed.data);
  const token = await createSession(student.id);
  setSessionCookie(response, token);
  response.status(201).json({ user: student });
});

app.post("/api/auth/login", async (request, response) => {
  const parsed = authSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid login details",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  const student = await authenticateStudent(parsed.data.email, parsed.data.password);
  const token = await createSession(student.id);
  setSessionCookie(response, token);
  response.json({ user: student });
});

app.post("/api/auth/logout", async (request, response) => {
  await deleteSession(readSessionCookie(request.headers.cookie));
  clearSessionCookie(response);
  response.status(204).end();
});

app.get("/api/users", requireAuth, async (request: AuthenticatedRequest, response) => {
  response.json({
    users: await listStudents(),
    currentUserId: request.auth!.student.id
  });
});

app.get("/api/events/:eventId/profiles", requireAuth, (request, response) => {
  const params = eventParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid event id" });
    return;
  }

  response.json({
    profiles: []
  });
});

app.post(
  "/api/events/:eventId/matches",
  requireAuth,
  (request: AuthenticatedRequest, response) => {
    const params = eventParamsSchema.safeParse(request.params);
    if (!params.success) {
      response.status(400).json({ error: "Invalid event id" });
      return;
    }

    response.status(501).json({
      error: "Event profile matching requires real event profiles from the database."
    });
  }
);

app.get("/api/users/:userId/state", requireAuth, async (request: AuthenticatedRequest, response) => {
  const userId = String(request.params.userId);
  if (!ensureCurrentUser(request, response, userId)) return;

  const student = await findStudent(userId);
  if (!student) {
    response.status(404).json({ error: "Student not found" });
    return;
  }

  response.json(await getUserState(userId));
});

app.get("/api/users/:userId/parties", requireAuth, async (request: AuthenticatedRequest, response) => {
  const userId = String(request.params.userId);
  if (!ensureCurrentUser(request, response, userId)) return;

  const student = await findStudent(userId);
  if (!student) {
    response.status(404).json({ error: "Student not found" });
    return;
  }

  response.json({ parties: await listPartiesForStudent(userId) });
});

app.get("/api/quests", requireAuth, async (_request, response) => {
  const quests = await listQuests();
  response.json({ quests });
});

app.get("/api/sources/verified", requireAuth, (_request, response) => {
  response.json({ urls: verifiedSourceUrls });
});

app.post("/api/sources/import", requireAuth, async (request: AuthenticatedRequest, response) => {
  const parsed = importSourcesSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid source import request",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  const result = await importVerifiedSources(request.auth!.student.id, parsed.data.urls);
  response.status(result.cards.length ? 201 : 502).json(result);
});

app.post("/api/quests", requireAuth, async (request, response) => {
  const parsed = questCardSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid side quest card",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  response.status(201).json({ quest: await publishQuest(parsed.data) });
});

app.patch("/api/quests/:questId", requireAuth, async (request, response) => {
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

app.delete("/api/quests/:questId", requireAuth, async (request, response) => {
  const params = questParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid quest id" });
    return;
  }

  await deleteQuest(params.data.questId);
  response.status(204).end();
});

app.post("/api/extract", requireAuth, upload.single("file"), async (request: AuthenticatedRequest, response) => {
  const input = parseExtractInput(request, response);
  if (!input) return;

  input.submittedByUserId = request.auth!.student.id;
  const extraction = await extractQuestCards(input);
  const sourceId = extraction.cards[0]?.source.id;
  if (sourceId) await saveSourceFromExtraction(input, sourceId, extraction.meta, request.auth!.student.id);
  response.json({
    ...extraction,
    meta: {
      ...extraction.meta,
      sourceId
    }
  });
});

app.post("/api/quests/import", requireAuth, upload.single("file"), async (request: AuthenticatedRequest, response) => {
  const input = parseExtractInput(request, response);
  if (!input) return;

  input.submittedByUserId = request.auth!.student.id;
  const extraction = await extractQuestCards(input);
  const sourceId = extraction.cards[0]?.source.id;
  if (sourceId) await saveSourceFromExtraction(input, sourceId, extraction.meta, request.auth!.student.id);
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

app.post("/api/users/:userId/saved-quests/:questId", requireAuth, async (request: AuthenticatedRequest, response) => {
  const params = userQuestParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid user or quest id" });
    return;
  }
  if (params.data.userId !== request.auth!.student.id) {
    response.status(403).json({ error: "Cannot change another user." });
    return;
  }

  response.json(await setSavedQuest(params.data.userId, params.data.questId, true));
});

app.delete("/api/users/:userId/saved-quests/:questId", requireAuth, async (request: AuthenticatedRequest, response) => {
  const params = userQuestParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid user or quest id" });
    return;
  }
  if (params.data.userId !== request.auth!.student.id) {
    response.status(403).json({ error: "Cannot change another user." });
    return;
  }

  response.json(await setSavedQuest(params.data.userId, params.data.questId, false));
});

app.post("/api/users/:userId/joined-quests/:questId", requireAuth, async (request: AuthenticatedRequest, response) => {
  const params = userQuestParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid user or quest id" });
    return;
  }
  if (params.data.userId !== request.auth!.student.id) {
    response.status(403).json({ error: "Cannot change another user." });
    return;
  }

  response.json(await setJoinedQuest(params.data.userId, params.data.questId, true));
});

app.delete("/api/users/:userId/joined-quests/:questId", requireAuth, async (request: AuthenticatedRequest, response) => {
  const params = userQuestParamsSchema.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid user or quest id" });
    return;
  }
  if (params.data.userId !== request.auth!.student.id) {
    response.status(403).json({ error: "Cannot change another user." });
    return;
  }

  response.json(await setJoinedQuest(params.data.userId, params.data.questId, false));
});

app.post("/api/matches/recommend", requireAuth, async (request: AuthenticatedRequest, response) => {
  const parsed = matchSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid request",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  const studentId = parsed.data.studentId ?? request.auth!.student.id;
  if (studentId !== request.auth!.student.id) {
    response.status(403).json({ error: "Cannot request matches for another user." });
    return;
  }
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

app.post("/api/parties/recommend", requireAuth, async (request: AuthenticatedRequest, response) => {
  const questId = String(request.body.questId ?? "");
  const studentId = String(request.body.studentId ?? request.auth!.student.id);
  if (!ensureCurrentUser(request, response, studentId)) return;

  const [quest, studentList] = await Promise.all([getQuest(questId), listStudents()]);

  if (!quest) {
    response.status(404).json({ error: "Side quest not found" });
    return;
  }

  response.json({
    parties: recommendParties(quest, studentList, studentId),
    students: studentList
  });
});

app.post("/api/parties", requireAuth, async (request: AuthenticatedRequest, response) => {
  const parsed = createPartySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid party request",
      details: parsed.error.issues.map((issue) => issue.message)
    });
    return;
  }

  const studentId = parsed.data.studentId ?? request.auth!.student.id;
  if (studentId !== request.auth!.student.id) {
    response.status(403).json({ error: "Cannot create a party for another user." });
    return;
  }
  const [quest, studentList] = await Promise.all([getQuest(parsed.data.questId), listStudents()]);
  if (!quest) {
    response.status(404).json({ error: "Side quest not found" });
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

app.post("/api/parties/:partyId/join", requireAuth, async (request: AuthenticatedRequest, response) => {
  const params = partyParamsSchema.safeParse(request.params);
  const studentId = String(request.body.studentId ?? request.auth!.student.id);
  if (!params.success) {
    response.status(400).json({ error: "Invalid party id" });
    return;
  }
  if (studentId !== request.auth!.student.id) {
    response.status(403).json({ error: "Cannot join a party for another user." });
    return;
  }

  response.json({ party: await joinParty(params.data.partyId, studentId) });
});

app.delete("/api/parties/:partyId/leave", requireAuth, async (request: AuthenticatedRequest, response) => {
  const params = partyParamsSchema.safeParse(request.params);
  const studentId = String(request.body.studentId ?? request.auth!.student.id);
  if (!params.success) {
    response.status(400).json({ error: "Invalid party id" });
    return;
  }
  if (studentId !== request.auth!.student.id) {
    response.status(403).json({ error: "Cannot leave a party for another user." });
    return;
  }

  await leaveParty(params.data.partyId, studentId);
  response.status(204).end();
});

app.patch("/api/parties/:partyId/prep/:itemId", requireAuth, async (request, response) => {
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

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  console.error(message);
  response.status(status).json({ error: message });
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
    console.log(`Side Quest running on http://localhost:${port}`);
  });
}

void start();
