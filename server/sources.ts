import type { ExtractQuestRequest, QuestCard } from "../src/types";
import { publishQuest, saveSourceFromExtraction } from "./db";
import { extractQuestCards } from "./extractor";

type VerifiedSourceKind = "event" | "tracker" | "report";

interface VerifiedSource {
  url: string;
  title: string;
  kind: VerifiedSourceKind;
  note: string;
}

export interface SourceImportResult {
  url: string;
  title: string;
  kind: VerifiedSourceKind;
  status: "imported" | "skipped" | "failed";
  cardCount: number;
  cardIds: string[];
  sourceId?: string;
  warnings: string[];
  errors: string[];
}

const minimumImportConfidence = 0.45;
const staleOpportunityGraceMs = 24 * 60 * 60 * 1000;
const sourceVerifyTimeoutMs = 8000;
const verifiedImportHosts = new Set(["luma.com", "the-trackr.com"]);

export const verifiedSources = [
  {
    url: "https://luma.com/vcsummit2026",
    title: "London Venture Capital Summit",
    kind: "event",
    note:
      "Import only the London Venture Capital Summit event explicitly described on this Lu.ma page."
  },
  {
    url: "https://luma.com/nn4aluwm",
    title: "2026 London Defence Tech Hackathon",
    kind: "event",
    note:
      "Import only the 2026 London Defence Tech Hackathon explicitly described on this Lu.ma page."
  },
  {
    url: "https://luma.com/londoncommunityweek-2026",
    title: "London Community Week 2026",
    kind: "event",
    note:
      "Import only London Community Week 2026 and its explicitly listed schedule from this Lu.ma page."
  },
  {
    url: "https://the-trackr.com/uk-finance-summer-internships/",
    title: "Trackr UK Finance Summer Internships",
    kind: "tracker",
    note:
      "Import only current UK finance internships explicitly listed on this Trackr page. Skip rows with past closing dates or stale programme years."
  },
  {
    url: "https://the-trackr.com/uk-finance-spring-weeks/",
    title: "Trackr UK Finance Spring Weeks",
    kind: "tracker",
    note:
      "Import only current UK finance spring weeks explicitly listed on this Trackr page. Skip rows with past closing dates or stale programme years."
  },
  {
    url: "https://the-trackr.com/blog/summer-internship-season-report-2026/",
    title: "Trackr Summer Internship Season Report 2026",
    kind: "report",
    note:
      "Use this Trackr report only for factual context about internship recruitment. Do not create a quest unless the page names a concrete current opportunity with a real application path."
  }
] as const satisfies readonly VerifiedSource[];

export const verifiedSourceUrls: string[] = verifiedSources.map((source) => source.url);

function canonicalHostname(hostname: string) {
  const lower = hostname.toLowerCase().replace(/^www\./, "");
  return lower === "lu.ma" ? "luma.com" : lower;
}

function isVerifiedImportHost(hostname: string) {
  return verifiedImportHosts.has(canonicalHostname(hostname));
}

function canonicalSourceUrl(rawUrl: string) {
  const parsed = new URL(rawUrl.trim());
  parsed.hash = "";
  parsed.hostname = canonicalHostname(parsed.hostname);

  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();

  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return parsed.toString();
}

function sourceLookupKey(rawUrl: string) {
  const parsed = new URL(canonicalSourceUrl(rawUrl));
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
}

const verifiedSourceByKey = new Map(
  verifiedSources.map((source) => [sourceLookupKey(source.url), source])
);

function sourceForUrl(url: string): VerifiedSource {
  const knownSource = verifiedSourceByKey.get(sourceLookupKey(url));
  if (knownSource) return knownSource;

  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol) || !isVerifiedImportHost(parsed.hostname)) {
    throw new Error("Source URL is not on the verified Luma or Trackr allow-list.");
  }

  const canonicalUrl = canonicalSourceUrl(url);
  const host = canonicalHostname(parsed.hostname);
  return {
    url: canonicalUrl,
    title: host === "luma.com" ? "Verified Luma event" : "Verified Trackr opportunity source",
    kind: host === "luma.com" ? "event" : "tracker",
    note:
      "Import only current opportunities explicitly present at this URL. Skip anything stale, generic, or unsupported by the source page."
  };
}

function dedupeUrls(urls: string[]) {
  const sources: VerifiedSource[] = [];
  const duplicateUrls: string[] = [];
  const errors: { url: string; error: string }[] = [];
  const seen = new Set<string>();

  for (const rawUrl of urls) {
    try {
      const key = sourceLookupKey(rawUrl);
      if (seen.has(key)) {
        duplicateUrls.push(rawUrl);
        continue;
      }
      seen.add(key);
      sources.push(sourceForUrl(rawUrl));
    } catch (error) {
      errors.push({
        url: rawUrl,
        error: error instanceof Error ? error.message : "Invalid source URL."
      });
    }
  }

  return { sources, duplicateUrls, errors };
}

function importGuidance(source: VerifiedSource) {
  return [
    "Verified source import instructions:",
    source.note,
    "Create QuestBoard cards only for real, explicitly supported opportunities from the linked source.",
    "Do not create sample, placeholder, related, or inferred opportunities.",
    "Do not import opportunities that have already closed or happened before the current date.",
    "Preserve concrete names, dates, locations, organizers, and application links from the source.",
    `Source title: ${source.title}`,
    `Source category: ${source.kind}`
  ].join("\n");
}

function sourceInput(source: VerifiedSource, studentId: string): ExtractQuestRequest {
  return {
    sourceType: "link",
    url: source.url,
    text: importGuidance(source),
    submittedByUserId: studentId
  };
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "Import failed.";
}

function parsedDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function opportunityDate(card: QuestCard) {
  return parsedDate(card.eventEnd) ?? parsedDate(card.eventStart) ?? parsedDate(card.deadline);
}

function isStaleOpportunity(card: QuestCard) {
  const date = opportunityDate(card);
  return date ? date.getTime() < Date.now() - staleOpportunityGraceMs : false;
}

function cardImportIssues(card: QuestCard, source: VerifiedSource) {
  const issues: string[] = [];
  const combinedText = `${card.title} ${card.organizer} ${card.summary}`.toLowerCase();

  if (card.aiExtraction.confidence < minimumImportConfidence) {
    issues.push(`confidence ${card.aiExtraction.confidence.toFixed(2)} is below import threshold`);
  }

  if (card.organizer.toLowerCase() === "campus submitter") {
    issues.push("organizer was not extracted from the source");
  }

  if (
    /^(new campus quest|untitled|sample|example)\b/i.test(card.title) ||
    combinedText.includes("placeholder")
  ) {
    issues.push("card looked like a placeholder rather than a real opportunity");
  }

  if (source.kind === "event" && !card.eventStart && !card.deadline) {
    issues.push("event source did not produce a date or deadline");
  }

  if (source.kind !== "report" && !card.applyUrl && !card.source.rawUrl) {
    issues.push("card did not include an application or source URL");
  }

  if (isStaleOpportunity(card)) {
    issues.push("opportunity is already closed or in the past");
  }

  return issues;
}

function cardKey(card: QuestCard, source: VerifiedSource) {
  const url = card.applyUrl ?? card.source.rawUrl ?? source.url;

  try {
    return `url:${canonicalSourceUrl(url)}`;
  } catch {
    return `title:${sourceLookupKey(source.url)}:${card.title.trim().toLowerCase()}`;
  }
}

function cardWithSourceTrace(card: QuestCard, source: VerifiedSource, studentId: string): QuestCard {
  return {
    ...card,
    source: {
      ...card.source,
      type: "link",
      submittedByUserId: studentId,
      rawUrl: card.source.rawUrl ?? source.url
    }
  };
}

function summarizeRejectedCards(rejections: string[]) {
  const unique = [...new Set(rejections)];
  if (!unique.length) return [];
  return unique.slice(0, 5);
}

async function importSource(
  source: VerifiedSource,
  studentId: string,
  seenCardKeys: Set<string>
): Promise<{ cards: QuestCard[]; result: SourceImportResult }> {
  const input = sourceInput(source, studentId);
  const extraction = await extractQuestCards(input);

  if (extraction.meta.provider !== "azure" || extraction.meta.fallbackUsed) {
    throw new Error("Source import requires Azure extraction.");
  }

  const sourceId = extraction.cards[0]?.source.id;
  if (sourceId) await saveSourceFromExtraction(input, sourceId, extraction.meta, studentId);

  const rejected: string[] = [];
  const uniqueCards: QuestCard[] = [];

  for (const card of extraction.cards.map((item) =>
    cardWithSourceTrace(item, source, studentId)
  )) {
    const issues = cardImportIssues(card, source);
    const key = cardKey(card, source);

    if (issues.length) {
      rejected.push(`${card.title}: ${issues.join(", ")}`);
      continue;
    }

    if (seenCardKeys.has(key)) {
      rejected.push(`${card.title}: duplicate of an already imported source card`);
      continue;
    }

    seenCardKeys.add(key);
    uniqueCards.push(card);
  }

  const published = await Promise.all(uniqueCards.map((quest) => publishQuest(quest)));
  const warnings = [
    ...extraction.meta.warnings,
    ...summarizeRejectedCards(rejected).map((message) => `Skipped card - ${message}`)
  ];

  return {
    cards: published,
    result: {
      url: source.url,
      title: source.title,
      kind: source.kind,
      status: published.length ? "imported" : "skipped",
      cardCount: published.length,
      cardIds: published.map((card) => card.id),
      sourceId,
      warnings,
      errors: published.length ? [] : ["No publishable cards passed source quality checks."]
    }
  };
}

export async function importVerifiedSources(studentId: string, urls = verifiedSourceUrls) {
  const requestedUrls = urls.length ? urls : verifiedSourceUrls;
  const { sources, duplicateUrls, errors: inputErrors } = dedupeUrls(requestedUrls);
  const cards: QuestCard[] = [];
  const errors = [...inputErrors];
  const results: SourceImportResult[] = inputErrors.map((error) => ({
    url: error.url,
    title: error.url,
    kind: "tracker",
    status: "failed",
    cardCount: 0,
    cardIds: [],
    warnings: [],
    errors: [error.error]
  }));
  const seenCardKeys = new Set<string>();

  for (const source of sources) {
    try {
      const imported = await importSource(source, studentId, seenCardKeys);
      cards.push(...imported.cards);
      results.push(imported.result);
      for (const error of imported.result.errors) {
        errors.push({ url: source.url, error });
      }
    } catch (error) {
      const message = messageFromError(error);
      errors.push({ url: source.url, error: message });
      results.push({
        url: source.url,
        title: source.title,
        kind: source.kind,
        status: "failed",
        cardCount: 0,
        cardIds: [],
        warnings: [],
        errors: [message]
      });
    }
  }

  return {
    cards,
    errors,
    results,
    duplicateUrls,
    sourceUrls: sources.map((source) => source.url)
  };
}
