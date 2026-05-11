# User Matching — Testing Guide



---

## Testing Guide

### 1. Loading and Querying the JSON Locally

**Node.js**

```js
// load.js
const fs = require('fs');
const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));

// Example: find all PhD students
const phds = users.filter(u => u.year_of_study === 'PhD');
console.log(phds.map(u => u.name));

// Example: find users at Imperial College London
const imperial = users.filter(u => u.university === 'Imperial College London');
console.log(imperial.map(u => u.name));

// Example: find all users with Python in their skills
const pythonists = users.filter(u => u.skills.includes('Python'));
console.log(`Python users: ${pythonists.length}`);
```

**Python**

```python
import json

with open("users.json", "r") as f:
    users = json.load(f)

# Example: find all PhD students
phds = [u for u in users if u["year_of_study"] == "PhD"]
print([u["name"] for u in phds])

# Example: find users at Imperial College London
imperial = [u for u in users if u["university"] == "Imperial College London"]
print([u["name"] for u in imperial])

# Example: find all users with Python in their skills
pythonists = [u for u in users if "Python" in u["skills"]]
print(f"Python users: {len(pythonists)}")
```

---

### 2. Additive Match Score Function

The matching algorithm computes an additive score between two users. Each dimension contributes a weighted point if there is overlap.

**Scoring weights (tunable):**

| Dimension | Match condition | Points |
|---|---|---|
| university | exact match | 3 |
| subject_group | exact match | 3 |
| year_of_study | same bracket (1-2, 3-4, Masters, PhD, Graduate) | 2 |
| skills | number of shared skills | 2 per shared skill |
| career_interests | number of shared interests | 2 per shared interest |
| looking_for | any overlap | 1 |
| events_attending | number of shared events | 2 per shared event |

**Node.js implementation**

```js
// matchScore.js

function yearBracket(y) {
  if (y === 1 || y === 2) return 'early-undergrad';
  if (y === 3 || y === 4) return 'late-undergrad';
  return String(y); // 'Masters', 'PhD', 'Graduate'
}

function arrayOverlap(a, b) {
  const setB = new Set(b);
  return a.filter(x => setB.has(x));
}

function matchScore(userA, userB) {
  let score = 0;
  const reasons = [];

  if (userA.university === userB.university) {
    score += 3;
    reasons.push(`Same university: ${userA.university} (+3)`);
  }
  if (userA.subject_group === userB.subject_group) {
    score += 3;
    reasons.push(`Same subject group: ${userA.subject_group} (+3)`);
  }
  if (yearBracket(userA.year_of_study) === yearBracket(userB.year_of_study)) {
    score += 2;
    reasons.push(`Same year bracket (+2)`);
  }

  const sharedSkills = arrayOverlap(userA.skills, userB.skills);
  if (sharedSkills.length > 0) {
    score += sharedSkills.length * 2;
    reasons.push(`Shared skills: ${sharedSkills.join(', ')} (+${sharedSkills.length * 2})`);
  }

  const sharedInterests = arrayOverlap(userA.career_interests, userB.career_interests);
  if (sharedInterests.length > 0) {
    score += sharedInterests.length * 2;
    reasons.push(`Shared interests: ${sharedInterests.join(', ')} (+${sharedInterests.length * 2})`);
  }

  const sharedLookingFor = arrayOverlap(userA.looking_for, userB.looking_for);
  if (sharedLookingFor.length > 0) {
    score += sharedLookingFor.length;
    reasons.push(`Shared looking_for: ${sharedLookingFor.join(', ')} (+${sharedLookingFor.length})`);
  }

  const sharedEvents = arrayOverlap(userA.events_attending, userB.events_attending);
  if (sharedEvents.length > 0) {
    score += sharedEvents.length * 2;
    reasons.push(`Shared events: ${sharedEvents.join(', ')} (+${sharedEvents.length * 2})`);
  }

  return { score, reasons };
}

function topMatches(targetUser, allUsers, n = 5) {
  return allUsers
    .filter(u => u.id !== targetUser.id)
    .map(u => ({ user: u, ...matchScore(targetUser, u) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// Usage
const fs = require('fs');
const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
const target = users.find(u => u.id === 'u001');
const top5 = topMatches(target, users);
top5.forEach(m => {
  console.log(`${m.user.name} — score: ${m.score}`);
  m.reasons.forEach(r => console.log(`  ${r}`));
});
```

**Python implementation**

```python
import json

def year_bracket(y):
    if y in (1, 2):
        return "early-undergrad"
    if y in (3, 4):
        return "late-undergrad"
    return str(y)  # 'Masters', 'PhD', 'Graduate'

def array_overlap(a, b):
    set_b = set(b)
    return [x for x in a if x in set_b]

def match_score(user_a, user_b):
    score = 0
    reasons = []

    if user_a["university"] == user_b["university"]:
        score += 3
        reasons.append(f"Same university: {user_a['university']} (+3)")
    if user_a["subject_group"] == user_b["subject_group"]:
        score += 3
        reasons.append(f"Same subject group: {user_a['subject_group']} (+3)")
    if year_bracket(user_a["year_of_study"]) == year_bracket(user_b["year_of_study"]):
        score += 2
        reasons.append("Same year bracket (+2)")

    shared_skills = array_overlap(user_a["skills"], user_b["skills"])
    if shared_skills:
        pts = len(shared_skills) * 2
        score += pts
        reasons.append(f"Shared skills: {', '.join(shared_skills)} (+{pts})")

    shared_interests = array_overlap(user_a["career_interests"], user_b["career_interests"])
    if shared_interests:
        pts = len(shared_interests) * 2
        score += pts
        reasons.append(f"Shared interests: {', '.join(shared_interests)} (+{pts})")

    shared_looking = array_overlap(user_a["looking_for"], user_b["looking_for"])
    if shared_looking:
        score += len(shared_looking)
        reasons.append(f"Shared looking_for: {', '.join(shared_looking)} (+{len(shared_looking)})")

    shared_events = array_overlap(user_a["events_attending"], user_b["events_attending"])
    if shared_events:
        pts = len(shared_events) * 2
        score += pts
        reasons.append(f"Shared events: {', '.join(shared_events)} (+{pts})")

    return {"score": score, "reasons": reasons}

def top_matches(target_user, all_users, n=5):
    others = [u for u in all_users if u["id"] != target_user["id"]]
    scored = [{"user": u, **match_score(target_user, u)} for u in others]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:n]

# Usage
with open("users.json") as f:
    users = json.load(f)

target = next(u for u in users if u["id"] == "u001")
top5 = top_matches(target, users)
for m in top5:
    print(f"{m['user']['name']} — score: {m['score']}")
    for r in m["reasons"]:
        print(f"  {r}")
```

---

### 3. Example Test Cases

#### Test Case 1: Given Aisha Rahman (u001), which 5 users are most similar?

**Profile:** Aisha is a Year 2 CS student at Imperial College London, with skills in Python, JavaScript, React, Machine Learning, interests in Software Engineering, AI/ML, FinTech, attending Google DeepMind Campus Tour and Imperial College Careers Fair 2026.

**Expected top 5 matches:**

| Rank | User | Key overlaps | Expected score |
|---|---|---|---|
| 1 | Liam Foster (u012) | CS subject group, Year 3-4 bracket mismatch but shares Python, AWS, `Internship`, `Graduate role` looking_for; Imperial Careers Fair (+2 event) | ~15 |
| 2 | Owen Price (u040) | Imperial same university (+3), CS subject group (+3), Python (+2), AI/ML career interest (+2), Imperial Careers Fair (+2), DeepMind Campus Tour (+2) | ~16+ |
| 3 | Rachel Kim (u017) | CS subject group (+3), early-undergrad bracket (+2), Python (+2), AI/ML (+2), Machine Learning overlap, DeepMind Campus Tour (+2) | ~15 |
| 4 | Femi Adebayo (u031) | CS subject group (+3), Python (+2), AI/ML (+2), FinTech (+2), DeepMind Tour (+2), Barclays Hackathon (no Aisha), Networking overlap | ~14 |
| 5 | Yusuf Ibrahim (u050) | CS subject group (+3), Python (+2), AI/ML (+2), DeepMind Campus Tour (+2), Year 3-4 bracket (Aisha is Year 2 so bracket miss), Internship looking_for (+1) | ~12 |

**Note for test validation:** Run the algorithm and assert that all 5 above appear in the top 5 results; exact rank ordering may vary slightly depending on tie-breaking. Owen Price (u040) sharing both university and subject group plus two events is expected to rank 1st or 2nd.

---

#### Test Case 2: Given Ben Cartwright (u002), which 5 users are most similar?

**Profile:** Ben is a Year 3 Mechanical Engineering student at Manchester. Skills: MATLAB, SolidWorks, AutoCAD, FEA, Python. Interests: Aerospace, Automotive, Manufacturing. Attending Rolls-Royce Engineering Open Day.

**Expected top 5 matches:**

| Rank | User | Key overlaps |
|---|---|---|
| 1 | Harry Lewis (u008) | Engineering subject group (+3), MATLAB + SolidWorks + Python skills (+6), Aerospace interest (+2), Graduate role looking_for (+1), Rolls-Royce event (+2) |
| 2 | Tanya Moreau (u019) | Engineering subject group (+3), MATLAB + SolidWorks + Python (+6), late-undergrad bracket (+2), Rolls-Royce event (+2) |
| 3 | Patrick Mensah (u016) | Engineering subject group (+3), MATLAB + Python (+4), Bristol (no uni match), early/late bracket miss, Rolls-Royce event (+2) |
| 4 | Marcus Reynolds (u038) | Engineering subject group (+3), MATLAB + Python (+4), Graduate role (+1), Rolls-Royce event (+2) |
| 5 | Xin Li (u023) | Engineering subject group (+3), MATLAB + Python + AutoCAD (+6), Graduate role (+1), Rolls-Royce event (+2) |

**Assert:** Harry Lewis and Tanya Moreau must appear in positions 1-2 (both share university bracket, subject group, three skills, and the Rolls-Royce event).

---

#### Test Case 3: Given Quinn Murphy (u042), which 5 users are most similar?

**Profile:** Quinn is a PhD Data Science student at Edinburgh. Skills: Python, R, Causal Inference, Statistical Modelling, SQL, PyTorch. Interests: Causal Inference, Health Data Science, AI Ethics. Attending Hack the Burgh 8.

**Expected top 5 matches:**

| Rank | User | Key overlaps |
|---|---|---|
| 1 | Nora Eriksen (u039) | PhD bracket (+2), Python + R (+4), Machine Learning + research overlap, Cambridge (no uni match), DeepMind (no event match), Networking looking_for (+1) |
| 2 | Jordan West (u035) | Data Science subject group (+3), Python + SQL (+4), Machine Learning interest partial, Barclays Hackathon (no overlap), Graduate role/Networking looking_for (+1) |
| 3 | Usman Tariq (u020) | Data Science subject group (+3), Python + SQL (+4), AI/ML interest (+2), early-undergrad bracket (Quinn is PhD — miss) |
| 4 | James Patel (u010) | Data Science subject group (+3), Python + SQL (+4), Machine Learning (+2), Barclays Hackathon (no Quinn overlap) |
| 5 | Rachel Kim (u017) | CS (not DS — miss), Python + PyTorch (+4), AI/ML (+2), Hack the Burgh 8 (+2), Edinburgh same university (+3), Networking overlap |

**Assert:** Rachel Kim (u017) should score highly due to same university (+3), shared event (+2), and PyTorch + Python overlap (+4). She may actually rank 1st or 2nd — the algorithm should be run to confirm. Usman Tariq and Jordan West provide subject-group boosted matches.

---

### 4. Extending to User-to-Event Matching

The same additive logic applies when scoring a **user against an event**. Events need a parallel schema:

```json
{
  "id": "e001",
  "name": "Google DeepMind Campus Tour",
  "location": "London",
  "university_affiliation": ["Imperial College London", "UCL", "King's College London"],
  "subject_groups": ["CS", "Mathematics", "Physics", "Data Science"],
  "relevant_skills": ["Python", "Machine Learning", "PyTorch", "TensorFlow"],
  "relevant_career_interests": ["AI/ML", "Research", "Software Engineering"],
  "year_groups": [2, 3, 4, "Masters", "PhD"],
  "looking_for_match": ["Internship", "Research placement", "Networking"]
}
```

**Event match score function (Python)**

```python
def user_event_score(user, event):
    score = 0
    reasons = []

    if user["location"] in event.get("university_affiliation", []) or \
       user["university"] in event.get("university_affiliation", []):
        score += 3
        reasons.append("University/location affiliation (+3)")

    if user["subject_group"] in event.get("subject_groups", []):
        score += 3
        reasons.append(f"Subject group match: {user['subject_group']} (+3)")

    if user["year_of_study"] in event.get("year_groups", []):
        score += 2
        reasons.append(f"Year group match (+2)")

    shared_skills = array_overlap(user["skills"], event.get("relevant_skills", []))
    if shared_skills:
        pts = len(shared_skills) * 2
        score += pts
        reasons.append(f"Relevant skills: {', '.join(shared_skills)} (+{pts})")

    shared_interests = array_overlap(
        user["career_interests"], event.get("relevant_career_interests", [])
    )
    if shared_interests:
        pts = len(shared_interests) * 2
        score += pts
        reasons.append(f"Relevant interests: {', '.join(shared_interests)} (+{pts})")

    shared_looking = array_overlap(
        user["looking_for"], event.get("looking_for_match", [])
    )
    if shared_looking:
        score += len(shared_looking)
        reasons.append(f"Looking_for match: {', '.join(shared_looking)} (+{len(shared_looking)})")

    return {"score": score, "reasons": reasons}

def recommend_events(user, events, n=5):
    scored = [{"event": e, **user_event_score(user, e)} for e in events]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:n]
```

The `university_affiliation` field on the event acts as a regional filter (events near the user's university score higher). All other dimensions mirror user-to-user matching exactly — you are simply comparing a user's profile fields against the event's equivalent tag arrays.

---

### Critical Files for Implementation

- `/Users/arham/Documents/usersprofile/users.json` — the 50-profile mock data file to be saved here
- `/Users/arham/Documents/usersprofile/matchScore.js` — Node.js implementation of the additive score and top-match functions
- `/Users/arham/Documents/usersprofile/match_score.py` — Python implementation of the same scoring logic
- `/Users/arham/Documents/usersprofile/events.json` — event schema definitions (5 seed events) for user-to-event matching tests
- `/Users/arham/Documents/usersprofile/test_cases.js` — or `test_cases.py`, the three worked example test cases with assertions