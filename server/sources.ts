import type { QuestCard } from "../src/types";
import { publishQuest, saveSourceFromExtraction } from "./db";
import { extractQuestCards } from "./extractor";

export const verifiedSourceUrls = [
  "https://lu.ma/vcsummit2026",
  "https://lu.ma/nn4aluwm",
  "https://lu.ma/londoncommunityweek-2026",
  "https://the-trackr.com/uk-finance-summer-internships/",
  "https://the-trackr.com/blog/summer-internship-season-report-2026/"
];

export async function importVerifiedSources(studentId: string, urls = verifiedSourceUrls) {
  const cards: QuestCard[] = [];
  const errors: { url: string; error: string }[] = [];

  for (const url of [...new Set(urls)]) {
    try {
      const input = {
        sourceType: "link" as const,
        url,
        submittedByUserId: studentId
      };
      const extraction = await extractQuestCards(input);
      const sourceId = extraction.cards[0]?.source.id;
      if (sourceId) await saveSourceFromExtraction(input, sourceId, extraction.meta, studentId);
      const published = await Promise.all(extraction.cards.map((quest) => publishQuest(quest)));
      cards.push(...published);
    } catch (error) {
      errors.push({
        url,
        error: error instanceof Error ? error.message : "Import failed"
      });
    }
  }

  return { cards, errors, sourceUrls: urls };
}
