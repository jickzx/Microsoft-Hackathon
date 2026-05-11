import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
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
import {
  daysUntil,
  formatDeadline,
  formatLocation,
  formatTimeCommitment,
  labelize
} from "./lib/format";
import { interestTags } from "./types";
import type {
  AzureConnectionHealth,
  DiscordIntegrationHealth,
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

type Page = "home" | "map" | "submit" | "parties" | "quests" | "saved" | "profile";
type AuthMode = "signup" | "login";
type QuickFilter = "Trending" | "New" | "Ending Soon" | "For You";
type SubmitMethodId = "link" | "photo" | "screenshot" | "text" | "file" | "discord";

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

interface AuthResponse {
  authenticated?: boolean;
  user: StudentProfile | null;
}

interface ExtractMetaWithSource extends ExtractQuestMeta {
  sourceId?: string;
}

interface IntegrationHealthResponse {
  discord: DiscordIntegrationHealth;
}

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
  { page: "home", label: "Discover", icon: Compass },
  { page: "map", label: "Map", icon: MapPin },
  { page: "submit", label: "Submit", icon: PlusCircle },
  { page: "parties", label: "Side Quest Parties", icon: Users },
  { page: "quests", label: "My Side Quests", icon: Award },
  { page: "saved", label: "Saved", icon: Bookmark },
  { page: "profile", label: "Profile", icon: UserRound }
];

const quickFilters: QuickFilter[] = ["Trending", "New", "Ending Soon", "For You"];

const browseFilters: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  ...interestTags.map((tag) => ({ value: tag, label: labelize(tag) })),
  { value: "internship", label: "Internship" },
  { value: "spring-week", label: "Spring Week" },
  { value: "grad-scheme", label: "Grad Scheme" }
];

const submitMethods: {
  id: SubmitMethodId;
  icon: typeof Globe2;
  label: string;
  detail?: string;
  requiresDiscord?: boolean;
}[] = [
  { id: "link", icon: Globe2, label: "Paste a Link" },
  { id: "discord", icon: MessageCircle, label: "Discord Message", detail: "Import by message link", requiresDiscord: true },
  { id: "photo", icon: Camera, label: "Take a Photo" },
  { id: "screenshot", icon: ImageIcon, label: "Upload Image" },
  { id: "text", icon: MessageCircle, label: "Paste Text" },
  { id: "file", icon: FileText, label: "Upload File" }
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const payload = data as {
      error?: string;
      details?: string[];
      errors?: { url?: string; error?: string }[];
    } | null;
    const sourceErrors = payload?.errors
      ?.map((item) => [item.url, item.error].filter(Boolean).join(": "))
      .filter(Boolean);
    throw new Error(
      payload?.details?.join(", ") ??
        sourceErrors?.join(", ") ??
        payload?.error ??
        "Request failed"
    );
  }
  return data as T;
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<StudentProfile | null>(null);
  const [quests, setQuests] = useState<QuestCard[]>([]);
  const [users, setUsers] = useState<StudentProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [activePage, setActivePage] = useState<Page>("home");
  const [selectedQuest, setSelectedQuest] = useState<QuestCard | null>(null);
  const [savedQuestIds, setSavedQuestIds] = useState<Set<string>>(() => new Set());
  const [joinedQuestIds, setJoinedQuestIds] = useState<Set<string>>(() => new Set());
  const [parties, setParties] = useState<PersistedParty[]>([]);
  const [azureHealth, setAzureHealth] = useState<AzureConnectionHealth | null>(null);
  const [discordHealth, setDiscordHealth] = useState<DiscordIntegrationHealth | null>(null);
  const [remoteMatches, setRemoteMatches] = useState<Record<string, QuestMatchBreakdown>>({});
  const [matchMeta, setMatchMeta] = useState<MatchRecommendationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [appError, setAppError] = useState("");
  const [importingSources, setImportingSources] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  const activeStudent = users.find((student) => student.id === currentUserId) ?? authUser;
  const questMatches = remoteMatches;

  async function refreshQuests() {
    const data = await fetchJson<{ quests: QuestCard[] }>("/api/quests");
    setQuests(data.quests);
    setSelectedQuest((current) =>
      current ? data.quests.find((quest) => quest.id === current.id) ?? null : null
    );
  }

  async function refreshUserState(userId = currentUserId) {
    if (!userId) return;
    const state = await fetchJson<UserState>(`/api/users/${userId}/state`);
    setSavedQuestIds(new Set(state.savedQuestIds));
    setJoinedQuestIds(new Set(state.joinedQuestIds));
    setParties(state.parties);
  }

  useEffect(() => {
    let active = true;
    fetchJson<AuthResponse>("/api/auth/me")
      .then((data) => {
        if (!active) return;
        setAuthUser(data.user);
        setCurrentUserId(data.user?.id ?? "");
      })
      .catch(() => {
        if (!active) return;
        setAuthUser(null);
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authUser) return undefined;

    let active = true;
    Promise.all([
      fetchJson<{ users: StudentProfile[]; currentUserId: string }>("/api/users"),
      fetchJson<{ quests: QuestCard[] }>("/api/quests"),
      fetchJson<AzureConnectionHealth>("/api/azure/health").catch(() => null),
      fetchJson<IntegrationHealthResponse>("/api/integrations").catch(() => null)
    ])
      .then(([userData, questData, health, integrations]) => {
        if (!active) return;
        setUsers(userData.users);
        setCurrentUserId(userData.currentUserId);
        setQuests(questData.quests);
        setAzureHealth(health);
        setDiscordHealth(integrations?.discord ?? null);
      })
      .catch((error) => {
        if (!active) return;
        setUsers([authUser]);
        setQuests([]);
        setAppError(error instanceof Error ? error.message : "Unable to load database-backed app data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;

    fetchJson<UserState>(`/api/users/${currentUserId}/state`)
      .then((state) => {
        if (!active) return;
        setSavedQuestIds(new Set(state.savedQuestIds));
        setJoinedQuestIds(new Set(state.joinedQuestIds));
        setParties(state.parties);
      })
      .catch((error) => {
        if (!active) return;
        setAppError(error instanceof Error ? error.message : "Unable to load user state.");
        setJoinedQuestIds(new Set());
        setParties([]);
      });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || !quests.length) return undefined;
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
        setAppError((current) =>
          current === "Azure matching is unavailable. Recommendations will appear once Azure responds."
            ? ""
            : current
        );
      })
      .catch(() => {
        if (!active) return;
        setRemoteMatches({});
        setMatchMeta(null);
        setAppError("Recommendations are temporarily unavailable. Try again in a moment.");
      });

    return () => {
      active = false;
    };
  }, [currentUserId, quests]);

  function handleAuth(user: StudentProfile) {
    setAuthUser(user);
    setCurrentUserId(user.id);
    setUsers((current) => [user, ...current.filter((student) => student.id !== user.id)]);
    setActivePage("home");
    setSelectedQuest(null);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setCurrentUserId("");
    setUsers([]);
    setQuests([]);
    setRemoteMatches({});
    setMatchMeta(null);
    setSavedQuestIds(new Set());
    setJoinedQuestIds(new Set());
    setParties([]);
    setSelectedQuest(null);
  }

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

  async function importVerifiedSources() {
    setImportingSources(true);
    setAppError("");
    try {
      const result = await fetchJson<{ cards: QuestCard[]; errors: { url: string; error: string }[] }>(
        "/api/sources/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        }
      );
      await refreshQuests();
      if (result.errors.length) {
        setAppError(
          `Imported ${result.cards.length} verified source${result.cards.length === 1 ? "" : "s"}; ${result.errors.length} source${result.errors.length === 1 ? "" : "s"} need review.`
        );
      }
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Unable to import verified sources.");
    } finally {
      setImportingSources(false);
    }
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

  if (!authChecked) {
    return <LoadingScreen />;
  }

  if (!authUser || !activeStudent) {
    return <AuthPage onAuthenticated={handleAuth} />;
  }

  const page = selectedQuest ? (
    <QuestDetailPage
      key={selectedQuest.id}
      quest={selectedQuest}
      student={activeStudent}
      saved={savedQuestIds.has(selectedQuest.id)}
      joined={joinedQuestIds.has(selectedQuest.id)}
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
          matchReady={Boolean(matchMeta)}
          loading={loading}
          importingSources={importingSources}
          searchSeed={globalSearch}
          onSave={toggleSaved}
          onSelectQuest={setSelectedQuest}
          onExplore={() => showPage("map")}
          onImportSources={importVerifiedSources}
        />
      ) : null}
      {activePage === "map" ? (
        <ExplorePage
          quests={quests}
          questMatches={questMatches}
          savedQuestIds={savedQuestIds}
          importingSources={importingSources}
          title="Map"
          subtitle="Search by campus, organiser, or nearby deadline."
          searchSeed={globalSearch}
          emptyCopy="No mapped events match those filters yet."
          onSave={toggleSaved}
          onSelectQuest={setSelectedQuest}
          onImportSources={importVerifiedSources}
        />
      ) : null}
      {activePage === "submit" ? (
        <SubmitQuestPage azureHealth={azureHealth} discordHealth={discordHealth} onPublish={publishQuest} />
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
      {activePage === "quests" ? (
        <ExplorePage
          quests={quests.filter((quest) => joinedQuestIds.has(quest.id))}
          questMatches={questMatches}
          savedQuestIds={savedQuestIds}
          importingSources={importingSources}
          title="My Side Quests"
          subtitle="Events you have joined or plan to attend."
          searchSeed={globalSearch}
          emptyCopy="Join an event from Discover to build your side quest list."
          onSave={toggleSaved}
          onSelectQuest={setSelectedQuest}
          onImportSources={importVerifiedSources}
        />
      ) : null}
      {activePage === "saved" ? (
        <ExplorePage
          quests={quests.filter((quest) => savedQuestIds.has(quest.id))}
          questMatches={questMatches}
          savedQuestIds={savedQuestIds}
          importingSources={importingSources}
          title="Saved"
          subtitle="Your shortlist for fast follow-up."
          searchSeed={globalSearch}
          emptyCopy="Save events from Discover to keep them here."
          onSave={toggleSaved}
          onSelectQuest={setSelectedQuest}
          onImportSources={importVerifiedSources}
        />
      ) : null}
      {activePage === "profile" ? (
        <ProfilePage
          quests={quests}
          student={activeStudent}
          savedCount={savedQuestIds.size}
          partyCount={parties.length}
          discordHealth={discordHealth}
          onSelectQuest={setSelectedQuest}
        />
      ) : null}
    </>
  );

  return (
    <div className="app-frame">
      <TopNav
        activePage={activePage}
        user={activeStudent}
        onNavigate={showPage}
        onLogout={logout}
      />
      <main className="app-main">
        <WorkspaceBar
          user={activeStudent}
          search={globalSearch}
          onSearchChange={setGlobalSearch}
          onSearchSubmit={() => showPage("home")}
        />
        {appError ? <AppBanner message={appError} /> : null}
        {page}
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Loader2 className="spin" size={28} />
      <strong>Loading Side Quest</strong>
    </main>
  );
}

function AppBanner({ message }: { message: string }) {
  return (
    <div className="app-banner" role="status">
      <Sparkles size={16} />
      <span>{message}</span>
    </div>
  );
}

function AuthPage({
  onAuthenticated
}: {
  onAuthenticated: (user: StudentProfile) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [profile, setProfile] = useState<SignupProfile>(signupInitialProfile);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const completedCount = requiredSignupFields.filter(({ key }) => profile[key].trim()).length;
  const completion = Math.round((completedCount / requiredSignupFields.length) * 100);

  function updateField(field: keyof SignupProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missingField = requiredSignupFields.find(({ key }) => !profile[key].trim());
    if (missingField) {
      setError(`${missingField.label} is required.`);
      return;
    }
    if (!email.trim() || password.length < 8) {
      setError("Use a valid email and a password with at least 8 characters.");
      return;
    }

    const cleanProfile = trimSignupProfile(profile);
    setSubmitting(true);
    setError("");
    try {
      const data = await fetchJson<{ user: StudentProfile }>("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: cleanProfile.name,
          role: cleanProfile.role,
          workExperience: cleanProfile.workExperience,
          highestEducation: cleanProfile.education,
          major: cleanProfile.courseOrJobTitle || "Undeclared",
          year: deriveYearFromEducation(cleanProfile.education),
          careerInterest: cleanProfile.careerInterest,
          skills: cleanProfile.skills,
          goals: cleanProfile.goals,
          hobbies: cleanProfile.hobbies
        })
      });
      onAuthenticated(data.user);
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Signup failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const data = await fetchJson<{ user: StudentProfile }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      });
      onAuthenticated(data.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Side Quest welcome">
        <div className="auth-brandline">
          <span className="brand-mark">
            <Compass size={18} />
          </span>
          <strong>Side Quest</strong>
        </div>
        <div className="auth-visual-copy">
          <h1>Side Quest</h1>
        </div>
        <div className="auth-profile-preview">
          <div>
            <Sparkles size={18} />
            <span>{completion}% profile</span>
          </div>
          <div className="auth-progress-track">
            <span style={{ width: `${completion}%` }} />
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-toggle" aria-label="Authentication mode">
          <button
            className={mode === "signup" ? "active" : ""}
            type="button"
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            onClick={() => setMode("login")}
          >
            Log in
          </button>
        </div>

        <div className="auth-panel-header">
          <span>
            Secure account
            <ChevronRight size={15} />
          </span>
          <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        </div>

        {mode === "login" ? (
          <form className="login-panel" onSubmit={submitLogin}>
            <div className="login-avatar">
              <UserRound size={30} />
            </div>
            <h3>Welcome back</h3>
            <AuthField icon={MessageCircle} label="Email" wide>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </AuthField>
            <AuthField icon={Settings} label="Password" wide>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                placeholder="Password"
                autoComplete="current-password"
                required
              />
            </AuthField>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="spin" size={17} /> : <ChevronRight size={17} />}
              Continue
            </button>
          </form>
        ) : (
          <form className="signup-form" onSubmit={submitSignup}>
            <div className="auth-form-grid">
              <AuthField icon={MessageCircle} label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </AuthField>
              <AuthField icon={Settings} label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </AuthField>
              <AuthField icon={UserRound} label="Name">
                <input
                  value={profile.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </AuthField>
              <AuthField icon={Users} label="Role">
                <select
                  value={profile.role}
                  onChange={(event) => updateField("role", event.target.value)}
                  required
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </AuthField>
              <AuthField icon={Trophy} label="Work experience">
                <select
                  value={profile.workExperience}
                  onChange={(event) => updateField("workExperience", event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select experience
                  </option>
                  {workExperienceOptions.map((experience) => (
                    <option key={experience} value={experience}>
                      {experience}
                    </option>
                  ))}
                </select>
              </AuthField>
              <AuthField icon={Award} label="Highest level of education">
                <select
                  value={profile.education}
                  onChange={(event) => updateField("education", event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select education
                  </option>
                  {educationOptions.map((education) => (
                    <option key={education} value={education}>
                      {education}
                    </option>
                  ))}
                </select>
              </AuthField>
              <AuthField icon={FileText} label="Course or job title">
                <input
                  value={profile.courseOrJobTitle}
                  onChange={(event) => updateField("courseOrJobTitle", event.target.value)}
                  placeholder="Computer Science, UX intern..."
                  required
                />
              </AuthField>
              <AuthField icon={Compass} label="Career interest" wide>
                <textarea
                  value={profile.careerInterest}
                  onChange={(event) => updateField("careerInterest", event.target.value)}
                  placeholder="AI product, finance, climate tech..."
                  required
                />
              </AuthField>
              <AuthField icon={Zap} label="Skills" wide>
                <textarea
                  value={profile.skills}
                  onChange={(event) => updateField("skills", event.target.value)}
                  placeholder="Coding, design, data, public speaking..."
                  required
                />
              </AuthField>
              <AuthField icon={Star} label="Goals" wide>
                <textarea
                  value={profile.goals}
                  onChange={(event) => updateField("goals", event.target.value)}
                  placeholder="Find teammates, build ML skills, ship a portfolio project..."
                  required
                />
              </AuthField>
              <AuthField icon={Heart} label="Hobbies" wide>
                <textarea
                  value={profile.hobbies}
                  onChange={(event) => updateField("hobbies", event.target.value)}
                  placeholder="Gaming, writing, volunteering, photography..."
                  required
                />
              </AuthField>
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="auth-actions">
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
                Create Profile
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function AuthField({
  icon: Icon,
  label,
  children,
  wide
}: {
  icon: typeof UserRound;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "auth-field wide" : "auth-field"}>
      <span>
        <Icon size={16} />
        {label}
      </span>
      {children}
    </label>
  );
}

function TopNav({
  activePage,
  user,
  onNavigate,
  onLogout
}: {
  activePage: Page;
  user: StudentProfile;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark">
          <Compass size={18} />
        </span>
        <strong>Side Quest</strong>
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
        <span className="student-select">{user.name}</span>
        <img src={user.avatarUrl} alt={`${user.name} avatar`} />
        <button className="secondary-button topbar-logout" type="button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}

function WorkspaceBar({
  user,
  search,
  onSearchChange,
  onSearchSubmit
}: {
  user: StudentProfile;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit();
  }

  return (
    <section
      className="home-header"
      style={{
        width: "min(1240px, calc(100% - 56px))",
        margin: "0 auto",
        padding: "22px 0 0"
      }}
    >
      <form
        className="wide-search"
        role="search"
        onSubmit={submit}
        style={{ flex: "1 1 520px", marginBottom: 0 }}
      >
        <Search size={17} />
        <input
          aria-label="Search events"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Find events, internships, societies, venues..."
        />
        {search ? (
          <button type="button" onClick={() => onSearchChange("")} aria-label="Clear search">
            <X size={16} />
          </button>
        ) : null}
      </form>
      <div className="profile-actions" style={{ flex: "0 0 auto" }}>
        <span className="student-select">North Campus University</span>
        <button className="icon-button alert-dot" type="button" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <img src={user.avatarUrl} alt={`${user.name} avatar`} />
      </div>
    </section>
  );
}

function HomePage({
  quests,
  student,
  questMatches,
  savedQuestIds,
  matchReady,
  loading,
  importingSources,
  searchSeed,
  onSave,
  onSelectQuest,
  onExplore,
  onImportSources
}: {
  quests: QuestCard[];
  student: StudentProfile;
  questMatches: Record<string, QuestMatchBreakdown>;
  savedQuestIds: Set<string>;
  matchReady: boolean;
  loading: boolean;
  importingSources: boolean;
  searchSeed: string;
  onSave: (questId: string) => void;
  onSelectQuest: (quest: QuestCard) => void;
  onExplore: () => void;
  onImportSources: () => void;
}) {
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
  const picked = [...filteredQuests].sort((a, b) => (questMatches[b.id]?.total ?? 0) - (questMatches[a.id]?.total ?? 0))[0];
  const friendsJoining = filteredQuests
    .filter((quest) => quest.stats.partyRequests > 0)
    .slice(0, 3);
  const upcomingDeadlines = [...filteredQuests]
    .filter((quest) => daysUntil(quest.deadline) !== null)
    .sort((a, b) => new Date(a.deadline ?? "2099-01-01").getTime() - new Date(b.deadline ?? "2099-01-01").getTime())
    .slice(0, 3);
  const partyIdea = filteredQuests.find((quest) => quest.party.allowed) ?? filteredQuests[0];
  const mapQuest = filteredQuests[0] ?? quests[0];

  useEffect(() => {
    if (!searchSeed) return;
    const handle = window.setTimeout(() => setSearch(searchSeed), 0);
    return () => window.clearTimeout(handle);
  }, [searchSeed]);

  return (
    <section className="page-shell">
      <div className="home-header">
        <div>
          <h1>Discover events fast</h1>
          <p>{loading ? "Loading quests..." : `${quests.length} live opportunities for ${student.name.split(" ")[0]}`}</p>
        </div>
        <div className="home-actions">
          <button className="secondary-button" type="button" onClick={onImportSources} disabled={importingSources}>
            {importingSources ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            Import Sources
          </button>
        </div>
      </div>

      <div className="wide-search" role="search">
        <Search size={17} />
        <input
          aria-label="Search side quests"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search events, internships, organisers, venues..."
        />
        {search ? (
          <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="stat-grid">
        <StatCard
          icon={Sparkles}
          tone="violet"
          label={matchReady ? "Matches" : "Recommendations"}
          value={recommendedCount}
          detail="recommended"
        />
        <StatCard
          icon={Flame}
          tone="coral"
          label="Hot"
          value={hotQuest ? shortTitle(hotQuest.title) : "Side Quest"}
          detail={`${hotQuest?.stats.views ?? 0} interested`}
        />
        <StatCard icon={Clock3} tone="mint" label="Closing" value={closingCount} detail="this week" />
        <RightRailBlock title="Picked for you" icon={Sparkles}>
          <button className="text-button" type="button" onClick={() => picked && onSelectQuest(picked)}>
            {picked ? picked.title : "Recommendations pending"}
            <ChevronRight size={16} />
          </button>
          <small>{picked ? `${questMatches[picked.id]?.total ?? 0}% match` : "Import events to unlock matches"}</small>
        </RightRailBlock>
        <RightRailBlock title="Friends joining" icon={Users}>
          {friendsJoining.map((quest) => (
            <button className="text-button" type="button" key={quest.id} onClick={() => onSelectQuest(quest)}>
              {shortTitle(quest.title)} <small>{quest.stats.partyRequests + 20} going</small>
            </button>
          ))}
        </RightRailBlock>
        <RightRailBlock title="Upcoming deadlines" icon={CalendarDays}>
          {upcomingDeadlines.map((quest) => (
            <button className="text-button" type="button" key={quest.id} onClick={() => onSelectQuest(quest)}>
              {shortTitle(quest.title)} <small>{formatDeadline(quest.deadline)}</small>
            </button>
          ))}
        </RightRailBlock>
        <RightRailBlock title="Mini map" icon={MapPin}>
          <strong>{mapQuest ? formatLocation(mapQuest) : "Campus map"}</strong>
          <small>{filteredQuests.length} events visible from your filters</small>
        </RightRailBlock>
        <RightRailBlock title="Party idea" icon={Users}>
          <button className="text-button" type="button" onClick={() => partyIdea && onSelectQuest(partyIdea)}>
            {partyIdea ? partyIdea.title : "No party-ready event yet"}
            <ChevronRight size={16} />
          </button>
          <small>{partyIdea ? `${partyIdea.party.openSlots} open slots` : "Try importing source links"}</small>
        </RightRailBlock>
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

function RightRailBlock({
  title,
  icon: Icon,
  children
}: {
  title: string;
  icon: typeof Sparkles;
  children: ReactNode;
}) {
  return (
    <article className="right-rail-block">
      <span>
        <Icon size={16} />
        {title}
      </span>
      {children}
    </article>
  );
}

function ExplorePage({
  quests,
  questMatches,
  savedQuestIds,
  importingSources,
  title = "Map",
  subtitle = "Search and filter the event board.",
  searchSeed,
  emptyCopy = "Try adjusting your filters.",
  onSave,
  onSelectQuest,
  onImportSources
}: {
  quests: QuestCard[];
  questMatches: Record<string, QuestMatchBreakdown>;
  savedQuestIds: Set<string>;
  importingSources: boolean;
  title?: string;
  subtitle?: string;
  searchSeed: string;
  emptyCopy?: string;
  onSave: (questId: string) => void;
  onSelectQuest: (quest: QuestCard) => void;
  onImportSources: () => void;
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

  useEffect(() => {
    if (!searchSeed) return;
    const handle = window.setTimeout(() => setSearch(searchSeed), 0);
    return () => window.clearTimeout(handle);
  }, [searchSeed]);

  return (
    <section className="page-shell">
      <div className="section-header">
        <div>
          <h1>{title}</h1>
          <p>{subtitle} {filtered.length} quests available.</p>
        </div>
        <div className="home-actions">
          <button className="secondary-button" type="button" onClick={onImportSources} disabled={importingSources}>
            {importingSources ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            Import Sources
          </button>
          <button className="icon-button" type="button" aria-label="Grid view">
            <Grid3X3 size={18} />
          </button>
        </div>
      </div>

      <div className="wide-search explore-search" role="search">
        <Search size={17} />
        <input
          aria-label="Search side quests"
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
        emptyCopy={emptyCopy}
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
  discordHealth,
  onPublish
}: {
  azureHealth: AzureConnectionHealth | null;
  discordHealth: DiscordIntegrationHealth | null;
  onPublish: (quest: QuestCard) => void | Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<SubmitMethodId | null>(null);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [extracted, setExtracted] = useState<QuestCard | null>(null);
  const [publishedCards, setPublishedCards] = useState<QuestCard[]>([]);
  const [error, setError] = useState("");

  const canProcess = Boolean(
    method && (method === "link" || method === "text" || method === "discord" ? input.trim() : file)
  );
  const azureReady = azureHealth?.status === "ready";
  const discordReady = discordHealth?.status === "ready";

  async function handleExtract() {
    if (!method || !canProcess) return;
    setProcessing(true);
    setError("");

    const body = new FormData();
    const sourceType = sourceTypeForMethod(method, file);
    body.append("sourceType", sourceType);
    if (method === "link" || method === "discord") body.append("url", input.trim());
    if (method === "text") body.append("text", input.trim());
    if (method !== "link" && method !== "text" && input.trim()) body.append("url", input.trim());
    if (file) body.append("file", file);

    try {
      const data = await fetchJson<ExtractQuestResponse>("/api/quests/import", { method: "POST", body });
      if (!data.cards?.[0]) throw new Error("Extraction returned no side quest cards");
      setPublishedCards(data.cards);
      setExtracted(data.cards[0]);
      for (const card of data.cards) {
        await onPublish(card);
      }
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
      setExtracted(data.quest);
      setPublishedCards((current) => current.map((quest) => (quest.id === data.quest.id ? data.quest : quest)));
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
          <h1>Submit a Side Quest</h1>
        </div>
      </div>

      <div className="integration-health-grid">
        <section className={azureReady ? "ai-status-card ready" : "ai-status-card"}>
          <Sparkles size={18} />
          <span>
            <strong>{azureReady ? "Import ready" : "Import unavailable"}</strong>
          </span>
        </section>
        <section className={discordReady ? "ai-status-card ready discord" : "ai-status-card discord"}>
          <MessageCircle size={18} />
          <span>
            <strong>{discordReady ? "Discord ready" : "Discord unavailable"}</strong>
          </span>
        </section>
      </div>

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
              const disabled = item.requiresDiscord && !discordReady;
              return (
                <button
                  type="button"
                  key={item.id}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    setMethod(item.id);
                    setStep(2);
                    setInput("");
                    setFile(null);
                    setExtracted(null);
                    setPublishedCards([]);
                    setError("");
                  }}
                >
                  <span>
                    <Icon size={21} />
                  </span>
                  <strong>{item.label}</strong>
                  {item.detail || item.requiresDiscord ? (
                    <small>{item.requiresDiscord ? (discordReady ? item.detail : "Connect Discord first") : item.detail}</small>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === 2 && method ? (
        <section className="input-panel">
          <h2>{inputHeadingForMethod(method)}</h2>
          {method === "link" || method === "discord" ? (
            <>
              <label className="large-input">
                {method === "discord" ? <MessageCircle size={18} /> : <Link2 size={18} />}
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={method === "discord" ? "https://discord.com/channels/..." : "https://..."}
                />
              </label>
            </>
          ) : null}
          {method === "text" ? (
            <textarea
              className="large-textarea"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste the side quest details..."
              rows={7}
            />
          ) : null}
          {method !== "link" && method !== "text" && method !== "discord" ? (
            <>
              <label className="upload-drop">
                <Upload size={34} />
                <strong>{file ? file.name : "Drop your file here"}</strong>
                <span>{file ? `${Math.round(file.size / 1024)} KB selected` : "or click to browse"}</span>
                <input
                  type="file"
                  accept={method === "file" ? ".pdf,.txt,.doc,.docx,image/*" : "image/*"}
                  capture={method === "photo" ? "environment" : undefined}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="large-input">
                <Link2 size={18} />
                <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Optional source URL" />
              </label>
            </>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="primary-button" type="button" onClick={handleExtract} disabled={!canProcess || processing}>
              {processing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              {processing ? "Adding..." : "Add to Marketplace"}
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
            <h2>Added to Marketplace</h2>
          </div>
          {publishedCards.length > 1 ? <p className="helper-text">{publishedCards.length} side quests were published from this source.</p> : null}
          <ReviewQuestForm quest={extracted} onChange={setExtracted} />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => setStep(2)}>
              Re-extract
            </button>
            <button className="primary-button publish-button" type="button" onClick={handlePublish} disabled={publishing}>
              {publishing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              Save Marketplace Changes
            </button>
          </div>
        </section>
      ) : null}
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
          <h1>Side Quest Parties</h1>
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
          <h3>Side quests looking for parties</h3>
          {partyQuests.map((quest) => (
            <article className="party-listing-card" key={quest.id}>
              <button className="party-listing" type="button" onClick={() => onSelectQuest(quest)}>
                <img src={quest.imageUrl} alt="" />
                <span>
                  <strong>{quest.title}</strong>
                  <small>
                    {quest.party.idealSize} members - {labelize(quest.interests[0] ?? "Side Quest")}
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
  discordHealth,
  onSelectQuest
}: {
  quests: QuestCard[];
  student: StudentProfile;
  savedCount: number;
  partyCount: number;
  discordHealth: DiscordIntegrationHealth | null;
  onSelectQuest: (quest: QuestCard) => void;
}) {
  return (
    <section className="profile-shell">
      <div className="profile-hero">
        <div className="profile-avatar">
          <img src={student.avatarUrl} alt="" />
        </div>
        <h1>{student.name}</h1>
        <p>{student.major}</p>
      </div>

      <section className="profile-summary-card">
        <div className="profile-stats">
          <div>
            <strong>{savedCount}</strong>
            <span>Saved</span>
          </div>
          <div>
            <strong>{partyCount}</strong>
            <span>Parties</span>
          </div>
          <div>
            <strong>{Math.min(quests.length, 3)}</strong>
            <span>Active</span>
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

      <ProfileSection title="Skills">
        <div className="chip-row">
          {student.skills.map((skill) => (
            <span className="soft-chip" key={skill}>
              {labelize(skill)}
            </span>
          ))}
        </div>
      </ProfileSection>

      <ProfileSection title="Integrations" aside={discordHealth?.status === "ready" ? "1 ready" : "needs setup"}>
        <div className="integration-grid">
          <IntegrationCard
            icon={MessageCircle}
            name="Discord"
            status={discordHealth?.status ?? "unknown"}
            detail={discordHealth?.detail ?? "Discord status has not loaded yet."}
          />
        </div>
      </ProfileSection>

      <ProfileSection title="Active Side Quests" aside={`${Math.min(quests.length, 3)} active`}>
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

    </section>
  );
}

function IntegrationCard({
  icon: Icon,
  name,
  status,
  detail
}: {
  icon: typeof MessageCircle;
  name: string;
  status: DiscordIntegrationHealth["status"] | "unknown";
  detail: string;
}) {
  const ready = status === "ready";
  return (
    <article className={ready ? "integration-card ready" : "integration-card"}>
      <span className="integration-icon">
        <Icon size={20} />
      </span>
      <div>
        <strong>{name}</strong>
        <small>{detail}</small>
      </div>
      <em className={ready ? "integration-status ready" : "integration-status"}>
        {ready ? "Ready" : "Setup"}
      </em>
    </article>
  );
}

function QuestDetailPage({
  quest,
  student,
  saved,
  joined,
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
        <button className="floating-button back-button" type="button" onClick={onBack} aria-label="Back">
          <ChevronRight size={21} />
        </button>
        <div className="detail-actions-top">
          <button className="floating-button" type="button" aria-label="Share side quest">
            <Upload size={18} />
          </button>
          <button className="floating-button" type="button" onClick={onSave} aria-label="Save side quest">
            {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
          </button>
        </div>
        <div className="hero-badge-row">
          <span className={difficultyClass(quest.difficulty)}>{difficultyLabel(quest.difficulty)}</span>
          <span className="glass-pill">{labelize(quest.interests[0] ?? "Side Quest")}</span>
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
              <h2>Edit published side quest</h2>
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
              </span>
            </div>

            <div className="detail-info-grid">
              <InfoTile icon={CalendarDays} label="Deadline" value={formatDeadline(quest.deadline)} />
              <InfoTile icon={Clock3} label="Time" value={formatTimeCommitment(quest)} />
              <InfoTile icon={MapPin} label="Location" value={formatLocation(quest)} />
              <InfoTile icon={Award} label="Reward" value={quest.reward.label} />
            </div>

            <section className="detail-section">
              <h2>About this Side Quest</h2>
              <p>{quest.description}</p>
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
            </div>

            {quest.party.allowed ? (
              <button className="party-cta" type="button" onClick={onParty}>
                <span>
                  <Users size={22} />
                </span>
                <strong>Create Party</strong>
                <small>{quest.party.idealSize} members</small>
                <ChevronRight size={20} />
              </button>
            ) : null}

            <div className="detail-admin-actions">
              <button className="secondary-button" type="button" onClick={() => setEditing(true)}>
                <FileText size={17} />
                Edit Side Quest
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
  emptyCopy = "Try adjusting your filters.",
  questMatches = {},
  savedQuestIds,
  onSave,
  onSelectQuest
}: {
  quests: QuestCard[];
  emptyCopy?: string;
  questMatches?: Record<string, QuestMatchBreakdown>;
  savedQuestIds: Set<string>;
  onSave: (questId: string) => void;
  onSelectQuest: (quest: QuestCard) => void;
}) {
  if (!quests.length) {
    return (
      <section className="empty-state">
        <Search size={32} />
        <h2>No side quests found</h2>
        <p>{emptyCopy}</p>
      </section>
    );
  }

  return (
    <div className="quest-grid">
      {quests.map((quest) => (
        <QuestCardView
          key={quest.id}
          quest={quest}
          match={questMatches[quest.id]}
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
  match,
  saved,
  onSave,
  onSelect
}: {
  quest: QuestCard;
  match?: QuestMatchBreakdown;
  saved: boolean;
  onSave: () => void;
  onSelect: () => void;
}) {
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
        <span className="category-label">{labelize(quest.interests[0] ?? "Side Quest")}</span>
        <span className="xp-chip">
          <Zap size={13} />
          {questXp(quest)} XP
        </span>
      </button>
      <button className={saved ? "save-fab saved" : "save-fab"} type="button" onClick={onSave} aria-label="Save side quest">
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
          <small>{match ? `${match.total}% match` : `${quest.stats.partyRequests} going`}</small>
          <em>
            <Heart size={14} />
            {quest.stats.saves}
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

function trimSignupProfile(profile: SignupProfile): SignupProfile {
  return {
    name: profile.name.trim(),
    role: profile.role.trim(),
    workExperience: profile.workExperience.trim(),
    education: profile.education.trim(),
    courseOrJobTitle: profile.courseOrJobTitle.trim(),
    careerInterest: profile.careerInterest.trim(),
    skills: profile.skills.trim(),
    goals: profile.goals.trim(),
    hobbies: profile.hobbies.trim()
  };
}

function deriveYearFromEducation(education: string): StudentProfile["year"] {
  const value = education.toLowerCase();
  if (value.includes("phd")) return "phd";
  if (value.includes("master")) return "masters";
  if (value.includes("bachelor")) return "senior";
  if (value.includes("undergraduate")) return "sophomore";
  return "freshman";
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
  if (method === "discord") return "message";
  if (method === "text") return "text";
  if (method === "photo") return "photo";
  if (method === "screenshot") return "screenshot";
  if (file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file?.type.startsWith("image/")) return "poster";
  return "text";
}

function inputHeadingForMethod(method: SubmitMethodId) {
  if (method === "link") return "Paste the URL";
  if (method === "discord") return "Paste the Discord message link";
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
