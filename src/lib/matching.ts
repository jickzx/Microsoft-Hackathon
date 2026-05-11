import type {
  PartyCandidateScore,
  PrepPlanItem,
  QuestCard,
  QuestDifficulty,
  QuestMatchBreakdown,
  StudentProfile
} from "../types";

const QUEST_SCORE_WEIGHTS = {
  interests: 0.28,
  skills: 0.18,
  availability: 0.16,
  difficulty: 0.12,
  reward: 0.1,
  location: 0.08,
  urgency: 0.08
} as const;

const PARTY_SCORE_WEIGHTS = {
  averageQuestFit: 0.35,
  complementarySkills: 0.25,
  availabilityOverlap: 0.2,
  sharedInterests: 0.1,
  size: 0.1
} as const;

const difficultyRank: Record<QuestDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3
};

function ratio(overlap: number, total: number) {
  if (total === 0) return 1;
  return Math.min(1, overlap / total);
}

function intersect<T>(a: T[], b: T[]) {
  return a.filter((item) => b.includes(item));
}

function humanize(value: string) {
  return value
    .split("-")
    .join(" ")
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function listReasons(values: string[], fallback: string) {
  if (values.length === 0) return fallback;
  return values.slice(0, 2).map(humanize).join(" and ");
}

function scoreUrgency(deadline?: string, now = new Date("2026-05-11T12:00:00Z")) {
  if (!deadline) return 0.45;
  const days = Math.ceil(
    (new Date(deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (days < 0) return 0;
  if (days <= 2) return 0.52;
  if (days <= 14) return 1;
  if (days <= 30) return 0.74;
  return 0.45;
}

export function scoreQuestForStudent(
  quest: QuestCard,
  student: StudentProfile
): QuestMatchBreakdown {
  const sharedInterests = intersect(student.interests, quest.interests);
  const usefulSkills = intersect(student.skills, quest.skillsHelpful);
  const learningSkills = intersect(student.wantsToBuildSkills, quest.skillsHelpful);

  const interestScore = ratio(sharedInterests.length, quest.interests.length);
  const skillScore =
    ratio(usefulSkills.length, quest.skillsHelpful.length) * 0.7 +
    ratio(learningSkills.length, quest.skillsHelpful.length) * 0.3;
  const availabilityScore =
    quest.estimatedHours.max <= student.availability.weeklyHours
      ? 1
      : Math.max(0.25, student.availability.weeklyHours / quest.estimatedHours.max);
  const difficultyScore =
    difficultyRank[quest.difficulty] <= difficultyRank[student.preferences.maxDifficulty]
      ? 1
      : 0.32;
  const rewardScore = ratio(
    intersect(student.preferences.rewardTypes, quest.reward.type).length,
    quest.reward.type.length
  );
  const locationScore = student.preferences.modes.includes(quest.location.mode)
    ? 1
    : quest.location.mode === "hybrid"
      ? 0.7
      : 0.2;
  const urgencyScore = scoreUrgency(quest.deadline);

  const total = Math.round(
    100 *
      (interestScore * QUEST_SCORE_WEIGHTS.interests +
        skillScore * QUEST_SCORE_WEIGHTS.skills +
        availabilityScore * QUEST_SCORE_WEIGHTS.availability +
        difficultyScore * QUEST_SCORE_WEIGHTS.difficulty +
        rewardScore * QUEST_SCORE_WEIGHTS.reward +
        locationScore * QUEST_SCORE_WEIGHTS.location +
        urgencyScore * QUEST_SCORE_WEIGHTS.urgency)
  );

  const reasons: string[] = [];
  if (sharedInterests.length > 0) {
    reasons.push(`Matches ${listReasons(sharedInterests, "campus")} interests`);
  }
  if (usefulSkills.length > 0) {
    reasons.push(`Uses ${listReasons(usefulSkills, "relevant")} skills`);
  }
  if (learningSkills.length > 0) {
    reasons.push(`Good way to build ${humanize(learningSkills[0])}`);
  }
  if (quest.estimatedHours.max <= student.preferences.maxHoursPerQuest) {
    reasons.push("Fits your weekly time limit");
  }
  if (student.preferences.rewardTypes.some((reward) => quest.reward.type.includes(reward))) {
    reasons.push("Reward matches what you prefer");
  }

  return {
    questId: quest.id,
    studentId: student.id,
    total,
    interestScore,
    skillScore,
    availabilityScore,
    difficultyScore,
    rewardScore,
    locationScore,
    urgencyScore,
    reasons: reasons.slice(0, 3)
  };
}

export function createDefaultPrepPlan(
  quest: QuestCard,
  memberIds: string[]
): PrepPlanItem[] {
  const dueAt = quest.deadline ?? quest.eventStart;

  return [
    {
      id: `${quest.id}-plan-1`,
      title: `Read the requirements for ${quest.title}`,
      type: "research",
      ownerUserId: memberIds[0],
      dueAt,
      done: false
    },
    {
      id: `${quest.id}-plan-2`,
      title: "Split roles and agree on a submission checklist",
      type: "meet",
      ownerUserId: memberIds[1] ?? memberIds[0],
      dueAt,
      done: false
    },
    {
      id: `${quest.id}-plan-3`,
      title: "Create a first draft, prototype, or outline",
      type: "build",
      ownerUserId: memberIds[2] ?? memberIds[0],
      dueAt,
      done: false
    },
    {
      id: `${quest.id}-plan-4`,
      title: "Review, polish, and submit together",
      type: "submit",
      ownerUserId: memberIds[memberIds.length - 1],
      dueAt,
      done: false
    }
  ];
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];

  const [first, ...rest] = items;
  return [
    ...combinations(rest, size - 1).map((combo) => [first, ...combo]),
    ...combinations(rest, size)
  ];
}

function availabilityOverlap(students: StudentProfile[]) {
  const commonDays = students.reduce(
    (days, student) => days.filter((day) => student.availability.preferredDays.includes(day)),
    students[0]?.availability.preferredDays ?? []
  );
  const commonTimes = students.reduce(
    (times, student) =>
      times.filter((time) => student.availability.preferredTimes.includes(time)),
    students[0]?.availability.preferredTimes ?? []
  );

  return Math.min(1, commonDays.length / 2 + commonTimes.length / 3);
}

function complementarySkills(quest: QuestCard, students: StudentProfile[]) {
  const covered = new Set(
    students.flatMap((student) =>
      student.skills.filter((skill) => quest.skillsHelpful.includes(skill))
    )
  );

  return ratio(covered.size, quest.skillsHelpful.length);
}

function sharedInterests(quest: QuestCard, students: StudentProfile[]) {
  const shared = quest.interests.filter((interest) =>
    students.every((student) => student.interests.includes(interest))
  );

  return ratio(shared.length, Math.min(2, quest.interests.length));
}

export function recommendParties(
  quest: QuestCard,
  students: StudentProfile[],
  anchorStudentId: string
): PartyCandidateScore[] {
  if (!quest.party.allowed) return [];

  const anchor = students.find((student) => student.id === anchorStudentId);
  if (!anchor) return [];

  const candidates = students
    .filter((student) => student.id !== anchorStudentId)
    .map((student) => ({
      student,
      fit: scoreQuestForStudent(quest, student)
    }))
    .filter(({ fit }) => fit.total >= 48)
    .sort((a, b) => b.fit.total - a.fit.total)
    .slice(0, 8);

  const partySizes = [2, 3, 4].filter((size) => size <= quest.party.idealSize + 1);

  return partySizes
    .flatMap((size) => combinations(candidates, size - 1))
    .map((combo) => {
      const members = [anchor, ...combo.map(({ student }) => student)];
      const memberFits = members.map((member) => scoreQuestForStudent(quest, member));
      const averageQuestFit =
        memberFits.reduce((sum, fit) => sum + fit.total, 0) / memberFits.length / 100;
      const complementarySkillScore = complementarySkills(quest, members);
      const availabilityOverlapScore = availabilityOverlap(members);
      const sharedInterestScore = sharedInterests(quest, members);
      const sizeScore = members.length === quest.party.idealSize ? 1 : 0.75;
      const total = Math.round(
        100 *
          (averageQuestFit * PARTY_SCORE_WEIGHTS.averageQuestFit +
            complementarySkillScore * PARTY_SCORE_WEIGHTS.complementarySkills +
            availabilityOverlapScore * PARTY_SCORE_WEIGHTS.availabilityOverlap +
            sharedInterestScore * PARTY_SCORE_WEIGHTS.sharedInterests +
            sizeScore * PARTY_SCORE_WEIGHTS.size)
      );

      const coveredSkills = [
        ...new Set(
          members.flatMap((member) =>
            member.skills.filter((skill) => quest.skillsHelpful.includes(skill))
          )
        )
      ];
      const reasons = [
        `${members.length}-person party with ${Math.round(averageQuestFit * 100)} average quest fit`,
        coveredSkills.length
          ? `Covers ${coveredSkills.slice(0, 3).map(humanize).join(", ")}`
          : "Strong shared motivation",
        availabilityOverlapScore > 0.5
          ? "Overlapping availability this week"
          : "Availability can work asynchronously"
      ];

      return {
        questId: quest.id,
        memberIds: members.map((member) => member.id),
        total,
        averageQuestFit,
        sharedInterestScore,
        complementarySkillScore,
        availabilityOverlapScore,
        sizeScore,
        reasons,
        prepPlan: createDefaultPrepPlan(
          quest,
          members.map((member) => member.id)
        )
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}
