import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
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
import { currentStudent, seedQuests, students } from "./data/seed";
import { daysUntil, formatDeadline, formatLocation, formatTimeCommitment, labelize } from "./lib/format";
import { recommendParties, scoreQuestForStudent } from "./lib/matching";
import type {
  ExtractQuestResponse,
  PartyCandidateScore,
  QuestCard,
  QuestSourceType,
  StudentProfile
} from "./types";

type Page = "home" | "explore" | "submit" | "parties" | "profile";
type QuickFilter = "Trending" | "New" | "Ending Soon" | "For You";
type SubmitMethodId = "link" | "photo" | "screenshot" | "text" | "file";

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
  { id: "link", icon: Globe2, label: "Paste a Link", description: "URL from any website" },
  { id: "photo", icon: Camera, label: "Take a Photo", description: "Poster, noticeboard, flyer" },
  { id: "screenshot", icon: ImageIcon, label: "Upload Image", description: "Screenshot or photo" },
  { id: "text", icon: MessageCircle, label: "Paste Text", description: "WhatsApp, email, etc." },
  { id: "file", icon: FileText, label: "Upload File", description: "PDF, doc, or email" }
];

const badgeItems = [
  { icon: Star, label: "Early Adopter", className: "badge-gold" },
  { icon: Users, label: "Team Player", className: "badge-blue" },
  { icon: Flame, label: "Night Owl", className: "badge-violet" },
  { icon: Trophy, label: "Hackathon Hero", className: "badge-green" }
];

const profileMenu = [
  { icon: Bookmark, label: "Saved Quests", count: 8 },
  { icon: History, label: "Quest History", count: 12 },
  { icon: Users, label: "My Parties", count: 2 },
  { icon: Settings, label: "Settings" }
];

function App() {
  const [quests, setQuests] = useState<QuestCard[]>(seedQuests);
  const [activePage, setActivePage] = useState<Page>("home");
  const [selectedQuest, setSelectedQuest] = useState<QuestCard | null>(null);
  const [savedQuestIds, setSavedQuestIds] = useState(() => new Set<string>(["quest-001", "quest-007"]));

  useEffect(() => {
    fetch("/api/quests")
      .then((response) => response.json())
      .then((data: { quests?: QuestCard[] }) => {
        if (data.quests?.length) setQuests(data.quests);
      })
      .catch(() => setQuests(seedQuests));
  }, []);

  const questMatches = useMemo(
    () =>
      Object.fromEntries(
        quests.map((quest) => [quest.id, scoreQuestForStudent(quest, currentStudent)])
      ) as Record<string, ReturnType<typeof scoreQuestForStudent>>,
    [quests]
  );

  function toggleSaved(questId: string) {
    setSavedQuestIds((current) => {
      const next = new Set(current);
      if (next.has(questId)) next.delete(questId);
      else next.add(questId);
      return next;
    });
  }

  function showPage(page: Page) {
    setSelectedQuest(null);
    setActivePage(page);
  }

  function publishQuest(quest: QuestCard) {
    setQuests((current) => [quest, ...current.filter((item) => item.id !== quest.id)]);
    setSelectedQuest(null);
    setActivePage("explore");
  }

  const page = selectedQuest ? (
    <QuestDetailPage
      quest={selectedQuest}
      saved={savedQuestIds.has(selectedQuest.id)}
      matchScore={questMatches[selectedQuest.id]?.total ?? 0}
      onBack={() => setSelectedQuest(null)}
      onSave={() => toggleSaved(selectedQuest.id)}
      onParty={() => {
        setSelectedQuest(null);
        setActivePage("parties");
      }}
    />
  ) : (
    <>
      {activePage === "home" ? (
        <HomePage
          quests={quests}
          questMatches={questMatches}
          savedQuestIds={savedQuestIds}
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
      {activePage === "submit" ? <SubmitQuestPage onPublish={publishQuest} /> : null}
      {activePage === "parties" ? (
        <PartiesPage quests={quests} onSelectQuest={setSelectedQuest} />
      ) : null}
      {activePage === "profile" ? (
        <ProfilePage quests={quests} savedCount={savedQuestIds.size} onSelectQuest={setSelectedQuest} />
      ) : null}
    </>
  );

  return (
    <div className="app-frame">
      <TopNav activePage={activePage} onNavigate={showPage} />
      <main className="app-main">{page}</main>
    </div>
  );
}

function TopNav({ activePage, onNavigate }: { activePage: Page; onNavigate: (page: Page) => void }) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark">
          <Compass size={18} />
        </span>
        <strong>YouQuest</strong>
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
          1,240 XP
          <strong>7</strong>
        </span>
        <img src={currentStudent.avatarUrl} alt={`${currentStudent.name} avatar`} />
      </div>
    </header>
  );
}

function HomePage({
  quests,
  questMatches,
  savedQuestIds,
  onSave,
  onSelectQuest,
  onExplore
}: {
  quests: QuestCard[];
  questMatches: Record<string, ReturnType<typeof scoreQuestForStudent>>;
  savedQuestIds: Set<string>;
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
          <h1>Hey {currentStudent.name.split(" ")[0]}</h1>
          <p>{quests.length} quests live on campus right now</p>
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
        <label className="wide-search">
          <Search size={17} />
          <input
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
        </label>
      ) : null}

      <div className="stat-grid">
        <StatCard icon={Sparkles} tone="violet" label="For You" value={recommendedCount} detail="matched quests" />
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
  questMatches: Record<string, ReturnType<typeof scoreQuestForStudent>>;
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
          <p>{filtered.length} quests available</p>
        </div>
        <button className="icon-button" type="button" aria-label="Grid view">
          <Grid3X3 size={18} />
        </button>
      </div>

      <label className="wide-search explore-search">
        <Search size={17} />
        <input
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
      </label>

      {showFilters ? (
        <div className="advanced-filters">
          <FilterGroup
            label="Category"
            options={browseFilters}
            value={category}
            onChange={setCategory}
          />
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

function SubmitQuestPage({ onPublish }: { onPublish: (quest: QuestCard) => void }) {
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<SubmitMethodId | null>(null);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [extracted, setExtracted] = useState<QuestCard | null>(null);
  const [error, setError] = useState("");

  const canProcess = Boolean(method && ((method === "link" || method === "text") ? input.trim() : file));

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
      const response = await fetch("/api/extract", { method: "POST", body });
      const data = (await response.json()) as ExtractQuestResponse & { error?: string; details?: string[] };
      if (!response.ok || !data.cards?.[0]) {
        throw new Error(data.details?.join(", ") ?? data.error ?? "Extraction failed");
      }
      setExtracted(data.cards[0]);
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
      const response = await fetch("/api/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const data = (await response.json().catch(() => ({}))) as { quest?: QuestCard; error?: string; details?: string[] };
      if (!response.ok) {
        throw new Error(data.details?.join(", ") ?? data.error ?? "Publish failed");
      }
      onPublish(data.quest ?? draft);
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
          <p>Paste anything - AI extracts the details</p>
        </div>
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
            <label className="large-input">
              <Link2 size={18} />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://..."
              />
            </label>
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
          <div className="review-grid">
            <label>
              Title
              <input
                value={extracted.title}
                onChange={(event) => setExtracted({ ...extracted, title: event.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                value={extracted.description}
                onChange={(event) => setExtracted({ ...extracted, description: event.target.value })}
                rows={4}
              />
            </label>
            <div className="review-field-row">
              <InfoField label="Category" value={labelize(extracted.interests[0] ?? "Quest")} />
              <InfoField label="Difficulty" value={difficultyLabel(extracted.difficulty)} />
              <InfoField label="Time" value={formatTimeCommitment(extracted)} />
              <InfoField label="Reward" value={extracted.reward.label} />
              <InfoField label="Location" value={formatLocation(extracted)} />
              <InfoField label="Deadline" value={formatDeadline(extracted.deadline)} />
            </div>
            <div>
              <span className="field-label">Tags</span>
              <div className="chip-row">
                {[...extracted.interests, ...extracted.skillsHelpful.slice(0, 3)].map((tag) => (
                  <span className="soft-chip active" key={tag}>
                    #{labelize(tag)}
                  </span>
                ))}
              </div>
            </div>
          </div>
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

function PartiesPage({
  quests,
  onSelectQuest
}: {
  quests: QuestCard[];
  onSelectQuest: (quest: QuestCard) => void;
}) {
  const [activeTab, setActiveTab] = useState<"my" | "browse">("my");
  const partyQuests = quests.filter((quest) => quest.party.allowed);
  const myParties = partyQuests
    .map((quest) => ({
      quest,
      party: recommendParties(quest, students, currentStudent.id)[0]
    }))
    .filter((item): item is { quest: QuestCard; party: PartyCandidateScore } => Boolean(item.party))
    .slice(0, 2);

  return (
    <section className="party-shell">
      <div className="section-header">
        <div>
          <h1>Quest Parties</h1>
          <p>Team up with matched students for shared adventures</p>
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
          {myParties.map(({ quest, party }, index) => (
            <PartyCard
              key={quest.id}
              quest={quest}
              party={party}
              status={index === 0 ? "Forming" : "Ready!"}
              onSelectQuest={onSelectQuest}
            />
          ))}
        </div>
      ) : (
        <div className="browse-party-panel">
          <section className="smart-match-card">
            <div className="smart-icon">
              <Users size={30} />
            </div>
            <h2>Smart Party Matching</h2>
            <p>AI matches you with students based on shared interests, availability, and complementary skills.</p>
            <button className="primary-button" type="button">
              <Sparkles size={18} />
              Find Me a Party
            </button>
          </section>
          <h3>Quests looking for parties</h3>
          {partyQuests.map((quest) => (
            <button className="party-listing" key={quest.id} type="button" onClick={() => onSelectQuest(quest)}>
              <img src={quest.imageUrl} alt="" />
              <span>
                <strong>{quest.title}</strong>
                <small>
                  {quest.party.idealSize} members · {labelize(quest.interests[0] ?? "Quest")}
                </small>
              </span>
              <em>
                <Users size={13} />
                {quest.party.openSlots} looking
              </em>
              <ChevronRight size={19} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfilePage({
  quests,
  savedCount,
  onSelectQuest
}: {
  quests: QuestCard[];
  savedCount: number;
  onSelectQuest: (quest: QuestCard) => void;
}) {
  const totalXp = 1240;
  const level = 7;
  const nextLevelXp = 200;
  const currentLevelXp = totalXp % nextLevelXp;
  const progress = Math.round((currentLevelXp / nextLevelXp) * 100);

  return (
    <section className="profile-shell">
      <div className="profile-hero">
        <div className="profile-avatar">
          <img src={currentStudent.avatarUrl} alt="" />
          <span>{level}</span>
        </div>
        <h1>{currentStudent.name}</h1>
        <p>{currentStudent.major}</p>
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
            <strong>{currentStudent.questCount + 5}</strong>
            <span>Completed</span>
          </div>
          <div>
            <strong>4</strong>
            <span>Week streak</span>
          </div>
        </div>
      </section>

      <ProfileSection title="Interests">
        <div className="chip-row">
          {currentStudent.interests.map((interest) => (
            <span className="soft-chip active" key={interest}>
              {labelize(interest)}
            </span>
          ))}
          <button className="dashed-chip" type="button">
            + Add
          </button>
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
          const count = item.label === "Saved Quests" ? savedCount : item.count;
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
  saved,
  matchScore,
  onBack,
  onSave,
  onParty
}: {
  quest: QuestCard;
  saved: boolean;
  matchScore: number;
  onBack: () => void;
  onSave: () => void;
  onParty: () => void;
}) {
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
        <h1>{quest.title}</h1>
        <div className="posted-by">
          <img src={currentStudent.avatarUrl} alt="" />
          <span>
            <strong>{quest.organizer}</strong>
            Posted this quest
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
            <strong>Find a Quest Party</strong>
            <small>Get matched with {quest.party.idealSize} others · Similar interests</small>
            <ChevronRight size={20} />
          </button>
        ) : null}
      </div>

      <div className="sticky-action-bar">
        <button className="primary-button" type="button">
          <Zap size={18} />
          I'm Going
        </button>
        <button className="secondary-button" type="button">
          Interested
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
  questMatches: Record<string, ReturnType<typeof scoreQuestForStudent>>;
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
            {quest.stats.partyRequests + 20} going · {friendNames[index % friendNames.length]} +{Math.max(0, Math.round(matchScore / 30) - 1)}
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
  quest,
  party,
  status,
  onSelectQuest
}: {
  quest: QuestCard;
  party: PartyCandidateScore;
  status: "Forming" | "Ready!";
  onSelectQuest: (quest: QuestCard) => void;
}) {
  return (
    <article className="party-card-large">
      <div className="party-header">
        <button type="button" onClick={() => onSelectQuest(quest)}>
          {quest.title}
        </button>
        <button className="chat-button" type="button">
          <MessageCircle size={15} />
          Chat
        </button>
      </div>
      <div className="party-status-row">
        <span className={status === "Ready!" ? "status-ready" : "status-forming"}>{status}</span>
        <small>{party.total}% match</small>
      </div>
      <div className="party-members">
        {party.memberIds.map((memberId, index) => {
          const member = findStudent(memberId);
          return member ? (
            <div key={member.id}>
              <img src={member.avatarUrl} alt="" />
              <span>
                <strong>{member.id === currentStudent.id ? "You" : member.name}</strong>
                <small>{member.skills.slice(0, 2).map(labelize).join(" · ")}</small>
              </span>
              <em className={index < 2 || status === "Ready!" ? "ready" : ""}>
                {index < 2 || status === "Ready!" ? <Check size={14} /> : <Circle size={14} />}
              </em>
            </div>
          ) : null;
        })}
      </div>
      <div className="prep-plan-block">
        <h3>Prep Plan</h3>
        {party.prepPlan.map((item, index) => (
          <div className="prep-step" key={item.id}>
            <span className={index < 2 ? "done" : ""}>{index < 2 ? <Check size={13} /> : null}</span>
            <p className={index < 2 ? "done" : ""}>
              {item.title}
              <small>Due {formatDeadline(item.dueAt)}</small>
            </p>
          </div>
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

function InfoTile({
  icon: Icon,
  label,
  value
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
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

function ProfileSection({
  title,
  aside,
  children
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
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
  questMatches: Record<string, ReturnType<typeof scoreQuestForStudent>>,
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
    if (quickFilter === "New") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
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

function findStudent(studentId: string): StudentProfile | undefined {
  return students.find((student) => student.id === studentId);
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

export default App;
