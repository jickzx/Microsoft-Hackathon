import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowUpDown,
  Bell,
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Filter,
  Flame,
  Gift,
  GraduationCap,
  LinkIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Trophy,
  Upload,
  Users,
  X
} from "lucide-react";
import { allSkills, currentStudent, seedQuests, students } from "./data/seed";
import {
  daysUntil,
  formatDeadline,
  formatLocation,
  formatTimeCommitment,
  labelize,
  labelMode
} from "./lib/format";
import { recommendParties, scoreQuestForStudent } from "./lib/matching";
import type {
  AzureConnectionHealth,
  ExtractQuestResponse,
  PartyCandidateScore,
  QuestCard,
  QuestSourceType,
  RewardType,
  SkillTag,
  StudentProfile
} from "./types";

type CategoryFilter =
  | "all"
  | "research"
  | "events"
  | "startups"
  | "clubs"
  | "volunteering"
  | "competitions";
type TimeFilter = "any" | "today" | "week" | "month";
type CommitmentFilter = "any" | "quick" | "one-day" | "ongoing";
type SortMode = "match" | "newest" | "deadline" | "reward";

const categories: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "research", label: "Research" },
  { value: "events", label: "Events" },
  { value: "startups", label: "Startups" },
  { value: "clubs", label: "Clubs" },
  { value: "volunteering", label: "Volunteer" },
  { value: "competitions", label: "Compete" }
];

const rewardOptions: { value: RewardType | "any"; label: string }[] = [
  { value: "any", label: "Any reward" },
  { value: "money", label: "Paid" },
  { value: "credits", label: "Credit" },
  { value: "swag", label: "Swag" },
  { value: "food", label: "Food" },
  { value: "experience", label: "Experience" }
];

const sourceTypes: { value: QuestSourceType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "link", label: "Link" },
  { value: "poster", label: "Poster" },
  { value: "email", label: "Email" },
  { value: "message", label: "Message" },
  { value: "pdf", label: "PDF" },
  { value: "photo", label: "Photo" },
  { value: "screenshot", label: "Screenshot" }
];

const questModeOptions: QuestCard["location"]["mode"][] = ["in_person", "hybrid", "remote"];

function labelSourceType(sourceType: QuestSourceType) {
  return sourceTypes.find((item) => item.value === sourceType)?.label ?? labelize(sourceType);
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

function moneyValue(quest: QuestCard) {
  return quest.reward.estimatedValueUsd ?? (quest.reward.type.includes("money") ? 150 : 0);
}

function isQuestInTimeFilter(quest: QuestCard, filter: TimeFilter) {
  if (filter === "any") return true;
  const days = daysUntil(quest.deadline);
  if (days === null) return false;
  if (filter === "today") return days <= 1;
  if (filter === "week") return days <= 7;
  return days <= 30;
}

function isQuestInCommitmentFilter(quest: QuestCard, filter: CommitmentFilter) {
  if (filter === "any") return true;
  if (filter === "quick") return quest.estimatedHours.max <= 3;
  if (filter === "one-day") return quest.estimatedHours.max <= 8;
  return quest.estimatedHours.max > 8;
}

function isNewQuest(quest: QuestCard) {
  return new Date(quest.createdAt).getTime() >= new Date("2026-05-07T00:00:00Z").getTime();
}

function badgeForQuest(quest: QuestCard) {
  const days = daysUntil(quest.deadline);
  if (days !== null && days <= 3) return { label: "Closing Soon", tone: "coral" };
  if (quest.party.openSlots > 6) return { label: "Party Open", tone: "blue" };
  if (moneyValue(quest) > 0) return { label: "Paid", tone: "gold" };
  if (isNewQuest(quest)) return { label: "New", tone: "green" };
  return { label: "Featured", tone: "neutral" };
}

function App() {
  const [quests, setQuests] = useState<QuestCard[]>(seedQuests);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("any");
  const [commitment, setCommitment] = useState<CommitmentFilter>("any");
  const [reward, setReward] = useState<RewardType | "any">("any");
  const [skill, setSkill] = useState<SkillTag | "any">("any");
  const [partyOnly, setPartyOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("match");
  const [savedQuestIds, setSavedQuestIds] = useState(() => new Set(["quest-001", "quest-007"]));
  const [selectedQuest, setSelectedQuest] = useState<QuestCard | null>(seedQuests[0]);
  const [postOpen, setPostOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [azureHealth, setAzureHealth] = useState<AzureConnectionHealth | null>(null);

  useEffect(() => {
    fetch("/api/quests")
      .then((response) => response.json())
      .then((data: { quests?: QuestCard[] }) => {
        if (data.quests?.length) setQuests(data.quests);
      })
      .catch(() => {
        setQuests(seedQuests);
      });
  }, []);

  useEffect(() => {
    fetch("/api/azure/health")
      .then((response) => response.json())
      .then((data: AzureConnectionHealth) => setAzureHealth(data))
      .catch(() => setAzureHealth(null));
  }, []);

  const questMatches = useMemo(
    () =>
      Object.fromEntries(
        quests.map((quest) => [quest.id, scoreQuestForStudent(quest, currentStudent)])
      ),
    [quests]
  );

  const filteredQuests = useMemo(() => {
    const term = search.trim().toLowerCase();
    const results = quests.filter((quest) => {
      const searchable = [
        quest.title,
        quest.organizer,
        quest.summary,
        ...quest.interests,
        ...quest.skillsHelpful,
        quest.reward.label,
        formatLocation(quest)
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!term || searchable.includes(term)) &&
        (category === "all" || quest.interests.includes(category)) &&
        isQuestInTimeFilter(quest, timeFilter) &&
        isQuestInCommitmentFilter(quest, commitment) &&
        (reward === "any" || quest.reward.type.includes(reward)) &&
        (skill === "any" || quest.skillsHelpful.includes(skill)) &&
        (!partyOnly || quest.party.allowed)
      );
    });

    return results.sort((a, b) => {
      if (sortMode === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortMode === "deadline") {
        return (
          new Date(a.deadline ?? "2099-01-01").getTime() -
          new Date(b.deadline ?? "2099-01-01").getTime()
        );
      }
      if (sortMode === "reward") return moneyValue(b) - moneyValue(a);
      return questMatches[b.id].total - questMatches[a.id].total;
    });
  }, [
    quests,
    search,
    category,
    timeFilter,
    commitment,
    reward,
    skill,
    partyOnly,
    sortMode,
    questMatches
  ]);

  const topParties = useMemo(() => {
    const quest = selectedQuest ?? filteredQuests[0];
    return quest ? recommendParties(quest, students, currentStudent.id) : [];
  }, [filteredQuests, selectedQuest]);

  function toggleSaved(questId: string) {
    setSavedQuestIds((current) => {
      const next = new Set(current);
      if (next.has(questId)) next.delete(questId);
      else next.add(questId);
      return next;
    });
  }

  function publishQuest(quest: QuestCard) {
    const published = {
      ...quest,
      status: "published" as const,
      updatedAt: new Date().toISOString()
    };

    fetch("/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(published)
    }).catch(() => undefined);
    setQuests((current) => [published, ...current.filter((item) => item.id !== quest.id)]);
    setSelectedQuest(published);
  }

  return (
    <div className="app-shell">
      <TopNav
        search={search}
        onSearch={setSearch}
        onPostQuest={() => setPostOpen(true)}
        onFindParty={() => setPartyOpen(true)}
        azureHealth={azureHealth}
      />
      <div className="workspace">
        <Sidebar
          category={category}
          onCategory={setCategory}
          savedCount={savedQuestIds.size}
          partyCount={topParties.length}
        />
        <main className="board">
          <BoardHeader questCount={filteredQuests.length} />
          <QuestFilters
            category={category}
            onCategory={setCategory}
            timeFilter={timeFilter}
            onTimeFilter={setTimeFilter}
            commitment={commitment}
            onCommitment={setCommitment}
            reward={reward}
            onReward={setReward}
            skill={skill}
            onSkill={setSkill}
            partyOnly={partyOnly}
            onPartyOnly={setPartyOnly}
            sortMode={sortMode}
            onSortMode={setSortMode}
          />
          {filteredQuests.length ? (
            <section className="quest-grid" aria-label="Quest results">
              {filteredQuests.map((quest) => (
                <QuestCardView
                  key={quest.id}
                  quest={quest}
                  matchScore={questMatches[quest.id].total}
                  matchReasons={questMatches[quest.id].reasons}
                  saved={savedQuestIds.has(quest.id)}
                  selected={selectedQuest?.id === quest.id}
                  onSave={() => toggleSaved(quest.id)}
                  onView={() => setSelectedQuest(quest)}
                  onParty={() => {
                    setSelectedQuest(quest);
                    setPartyOpen(true);
                  }}
                />
              ))}
            </section>
          ) : (
            <EmptyState onPostQuest={() => setPostOpen(true)} />
          )}
        </main>
        <RightRail
          selectedQuest={selectedQuest}
          parties={topParties}
          matchScore={selectedQuest ? questMatches[selectedQuest.id]?.total : undefined}
          onOpenParty={() => setPartyOpen(true)}
        />
      </div>
      {selectedQuest && (
        <QuestDetailPanel
          quest={selectedQuest}
          matchScore={questMatches[selectedQuest.id]?.total ?? 0}
          saved={savedQuestIds.has(selectedQuest.id)}
          onSave={() => toggleSaved(selectedQuest.id)}
          onClose={() => setSelectedQuest(null)}
          onParty={() => setPartyOpen(true)}
        />
      )}
      {postOpen && (
        <PostQuestModal
          azureHealth={azureHealth}
          onClose={() => setPostOpen(false)}
          onPublish={(quest) => {
            publishQuest(quest);
            setPostOpen(false);
          }}
        />
      )}
      {partyOpen && (
        <PartyDrawer
          quest={selectedQuest ?? filteredQuests[0]}
          onClose={() => setPartyOpen(false)}
        />
      )}
    </div>
  );
}

function TopNav({
  search,
  onSearch,
  onPostQuest,
  onFindParty,
  azureHealth
}: {
  search: string;
  onSearch: (value: string) => void;
  onPostQuest: () => void;
  onFindParty: () => void;
  azureHealth: AzureConnectionHealth | null;
}) {
  const healthLabel =
    azureHealth?.status === "ready"
      ? "Azure Ready"
      : azureHealth?.reachable
        ? "Azure Setup"
        : "Azure Local";

  return (
    <header className="top-nav">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Sparkles size={19} />
        </div>
        <div>
          <strong>QuestBoard</strong>
          <span>North Campus</span>
        </div>
      </div>
      <label className="search-box">
        <Search size={18} />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search quests, clubs, skills, rewards..."
        />
      </label>
      <div className="top-actions">
        <span className={`azure-pill ${azureHealth?.status === "ready" ? "ready" : "setup"}`}>
          <Sparkles size={14} />
          {healthLabel}
        </span>
        <button className="ghost-button compact" type="button">
          North Campus
          <ChevronDown size={16} />
        </button>
        <button className="ghost-button icon-button" aria-label="Notifications" type="button">
          <Bell size={18} />
        </button>
        <button className="secondary-button" type="button" onClick={onFindParty}>
          <Users size={17} />
          Find Party
        </button>
        <button className="primary-button" type="button" onClick={onPostQuest}>
          <Upload size={17} />
          Post Quest
        </button>
      </div>
    </header>
  );
}

function Sidebar({
  category,
  onCategory,
  savedCount,
  partyCount
}: {
  category: CategoryFilter;
  onCategory: (value: CategoryFilter) => void;
  savedCount: number;
  partyCount: number;
}) {
  return (
    <aside className="sidebar">
      <nav className="side-nav" aria-label="Quest categories">
        {categories.map((item) => (
          <button
            className={item.value === category ? "active" : ""}
            key={item.value}
            type="button"
            onClick={() => onCategory(item.value)}
          >
            {item.value === "all" ? <ClipboardList size={17} /> : <Trophy size={17} />}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="side-metrics">
        <div>
          <span>{savedCount}</span>
          <p>Saved</p>
        </div>
        <div>
          <span>{partyCount}</span>
          <p>Party fits</p>
        </div>
      </div>
      <div className="profile-strip">
        <img src={currentStudent.avatarUrl} alt="" />
        <div>
          <strong>{currentStudent.name}</strong>
          <span>{currentStudent.major}</span>
        </div>
      </div>
    </aside>
  );
}

function BoardHeader({ questCount }: { questCount: number }) {
  return (
    <section className="board-header">
      <div>
        <p className="eyebrow">Public campus board</p>
        <h1>Explore Quests</h1>
        <p>Find campus gigs, events, projects, and challenges worth your time.</p>
      </div>
      <div className="board-stats" aria-label="Board stats">
        <div>
          <strong>{questCount}</strong>
          <span>visible</span>
        </div>
        <div>
          <strong>86%</strong>
          <span>matched</span>
        </div>
        <div>
          <strong>24h</strong>
          <span>avg reply</span>
        </div>
      </div>
    </section>
  );
}

function QuestFilters({
  category,
  onCategory,
  timeFilter,
  onTimeFilter,
  commitment,
  onCommitment,
  reward,
  onReward,
  skill,
  onSkill,
  partyOnly,
  onPartyOnly,
  sortMode,
  onSortMode
}: {
  category: CategoryFilter;
  onCategory: (value: CategoryFilter) => void;
  timeFilter: TimeFilter;
  onTimeFilter: (value: TimeFilter) => void;
  commitment: CommitmentFilter;
  onCommitment: (value: CommitmentFilter) => void;
  reward: RewardType | "any";
  onReward: (value: RewardType | "any") => void;
  skill: SkillTag | "any";
  onSkill: (value: SkillTag | "any") => void;
  partyOnly: boolean;
  onPartyOnly: (value: boolean) => void;
  sortMode: SortMode;
  onSortMode: (value: SortMode) => void;
}) {
  return (
    <section className="filters">
      <div className="segmented" aria-label="Quest category">
        {categories.map((item) => (
          <button
            key={item.value}
            className={category === item.value ? "active" : ""}
            type="button"
            onClick={() => onCategory(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="filter-row">
        <label className="select-filter">
          <CalendarClock size={16} />
          <select
            value={timeFilter}
            onChange={(event) => onTimeFilter(event.target.value as TimeFilter)}
          >
            <option value="any">Any time</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
        </label>
        <label className="select-filter">
          <Clock3 size={16} />
          <select
            value={commitment}
            onChange={(event) => onCommitment(event.target.value as CommitmentFilter)}
          >
            <option value="any">Any commitment</option>
            <option value="quick">Quick</option>
            <option value="one-day">One-day</option>
            <option value="ongoing">Ongoing</option>
          </select>
        </label>
        <label className="select-filter">
          <Gift size={16} />
          <select
            value={reward}
            onChange={(event) => onReward(event.target.value as RewardType | "any")}
          >
            {rewardOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="select-filter">
          <Filter size={16} />
          <select
            value={skill}
            onChange={(event) => onSkill(event.target.value as SkillTag | "any")}
          >
            <option value="any">Any skill</option>
            {allSkills.map((item) => (
              <option key={item} value={item}>
                {labelize(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle-filter">
          <input
            type="checkbox"
            checked={partyOnly}
            onChange={(event) => onPartyOnly(event.target.checked)}
          />
          <span>Party-friendly</span>
        </label>
        <label className="select-filter sort-filter">
          <ArrowUpDown size={16} />
          <select
            value={sortMode}
            onChange={(event) => onSortMode(event.target.value as SortMode)}
          >
            <option value="match">Best match</option>
            <option value="newest">Newest</option>
            <option value="deadline">Deadline soon</option>
            <option value="reward">Highest reward</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function QuestCardView({
  quest,
  matchScore,
  matchReasons,
  saved,
  selected,
  onSave,
  onView,
  onParty
}: {
  quest: QuestCard;
  matchScore: number;
  matchReasons: string[];
  saved: boolean;
  selected: boolean;
  onSave: () => void;
  onView: () => void;
  onParty: () => void;
}) {
  const badge = badgeForQuest(quest);
  const days = daysUntil(quest.deadline);

  return (
    <article className={`quest-card ${selected ? "selected" : ""}`}>
      <button className="quest-image-button" type="button" onClick={onView}>
        <img src={quest.imageUrl} alt="" />
        <span className={`status-badge ${badge.tone}`}>{badge.label}</span>
      </button>
      <div className="quest-card-body">
        <div className="quest-title-row">
          <button className="text-button" type="button" onClick={onView}>
            <h2>{quest.title}</h2>
          </button>
          <button
            className={`icon-button save-button ${saved ? "saved" : ""}`}
            aria-label={saved ? "Remove saved quest" : "Save quest"}
            type="button"
            onClick={onSave}
          >
            {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
          </button>
        </div>
        <div className="organizer-line">
          <GraduationCap size={15} />
          <span>{quest.organizer}</span>
          <CheckCircle2 size={14} />
          <span>Verified</span>
        </div>
        <p className="quest-summary">{quest.summary}</p>
        <div className="quest-meta">
          <span>
            <CalendarClock size={14} />
            {days !== null && days <= 3 ? "Due soon" : formatDeadline(quest.deadline)}
          </span>
          <span>
            <Clock3 size={14} />
            {formatTimeCommitment(quest)}
          </span>
          <span>
            <MapPin size={14} />
            {labelMode(quest.location.mode)}
          </span>
        </div>
        <div className="tag-row">
          {quest.skillsHelpful.slice(0, 4).map((tag) => (
            <span className="skill-chip" key={tag}>
              {labelize(tag)}
            </span>
          ))}
        </div>
        <div className="reward-line">
          <Gift size={15} />
          <span>{quest.reward.label}</span>
        </div>
        <div className="match-strip">
          <div className="match-score">
            <strong>{matchScore}%</strong>
            <span>match</span>
          </div>
          <p>{matchReasons[0] ?? "Strong campus fit"}</p>
        </div>
        <div className="card-actions">
          <button className="secondary-button" type="button" onClick={onView}>
            View Quest
          </button>
          <button className="primary-button soft" type="button" onClick={onParty}>
            <Users size={16} />
            Join Party
          </button>
        </div>
      </div>
    </article>
  );
}

function RightRail({
  selectedQuest,
  parties,
  matchScore,
  onOpenParty
}: {
  selectedQuest: QuestCard | null;
  parties: PartyCandidateScore[];
  matchScore?: number;
  onOpenParty: () => void;
}) {
  const upcoming = seedQuests
    .slice()
    .sort(
      (a, b) =>
        new Date(a.deadline ?? "2099-01-01").getTime() -
        new Date(b.deadline ?? "2099-01-01").getTime()
    )
    .slice(0, 3);
  const topParty = parties[0];

  return (
    <aside className="right-rail">
      <section className="rail-panel profile-panel">
        <div className="profile-strip large">
          <img src={currentStudent.avatarUrl} alt="" />
          <div>
            <strong>{currentStudent.name}</strong>
            <span>{currentStudent.year} · {currentStudent.questCount} quests</span>
          </div>
        </div>
        <div className="profile-tags">
          {currentStudent.skills.slice(0, 4).map((item) => (
            <span key={item}>{labelize(item)}</span>
          ))}
        </div>
      </section>
      <section className="rail-panel">
        <div className="rail-heading">
          <h3>My Party</h3>
          <button className="text-link" type="button" onClick={onOpenParty}>
            Open
          </button>
        </div>
        {selectedQuest && topParty ? (
          <div className="party-preview">
            <div className="party-score">
              <Users size={18} />
              <strong>{topParty.total}%</strong>
            </div>
            <p>{selectedQuest.title}</p>
            <div className="avatar-stack">
              {topParty.memberIds.map((memberId) => {
                const student = students.find((item) => item.id === memberId);
                return student ? <img src={student.avatarUrl} alt="" key={memberId} /> : null;
              })}
            </div>
            <span>{topParty.reasons[1]}</span>
          </div>
        ) : (
          <p className="muted">Pick a quest with open party slots.</p>
        )}
      </section>
      <section className="rail-panel">
        <div className="rail-heading">
          <h3>Match Pulse</h3>
          <Flame size={18} />
        </div>
        <div
          className="pulse-meter"
          style={{ "--score": `${matchScore ?? 72}%` } as CSSProperties}
        >
          <span />
        </div>
        <p className="muted">
          {selectedQuest
            ? `${matchScore ?? 0}% fit for ${selectedQuest.skillsHelpful
                .slice(0, 2)
                .map(labelize)
                .join(" and ")}`
            : "Select a quest to see fit."}
        </p>
      </section>
      <section className="rail-panel">
        <div className="rail-heading">
          <h3>Deadlines</h3>
          <CalendarClock size={18} />
        </div>
        <div className="deadline-list">
          {upcoming.map((quest) => (
            <button type="button" key={quest.id}>
              <span>{quest.title}</span>
              <strong>{formatDeadline(quest.deadline)}</strong>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function QuestDetailPanel({
  quest,
  matchScore,
  saved,
  onSave,
  onClose,
  onParty
}: {
  quest: QuestCard;
  matchScore: number;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
  onParty: () => void;
}) {
  return (
    <aside className="detail-panel" aria-label="Quest details">
      <div className="detail-media">
        <img src={quest.imageUrl} alt="" />
        <button className="icon-button close-button" type="button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="detail-body">
        <div className="detail-title">
          <div>
            <p className="eyebrow">{quest.organizer}</p>
            <h2>{quest.title}</h2>
          </div>
          <button
            className={`icon-button save-button ${saved ? "saved" : ""}`}
            type="button"
            onClick={onSave}
            aria-label={saved ? "Remove saved quest" : "Save quest"}
          >
            {saved ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
          </button>
        </div>
        <div className="detail-meta-grid">
          <span>
            <CalendarClock size={16} />
            {formatDeadline(quest.deadline)}
          </span>
          <span>
            <Clock3 size={16} />
            {formatTimeCommitment(quest)}
          </span>
          <span>
            <MapPin size={16} />
            {formatLocation(quest)}
          </span>
          <span>
            <Sparkles size={16} />
            {matchScore}% match
          </span>
        </div>
        <section>
          <h3>Overview</h3>
          <p>{quest.description}</p>
        </section>
        <section>
          <h3>Best For</h3>
          <div className="tag-row">
            {quest.bestFor.map((item) => (
              <span className="pill" key={item}>
                {item}
              </span>
            ))}
          </div>
        </section>
        <section>
          <h3>Skills</h3>
          <div className="tag-row">
            {quest.skillsHelpful.map((item) => (
              <span className="skill-chip" key={item}>
                {labelize(item)}
              </span>
            ))}
          </div>
        </section>
        <section className="party-callout">
          <div>
            <h3>Party Options</h3>
            <p>
              Party of {quest.party.idealSize} works well here. {quest.party.openSlots} open
              matching slots.
            </p>
          </div>
          <button className="primary-button" type="button" onClick={onParty}>
            <Users size={17} />
            Join Party
          </button>
        </section>
        <div className="detail-actions">
          <button className="primary-button" type="button">
            <Send size={17} />
            Apply to Quest
          </button>
          <button className="secondary-button" type="button" onClick={onParty}>
            Join a Party
          </button>
        </div>
      </div>
    </aside>
  );
}

function PostQuestModal({
  azureHealth,
  onClose,
  onPublish
}: {
  azureHealth: AzureConnectionHealth | null;
  onClose: () => void;
  onPublish: (quest: QuestCard) => void;
}) {
  const [sourceType, setSourceType] = useState<QuestSourceType>("text");
  const [url, setUrl] = useState("");
  const [text, setText] = useState(
    "Design posters for the Spring Robotics Showcase. Robotics Club needs Canva/social graphics by Friday. 3-5 hours, Engineering Hall, $75 plus showcase credit. Party of 2-3 welcome."
  );
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [response, setResponse] = useState<ExtractQuestResponse | null>(null);
  const [draftCard, setDraftCard] = useState<QuestCard | null>(null);
  const [extractError, setExtractError] = useState("");

  async function extract() {
    setExtracting(true);
    setResponse(null);
    setDraftCard(null);
    setExtractError("");
    const formData = new FormData();
    formData.append("sourceType", sourceType);
    if (text) formData.append("text", text);
    if (url) formData.append("url", url);
    if (file) formData.append("file", file);

    try {
      const result = await fetch("/api/extract", {
        method: "POST",
        body: formData
      });
      const data = (await result.json()) as ExtractQuestResponse & {
        error?: string;
        details?: string[];
      };
      if (!result.ok) {
        throw new Error(data.details?.join(", ") ?? data.error ?? "Extraction failed");
      }
      setResponse(data);
      setDraftCard(data.cards[0] ?? null);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  const card = draftCard;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="post-modal" role="dialog" aria-modal="true" aria-label="Post quest">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Quest intake</p>
            <h2>Post Quest</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>
        <div className="post-grid">
          <div className="intake-panel">
            <div className={`azure-health-card ${azureHealth?.status === "ready" ? "ready" : ""}`}>
              <Sparkles size={18} />
              <div>
                <strong>
                  {azureHealth?.status === "ready"
                    ? "Azure extraction ready"
                    : "Azure fallback protected"}
                </strong>
                <p>
                  {azureHealth?.detail ??
                    "Server will use local extraction until Azure settings are available."}
                </p>
              </div>
            </div>
            <div className="field-row">
              <label>
                Source
                <select
                  value={sourceType}
                  onChange={(event) => setSourceType(event.target.value as QuestSourceType)}
                >
                  {sourceTypes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Link
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://..."
                />
              </label>
            </div>
            <label>
              Source text
              <textarea value={text} onChange={(event) => setText(event.target.value)} />
            </label>
            <label className="file-drop">
              <Upload size={18} />
              <span>{file ? file.name : "Attach poster, screenshot, PDF, or note"}</span>
              <input
                type="file"
                accept="image/*,.pdf,.txt,.md,.json"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button
              className="primary-button wide"
              type="button"
              onClick={extract}
              disabled={extracting}
            >
              {extracting ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
              Extract Quest Card
            </button>
            {extractError ? <p className="error-text">{extractError}</p> : null}
            {response?.meta.warnings.length ? (
              <p className="warning-text">{response.meta.warnings[0]}</p>
            ) : null}
          </div>
          <div className="preview-panel">
            {card && response ? (
              <>
                <ExtractionDiagnostics response={response} />
                <div className="quest-card compact-preview">
                  <img src={card.imageUrl} alt="" />
                  <div className="quest-card-body">
                    <span className="status-badge blue">
                      {response.meta.provider === "azure" ? "Azure AI" : "Local AI"}
                    </span>
                    <h3>{card.title}</h3>
                    <p>{card.summary}</p>
                    <div className="quest-meta">
                      <span>
                        <CalendarClock size={14} />
                        {formatDeadline(card.deadline)}
                      </span>
                      <span>
                        <Clock3 size={14} />
                        {formatTimeCommitment(card)}
                      </span>
                    </div>
                    <div className="tag-row">
                      {card.skillsHelpful.slice(0, 4).map((item) => (
                        <span className="skill-chip" key={item}>
                          {labelize(item)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <ReviewQuestForm quest={card} onChange={(quest) => setDraftCard(quest)} />
                <div className="preview-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setDraftCard(response.cards[0] ?? null)}
                  >
                    Reset
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => onPublish(card)}
                    disabled={!card.title.trim() || !card.organizer.trim()}
                  >
                    Publish Quest
                  </button>
                </div>
              </>
            ) : (
              <div className="preview-empty">
                <LinkIcon size={34} />
                <h3>Quest Card Preview</h3>
                <p>Extracted title, deadline, tags, reward, and party settings appear here.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ExtractionDiagnostics({ response }: { response: ExtractQuestResponse }) {
  return (
    <section className="diagnostics-panel" aria-label="Extraction diagnostics">
      <div>
        <span>Provider</span>
        <strong>{response.meta.provider === "azure" ? "Azure AI" : "Local fallback"}</strong>
      </div>
      <div>
        <span>Confidence</span>
        <strong>{Math.round(response.meta.confidence * 100)}%</strong>
      </div>
      <div>
        <span>Source</span>
        <strong>{labelSourceType(response.meta.sourceType)}</strong>
      </div>
      <div>
        <span>Missing</span>
        <strong>
          {response.meta.missingFields.length
            ? response.meta.missingFields.map(labelize).join(", ")
            : "None"}
        </strong>
      </div>
      {response.meta.warnings.map((warning) => (
        <p className="warning-text" key={warning}>
          {warning}
        </p>
      ))}
    </section>
  );
}

function ReviewQuestForm({
  quest,
  onChange
}: {
  quest: QuestCard;
  onChange: (quest: QuestCard) => void;
}) {
  return (
    <section className="review-form" aria-label="Review extracted quest">
      <div className="review-heading">
        <div>
          <p className="eyebrow">Review</p>
          <h3>Edit Quest Card</h3>
        </div>
        <span className="status-badge blue">
          {quest.status === "needs_review" ? "Needs Review" : labelize(quest.status)}
        </span>
      </div>
      <label>
        Title
        <input
          value={quest.title}
          onChange={(event) => onChange({ ...quest, title: event.target.value })}
        />
      </label>
      <label>
        Organizer
        <input
          value={quest.organizer}
          onChange={(event) => onChange({ ...quest, organizer: event.target.value })}
        />
      </label>
      <label>
        Summary
        <textarea
          value={quest.summary}
          onChange={(event) => onChange({ ...quest, summary: event.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          value={quest.description}
          onChange={(event) => onChange({ ...quest, description: event.target.value })}
        />
      </label>
      <div className="review-field-row">
        <label>
          Deadline
          <input
            type="datetime-local"
            value={toDateTimeLocal(quest.deadline)}
            onChange={(event) =>
              onChange({ ...quest, deadline: fromDateTimeLocal(event.target.value) })
            }
          />
        </label>
        <label>
          Mode
          <select
            value={quest.location.mode}
            onChange={(event) =>
              onChange({
                ...quest,
                location: {
                  ...quest.location,
                  mode: event.target.value as QuestCard["location"]["mode"]
                }
              })
            }
          >
            {questModeOptions.map((mode) => (
              <option key={mode} value={mode}>
                {labelMode(mode)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="review-field-row">
        <label>
          Campus
          <input
            value={quest.location.campus ?? ""}
            onChange={(event) =>
              onChange({
                ...quest,
                location: { ...quest.location, campus: event.target.value || undefined }
              })
            }
          />
        </label>
        <label>
          Building
          <input
            value={quest.location.building ?? ""}
            onChange={(event) =>
              onChange({
                ...quest,
                location: { ...quest.location, building: event.target.value || undefined }
              })
            }
          />
        </label>
      </div>
      <div className="review-field-row">
        <label>
          Min hrs
          <input
            min="0"
            type="number"
            value={quest.estimatedHours.min}
            onChange={(event) =>
              onChange({
                ...quest,
                estimatedHours: {
                  ...quest.estimatedHours,
                  min: numberFromInput(event.target.value, quest.estimatedHours.min)
                }
              })
            }
          />
        </label>
        <label>
          Max hrs
          <input
            min="0"
            type="number"
            value={quest.estimatedHours.max}
            onChange={(event) =>
              onChange({
                ...quest,
                estimatedHours: {
                  ...quest.estimatedHours,
                  max: numberFromInput(event.target.value, quest.estimatedHours.max)
                }
              })
            }
          />
        </label>
      </div>
      <label>
        Reward
        <input
          value={quest.reward.label}
          onChange={(event) =>
            onChange({ ...quest, reward: { ...quest.reward, label: event.target.value } })
          }
        />
      </label>
      <div className="review-field-row">
        <label>
          Apply URL
          <input
            value={quest.applyUrl ?? ""}
            onChange={(event) => onChange({ ...quest, applyUrl: event.target.value || undefined })}
          />
        </label>
        <label>
          Contact
          <input
            value={quest.contactEmail ?? ""}
            onChange={(event) =>
              onChange({ ...quest, contactEmail: event.target.value || undefined })
            }
          />
        </label>
      </div>
      <div className="review-field-row party-review-row">
        <label className="toggle-filter">
          <input
            type="checkbox"
            checked={quest.party.allowed}
            onChange={(event) =>
              onChange({
                ...quest,
                party: { ...quest.party, allowed: event.target.checked }
              })
            }
          />
          <span>Party-friendly</span>
        </label>
        <label>
          Ideal size
          <input
            min="1"
            type="number"
            value={quest.party.idealSize}
            onChange={(event) =>
              onChange({
                ...quest,
                party: {
                  ...quest.party,
                  idealSize: Math.max(1, numberFromInput(event.target.value, quest.party.idealSize))
                }
              })
            }
          />
        </label>
        <label>
          Open slots
          <input
            min="0"
            type="number"
            value={quest.party.openSlots}
            onChange={(event) =>
              onChange({
                ...quest,
                party: {
                  ...quest.party,
                  openSlots: Math.max(0, numberFromInput(event.target.value, quest.party.openSlots))
                }
              })
            }
          />
        </label>
      </div>
    </section>
  );
}

function PartyDrawer({ quest, onClose }: { quest?: QuestCard; onClose: () => void }) {
  const [remoteParties, setRemoteParties] = useState<PartyCandidateScore[] | null>(null);
  const fallback = useMemo(
    () => (quest ? recommendParties(quest, students, currentStudent.id) : []),
    [quest]
  );
  const parties = remoteParties ?? fallback;
  const topParty = parties[0];

  useEffect(() => {
    if (!quest) return;
    fetch("/api/parties/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questId: quest.id, studentId: currentStudent.id })
    })
      .then((response) => response.json())
      .then((data: { parties?: PartyCandidateScore[] }) => {
        if (data.parties) setRemoteParties(data.parties);
      })
      .catch(() => setRemoteParties(null));
  }, [quest]);

  if (!quest) return null;

  return (
    <div className="modal-backdrop party-backdrop" role="presentation">
      <aside className="party-drawer" role="dialog" aria-modal="true" aria-label="Quest party">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Quest Parties</p>
            <h2>{quest.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>
        {topParty ? (
          <>
            <section className="party-hero">
              <div>
                <span className="status-badge green">{topParty.total}% fit</span>
                <h3>Recommended Party</h3>
                <p>{topParty.reasons.join(". ")}.</p>
              </div>
              <div className="avatar-stack large">
                {topParty.memberIds.map((memberId) => {
                  const student = students.find((item) => item.id === memberId);
                  return student ? <img src={student.avatarUrl} alt="" key={memberId} /> : null;
                })}
              </div>
            </section>
            <section>
              <h3>Students</h3>
              <div className="student-list">
                {topParty.memberIds.map((memberId) => {
                  const student = students.find((item) => item.id === memberId);
                  return student ? <StudentMatchCard key={memberId} student={student} quest={quest} /> : null;
                })}
              </div>
            </section>
            <section>
              <h3>Prep Plan</h3>
              <div className="prep-list">
                {topParty.prepPlan.map((item, index) => {
                  const owner = students.find((student) => student.id === item.ownerUserId);
                  return (
                    <div className="prep-item" key={item.id}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{owner ? owner.name : "Group"} · {labelize(item.type)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="drawer-actions">
              <button className="primary-button" type="button">
                <MessageCircle size={17} />
                Invite Party
              </button>
              <button className="secondary-button" type="button">
                Create Listing
              </button>
            </div>
          </>
        ) : (
          <EmptyParty />
        )}
      </aside>
    </div>
  );
}

function StudentMatchCard({ student, quest }: { student: StudentProfile; quest: QuestCard }) {
  const fit = scoreQuestForStudent(quest, student);
  const sharedSkills = student.skills.filter((skill) => quest.skillsHelpful.includes(skill));

  return (
    <article className="student-card">
      <img src={student.avatarUrl} alt="" />
      <div>
        <div className="student-card-title">
          <strong>{student.name}</strong>
          <span>{fit.total}%</span>
        </div>
        <p>{student.major} · {student.year}</p>
        <div className="tag-row">
          {(sharedSkills.length ? sharedSkills : student.skills.slice(0, 2)).map((skill) => (
            <span className="skill-chip" key={skill}>
              {labelize(skill)}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function EmptyState({ onPostQuest }: { onPostQuest: () => void }) {
  return (
    <section className="empty-state">
      <Search size={38} />
      <h2>No quests match these filters.</h2>
      <p>Loosen one filter or post what you are looking for.</p>
      <button className="primary-button" type="button" onClick={onPostQuest}>
        <Upload size={17} />
        Post Quest
      </button>
    </section>
  );
}

function EmptyParty() {
  return (
    <section className="empty-state">
      <Users size={38} />
      <h2>No party fit yet.</h2>
      <p>Try a quest with broader skills or more open slots.</p>
    </section>
  );
}

export default App;
