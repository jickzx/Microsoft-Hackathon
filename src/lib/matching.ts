import type {
  InterestTag,
  PartyCandidateScore,
  PrepPlanItem,
  QuestCard,
  QuestDifficulty,
  QuestMatchBreakdown,
  SkillTag,
  StudentProfile
} from "../types";

const QUEST_SCORE_WEIGHTS = {
  interests: 0.3,
  skills: 0.2,
  availability: 0.16,
  difficulty: 0.1,
  reward: 0.09,
  location: 0.07,
  urgency: 0.08
} as const;

const PARTY_SCORE_WEIGHTS = {
  averageQuestFit: 0.35,
  complementarySkills: 0.25,
  availabilityOverlap: 0.2,
  sharedInterests: 0.1,
  size: 0.1
} as const;

const CURRENT_MATCH_TIME = new Date("2026-05-11T12:00:00Z");

const difficultyRank: Record<QuestDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3
};

const interestAffinity: Partial<Record<InterestTag, InterestTag[]>> = {
  ai: ["robotics", "research", "education", "startups", "finance"],
  career: ["finance", "startups", "clubs", "events"],
  climate: ["social-impact", "volunteering", "research", "startups"],
  clubs: ["events", "career", "volunteering"],
  competitions: ["ai", "finance", "gaming", "robotics", "startups"],
  design: ["events", "gaming", "health", "social-impact", "startups"],
  education: ["ai", "social-impact", "research", "writing"],
  events: ["clubs", "design", "gaming", "volunteering"],
  finance: ["career", "competitions", "startups", "research"],
  gaming: ["design", "events", "competitions"],
  health: ["design", "research", "social-impact"],
  research: ["ai", "climate", "education", "health", "robotics"],
  robotics: ["ai", "competitions", "research"],
  "social-impact": ["climate", "education", "health", "volunteering"],
  startups: ["ai", "career", "competitions", "design", "finance"],
  volunteering: ["clubs", "events", "social-impact"],
  writing: ["career", "education", "research"]
};

const skillInterestAffinity: Partial<Record<SkillTag, InterestTag[]>> = {
  backend: ["ai", "finance", "robotics", "startups"],
  community: ["clubs", "events", "social-impact", "volunteering"],
  coding: ["ai", "competitions", "gaming", "robotics", "startups"],
  data: ["ai", "climate", "finance", "health", "research"],
  design: ["design", "events", "gaming", "health", "startups"],
  frontend: ["design", "education", "events", "gaming", "startups"],
  hardware: ["robotics", "research"],
  marketing: ["career", "clubs", "events", "startups"],
  ml: ["ai", "finance", "health", "research", "robotics"],
  photography: ["design", "events", "volunteering"],
  pitching: ["career", "competitions", "finance", "startups"],
  "public-speaking": ["career", "clubs", "competitions", "events"],
  video: ["design", "events", "gaming", "volunteering"],
  writing: ["career", "education", "research", "social-impact"]
};

const transferableSkills: Partial<Record<SkillTag, SkillTag[]>> = {
  backend: ["coding", "data"],
  community: ["marketing", "public-speaking", "writing"],
  coding: ["backend", "frontend", "ml"],
  data: ["backend", "ml", "writing"],
  design: ["frontend", "marketing", "photography", "video"],
  frontend: ["coding", "design"],
  hardware: ["backend", "data"],
  marketing: ["community", "pitching", "public-speaking"],
  ml: ["backend", "coding", "data"],
  photography: ["design", "video"],
  pitching: ["marketing", "public-speaking", "writing"],
  "public-speaking": ["pitching", "community"],
  video: ["design", "marketing", "photography"],
  writing: ["community", "marketing", "pitching"]
};

const weekdayLabels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function ratio(overlap: number, total: number) {
  if (total === 0) return 1;
  return clamp01(overlap / total);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function intersect<T>(a: T[], b: T[]) {
  const lookup = new Set(b);
  return a.filter((item) => lookup.has(item));
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

function scoreUrgency(deadline?: string, now = CURRENT_MATCH_TIME) {
  if (!deadline) return 0.45;
  const days = Math.ceil(
    (new Date(deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (days < 0) return 0;
  if (days <= 1) return 0.42;
  if (days <= 3) return 0.66;
  if (days <= 14) return 1;
  if (days <= 30) return 0.74;
  return 0.45;
}

function dayTimeFor(date: Date) {
  const hour = date.getUTCHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function scoreEventTiming(quest: QuestCard, student: StudentProfile) {
  if (!quest.eventStart) return 0.72;
  const eventDate = new Date(quest.eventStart);
  if (Number.isNaN(eventDate.getTime())) return 0.72;

  const day = weekdayLabels[eventDate.getUTCDay()];
  const time = dayTimeFor(eventDate);
  const dayScore = student.availability.preferredDays.includes(day) ? 1 : 0.46;
  const timeScore = student.availability.preferredTimes.includes(time) ? 1 : 0.54;

  return dayScore * 0.56 + timeScore * 0.44;
}

function scoreInterestFit(quest: QuestCard, student: StudentProfile) {
  const shared = intersect(student.interests, quest.interests);
  const direct = new Set(shared);
  const adjacent = quest.interests.filter(
    (interest) =>
      !direct.has(interest) &&
      student.interests.some((studentInterest) =>
        interestAffinity[studentInterest]?.includes(interest)
      )
  );
  const skillLed = quest.interests.filter(
    (interest) =>
      !direct.has(interest) &&
      !adjacent.includes(interest) &&
      student.skills.some((skill) => skillInterestAffinity[skill]?.includes(interest))
  );

  const directScore = ratio(shared.length, quest.interests.length);
  const adjacentScore = ratio(adjacent.length, quest.interests.length);
  const skillSignalScore = ratio(skillLed.length, quest.interests.length);

  return {
    score: clamp01(directScore * 0.72 + adjacentScore * 0.2 + skillSignalScore * 0.08),
    shared,
    adjacent,
    skillLed
  };
}

function scoreSkillFit(quest: QuestCard, student: StudentProfile) {
  const useful = intersect(student.skills, quest.skillsHelpful);
  const direct = new Set(useful);
  const learning = quest.skillsHelpful.filter(
    (skill) => !direct.has(skill) && student.wantsToBuildSkills.includes(skill)
  );
  const learningSet = new Set(learning);
  const transferable = quest.skillsHelpful.filter(
    (skill) =>
      !direct.has(skill) &&
      !learningSet.has(skill) &&
      student.skills.some((studentSkill) => transferableSkills[studentSkill]?.includes(skill))
  );

  const directScore = ratio(useful.length, quest.skillsHelpful.length);
  const learningScore = ratio(learning.length, quest.skillsHelpful.length);
  const transferScore = ratio(transferable.length, quest.skillsHelpful.length);

  return {
    score: clamp01(directScore * 0.64 + learningScore * 0.24 + transferScore * 0.12),
    useful,
    learning,
    transferable
  };
}

function scoreAvailability(quest: QuestCard, student: StudentProfile) {
  const maxAvailableHours = Math.min(
    student.availability.weeklyHours,
    student.preferences.maxHoursPerQuest
  );
  const hourScore =
    quest.estimatedHours.max <= maxAvailableHours
      ? 1
      : Math.max(0.2, maxAvailableHours / Math.max(1, quest.estimatedHours.max));
  const timingScore = scoreEventTiming(quest, student);

  return clamp01(hourScore * 0.68 + timingScore * 0.32);
}

function scoreDifficulty(quest: QuestCard, student: StudentProfile, learningSkills: SkillTag[]) {
  const questRank = difficultyRank[quest.difficulty];
  const maxRank = difficultyRank[student.preferences.maxDifficulty];
  if (questRank <= maxRank) return 1;
  if (questRank === maxRank + 1 && learningSkills.length > 0) return 0.62;
  return 0.34;
}

function scoreLocation(quest: QuestCard, student: StudentProfile) {
  if (student.preferences.modes.includes(quest.location.mode)) return 1;
  if (
    quest.location.mode === "hybrid" &&
    student.preferences.modes.some((mode) => mode === "in_person" || mode === "remote")
  ) {
    return 0.86;
  }
  if (
    student.preferences.modes.includes("hybrid") &&
    (quest.location.mode === "in_person" || quest.location.mode === "remote")
  ) {
    return 0.72;
  }

  return 0.24;
}

export function scoreQuestForStudent(
  quest: QuestCard,
  student: StudentProfile
): QuestMatchBreakdown {
  const interestFit = scoreInterestFit(quest, student);
  const skillFit = scoreSkillFit(quest, student);

  const interestScore = interestFit.score;
  const skillScore = skillFit.score;
  const availabilityScore = scoreAvailability(quest, student);
  const difficultyScore = scoreDifficulty(quest, student, skillFit.learning);
  const rewardScore = ratio(
    intersect(student.preferences.rewardTypes, quest.reward.type).length,
    quest.reward.type.length
  );
  const locationScore = scoreLocation(quest, student);
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
  if (interestFit.shared.length > 0) {
    reasons.push(`Matches ${listReasons(interestFit.shared, "campus")} interests`);
  }
  if (interestFit.adjacent.length > 0) {
    reasons.push(`Adjacent to ${listReasons(interestFit.adjacent, "nearby")} interests`);
  }
  if (skillFit.useful.length > 0) {
    reasons.push(`Uses ${listReasons(skillFit.useful, "relevant")} skills`);
  }
  if (skillFit.learning.length > 0) {
    reasons.push(`Good way to build ${humanize(skillFit.learning[0])}`);
  }
  if (quest.estimatedHours.max <= student.preferences.maxHoursPerQuest) {
    reasons.push("Fits your weekly time limit");
  }
  if (student.preferences.rewardTypes.some((reward) => quest.reward.type.includes(reward))) {
    reasons.push("Reward matches what you prefer");
  }
  if (quest.party.allowed && quest.party.openSlots > 0) {
    reasons.push("Party slots are open for a side quest");
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
    reasons: reasons.length ? reasons.slice(0, 4) : ["Good exploratory side quest"]
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

function pairScore<T>(items: T[], score: (a: T, b: T) => number) {
  if (items.length < 2) return 1;

  let total = 0;
  let count = 0;
  for (let index = 0; index < items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < items.length; nextIndex += 1) {
      total += score(items[index], items[nextIndex]);
      count += 1;
    }
  }

  return count ? total / count : 1;
}

function communicationCompatibility(a: StudentProfile, b: StudentProfile) {
  if (a.communicationStyle === b.communicationStyle) return 1;
  const styles = new Set([a.communicationStyle, b.communicationStyle]);
  if (styles.has("async") && styles.has("low-pressure")) return 0.94;
  if (styles.has("planner") && styles.has("live-collab")) return 0.9;
  if (styles.has("planner") && styles.has("async")) return 0.82;
  if (styles.has("live-collab") && styles.has("low-pressure")) return 0.68;
  return 0.74;
}

function availabilitySummary(students: StudentProfile[]) {
  const commonDays = students.reduce(
    (days, student) => days.filter((day) => student.availability.preferredDays.includes(day)),
    students[0]?.availability.preferredDays ?? []
  );
  const commonTimes = students.reduce(
    (times, student) =>
      times.filter((time) => student.availability.preferredTimes.includes(time)),
    students[0]?.availability.preferredTimes ?? []
  );

  return { commonDays, commonTimes };
}

function availabilityOverlap(students: StudentProfile[]) {
  const { commonDays, commonTimes } = availabilitySummary(students);
  const commonScore = clamp01(commonDays.length / 2 + commonTimes.length / 3);
  const pairAvailabilityScore = pairScore(students, (a, b) => {
    const dayOverlap = intersect(a.availability.preferredDays, b.availability.preferredDays);
    const timeOverlap = intersect(a.availability.preferredTimes, b.availability.preferredTimes);
    return clamp01(ratio(dayOverlap.length, 3) * 0.58 + ratio(timeOverlap.length, 2) * 0.42);
  });
  const communicationScore = pairScore(students, communicationCompatibility);

  return clamp01(commonScore * 0.52 + pairAvailabilityScore * 0.36 + communicationScore * 0.12);
}

function complementarySkills(quest: QuestCard, students: StudentProfile[]) {
  const directlyCovered = new Set(
    students.flatMap((student) =>
      student.skills.filter((skill) => quest.skillsHelpful.includes(skill))
    )
  );
  const learningCovered = new Set(
    students.flatMap((student) =>
      student.wantsToBuildSkills.filter((skill) => quest.skillsHelpful.includes(skill))
    )
  );

  return clamp01(
    ratio(directlyCovered.size, quest.skillsHelpful.length) * 0.78 +
      ratio(learningCovered.size, quest.skillsHelpful.length) * 0.22
  );
}

function sharedInterests(quest: QuestCard, students: StudentProfile[]) {
  const covered = quest.interests.filter((interest) =>
    students.some((student) => student.interests.includes(interest))
  );
  const sharedByAtLeastTwo = quest.interests.filter(
    (interest) =>
      students.filter((student) => student.interests.includes(interest)).length >= 2
  );

  return clamp01(
    ratio(covered.length, quest.interests.length) * 0.62 +
      ratio(sharedByAtLeastTwo.length, Math.min(2, quest.interests.length)) * 0.38
  );
}

function partySizesForQuest(quest: QuestCard) {
  if (!quest.party.allowed || quest.party.openSlots <= 0) return [];

  const maxSize = Math.min(
    4,
    Math.max(2, quest.party.openSlots),
    Math.max(2, quest.party.idealSize + 1)
  );
  const sizes = [
    quest.party.idealSize - 1,
    quest.party.idealSize,
    quest.party.idealSize + 1
  ].filter((size) => size >= 2 && size <= maxSize);

  return unique(sizes.length ? sizes : [Math.min(maxSize, 2)]);
}

function describeAvailability(students: StudentProfile[]) {
  const { commonDays, commonTimes } = availabilitySummary(students);

  if (commonDays.length && commonTimes.length) {
    return `Overlaps ${humanize(commonDays[0])} ${humanize(commonTimes[0]).toLowerCase()}`;
  }
  if (commonTimes.length) {
    return `${humanize(commonTimes[0])} availability lines up`;
  }

  return "Availability can work asynchronously";
}

export function recommendParties(
  quest: QuestCard,
  students: StudentProfile[],
  anchorStudentId: string
): PartyCandidateScore[] {
  if (!quest.party.allowed || quest.party.openSlots <= 0) return [];

  const anchor = students.find((student) => student.id === anchorStudentId);
  if (!anchor) return [];

  const candidates = students
    .filter((student) => student.id !== anchorStudentId)
    .map((student) => ({
      student,
      fit: scoreQuestForStudent(quest, student)
    }))
    .filter(({ fit }) => fit.total >= 45)
    .sort((a, b) => b.fit.total - a.fit.total)
    .slice(0, 8);

  const partySizes = partySizesForQuest(quest);

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
      const sizeDistance = Math.abs(members.length - quest.party.idealSize);
      const sizeScore = sizeDistance === 0 ? 1 : sizeDistance === 1 ? 0.78 : 0.56;
      const total = Math.round(
        100 *
          (averageQuestFit * PARTY_SCORE_WEIGHTS.averageQuestFit +
            complementarySkillScore * PARTY_SCORE_WEIGHTS.complementarySkills +
            availabilityOverlapScore * PARTY_SCORE_WEIGHTS.availabilityOverlap +
            sharedInterestScore * PARTY_SCORE_WEIGHTS.sharedInterests +
            sizeScore * PARTY_SCORE_WEIGHTS.size)
      );

      const coveredSkills = unique(
        members.flatMap((member) =>
          member.skills.filter((skill) => quest.skillsHelpful.includes(skill))
        )
      );
      const sharedQuestInterests = quest.interests.filter(
        (interest) =>
          members.filter((member) => member.interests.includes(interest)).length >= 2
      );
      const reasons = [
        `${members.length}-person side quest party with ${Math.round(
          averageQuestFit * 100
        )}% average fit`,
        coveredSkills.length
          ? `Covers ${coveredSkills.slice(0, 3).map(humanize).join(", ")}`
          : "Strong shared motivation",
        sharedQuestInterests.length
          ? `Shared pull toward ${humanize(sharedQuestInterests[0])}`
          : describeAvailability(members),
        describeAvailability(members)
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
        reasons: unique(reasons).slice(0, 4),
        prepPlan: createDefaultPrepPlan(
          quest,
          members.map((member) => member.id)
        )
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}
