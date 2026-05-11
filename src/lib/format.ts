import type { QuestCard, QuestMode } from "../types";

export function labelize(value: string) {
  return value
    .split("-")
    .join(" ")
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDeadline(date?: string) {
  if (!date) return "No deadline";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(date));
}

export function daysUntil(date?: string) {
  if (!date) return null;
  const days = Math.ceil(
    (new Date(date).getTime() - new Date("2026-05-11T12:00:00Z").getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return days;
}

export function formatTimeCommitment(quest: QuestCard) {
  return `${quest.estimatedHours.min}-${quest.estimatedHours.max} hrs`;
}

export function formatLocation(quest: QuestCard) {
  const parts = [
    quest.location.campus,
    quest.location.building,
    quest.location.room,
    quest.location.address
  ].filter(Boolean);

  if (quest.location.mode === "remote") return "Remote";
  if (parts.length === 0) return labelMode(quest.location.mode);
  return parts.join(" / ");
}

export function labelMode(mode: QuestMode) {
  return mode === "in_person" ? "In person" : labelize(mode);
}
