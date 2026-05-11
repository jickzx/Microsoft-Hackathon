import type { QuestCard, StudentProfile } from "../types";

export const currentStudent: StudentProfile = {
  id: "student-you",
  name: "Maya Chen",
  year: "sophomore",
  major: "Computer Science and Design",
  avatarUrl:
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80",
  interests: ["ai", "design", "startups", "social-impact", "education"],
  skills: ["frontend", "design", "coding", "writing"],
  wantsToBuildSkills: ["ml", "pitching", "data"],
  availability: {
    weeklyHours: 8,
    preferredDays: ["thu", "fri", "sat", "sun"],
    preferredTimes: ["afternoon", "evening"]
  },
  preferences: {
    maxDifficulty: "hard",
    modes: ["in_person", "hybrid", "remote"],
    rewardTypes: ["money", "networking", "experience", "food"],
    maxHoursPerQuest: 12
  },
  questCount: 7,
  communicationStyle: "planner"
};

export const students: StudentProfile[] = [
  currentStudent,
  {
    id: "student-avery",
    name: "Avery Brooks",
    year: "junior",
    major: "Mechanical Engineering",
    avatarUrl:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=240&q=80",
    interests: ["robotics", "ai", "competitions"],
    skills: ["hardware", "data", "backend"],
    wantsToBuildSkills: ["pitching", "frontend"],
    availability: {
      weeklyHours: 10,
      preferredDays: ["fri", "sat", "sun"],
      preferredTimes: ["afternoon", "evening"]
    },
    preferences: {
      maxDifficulty: "hard",
      modes: ["in_person", "hybrid"],
      rewardTypes: ["experience", "networking", "food"],
      maxHoursPerQuest: 14
    },
    questCount: 5,
    communicationStyle: "live-collab"
  },
  {
    id: "student-sam",
    name: "Samira Khan",
    year: "masters",
    major: "Public Health",
    avatarUrl:
      "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=240&q=80",
    interests: ["health", "research", "social-impact"],
    skills: ["writing", "data", "community"],
    wantsToBuildSkills: ["design", "public-speaking"],
    availability: {
      weeklyHours: 6,
      preferredDays: ["wed", "thu", "sat"],
      preferredTimes: ["morning", "afternoon"]
    },
    preferences: {
      maxDifficulty: "medium",
      modes: ["hybrid", "remote", "in_person"],
      rewardTypes: ["experience", "networking"],
      maxHoursPerQuest: 8
    },
    questCount: 9,
    communicationStyle: "async"
  },
  {
    id: "student-noah",
    name: "Noah Patel",
    year: "senior",
    major: "Finance",
    avatarUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80",
    interests: ["finance", "career", "startups"],
    skills: ["data", "pitching", "writing"],
    wantsToBuildSkills: ["ml", "marketing"],
    availability: {
      weeklyHours: 7,
      preferredDays: ["mon", "wed", "fri", "sat"],
      preferredTimes: ["evening"]
    },
    preferences: {
      maxDifficulty: "hard",
      modes: ["in_person", "hybrid"],
      rewardTypes: ["money", "networking", "experience"],
      maxHoursPerQuest: 10
    },
    questCount: 11,
    communicationStyle: "planner"
  },
  {
    id: "student-lena",
    name: "Lena Ortiz",
    year: "freshman",
    major: "Media Arts",
    avatarUrl:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=80",
    interests: ["design", "events", "gaming", "volunteering"],
    skills: ["design", "video", "photography", "marketing"],
    wantsToBuildSkills: ["frontend", "public-speaking"],
    availability: {
      weeklyHours: 5,
      preferredDays: ["fri", "sat", "sun"],
      preferredTimes: ["afternoon", "evening"]
    },
    preferences: {
      maxDifficulty: "medium",
      modes: ["in_person", "hybrid"],
      rewardTypes: ["food", "swag", "experience"],
      maxHoursPerQuest: 6
    },
    questCount: 4,
    communicationStyle: "low-pressure"
  },
  {
    id: "student-eli",
    name: "Eli Morgan",
    year: "phd",
    major: "Climate Systems",
    avatarUrl:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=240&q=80",
    interests: ["climate", "research", "social-impact"],
    skills: ["data", "writing", "community"],
    wantsToBuildSkills: ["pitching", "design"],
    availability: {
      weeklyHours: 4,
      preferredDays: ["tue", "thu", "sun"],
      preferredTimes: ["morning", "afternoon"]
    },
    preferences: {
      maxDifficulty: "medium",
      modes: ["remote", "hybrid"],
      rewardTypes: ["money", "experience", "networking"],
      maxHoursPerQuest: 8
    },
    questCount: 13,
    communicationStyle: "async"
  }
];

export const seedQuests: QuestCard[] = [
  {
    id: "quest-001",
    title: "AI Study Buddy Hack Night",
    organizer: "Campus AI Society",
    summary:
      "Build a small AI tool that helps students revise, summarize notes, or plan study sessions.",
    description:
      "A one-night build session for students who want to turn study pain points into tiny AI products. Bring notes, form a team, and demo a working prototype by the end of the night.",
    imageUrl:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    source: {
      id: "src-001",
      type: "poster",
      submittedByUserId: "student-you",
      fileName: "ai-study-buddy-poster.png",
      submittedAt: "2026-05-01T10:00:00Z"
    },
    status: "published",
    interests: ["ai", "education", "design"],
    skillsHelpful: ["frontend", "ml", "design", "pitching"],
    difficulty: "medium",
    estimatedHours: { min: 6, max: 12 },
    reward: {
      type: ["swag", "networking", "experience"],
      label: "Mentor feedback, society showcase, and sponsor swag"
    },
    location: {
      mode: "in_person",
      campus: "North Campus",
      building: "Innovation Hub",
      room: "Studio B"
    },
    deadline: "2026-05-17T23:59:00Z",
    eventStart: "2026-05-18T18:00:00Z",
    eventEnd: "2026-05-18T23:00:00Z",
    bestFor: [
      "AI-curious builders",
      "students with exam pain points",
      "first-time hackathon teams"
    ],
    eligibility: ["Open to all students"],
    applyUrl: "https://example.edu/ai-study-buddy",
    party: { allowed: true, idealSize: 3, openSlots: 7 },
    aiExtraction: {
      confidence: 0.91,
      missingFields: [],
      extractedAt: "2026-05-01T10:02:00Z",
      model: "azure-ai-document-intelligence"
    },
    stats: { saves: 42, views: 310, partyRequests: 18 },
    createdAt: "2026-05-01T10:02:00Z",
    updatedAt: "2026-05-01T10:02:00Z"
  },
  {
    id: "quest-002",
    title: "Sustainable Campus Microgrant",
    organizer: "Office of Sustainability",
    summary:
      "Pitch a practical idea to reduce waste, energy use, or commuting emissions on campus.",
    description:
      "Turn a campus sustainability observation into a scoped pilot. Winning teams receive implementation funding plus staff support to test the idea before summer.",
    imageUrl:
      "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=1200&q=80",
    source: {
      id: "src-002",
      type: "email",
      submittedByUserId: "student-eli",
      rawText: "Applications open for student sustainability microgrants up to $500.",
      submittedAt: "2026-05-02T09:30:00Z"
    },
    status: "published",
    interests: ["climate", "social-impact", "startups"],
    skillsHelpful: ["writing", "data", "pitching", "community"],
    difficulty: "medium",
    estimatedHours: { min: 4, max: 8 },
    reward: {
      type: ["money", "experience"],
      label: "Up to $500 project funding",
      estimatedValueUsd: 500
    },
    location: {
      mode: "hybrid",
      campus: "North Campus",
      building: "Student Union"
    },
    deadline: "2026-05-24T23:59:00Z",
    bestFor: [
      "climate-focused students",
      "project leads",
      "students who know campus operations"
    ],
    eligibility: ["Teams of 1-4 students"],
    applyUrl: "https://example.edu/sustainability-grant",
    party: { allowed: true, idealSize: 4, openSlots: 5 },
    aiExtraction: {
      confidence: 0.88,
      missingFields: ["eventEnd"],
      extractedAt: "2026-05-02T09:31:00Z",
      model: "azure-ai-language"
    },
    stats: { saves: 27, views: 188, partyRequests: 9 },
    createdAt: "2026-05-02T09:31:00Z",
    updatedAt: "2026-05-02T09:31:00Z"
  },
  {
    id: "quest-003",
    title: "HealthTech Design Sprint",
    organizer: "Medical Innovation Lab",
    summary:
      "Design a patient-friendly digital experience for booking, reminders, or care follow-up.",
    description:
      "Spend a focused Saturday interviewing scenario patients, mapping friction, and designing a prototype that clinicians can critique. Strong fit for UX, public health, and frontend students.",
    imageUrl:
      "https://images.unsplash.com/photo-1581093458791-9d42e82044f3?auto=format&fit=crop&w=1200&q=80",
    source: {
      id: "src-003",
      type: "pdf",
      submittedByUserId: "student-sam",
      fileName: "healthtech-design-sprint.pdf",
      submittedAt: "2026-05-03T14:20:00Z"
    },
    status: "published",
    interests: ["health", "design", "research"],
    skillsHelpful: ["design", "frontend", "writing", "pitching"],
    difficulty: "hard",
    estimatedHours: { min: 10, max: 16 },
    reward: {
      type: ["networking", "experience", "food"],
      label: "Clinician feedback, dinner, and demo day invite"
    },
    location: {
      mode: "in_person",
      campus: "Health Sciences Campus",
      building: "Simulation Center"
    },
    deadline: "2026-05-15T12:00:00Z",
    eventStart: "2026-05-16T09:00:00Z",
    eventEnd: "2026-05-16T18:00:00Z",
    bestFor: [
      "UX researchers",
      "healthcare-interested builders",
      "students comfortable with ambiguity"
    ],
    eligibility: ["Undergraduate and graduate students"],
    applyUrl: "https://example.edu/healthtech-sprint",
    party: { allowed: true, idealSize: 3, openSlots: 4 },
    aiExtraction: {
      confidence: 0.84,
      missingFields: [],
      extractedAt: "2026-05-03T14:22:00Z",
      model: "azure-ai-document-intelligence"
    },
    stats: { saves: 35, views: 240, partyRequests: 14 },
    createdAt: "2026-05-03T14:22:00Z",
    updatedAt: "2026-05-03T14:22:00Z"
  },
  {
    id: "quest-004",
    title: "Campus Esports Overlay Challenge",
    organizer: "Game Dev Club",
    summary:
      "Create stream overlays, live stats panels, or highlight graphics for the spring finals broadcast.",
    description:
      "The club needs a broadcast package for finals night. Designers and frontend students can build overlays, player cards, animated stingers, or match summary panels.",
    imageUrl:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
    source: {
      id: "src-004",
      type: "message",
      submittedByUserId: "student-lena",
      rawText: "Need designers/devs for esports finals stream package.",
      submittedAt: "2026-05-04T16:45:00Z"
    },
    status: "published",
    interests: ["gaming", "design", "events"],
    skillsHelpful: ["frontend", "design", "video"],
    difficulty: "easy",
    estimatedHours: { min: 3, max: 6 },
    reward: {
      type: ["swag", "experience", "food"],
      label: "Club merch, pizza, and broadcast credit"
    },
    location: {
      mode: "hybrid",
      campus: "North Campus",
      building: "Media Lab"
    },
    deadline: "2026-05-13T18:00:00Z",
    eventStart: "2026-05-14T19:00:00Z",
    bestFor: [
      "visual designers",
      "frontend students",
      "students who like live events"
    ],
    eligibility: ["Open to all students"],
    party: { allowed: true, idealSize: 2, openSlots: 3 },
    aiExtraction: {
      confidence: 0.79,
      missingFields: ["applyUrl", "eventEnd"],
      extractedAt: "2026-05-04T16:46:00Z",
      model: "azure-ai-language"
    },
    stats: { saves: 19, views: 121, partyRequests: 6 },
    createdAt: "2026-05-04T16:46:00Z",
    updatedAt: "2026-05-04T16:46:00Z"
  },
  {
    id: "quest-005",
    title: "Robotics Lab Open Build",
    organizer: "Autonomous Systems Lab",
    summary:
      "Join a weekend build session testing sensors, chassis designs, and simple navigation routines.",
    description:
      "A hands-on weekend in the robotics lab. Students can help test perception, wiring, chassis stability, and navigation routines with graduate mentors nearby.",
    imageUrl:
      "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80",
    source: {
      id: "src-005",
      type: "photo",
      submittedByUserId: "student-avery",
      fileName: "robotics-lab-flyer.jpg",
      submittedAt: "2026-05-05T11:10:00Z"
    },
    status: "published",
    interests: ["robotics", "ai", "research"],
    skillsHelpful: ["hardware", "ml", "data", "backend"],
    difficulty: "hard",
    estimatedHours: { min: 8, max: 14 },
    reward: {
      type: ["experience", "networking", "food"],
      label: "Lab access, mentor support, and lunch"
    },
    location: {
      mode: "in_person",
      campus: "Engineering Campus",
      building: "Robotics Lab",
      room: "E204"
    },
    deadline: "2026-05-20T23:59:00Z",
    eventStart: "2026-05-23T10:00:00Z",
    eventEnd: "2026-05-24T16:00:00Z",
    bestFor: [
      "hardware tinkerers",
      "ML students",
      "students looking for lab experience"
    ],
    eligibility: ["Safety induction required"],
    contactEmail: "robotics@example.edu",
    party: { allowed: true, idealSize: 4, openSlots: 6 },
    aiExtraction: {
      confidence: 0.82,
      missingFields: ["applyUrl"],
      extractedAt: "2026-05-05T11:12:00Z",
      model: "azure-ai-vision"
    },
    stats: { saves: 31, views: 205, partyRequests: 11 },
    createdAt: "2026-05-05T11:12:00Z",
    updatedAt: "2026-05-05T11:12:00Z"
  },
  {
    id: "quest-006",
    title: "Student Finance Case Jam",
    organizer: "Investment Society",
    summary:
      "Analyze a public company, build a short investment thesis, and present it to alumni judges.",
    description:
      "Teams receive a prompt, market data, and three hours to make a clear investment recommendation. Alumni judges will give feedback and choose a top presentation.",
    imageUrl:
      "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
    source: {
      id: "src-006",
      type: "link",
      submittedByUserId: "student-noah",
      rawUrl: "https://example.edu/finance-case-jam",
      submittedAt: "2026-05-06T08:15:00Z"
    },
    status: "published",
    interests: ["finance", "career", "research"],
    skillsHelpful: ["data", "writing", "pitching"],
    difficulty: "medium",
    estimatedHours: { min: 5, max: 10 },
    reward: {
      type: ["money", "networking", "experience"],
      label: "$300 top prize and alumni networking",
      estimatedValueUsd: 300
    },
    location: {
      mode: "in_person",
      campus: "North Campus",
      building: "Business School",
      room: "Case Room 2"
    },
    deadline: "2026-05-21T17:00:00Z",
    eventStart: "2026-05-22T13:00:00Z",
    eventEnd: "2026-05-22T17:00:00Z",
    bestFor: [
      "finance students",
      "data storytellers",
      "students practicing presentations"
    ],
    eligibility: ["Teams of 2-4 students"],
    applyUrl: "https://example.edu/finance-case-jam",
    party: { allowed: true, idealSize: 3, openSlots: 8 },
    aiExtraction: {
      confidence: 0.94,
      missingFields: [],
      extractedAt: "2026-05-06T08:16:00Z",
      model: "azure-ai-language"
    },
    stats: { saves: 23, views: 177, partyRequests: 13 },
    createdAt: "2026-05-06T08:16:00Z",
    updatedAt: "2026-05-06T08:16:00Z"
  },
  {
    id: "quest-007",
    title: "Community Mural Volunteer Crew",
    organizer: "Arts and Service Office",
    summary:
      "Help paint a neighborhood mural designed by local artists and document the day for campus channels.",
    description:
      "A low-pressure service quest for students who want to paint, document, or help coordinate a public art day with local organizers.",
    imageUrl:
      "https://images.unsplash.com/photo-1579762593131-b8945254345c?auto=format&fit=crop&w=1200&q=80",
    source: {
      id: "src-007",
      type: "screenshot",
      submittedByUserId: "student-lena",
      fileName: "mural-volunteer.png",
      submittedAt: "2026-05-07T12:00:00Z"
    },
    status: "published",
    interests: ["volunteering", "social-impact", "design"],
    skillsHelpful: ["community", "design", "video", "photography"],
    difficulty: "easy",
    estimatedHours: { min: 2, max: 5 },
    reward: {
      type: ["food", "experience"],
      label: "Free lunch and service hours"
    },
    location: {
      mode: "in_person",
      campus: "Downtown Site",
      address: "14 River Street"
    },
    deadline: "2026-05-18T20:00:00Z",
    eventStart: "2026-05-19T10:00:00Z",
    eventEnd: "2026-05-19T15:00:00Z",
    bestFor: ["students wanting service hours", "creative students", "friend groups"],
    eligibility: ["No experience required"],
    contactEmail: "service@example.edu",
    party: { allowed: true, idealSize: 4, openSlots: 10 },
    aiExtraction: {
      confidence: 0.86,
      missingFields: ["applyUrl"],
      extractedAt: "2026-05-07T12:01:00Z",
      model: "azure-ai-vision"
    },
    stats: { saves: 48, views: 260, partyRequests: 21 },
    createdAt: "2026-05-07T12:01:00Z",
    updatedAt: "2026-05-07T12:01:00Z"
  },
  {
    id: "quest-008",
    title: "Startup Weekend Pitch Clinic",
    organizer: "Entrepreneurship Center",
    summary:
      "Help founders sharpen a 90-second pitch, validate users, and prep slides before demo night.",
    description:
      "A practical coaching sprint for students curious about startups. Join as a pitch partner, slide designer, or lightweight market researcher.",
    imageUrl:
      "https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=1200&q=80",
    source: {
      id: "src-008",
      type: "link",
      submittedByUserId: "student-noah",
      rawUrl: "https://example.edu/startup-pitch-clinic",
      submittedAt: "2026-05-08T09:20:00Z"
    },
    status: "published",
    interests: ["startups", "career", "competitions"],
    skillsHelpful: ["pitching", "design", "marketing", "writing"],
    difficulty: "medium",
    estimatedHours: { min: 3, max: 7 },
    reward: {
      type: ["networking", "experience", "food"],
      label: "Founder network, dinner, and mentor intros"
    },
    location: {
      mode: "hybrid",
      campus: "North Campus",
      building: "Founders Lab"
    },
    deadline: "2026-05-16T15:00:00Z",
    eventStart: "2026-05-16T18:00:00Z",
    eventEnd: "2026-05-16T21:00:00Z",
    bestFor: [
      "startup-curious students",
      "strong presenters",
      "students who can simplify messy ideas"
    ],
    eligibility: ["Open to all years"],
    applyUrl: "https://example.edu/startup-pitch-clinic",
    party: { allowed: true, idealSize: 2, openSlots: 4 },
    aiExtraction: {
      confidence: 0.9,
      missingFields: [],
      extractedAt: "2026-05-08T09:21:00Z",
      model: "azure-ai-language"
    },
    stats: { saves: 36, views: 219, partyRequests: 17 },
    createdAt: "2026-05-08T09:21:00Z",
    updatedAt: "2026-05-08T09:21:00Z"
  }
];

export const allInterests = [
  "ai",
  "research",
  "events",
  "startups",
  "clubs",
  "volunteering",
  "competitions",
  "design",
  "career",
  "climate",
  "finance",
  "gaming",
  "health",
  "robotics",
  "social-impact",
  "education"
] as const;

export const allSkills = [
  "design",
  "coding",
  "frontend",
  "backend",
  "ml",
  "data",
  "writing",
  "marketing",
  "photography",
  "public-speaking",
  "pitching",
  "video",
  "hardware",
  "community"
] as const;
