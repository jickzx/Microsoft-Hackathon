import crypto from "node:crypto";
import type { Response } from "express";
import { prisma, studentFromRecord } from "./db";
import type { StudentProfile } from "../src/types";

const sessionCookieName = "side_quest_session";
const sessionDays = 14;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function passwordHash(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [scheme, salt, expected] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;

  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function defaultAvatar(name: string) {
  const initials = encodeURIComponent(
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "QB"
  );
  return `https://ui-avatars.com/api/?name=${initials}&background=7c4dff&color=fff`;
}

export function readSessionCookie(cookieHeader: string | undefined) {
  const cookies = cookieHeader?.split(";") ?? [];
  for (const cookie of cookies) {
    const [name, ...value] = cookie.trim().split("=");
    if (name === sessionCookieName) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function setSessionCookie(response: Response, token: string) {
  const maxAge = sessionDays * 24 * 60 * 60;
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAge * 1000,
    path: "/"
  });
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(sessionCookieName, { path: "/" });
}

export async function createStudentAccount(input: {
  email: string;
  password: string;
  name: string;
  major: string;
  year: StudentProfile["year"];
}) {
  const email = normalizeEmail(input.email);
  const existing = await prisma.student.findUnique({ where: { email } });
  if (existing) throw Object.assign(new Error("An account already exists for this email."), { status: 409 });

  const student = await prisma.student.create({
    data: {
      id: `student-${crypto.randomUUID()}`,
      email,
      passwordHash: passwordHash(input.password),
      name: input.name.trim(),
      year: input.year,
      major: input.major.trim(),
      avatarUrl: defaultAvatar(input.name),
      interests: [],
      skills: [],
      wantsToBuildSkills: [],
      availability: {
        weeklyHours: 6,
        preferredDays: [],
        preferredTimes: []
      },
      preferences: {
        maxDifficulty: "medium",
        modes: ["in_person", "hybrid", "remote"],
        rewardTypes: ["experience", "networking"],
        maxHoursPerQuest: 8
      },
      questCount: 0,
      communicationStyle: "planner"
    }
  });

  return studentFromRecord(student);
}

export async function authenticateStudent(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const student = await prisma.student.findUnique({ where: { email } });
  if (!student || !verifyPassword(password, student.passwordHash)) {
    throw Object.assign(new Error("Invalid email or password."), { status: 401 });
  }

  const updated = await prisma.student.update({
    where: { id: student.id },
    data: { lastLoginAt: new Date() }
  });
  return studentFromRecord(updated);
}

export async function createSession(studentId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      studentId,
      tokenHash: hashToken(token),
      expiresAt
    }
  });
  return token;
}

export async function studentForSession(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { student: true }
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return {
    sessionId: session.id,
    student: studentFromRecord(session.student)
  };
}

export async function deleteSession(token: string | undefined) {
  if (!token) return;
  await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}
