import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Award,
  Bell,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Compass,
  FileText,
  Flame,
  Globe2,
  Grid3X3,
  Heart,
  History,
  HomeIcon,
  Image as ImageIcon,
  Link2,
  Loader2,
  MapPin,
  MessageCircle,
  PlusCircle,
  Search,
  Settings,
  Sparkles,
  Star,
  Trophy,
  Upload,
  UserRound,
  Users,
  Zap,
  X
} from "lucide-react";
import { currentStudent, seedQuests, students as seedStudents } from "./data/seed";
import {
  daysUntil,
  formatDeadline,
  formatLocation,
  formatTimeCommitment,
  labelize
} from "./lib/format";
import { scoreQuestForStudent } from "./lib/matching";
import type {
  AzureConnectionHealth,
  ExtractQuestMeta,
  ExtractQuestResponse,
  MatchRecommendationMeta,
  MatchRecommendationResponse,
  PrepPlanItem,
  QuestCard,
  QuestMatchBreakdown,
  QuestParty,
  QuestSourceType,
  StudentProfile
} from "./types";

type Page = "home" | "explore" | "submit" | "parties" | "profile";
type AuthMode = "signup" | "login";
type QuickFilter = "Trending" | "New" | "Ending Soon" | "For You";
type SubmitMethodId = "link" | "photo" | "screenshot" | "text" | "file";

interface SignupProfile {
  name: string;
  role: string;
  workExperience: string;
  education: string;
  courseOrJobTitle: string;
  careerInterest: string;
  skills: string;
  goals: string;
  hobbies: string;
}

interface AuthState {
  signedIn: boolean;
  profile: SignupProfile | null;
}

interface UserState {
  savedQuestIds: string[];
  joinedQuestIds: string[];
  joinedQuestStatuses: Record<string, string>;
  parties: PersistedParty[];
}

interface PersistedParty extends QuestParty {
  quest: QuestCard;
  members: StudentProfile[];
}

interface ExtractMetaWithSource extends ExtractQuestMeta {
  sourceId?: string;
}

const authProfileStorageKey = "questboard.signupProfile";
const authModeStorageKey = "questboard.authMode";

const signupInitialProfile: SignupProfile = {
  name: "",
  role: "Student",
  workExperience: "",
  education: "",
  courseOrJobTitle: "",
  careerInterest: "",
  skills: "",
  goals: "",
  hobbies: ""
};

const roleOptions = ["Student", "Graduate", "Career switcher", "Founder", "Job seeker", "Researcher"];
const workExperienceOptions = [
  "No formal experience yet",
  "0-1 years",
  "1-3 years",
  "3-5 years",
  "5+ years"
];
const educationOptions = [
  "High school",
  "Undergraduate",
  "Bachelor's degree",
  "Master's degree",
  "PhD",
  "Bootcamp or certificate",
  "Self-taught"
];

const requiredSignupFields: { key: keyof SignupProfile; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "role", label: "Role" },
  { key: "workExperience", label: "Work experience" },
  { key: "education", label: "Highest level of education" },
  { key: "courseOrJobTitle", label: "Course or job title" },
  { key: "careerInterest", label: "Career interest" },
  { key: "skills", label: "Skills" },
  { key: "goals", label: "Goals" },
  { key: "hobbies", label: "Hobbies" }
];

const navItems: { page: Page; label: string; icon: typeof HomeIcon }[] = [
  { page: "home", label: "Home", icon: HomeIcon },
  { page: "explore", label: "Explore", icon: Compass },
  { page: "submit", label: "Submit", icon: PlusCircle },
  { page: "parties", label: "Parties", icon: Users },
  { page: "profile", label: "Profile", icon: UserRound }
];

const quickFilters: QuickFilter[] = ["Trending", "New", "Ending Soon", "For You"];

const browseFilters = [
  { value: "all", label: "All" },
  { value: "ai", label: "Hackathon" },
  { value: "events", label: "Spring Week" },
  { value: "career", label: "Internship" },
  { value: "startups", label: "Grad Scheme" },
  { value: "design", label: "Workshop" },
  { value: "competitions", label: "Competition" },
  { value: "networking", label: "Networking" }
];

const submitMethods: {
  id: SubmitMethodId;
  icon: typeof Globe2;
  label: string;
  description: string;
}[] = [
  { id: "link", icon: Globe2, label: "Paste a Link", description: "Store URL as source" },
  { id: "photo", icon: Camera, label: "Take a Photo", description: "Poster or noticeboard" },
  { id: "screenshot", icon: ImageIcon, label: "Upload Image", description: "Screenshot or flyer" },
  { id: "text", icon: MessageCircle, label: "Paste Text", description: "Email, chat, caption" },
  { id: "file", icon: FileText, label: "Upload File", description: "PDF, doc, or note" }
];

const badgeItems = [
  { icon: Star, label: "Early Adopter", className: "badge-gold" },
  { icon: Users, label: "Team Player", className: "badge-blue" },
  { icon: Flame, label: "Night Owl", className: "badge-violet" },
  { icon: Trophy, label: "Hackathon Hero", className: "badge-green" }
];

const profileMenu = [
  { icon: Bookmark, label: "Saved Quests", count: 0 },
  { icon: History, label: "Quest History", count: 12 },
  { icon: Users, label: "My Parties", count: 0 },
  { icon: Settings, label: "Settings" }
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const payload = data as { error?: string; details?: string[] } | null;
    throw new Error(payload?.details?.join(", ") ?? payload?.error ?? "Request failed");
  }
  return data as T;
}

function readStoredAuthState(): AuthState {
  if (typeof window === "undefined") return { signedIn: false, profile: null };

  const rawProfile = window.localStorage.getItem(authProfileStorageKey);
  if (rawProfile) {
    try {
      return { signedIn: true, profile: JSON.parse(rawProfile) as SignupProfile };
    } catch {
      window.localStorage.removeItem(authProfileStorageKey);
    }
  }

  return {
    signedIn: window.localStorage.getItem(authModeStorageKey) === "demo",
    profile: null
  };
}

function saveAuthProfile(profile: SignupProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(authProfileStorageKey, JSON.stringify(profile));
  window.localStorage.setItem(authModeStorageKey, "profile");
}

function saveDemoLogin() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(authModeStorageKey, "demo");
}

function App() {
  const [authState, setAuthState] = useState<AuthState>(() => readStoredAuthState());
  const [quests, setQuests] = useState<QuestCard[]>(seedQuests);
  const [users, setUsers] = useState<StudentProfile[]>(seedStudents);
  const [currentUserId, setCurrentUserId] = useState(currentStudent.id);
  const [activePage, setActivePage] = useState<Page>("home");
  const [selectedQuest, setSelectedQuest] = useState<QuestCard | null>(null);
  const [savedQuestIds, setSavedQuestIds] = useState<Set<string>>(() => new Set());
  const [joinedQuestIds, setJoinedQuestIds] = useState<Set<string>>(() => new Set());
  const [parties, setParties] = useState<PersistedParty[]>([]);
  const [azureHealth, setAzureHealth] = useState<AzureConnectionHealth | null>(null);
  const [remoteMatches, setRemoteMatches] = useState<Record<string, QuestMatchBreakdown>>({});
  const [matchMeta, setMatchMeta] = useState<MatchRecommendationMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const signupStudent = useMemo(
    () => (authState.profile ? createStudentFromSignup(authState.profile, currentStudent) : null),
    [authState.profile]
  );

  const displayUsers = useMemo(() => {
    if (!signupStudent) return users;
    const nextUsers = users.map((student) =>
      student.id === signupStudent.id ? signupStudent : student
    );
    return nextUsers.some((student) => student.id === signupStudent.id)
      ? nextUsers
      : [signupStudent, ...nextUsers];
  }, [signupStudent, users]);

  const activeStudent =
    displayUsers.find((student) => student.id === currentUserId) ??
    seedStudents.find((student) => student.id === currentUserId) ??
    currentStudent;

  const localQuestMatches = useMemo(
    () =>
      Object.fromEntries(
        quests.map((quest) => [quest.id, scoreQuestForStudent(quest, activeStudent)])
      ) as Record<string, QuestMatchBreakdown>,
    [activeStudent, quests]
  );

  const questMatches = useMemo(
    () => ({ ...localQuestMatches, ...remoteMatches }),
    [localQuestMatches, remoteMatches]
  );

  async function refreshQuests() {
    const data = await fetchJson<{ quests: QuestCard[] }>("/api/quests");
    setQuests(data.quests);
    setSelectedQuest((current) =>
      current ? data.quests.find((quest) => quest.id === current.id) ?? null : null
    );
  }

  async function refreshUserState(userId = currentUserId) {
    const state = await fetchJson<UserState>(`/api/users/${userId}/state`);
    setSavedQuestIds(new Set(state.savedQuestIds));
    setJoinedQuestIds(new Set(state.joinedQuestIds));
    setParties(state.parties);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchJson<{ users: StudentProfile[]; currentUserId: string }>("/api/users"),
      fetchJson<{ quests: QuestCard[] }>("/api/quests"),
      fetchJson<AzureConnectionHealth>("/api/azure/health").catch(() => null)
    ])
      .then(([userData, questData, health]) => {
        if (!active) return;
        setUsers(userData.users.length ? userData.users : seedStudents);
        setCurrentUserId(userData.currentUserId);
        setQuests(questData.quests.length ? questData.quests : seedQuests);
        setAzureHealth(health);
      })
      .catch(() => {
        if (!active) return;
        setUsers(seedStudents);
        setQuests(seedQuests);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetchJson<UserState>(`/api/users/${currentUserId}/state`)
      .then((state) => {
        if (!active) return;
        setSavedQuestIds(new Set(state.savedQuestIds));
        setJoinedQuestIds(new Set(state.joinedQuestIds));
        setParties(state.parties);
      })
      .catch(() => {
        if (!active) return;
        setSavedQuestIds(new Set(["quest-001", "quest-007"]));
        setJoinedQuestIds(new Set());
        setParties([]);
      });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!quests.length) return undefined;
    let active = true;

    fetchJson<MatchRecommendationResponse>("/api/matches/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: currentUserId,
        questIds: quests.map((quest) => quest.id)
      })
    })
      .then((data) => {
        if (!active) return;
        setRemoteMatches(
          Object.fromEntries(data.matches.map((match) => [match.questId, match])) as Record<
            string,
            QuestMatchBreakdown
          >
        );
        setMatchMeta(data.meta);
      })
      .catch(() => {
        if (!active) return;
        setRemoteMatches({});
        setMatchMeta(null);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, quests]);

  async function toggleSaved(questId: string) {
    const saved = savedQuestIds.has(questId);
    setSavedQuestIds((current) => {
      const next = new Set(current);
      if (saved) next.delete(questId);
      else next.add(questId);
      return next;
    });

    try {
      await fetchJson<UserState>(`/api/users/${currentUserId}/saved-quests/${questId}`, {
        method: saved ? "DELETE" : "POST"
      });
      await Promise.all([refreshUserState(), refreshQuests()]);
    } catch {
      setSavedQuestIds((current) => {
        const next = new Set(current);
        if (saved) next.add(questId);
        else next.delete(questId);
        return next;
      });
    }
  }

  async function toggleJoined(questId: string) {
    const joined = joinedQuestIds.has(questId);
    setJoinedQuestIds((current) => {
      const next = new Set(current);
      if (joined) next.delete(questId);
      else next.add(questId);
      return next;
    });

    try {
      await fetchJson<UserState>(`/api/users/${currentUserId}/joined-quests/${questId}`, {
        method: joined ? "DELETE" : "POST"
      });
      await Promise.all([refreshUserState(), refreshQuests()]);
    } catch {
      setJoinedQuestIds((current) => {
        const next = new Set(current);
        if (joined) next.add(questId);
        else next.delete(questId);
        return next;
      });
    }
  }

  async function publishQuest(quest: QuestCard) {
    setQuests((current) => [quest, ...current.filter((item) => item.id !== quest.id)]);
    await refreshQuests();
    setSelectedQuest(null);
    setActivePage("explore");
  }

  async function updateQuestCard(quest: QuestCard) {
    const data = await fetchJson<{ quest: QuestCard }>(`/api/quests/${quest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quest)
    });
    setQuests((current) => current.map((item) => (item.id === data.quest.id ? data.quest : item)));
    setSelectedQuest(data.quest);
  }

  async function deleteQuestCard(questId: string) {
    await fetch(`/api/quests/${questId}`, { method: "DELETE" });
    setQuests((current) => current.filter((quest) => quest.id !== questId));
    setSelectedQuest(null);
  }

  async function createParty(questId: string) {
    const data = await fetchJson<{ party: PersistedParty }>("/api/parties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId, studentId: currentUserId })
    });
    setParties((current) => [data.party, ...current.filter((party) => party.id !== data.party.id)]);
    setJoinedQuestIds((current) => new Set([...current, questId]));
    setActivePage("parties");
  }

  function completeSignup(profile: SignupProfile) {
    const cleanProfile = trimSignupProfile(profile);
    saveAuthProfile(cleanProfile);
    setAuthState({ signedIn: true, profile: cleanProfile });
    setCurrentUserId(currentStudent.id);
    setActivePage("home");
    setSelectedQuest(null);
  }

  function continueWithDemoProfile() {
    saveDemoLogin();
    setAuthState({ signedIn: true, profile: null });
    setCurrentUserId(currentStudent.id);
    setActivePage("home");
    setSelectedQuest(null);
  }

  async function togglePrepItem(partyId: string, item: PrepPlanItem) {
    const data = await fetchJson<{ item: PrepPlanItem }>(
      `/api/parties/${partyId}/prep/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !item.done })
      }
    );
    setParties((current) =>
      current.map((party) =>
        party.id === partyId
          ? {
              ...party,
              prepPlan: party.prepPlan.map((candidate) =>
                candidate.id === item.id ? data.item : candidate
              )
            }
          : party
      )
    );
  }

  function showPage(page: Page) {
    setSelectedQuest(null);
    setActivePage(page);
  }

  const page = selectedQuest ? (
    <QuestDetailPage
      key={selectedQuest.id}
      quest={selectedQuest}
      student={activeStudent}
      saved={savedQuestIds.has(selectedQuest.id)}
      joined={joinedQuestIds.has(selectedQuest.id)}
      match={questMatches[selectedQuest.id]}
      matchMeta={matchMeta}
      onBack={() => setSelectedQuest(null)}
      onSave={() => toggleSaved(selectedQuest.id)}
      onJoin={() => toggleJoined(selectedQuest.id)}
      onParty={() => createParty(selectedQuest.id)}
      onUpdate={updateQuestCard}
      onDelete={() => deleteQuestCard(selectedQuest.id)}
    />
  ) : (
    <>
      {activePage === "home" ? (
        <HomePage
          quests={quests}
          student={activeStudent}
          questMatches={questMatches}
          savedQuestIds={savedQuestIds}
          matchProvider={matchMeta?.provider ?? "local"}
          loading={loading}
          onSave={toggleSaved}
          onSelectQuest={setSelectedQuest}
          onExplore={() => showPage("explore")}
        />
      ) : null}
      {activePage === "explore" ? (
        <ExplorePage
          quests={quests}
          questMatches={questMatches}
          savedQuestIds={savedQuestIds}
          onSave={toggleSaved}
          onSelectQuest={setSelectedQuest}
        />
      ) : null}
      {activePage === "submit" ? (
        <SubmitQuestPage azureHealth={azureHealth} onPublish={publishQuest} />
      ) : null}
      {activePage === "parties" ? (
        <PartiesPage
          quests={quests}
          parties={parties}
          students={users}
          currentUserId={currentUserId}
          onCreateParty={createParty}
          onTogglePrep={togglePrepItem}
          onSelectQuest={setSelectedQuest}
        />
      ) : null}
      {activePage === "profile" ? (
        <ProfilePage
          quests={quests}
          student={activeStudent}
          savedCount={savedQuestIds.size}
          partyCount={parties.length}
          onSelectQuest={setSelectedQuest}
        />
      ) : null}
    </>
  );

  return (
    <div className="app-frame">
      <TopNav
        activePage={activePage}
        users={users}
        currentUserId={currentUserId}
        azureHealth={azureHealth}
        onNavigate={showPage}
        onUserChange={setCurrentUserId}
      />
      <main className="app-main">{page}</main>
    </div>
  );
}

function TopNav({
  activePage,
  users,
  currentUserId,
  azureHealth,
  onNavigate,
  onUserChange
}: {
  activePage: Page;
  users: StudentProfile[];
  currentUserId: string;
  azureHealth: AzureConnectionHealth | null;
  onNavigate: (page: Page) => void;
  onUserChange: (userId: string) => void;
}) {
  const user = users.find((student) => student.id === currentUserId) ?? currentStudent;
  const azureLabel =
    azureHealth?.status === "ready" ? "Azure Ready" : azureHealth?.reachable ? "Azure Setup" : "Local AI";

  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark">
          <Compass size={18} />
        </span>
        <strong>QuestBoard</strong>
      </button>
      <nav className="nav-tabs" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={activePage === item.page ? "active" : ""}
              key={item.page}
              type="button"
              onClick={() => onNavigate(item.page)}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="profile-actions">
        <span className="xp-pill">
          {azureLabel}
          <strong>{azureHealth?.status === "ready" ? "AI" : "DB"}</strong>
        </span>
        <select
          aria-label="Current student"
          className="student-select"
          value={currentUserId}
          onChange={(event) => onUserChange(event.target.value)}
        >
          {users.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
        <img src={user.avatarUrl} alt={`${user.name} avatar`} />
      </div>
    </header>
  );
}

function HomePage({
  quests,
  student,
  questMatches,
  savedQuestIds,
  matchProvider,
  loading,
  onSave,
  onSelectQuest,
  onExplore
}: {
  quests: QuestCard[];
  student: StudentProfile;
  questMatches: Record<string, QuestMatchBreakdown>;
  savedQuestIds: Set<string>;
  matchProvider: "azure" | "local";
  loading: boolean;
  onSave: (questId: string) => void;
  onSelectQuest: (quest: QuestCard) => void;
  onExplore: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("Trending");
  const [category, setCategory] = useState("all");

  const filteredQuests = useMemo(
    () => filterAndSortQuests(quests, questMatches, search, category, quickFilter),
    [quests, questMatches, search, category, quickFilter]
  );
  const recommendedCount = quests.filter((quest) => (questMatches[quest.id]?.total ?? 0) >= 62).length;
  const hotQuest = [...quests].sort((a, b) => b.stats.views - a.stats.views)[0];
  const closingCount = quests.filter((quest) => {
    const days = daysUntil(quest.deadline);
    return days !== null && days <= 7;
  }).length;

  return (
    <section className="page-shell">
      <div className="home-header">
        <div>
          <h1>Hey {student.name.split(" ")[0]}</h1>
          <p>
            {loading ? "Loading campus quests..." : `${quests.length} persistent quests live on campus`}
          </p>
        </div>
        <div className="home-actions">
          <button className="icon-button" type="button" onClick={() => setSearchOpen((value) => !value)}>
            <Search size={20} />
          </button>
          <button className="icon-button alert-dot" type="button" aria-label="Notifications">
            <Bell size={20} />
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="wide-search" role="search">
          <Search size={17} />
          <input
            aria-label="Search quests"
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search quests, societies, events..."
          />
          {search ? (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
              <X size={16} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="stat-grid">
        <StatCard icon={Sparkles} tone="violet" label={matchProvider === "azure" ? "Azure Match" : "Local Match"} value={recommendedCount} detail="personalized quests" />
        <StatCard
          icon={Flame}
          tone="coral"
          label="Hot"
          value={hotQuest ? shortTitle(hotQuest.title) : "Quest"}
          detail={`${hotQuest?.stats.views ?? 0} interested`}
        />
        <StatCard icon={Clock3} tone="mint" label="Closing" value={closingCount} detail="deadlines this week" />
      </div>

      <FilterRail
        quickFilter={quickFilter}
        category={category}
        onQuickFilter={setQuickFilter}
        onCategory={setCategory}
      />

      <QuestGrid
        quests={filteredQuests}
        questMatches={questMatches}
        savedQuestIds={savedQuestIds}
        onSave={onSave}
        onSelectQuest={onSelectQuest}
      />

      {filteredQuests.length > 6 ? (
        <div className="centered-row">
          <button className="text-button" type="button" onClick={onExplore}>
            View all quests
            <ChevronRight size={16} />
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ExplorePage({
  quests,
  questMatches,
  savedQuestIds,
  onSave,
  onSelectQuest
}: {
  quests: QuestCard[];
  questMatches: Record<string, QuestMatchBreakdown>;
  savedQuestIds: Set<string>;
  onSave: (questId: string) => void;
  onSelectQuest: (quest: QuestCard) => void;
}) {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [time, setTime] = useState("all");

  const filtered = useMemo(() => {
    return filterAndSortQuests(quests, questMatches, search, category, "For You").filter((quest) => {
      const difficultyMatch = difficulty === "all" || quest.difficulty === difficulty;
      const hours = quest.estimatedHours.max;
      const timeMatch =
        time === "all" ||
        (time === "quick" && hours <= 3) ||
        (time === "medium" && hours > 3 && hours <= 8) ||
        (time === "day" && hours > 8 && hours <= 12) ||
        (time === "long" && hours > 12);
      return difficultyMatch && timeMatch;
    });
  }, [category, difficulty, questMatches, quests, search, time]);

  return (
    <section className="page-shell">
      <div className="section-header">
        <div>
          <h1>Explore Quests</h1>
          <p>{filtered.length} database-backed quests available</p>
        </div>
        <button className="icon-button" type="button" aria-label="Grid view">
          <Grid3X3 size={18} />
        </button>
      </div>

      <div className="wide-search explore-search" role="search">
        <Search size={17} />
        <input
          aria-label="Search quests"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, topic, or keyword..."
        />
        <button
          className={showFilters ? "filter-toggle active" : "filter-toggle"}
          type="button"
          onClick={() => setShowFilters((value) => !value)}
          aria-label="Toggle filters"
        >
          <Settings size={16} />
        </button>
      </div>

      {showFilters ? (
        <div className="advanced-filters">
          <FilterGroup label="Category" options={browseFilters} value={category} onChange={setCategory} />
          <FilterGroup
            label="Difficulty"
            options={[
              { value: "all", label: "All" },
              { value: "easy", label: "Chill" },
              { value: "medium", label: "Moderate" },
              { value: "hard", label: "Challenge" }
            ]}
            value={difficulty}
            onChange={setDifficulty}
          />
          <FilterGroup
            label="Time Commitment"
            options={[
              { value: "all", label: "All" },
              { value: "quick", label: "< 1 hour" },
              { value: "medium", label: "1-3 hours" },
              { value: "day", label: "Half day" },
              { value: "long", label: "Full day" }
            ]}
            value={time}
            onChange={setTime}
          />
        </div>
      ) : null}

      <QuestGrid
        quests={filtered}
        questMatches={questMatches}
        savedQuestIds={savedQuestIds}
        onSave={onSave}
        onSelectQuest={onSelectQuest}
      />
    </section>
  );
}

function SubmitQuestPage({
  azureHealth,
  onPublish
}: {
  azureHealth: AzureConnectionHealth | null;
  onPublish: (quest: QuestCard) => void;
}) {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<SubmitMethodId | null>(null);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [extracted, setExtracted] = useState<QuestCard | null>(null);
  const [extractionMeta, setExtractionMeta] = useState<ExtractMetaWithSource | null>(null);
  const [error, setError] = useState("");

  const canProcess = Boolean(method && ((method === "link" || method === "text") ? input.trim() : file));
  const azureReady = azureHealth?.status === "ready";

  async function handleExtract() {
    if (!method || !canProcess) return;
    setProcessing(true);
    setError("");

    const body = new FormData();
    const sourceType = sourceTypeForMethod(method, file);
    body.append("sourceType", sourceType);
    if (method === "link") body.append("url", input.trim());
    if (method === "text") body.append("text", input.trim());
    if (file) body.append("file", file);

    try {
      const data = await fetchJson<ExtractQuestResponse & { meta: ExtractMetaWithSource }>(
        "/api/extract",
        { method: "POST", body }
      );
      if (!data.cards?.[0]) throw new Error("Extraction returned no quest cards");
      setExtracted(data.cards[0]);
      setExtractionMeta(data.meta);
      setStep(3);
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "Extraction failed");
    } finally {
      setProcessing(false);
    }
  }

  async function handlePublish() {
    if (!extracted) return;
    setPublishing(true);
    setError("");
    const draft = { ...extracted, status: "published" as const, updatedAt: new Date().toISOString() };

    try {
      const data = await fetchJson<{ quest: QuestCard }>("/api/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      onPublish(data.quest);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className="submit-shell">
      <div className="section-header submit-heading">
        <div>
          <h1>Submit a Quest</h1>
          <p>Upload messy material, review the AI card, then publish to the live board.</p>
        </div>
      </div>

      <section className={azureReady ? "ai-status-card ready" : "ai-status-card"}>
        <Sparkles size={18} />
        <span>
          <strong>{azureReady ? "Azure extraction ready" : "Local fallback protected"}</strong>
          {azureHealth?.detail ?? "QuestBoard will store the source and use local extraction if Azure is unavailable."}
        </span>
      </section>

      <div className="stepper" aria-label="Submission progress">
        {[1, 2, 3].map((item) => (
          <span className={step >= item ? "active" : ""} key={item}>
            {step > item ? <Check size={15} /> : item}
          </span>
        ))}
      </div>

      {step === 1 ? (
        <section className="method-panel">
          <h2>How would you like to share?</h2>
          <div className="method-grid">
            {submitMethods.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setMethod(item.id);
                    setStep(2);
                    setInput("");
                    setFile(null);
                    setError("");
                  }}
                >
                  <span>
                    <Icon size={21} />
                  </span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === 2 && method ? (
        <section className="input-panel">
          <h2>{inputHeadingForMethod(method)}</h2>
          {method === "link" ? (
            <>
              <label className="large-input">
                <Link2 size={18} />
                <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="https://..." />
              </label>
              <p className="helper-text">Links are stored as source metadata for this MVP; paste visible event text too if the page needs rich extraction.</p>
            </>
          ) : null}
          {method === "text" ? (
            <textarea
              className="large-textarea"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste the WhatsApp message, email, Instagram caption, or any text..."
              rows={7}
            />
          ) : null}
          {method !== "link" && method !== "text" ? (
            <label className="upload-drop">
              <Upload size={34} />
              <strong>{file ? file.name : "Drop your file here"}</strong>
              <span>{file ? `${Math.round(file.size / 1024)} KB selected` : "or click to browse"}</span>
              <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="primary-button" type="button" onClick={handleExtract} disabled={!canProcess || processing}>
              {processing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              {processing ? "AI is extracting..." : "Extract with AI"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 && extracted ? (
        <section className="review-card">
          <div className="review-title">
            <span>
              <Check size={18} />
            </span>
            <h2>AI extracted this Quest Card</h2>
          </div>
          {extractionMeta ? <ExtractionDiagnostics meta={extractionMeta} /> : null}
          <ReviewQuestForm quest={extracted} onChange={setExtracted} />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => setStep(2)}>
              Re-extract
            </button>
            <button className="primary-button publish-button" type="button" onClick={handlePublish} disabled={publishing}>
              {publishing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              Publish Quest
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function ExtractionDiagnostics({ meta }: { meta: ExtractMetaWithSource }) {
  return (
    <section className="diagnostics-grid">
      <InfoField label="Provider" value={meta.provider === "azure" ? "Azure AI" : "Local fallback"} />
      <InfoField label="Confidence" value={`${Math.round(meta.confidence * 100)}%`} />
      <InfoField label="Source" value={labelize(meta.sourceType)} />
      <InfoField label="Missing" value={meta.missingFields.length ? meta.missingFields.map(labelize).join(", ") : "None"} />
    </section>
  );
}

function ReviewQuestForm({ quest, onChange }: { quest: QuestCard; onChange: (quest: QuestCard) => void }) {
  return (
    <div className="review-grid">
      <label>
        Title
        <input value={quest.title} onChange={(event) => onChange({ ...quest, title: event.target.value })} />
      </label>
      <label>
        Organizer
        <input value={quest.organizer} onChange={(event) => onChange({ ...quest, organizer: event.target.value })} />
      </label>
      <label>
        Summary
        <textarea value={quest.summary} onChange={(event) => onChange({ ...quest, summary: event.target.value })} rows={3} />
      </label>
      <label>
        Description
        <textarea value={quest.description} onChange={(event) => onChange({ ...quest, description: event.target.value })} rows={4} />
      </label>
      <div className="review-field-row">
        <label>
          Deadline
          <input
            type="datetime-local"
            value={toDateTimeLocal(quest.deadline)}
            onChange={(event) => onChange({ ...quest, deadline: fromDateTimeLocal(event.target.value) })}
          />
        </label>
        <label>
          Reward
          <input
            value={quest.reward.label}
            onChange={(event) => onChange({ ...quest, reward: { ...quest.reward, label: event.target.value } })}
          />
        </label>
      </div>
      <div className="review-field-row">
        <label>
          Campus
          <input
            value={quest.location.campus ?? ""}
            onChange={(event) => onChange({ ...quest, location: { ...quest.location, campus: event.target.value || undefined } })}
          />
        </label>
        <label>
          Building
          <input
            value={quest.location.building ?? quest.location.address ?? ""}
            onChange={(event) => onChange({ ...quest, location: { ...quest.location, building: event.target.value || undefined } })}
          />
        </label>
      </div>
      <div className="review-field-row">
        <label>
          Apply URL
          <input value={quest.applyUrl ?? ""} onChange={(event) => onChange({ ...quest, applyUrl: event.target.value || undefined })} />
        </label>
        <label>
          Contact
          <input value={quest.contactEmail ?? ""} onChange={(event) => onChange({ ...quest, contactEmail: event.target.value || undefined })} />
        </label>
      </div>
      <div className="review-field-row party-review-row">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={quest.party.allowed}
            onChange={(event) => onChange({ ...quest, party: { ...quest.party, allowed: event.target.checked } })}
          />
          Party-friendly
        </label>
        <label>
          Open slots
          <input
            type="number"
            min="0"
            value={quest.party.openSlots}
            onChange={(event) => onChange({ ...quest, party: { ...quest.party, openSlots: numberFromInput(event.target.value, quest.party.openSlots) } })}
          />
        </label>
      </div>
      <div>
        <span className="field-label">Tags</span>
        <div className="chip-row">
          {[...quest.interests, ...quest.skillsHelpful.slice(0, 4)].map((tag) => (
            <span className="soft-chip active" key={tag}>
              #{labelize(tag)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PartiesPage({
  quests,
  parties,
  students,
  currentUserId,
  onCreateParty,
  onTogglePrep,
  onSelectQuest
}: {
  quests: QuestCard[];
  parties: PersistedParty[];
  students: StudentProfile[];
  currentUserId: string;
  onCreateParty: (questId: string) => Promise<void>;
  onTogglePrep: (partyId: string, item: PrepPlanItem) => Promise<void>;
  onSelectQuest: (quest: QuestCard) => void;
}) {
  const [activeTab, setActiveTab] = useState<"my" | "browse">("my");
  const [creatingQuestId, setCreatingQuestId] = useState("");
  const partyQuests = quests.filter((quest) => quest.party.allowed);

  async function create(questId: string) {
    setCreatingQuestId(questId);
    try {
      await onCreateParty(questId);
      setActiveTab("my");
    } finally {
      setCreatingQuestId("");
    }
  }

  return (
    <section className="party-shell">
      <div className="section-header">
        <div>
          <h1>Quest Parties</h1>
          <p>Persisted teams with matched students, reasons, and prep plans.</p>
        </div>
      </div>
      <div className="party-tabs">
        <button className={activeTab === "my" ? "active" : ""} type="button" onClick={() => setActiveTab("my")}>
          My Parties
        </button>
        <button className={activeTab === "browse" ? "active" : ""} type="button" onClick={() => setActiveTab("browse")}>
          Find a Party
        </button>
      </div>

      {activeTab === "my" ? (
        <div className="party-card-list">
          {parties.length ? (
            parties.map((party) => (
              <PartyCard
                key={party.id}
                party={party}
                currentUserId={currentUserId}
                onSelectQuest={onSelectQuest}
                onTogglePrep={onTogglePrep}
              />
            ))
          ) : (
            <section className="empty-state">
              <Users size={32} />
              <h2>No party yet</h2>
              <p>Create one from the Find a Party tab.</p>
            </section>
          )}
        </div>
      ) : (
        <div className="browse-party-panel">
          <section className="smart-match-card">
            <div className="smart-icon">
              <Users size={30} />
            </div>
            <h2>Smart Party Matching</h2>
            <p>QuestBoard matches students by interests, availability, and complementary skills.</p>
          </section>
          <h3>Quests looking for parties</h3>
          {partyQuests.map((quest) => (
            <article className="party-listing-card" key={quest.id}>
              <button className="party-listing" type="button" onClick={() => onSelectQuest(quest)}>
                <img src={quest.imageUrl} alt="" />
                <span>
                  <strong>{quest.title}</strong>
                  <small>
                    {quest.party.idealSize} members - {labelize(quest.interests[0] ?? "Quest")}
                  </small>
                </span>
                <em>
                  <Users size={13} />
                  {quest.party.openSlots} open
                </em>
                <ChevronRight size={19} />
              </button>
              <button className="primary-button" type="button" disabled={creatingQuestId === quest.id} onClick={() => create(quest.id)}>
                {creatingQuestId === quest.id ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
                Create Party
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfilePage({
  quests,
  student,
  savedCount,
  partyCount,
  onSelectQuest
}: {
  quests: QuestCard[];
  student: StudentProfile;
  savedCount: number;
  partyCount: number;
  onSelectQuest: (quest: QuestCard) => void;
}) {
  const totalXp = 1240 + partyCount * 80 + savedCount * 12;
  const level = 7;
  const nextLevelXp = 200;
  const currentLevelXp = totalXp % nextLevelXp;
  const progress = Math.round((currentLevelXp / nextLevelXp) * 100);

  return (
    <section className="profile-shell">
      <div className="profile-hero">
        <div className="profile-avatar">
          <img src={student.avatarUrl} alt="" />
          <span>{level}</span>
        </div>
        <h1>{student.name}</h1>
        <p>{student.major}</p>
        <small>
          <MapPin size={13} />
          North Campus University
        </small>
      </div>

      <section className="xp-card">
        <div className="xp-heading">
          <span>
            <Zap size={20} />
            Level {level}
          </span>
          <small>
            {currentLevelXp}/{nextLevelXp} XP to next level
          </small>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="profile-stats">
          <div>
            <strong>{totalXp}</strong>
            <span>Total XP</span>
          </div>
          <div>
            <strong>{savedCount}</strong>
            <span>Saved</span>
          </div>
          <div>
            <strong>{partyCount}</strong>
            <span>Parties</span>
          </div>
        </div>
      </section>

      <ProfileSection title="Interests">
        <div className="chip-row">
          {student.interests.map((interest) => (
            <span className="soft-chip active" key={interest}>
              {labelize(interest)}
            </span>
          ))}
        </div>
      </ProfileSection>

      <ProfileSection title="Badges">
        <div className="badge-grid">
          {badgeItems.map((badge) => {
            const Icon = badge.icon;
            return (
              <div key={badge.label}>
                <span className={badge.className}>
                  <Icon size={25} />
                </span>
                <strong>{badge.label}</strong>
              </div>
            );
          })}
        </div>
      </ProfileSection>

      <ProfileSection title="Active Quests" aside={`${Math.min(quests.length, 3)} active`}>
        <div className="active-quest-list">
          {quests.slice(0, 3).map((quest) => (
            <button type="button" key={quest.id} onClick={() => onSelectQuest(quest)}>
              <img src={quest.imageUrl} alt="" />
              <span>
                <strong>{quest.title}</strong>
                <small>
                  {formatTimeCommitment(quest)}
                  <Zap size={13} />
                  {questXp(quest)}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      </ProfileSection>

      <section className="profile-menu">
        {profileMenu.map((item) => {
          const Icon = item.icon;
          const count = item.label === "Saved Quests" ? savedCount : item.label === "My Parties" ? partyCount : item.count;
          return (
            <button type="button" key={item.label}>
              <Icon size={20} />
              <span>{item.label}</span>
              {count !== undefined ? <em>{count}</em> : null}
              <ChevronRight size={17} />
            </button>
          );
        })}
      </section>
    </section>
  );
}

function QuestDetailPage({
  quest,
  student,
  saved,
  joined,
  match,
  matchMeta,
  onBack,
  onSave,
  onJoin,
  onParty,
  onUpdate,
  onDelete
}: {
  quest: QuestCard;
  student: StudentProfile;
  saved: boolean;
  joined: boolean;
  match?: QuestMatchBreakdown;
  matchMeta: MatchRecommendationMeta | null;
  onBack: () => void;
  onSave: () => void;
  onJoin: () => void;
  onParty: () => void;
  onUpdate: (quest: QuestCard) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(quest);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const matchScore = match?.total ?? scoreQuestForStudent(quest, student).total;
  const providerLabel = matchMeta?.provider === "azure" ? "Azure AI" : "Local";

  async function saveEdit() {
    setSaving(true);
    try {
      await onUpdate(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function removeQuest() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="quest-detail-page">
      <div className="detail-hero">
        <img src={quest.imageUrl} alt={quest.title} />
        <button className="floating-button back-button" type="button" onClick={onBack}>
          <ChevronRight size={21} />
        </button>
        <div className="detail-actions-top">
          <button className="floating-button" type="button" aria-label="Share quest">
            <Upload size={18} />
          </button>
          <button className="floating-button" type="button" onClick={onSave} aria-label="Save quest">
            {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
          </button>
        </div>
        <div className="hero-badge-row">
          <span className={difficultyClass(quest.difficulty)}>{difficultyLabel(quest.difficulty)}</span>
          <span className="glass-pill">{labelize(quest.interests[0] ?? "Quest")}</span>
          <span className="xp-float">
            <Zap size={15} />
            {questXp(quest)} XP
          </span>
        </div>
      </div>

      <div className="detail-content">
        {editing ? (
          <section className="review-card">
            <div className="review-title">
              <span>
                <FileText size={18} />
              </span>
              <h2>Edit published quest</h2>
            </div>
            <ReviewQuestForm quest={draft} onChange={setDraft} />
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
                Save Changes
              </button>
            </div>
          </section>
        ) : (
          <>
            <h1>{quest.title}</h1>
            <div className="posted-by">
              <img src={student.avatarUrl} alt="" />
              <span>
                <strong>{quest.organizer}</strong>
                Posted from {labelize(quest.source.type)}
              </span>
            </div>

            <div className="detail-info-grid">
              <InfoTile icon={CalendarDays} label="Deadline" value={formatDeadline(quest.deadline)} />
              <InfoTile icon={Clock3} label="Time" value={formatTimeCommitment(quest)} />
              <InfoTile icon={MapPin} label="Location" value={formatLocation(quest)} />
              <InfoTile icon={Award} label="Reward" value={quest.reward.label} />
            </div>

            <section className="detail-section">
              <h2>About this Quest</h2>
              <p>{quest.description}</p>
            </section>

            <section className="ai-detail-card">
              <InfoField label="Matcher" value={`${providerLabel}: ${matchScore}% fit`} />
              <InfoField label="Extraction" value={`${Math.round(quest.aiExtraction.confidence * 100)}% confidence`} />
              <InfoField label="Source" value={quest.source.fileName ?? quest.source.rawUrl ?? labelize(quest.source.type)} />
              <InfoField label="Missing" value={quest.aiExtraction.missingFields.length ? quest.aiExtraction.missingFields.map(labelize).join(", ") : "None"} />
            </section>

            <section className="best-for">
              <UserRound size={18} />
              <span>
                <strong>Best for</strong>
                {quest.bestFor.join(", ")}
              </span>
            </section>

            <div className="chip-row">
              {[...quest.interests, ...quest.skillsHelpful.slice(0, 4)].map((tag) => (
                <span className="soft-chip" key={tag}>
                  #{labelize(tag)}
                </span>
              ))}
            </div>

            <div className="social-proof">
              <span>
                <Heart size={17} />
                {quest.stats.views} interested
              </span>
              <span>
                <Users size={17} />
                {quest.stats.partyRequests} going
              </span>
              <span>
                <Bookmark size={17} />
                {quest.stats.saves}
              </span>
              <strong>{matchScore}% match</strong>
            </div>

            {quest.party.allowed ? (
              <button className="party-cta" type="button" onClick={onParty}>
                <span>
                  <Users size={22} />
                </span>
                <strong>Create a Quest Party</strong>
                <small>Get matched with {quest.party.idealSize} students and a prep plan</small>
                <ChevronRight size={20} />
              </button>
            ) : null}

            <div className="detail-admin-actions">
              <button className="secondary-button" type="button" onClick={() => setEditing(true)}>
                <FileText size={17} />
                Edit Quest
              </button>
              <button className="secondary-button danger-button" type="button" onClick={removeQuest} disabled={deleting}>
                {deleting ? <Loader2 className="spin" size={17} /> : <X size={17} />}
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      <div className="sticky-action-bar">
        <button className="primary-button" type="button" onClick={onJoin}>
          <Zap size={18} />
          {joined ? "Going" : "I'm Going"}
        </button>
        <button className="secondary-button" type="button" onClick={onSave}>
          {saved ? "Saved" : "Interested"}
        </button>
      </div>
    </section>
  );
}

function QuestGrid({
  quests,
  questMatches,
  savedQuestIds,
  onSave,
  onSelectQuest
}: {
  quests: QuestCard[];
  questMatches: Record<string, QuestMatchBreakdown>;
  savedQuestIds: Set<string>;
  onSave: (questId: string) => void;
  onSelectQuest: (quest: QuestCard) => void;
}) {
  if (!quests.length) {
    return (
      <section className="empty-state">
        <Search size={32} />
        <h2>No quests found</h2>
        <p>Try adjusting your filters.</p>
      </section>
    );
  }

  return (
    <div className="quest-grid">
      {quests.map((quest, index) => (
        <QuestCardView
          key={quest.id}
          quest={quest}
          index={index}
          matchScore={questMatches[quest.id]?.total ?? 0}
          saved={savedQuestIds.has(quest.id)}
          onSave={() => onSave(quest.id)}
          onSelect={() => onSelectQuest(quest)}
        />
      ))}
    </div>
  );
}

function QuestCardView({
  quest,
  index,
  matchScore,
  saved,
  onSave,
  onSelect
}: {
  quest: QuestCard;
  index: number;
  matchScore: number;
  saved: boolean;
  onSave: () => void;
  onSelect: () => void;
}) {
  const friendNames = ["Alex M.", "Priya S.", "Jordan L.", "Chris T.", "Zara N."];

  return (
    <article className="quest-card">
      <button className="quest-media" type="button" onClick={onSelect}>
        <img src={quest.imageUrl} alt="" />
        <span className={difficultyClass(quest.difficulty)}>{difficultyLabel(quest.difficulty)}</span>
        {quest.party.allowed ? (
          <span className="party-pill">
            <Users size={12} />
            Party
          </span>
        ) : null}
        <span className="category-label">{labelize(quest.interests[0] ?? "Quest")}</span>
        <span className="xp-chip">
          <Zap size={13} />
          {questXp(quest)} XP
        </span>
      </button>
      <button className={saved ? "save-fab saved" : "save-fab"} type="button" onClick={onSave} aria-label="Save quest">
        {saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
      </button>
      <div className="quest-body">
        <button className="quest-title-button" type="button" onClick={onSelect}>
          {quest.title}
        </button>
        <div className="quest-meta-line">
          <span>
            <Clock3 size={13} />
            {compactTime(quest)}
          </span>
          <span>
            <MapPin size={13} />
            {quest.organizer}
          </span>
        </div>
        <div className="card-footer">
          <span className="avatar-cluster">
            <i />
            <i />
            <i />
          </span>
          <small>
            {quest.stats.partyRequests + 20} going - {friendNames[index % friendNames.length]} +{Math.max(0, Math.round(matchScore / 30) - 1)}
          </small>
          <em>
            <Heart size={14} />
            {quest.stats.saves + quest.stats.views}
          </em>
        </div>
      </div>
    </article>
  );
}

function PartyCard({
  party,
  currentUserId,
  onSelectQuest,
  onTogglePrep
}: {
  party: PersistedParty;
  currentUserId: string;
  onSelectQuest: (quest: QuestCard) => void;
  onTogglePrep: (partyId: string, item: PrepPlanItem) => Promise<void>;
}) {
  return (
    <article className="party-card-large">
      <div className="party-header">
        <button type="button" onClick={() => onSelectQuest(party.quest)}>
          {party.quest.title}
        </button>
        <button className="chat-button" type="button">
          <MessageCircle size={15} />
          Chat
        </button>
      </div>
      <div className="party-status-row">
        <span className={party.status === "active" ? "status-ready" : "status-forming"}>{labelize(party.status)}</span>
        <small>{party.matchScore}% match</small>
      </div>
      <div className="party-reasons">
        {party.reasons.slice(0, 3).map((reason) => (
          <span key={reason}>
            <Sparkles size={13} />
            {reason}
          </span>
        ))}
      </div>
      <div className="party-members">
        {party.members.map((member, index) => (
          <div key={member.id}>
            <img src={member.avatarUrl} alt="" />
            <span>
              <strong>{member.id === currentUserId ? "You" : member.name}</strong>
              <small>{member.skills.slice(0, 2).map(labelize).join(" / ")}</small>
            </span>
            <em className={index < 2 || party.status === "active" ? "ready" : ""}>
              {index < 2 || party.status === "active" ? <Check size={14} /> : <Circle size={14} />}
            </em>
          </div>
        ))}
      </div>
      <div className="prep-plan-block">
        <h3>Prep Plan</h3>
        {party.prepPlan.map((item) => (
          <button className="prep-step prep-step-button" type="button" key={item.id} onClick={() => onTogglePrep(party.id, item)}>
            <span className={item.done ? "done" : ""}>{item.done ? <Check size={13} /> : null}</span>
            <p className={item.done ? "done" : ""}>
              {item.title}
              <small>Due {formatDeadline(item.dueAt)}</small>
            </p>
          </button>
        ))}
      </div>
    </article>
  );
}

function FilterRail({
  quickFilter,
  category,
  onQuickFilter,
  onCategory
}: {
  quickFilter: QuickFilter;
  category: string;
  onQuickFilter: (filter: QuickFilter) => void;
  onCategory: (filter: string) => void;
}) {
  return (
    <div className="filter-rail">
      <div className="chip-row">
        <Sparkles size={16} />
        {quickFilters.map((filter) => (
          <button
            className={quickFilter === filter ? "soft-chip active dark" : "soft-chip"}
            key={filter}
            type="button"
            onClick={() => onQuickFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="chip-row">
        <Flame size={16} />
        {browseFilters.map((filter) => (
          <button
            className={category === filter.value ? "soft-chip active dark" : "soft-chip"}
            key={filter.value}
            type="button"
            onClick={() => onCategory(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section>
      <h3>{label}</h3>
      <div className="chip-row">
        {options.map((option) => (
          <button
            className={value === option.value ? "soft-chip active dark" : "soft-chip"}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  detail
}: {
  icon: typeof Sparkles;
  tone: "violet" | "coral" | "mint";
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className={`stat-card ${tone}`}>
      <span>
        <Icon size={16} />
        {label}
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="info-tile">
      <span>
        <Icon size={17} />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function ProfileSection({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="profile-section">
      <div>
        <h2>{title}</h2>
        {aside ? <span>{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function filterAndSortQuests(
  quests: QuestCard[],
  questMatches: Record<string, QuestMatchBreakdown>,
  search: string,
  category: string,
  quickFilter: QuickFilter
) {
  const term = search.trim().toLowerCase();
  const filtered = quests.filter((quest) => {
    const searchable = [
      quest.title,
      quest.summary,
      quest.description,
      quest.organizer,
      formatLocation(quest),
      ...quest.interests,
      ...quest.skillsHelpful
    ]
      .join(" ")
      .toLowerCase();

    return (!term || searchable.includes(term)) && questMatchesCategory(quest, category);
  });

  return [...filtered].sort((a, b) => {
    if (quickFilter === "New") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (quickFilter === "Ending Soon") {
      return (
        new Date(a.deadline ?? "2099-01-01").getTime() -
        new Date(b.deadline ?? "2099-01-01").getTime()
      );
    }
    if (quickFilter === "Trending") return b.stats.views - a.stats.views;
    return (questMatches[b.id]?.total ?? 0) - (questMatches[a.id]?.total ?? 0);
  });
}

function questMatchesCategory(quest: QuestCard, category: string) {
  if (category === "all") return true;
  if (category === "networking") return quest.reward.type.includes("networking");
  return (
    quest.interests.includes(category as QuestCard["interests"][number]) ||
    quest.skillsHelpful.includes(category as QuestCard["skillsHelpful"][number])
  );
}

function difficultyLabel(difficulty: QuestCard["difficulty"]) {
  if (difficulty === "easy") return "Easy Apply";
  if (difficulty === "medium") return "Moderate";
  return "Competitive";
}

function difficultyClass(difficulty: QuestCard["difficulty"]) {
  if (difficulty === "easy") return "difficulty-badge easy";
  if (difficulty === "medium") return "difficulty-badge medium";
  return "difficulty-badge hard";
}

function questXp(quest: QuestCard) {
  const base = quest.difficulty === "hard" ? 300 : quest.difficulty === "medium" ? 180 : 90;
  const rewardBoost = quest.reward.estimatedValueUsd ? Math.round(quest.reward.estimatedValueUsd / 5) : 0;
  return Math.min(500, base + rewardBoost);
}

function compactTime(quest: QuestCard) {
  if (quest.estimatedHours.max <= 3) return "1-3 hours";
  if (quest.estimatedHours.max <= 8) return "Half day";
  if (quest.estimatedHours.max <= 12) return "Full day";
  return "10 weeks+";
}

function shortTitle(title: string) {
  const words = title.split(" ");
  return words.length > 2 ? words.slice(0, 2).join(" ") : title;
}

function sourceTypeForMethod(method: SubmitMethodId, file: File | null): QuestSourceType {
  if (method === "link") return "link";
  if (method === "text") return "text";
  if (method === "photo") return "photo";
  if (method === "screenshot") return "screenshot";
  if (file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file?.type.startsWith("image/")) return "poster";
  return "text";
}

function inputHeadingForMethod(method: SubmitMethodId) {
  if (method === "link") return "Paste the URL";
  if (method === "text") return "Paste the message";
  if (method === "photo") return "Upload your photo";
  if (method === "screenshot") return "Upload your image";
  return "Upload your file";
}

function toDateTimeLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function numberFromInput(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default App;
