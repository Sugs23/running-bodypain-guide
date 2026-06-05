# Body Pain Guide — Project Report & Integration Reference

**Version:** 1.0  
**Last updated:** June 2026  
**Author:** Sugandh Sinha  
**Live app:** https://bodypain-guide.vercel.app  
**Repo:** https://github.com/Sugs23/running-bodypain-guide  

---

## 1. What this app is

An interactive 3D anatomy web app for runners. The user clicks a body zone, selects a specific muscle, picks a severity level, and gets structured information on why it hurts, short-term relief, and long-term prevention. The app connects to Strava and uses the last 90 days of training data to personalise injury risk scores across 25+ muscle groups.

**Key design principles:**
- Data never leaves the user's browser — no server-side storage
- Risk engine degrades gracefully — if a data signal is null, it contributes zero, not noise
- All thresholds scale to the user's experience tier (derived from lifetime km)
- Content is static JSON — easy to edit without touching code

---

## 2. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 18 + Vite | SPA, no router library needed |
| 3D | Three.js + React Three Fiber | GLB model loaded via useGLTF |
| State | Zustand | Single store, no context boilerplate |
| Styling | Tailwind CSS + inline styles | Tailwind for layout, inline for component-specific |
| Backend | Vercel Serverless Functions | Only one function: `/api/strava-token.js` |
| Hosting | Vercel | Free tier, auto-deploy from GitHub |
| Data | Strava OAuth v3 API | Client-side fetch after token exchange |

---

## 3. Repository structure

```
bodypain-guide/
├── api/
│   └── strava-token.js          # Serverless — OAuth token exchange only
├── public/
│   └── models/
│       └── body.glb             # 3D body model (Mixamo, textures stripped)
├── src/
│   ├── components/
│   │   ├── Scene/
│   │   │   ├── index.jsx        # Canvas setup, lights, OrbitControls
│   │   │   ├── BodyModel.jsx    # Loads GLB, raycasting, zone highlighting
│   │   │   └── CameraRig.jsx    # Smooth camera lerp to selected zone
│   │   ├── UI/
│   │   │   ├── ZoneSelector.jsx    # Level 1 — sidebar zone list
│   │   │   ├── MuscleSelector.jsx  # Level 2 — muscle picker (lower body)
│   │   │   ├── PainPanel.jsx       # Why/relief/prevention content
│   │   │   ├── SeverityPicker.jsx  # Mild/Moderate/Severe toggle
│   │   │   ├── StravaWidget.jsx    # Connected state, 4 stat blocks
│   │   │   ├── RiskWidget.jsx      # Floating beacon, ranked risk list
│   │   │   ├── RiskBadge.jsx       # Inline risk label component
│   │   │   └── BottomDrawer.jsx    # Slides up 30vh on zone select
│   │   └── Layout/
│   │       ├── Sidebar.jsx         # Left panel — Strava + zone list
│   │       └── Header.jsx          # Breadcrumb: Body > Zone > Muscle
│   ├── content/
│   │   ├── zones.json           # Zone definitions + mesh names
│   │   ├── muscles.json         # Muscle list per zone
│   │   └── pain-data/           # 34 JSON files, one per muscle/area
│   ├── hooks/
│   │   └── useStrava.js         # OAuth, fetch, cache, stream logic
│   ├── store/
│   │   └── useAppStore.js       # Zustand store
│   └── utils/
│       ├── riskEngine.js        # All risk calculations + dynamic reasons
│       ├── stravaTransform.js   # Raw Strava API → internal schema
│       └── cameraPositions.js  # Named camera positions per zone
├── vercel.json                  # SPA rewrite rules
└── .env.local                   # STRAVA_CLIENT_SECRET (never committed)
```

---

## 4. Data flow (end to end)

```
User connects Strava
  │
  ├── Browser redirects to Strava OAuth
  ├── Strava redirects back with ?code=
  ├── Browser POSTs code to /api/strava-token (Vercel serverless)
  ├── Serverless exchanges code for access_token (secret stays server-side)
  └── access_token stored in sessionStorage

useStrava.fetchAllData(token)
  │
  ├── GET /v3/athlete                    → profile, weight, sex
  ├── GET /v3/athlete/zones              → HR zones (may 401 — caught)
  ├── GET /v3/athletes/{id}/stats        → all-time km, ytd km, recent 4wk
  ├── GET /v3/athlete/activities         → last 90 days, 200 activities max
  ├── GET /v3/gear/{id}                  → shoe data per unique gear_id
  └── GET /v3/activities/{id}/streams    → HR, cadence, altitude (long runs only >15km, cached)

stravaTransform.js
  └── Raw API → internal schema (actual_km, avg_pace_num, elevation_gain,
                                  suffer_score, workout_type, gear, streams)

computeRiskScores(activities, athleteProfile)
  └── Returns { muscle_id: 0-100, _weekly_km, _readiness, _tier, ... }

Zustand store
  └── setActivities(), setRiskScores() → triggers re-render across all components

Saved to localStorage (6h TTL) → restored on page reload without re-fetching
```

---

## 5. Risk engine architecture

**File:** `src/utils/riskEngine.js`

### Experience tiers
```javascript
// Derived from athleteProfile.all_time_km
beginner:     < 500km  → multiplier 0.65  (tightest thresholds)
intermediate: 500-2000 → multiplier 1.0
advanced:     > 2000km → multiplier 1.35  (most relaxed)
```

### Input signals (per user)
| Signal | Source | Null behaviour |
|---|---|---|
| `weekly_km` | Strava activities | Defaults to 0 |
| `prev_weekly_km` | Strava activities | Defaults to 0 |
| `weekly_increase` | Derived | 0 if no prior week |
| `long_run_km` | Max single run last 7d | 0 if no runs |
| `consecutive_days` | Derived from dates | 0 |
| `suffer_score` | Strava field | Skipped if null |
| `suffer_trend` | Week-over-week suffer avg | 0 if insufficient data |
| `elevation_gain` | Strava field | 0 if not recorded |
| `avg_hr` | Strava field | Not used if null |
| `hr_zones` | Strava /athlete/zones | Not used if 401 |
| `all_time_km` | Strava athlete stats | Falls back to beginner tier |

### Per-muscle scoring
Each muscle uses 1–3 signals via `risk1()`, `risk2()`, `risk3()` helpers:
```javascript
risk1(f1)         → f1 * 100, capped at 100
risk2(f1, f2)     → average of f1, f2, * 100
risk3(f1, f2, f3) → average of f1, f2, f3, * 100
norm(value, threshold) → value/threshold, capped at 1
normSuffer(trend, threshold) → only counts positive trends (fatigue)
```

### Risk levels
```
0–30:   no badge
31–60:  Watch    (#FAC775 amber)
61–80:  Elevated (#EF9F27 orange)
81–100: High risk (#E24B4A red, pulses)
```

### Dynamic reason strings
`getRiskReason(muscleId, riskScores)` returns a one-line human explanation
using if/else templates filled with actual numbers. No LLM needed.

### Readiness score
Composite 0–100:
```
volume_score      × 0.25   (weekly_km / target)
consistency_score × 0.25   (no large week-over-week swings)
recovery_score    × 0.20   (consecutive days penalty)
effort_score      × 0.15   (suffer trend penalty)
base_score        × 0.15   (monthly volume / target × 4)
```

---

## 6. Content system

### zones.json
Defines Level 1 clickable zones. Key fields:
- `id` — matches camera position key and risk engine output key
- `direct: true` — upper body, opens panel immediately
- `direct: false` — lower body, shows muscle picker first
- `meshNames` — array of GLB mesh names that map to this zone

### muscles.json
Keyed by zone id. Each muscle has:
- `id` — matches pain-data filename and risk engine output key
- `label` — display name
- `sub` — one-line context shown in picker

### pain-data/{muscle_id}.json
Schema per file:
```json
{
  "id": "plantar_fascia",
  "zone": "foot",
  "display_name": "...",
  "subtitle": "...",
  "strava_risk_triggers": {
    "weekly_km_threshold": 50,
    "long_run_km_threshold": 28,
    "risk_note": "..."
  },
  "severity_levels": {
    "mild":     { "description", "can_run", "can_run_note", "urgency_label", "urgency_color", "why[]", "relief[]", "prevention[]" },
    "moderate": { ... },
    "severe":   { ... }
  },
  "see_physio_if": [...]
}
```

**34 files total:**
- 5 upper body (neck, shoulder, upper_back, lower_back, core) — direct
- 23 lower body muscles
- 6 general fallbacks (hip_general, thigh_general, etc.)

---

## 7. 3D model system

### Current model
- Source: Mixamo character (free, Adobe account required)
- Processed in Blender: separated into named meshes, textures stripped
- File: `public/models/body.glb` — ~600KB after texture removal
- Loaded via `useGLTF('/models/body.glb')` with preload

### Mesh naming convention
```
zone_neck
zone_shoulder_left / zone_shoulder_right
zone_upper_back
zone_lower_back
zone_core
zone_hip_left / zone_hip_right
zone_thigh_left / zone_thigh_right
zone_knee_left / zone_knee_right
zone_lower_leg_left / zone_lower_leg_right
zone_ankle_left / zone_ankle_right
zone_foot_left / zone_foot_right
zone_body_base    ← non-interactive fill (torso, arms, head)
```

### MESH_TO_ZONE mapping (in BodyModel.jsx)
```javascript
zone_knee_left  → 'knee'
zone_knee_right → 'knee'
// Left/right meshes map to the same zone id
```

### Raycasting flow
1. User clicks canvas → Three.js raycaster hits mesh
2. `mesh.name` looked up in `MESH_TO_ZONE`
3. `selectZone(zoneId)` called on Zustand store
4. Camera lerps to zone (CameraRig via useFrame)
5. BottomDrawer opens — MuscleSelector or PainPanel depending on zone type

### Camera positions
Named positions in `src/utils/cameraPositions.js`. On zone select, CameraRig
lerps camera position once then stops — OrbitControls take over. User can
rotate freely after zoom.

---

## 8. Expanding the 3D model (Blender guide for future work)

### When to expand
- Adding new zones not currently interactive (e.g. forearm, hamstring separate from thigh)
- Splitting zones that are currently merged (e.g. knee into patella vs lateral vs medial)
- Improving mesh accuracy

### Blender workflow (from scratch or expanding existing)
1. Open `body.glb` in Blender: File → Import → glTF 2.0
2. In Object Mode, click the zone mesh to expand
3. Tab into Edit Mode → Face Select (press 3)
4. Select faces for the new sub-zone
5. P → Separate by Selection
6. Rename new object in Outliner to `zone_newname`
7. Export: File → Export → glTF 2.0
   - Format: GLB
   - Materials: No export (keeps file small)
   - Animation: unchecked
8. Strip textures if any crept in (run `strip_textures.py`)

### Adding a new zone to the app after Blender
Four files to update:

**1. `src/utils/cameraPositions.js`**
```javascript
new_zone: { pos: [x, y, z], target: [x, y, z] }
```

**2. `src/content/zones.json`**
```json
{
  "id": "new_zone",
  "label": "Display name",
  "level": 1,
  "direct": false,
  "meshNames": ["zone_newname"]
}
```

**3. `src/content/muscles.json`**
Add muscle list under the new zone id.

**4. `src/components/Scene/BodyModel.jsx`**
Add to MESH_TO_ZONE:
```javascript
zone_newname: 'new_zone',
```

**5. `src/content/pain-data/`**
Create JSON files for each new muscle.

**6. `src/utils/riskEngine.js`**
Add risk score calculation for each new muscle in `computeRiskScores()`.

---

## 9. Integration architecture — adding new data sources

This is the centrepiece for future expansion.

### How Strava plugs in (the reference pattern)

```
External API
    ↓
useStrava.js          ← OAuth, fetch, cache orchestration
    ↓
stravaTransform.js    ← Raw API response → internal schema
    ↓
Zustand store         ← setActivities(), setRiskScores()
    ↓
riskEngine.js         ← Reads activities + athleteProfile → risk scores
    ↓
UI components         ← Read riskScores from store
```

Every new integration follows this exact pattern. The risk engine is the
single consumer of all data — new sources just add more signals to it.

### Internal activity schema (what riskEngine.js expects)
Any data source must transform its output to match this shape:

```javascript
{
  // Required
  date:           '2026-06-01',      // YYYY-MM-DD string
  actual_km:      10.5,              // distance in km

  // Strongly recommended
  time_min:       62.0,              // moving time in minutes
  avg_pace_num:   5.9,               // min/km as float
  elevation_gain: 120,               // metres

  // Optional — null if not available
  avg_hr:         null,
  max_hr:         null,
  avg_cadence:    null,              // steps per minute (both feet)
  suffer_score:   null,             // 0–200+
  perceived_exertion: null,         // RPE 1–10
  workout_type:   0,                // 0=easy, 1=race, 2=long, 3=workout
  gear_id:        null,
  streams:        null,             // second-by-second data if available
}
```

### athleteProfile schema (what riskEngine.js expects)
```javascript
{
  all_time_km:    306,    // lifetime distance — sets experience tier
  weight_kg:      77,
  sex:            'M',
  hr_zones:       null,  // array of {zone, min, max} or null
  recent_4wk_km:  113,
  ytd_km:         306,
}
```

---

## 10. Future integrations — technical spec

### Pattern for any new integration

Create these files:
```
src/hooks/use{Source}.js          ← Auth + fetch + cache
src/utils/{source}Transform.js    ← Raw → internal schema
api/{source}-token.js             ← Serverless OAuth handler (if OAuth)
```

Update these files:
```
src/store/useAppStore.js          ← Add connected state + token
src/components/UI/{Source}Widget.jsx  ← Sidebar widget
src/utils/riskEngine.js           ← Add new signals to relevant muscles
```

---

### Hevy (gym workouts)

**What it provides:** Exercise name, sets, reps, weight, RPE, rest time  
**API:** Hevy has a public API (hevy.com/api-docs) — requires API key, no OAuth  
**Auth pattern:** API key in `.env.local`, no serverless function needed  

**New signals for risk engine:**
```javascript
// From Hevy activities on the same day or day before a run
leg_session_yesterday:  bool     // squats/deadlifts before a run = elevated hamstring/quad risk
upper_session_load:     number   // press volume = shoulder risk
total_weekly_sets:      number   // overall fatigue proxy
leg_weekly_volume_kg:   number   // total kg moved in leg exercises
```

**New muscles to flag with gym data:**
- `quad` — heavy squat session + long run same week
- `hamstring` — Romanian deadlift + speed session
- `lower_back` — deadlift + consecutive run days
- `shoulder` — bench/overhead press + high run volume

**Transform shape:**
```javascript
{
  date:               '2026-06-01',
  source:             'hevy',
  workout_type:       'legs',        // 'legs', 'upper', 'full_body', 'cardio'
  total_volume_kg:    4500,
  primary_muscles:    ['quad', 'hamstring', 'glute_max'],
  rpe_avg:            7.5,
  duration_min:       55,
}
```

---

### Garmin / Apple Health / Whoop

**What they provide:** Everything Strava has + sleep, HRV, recovery score, body battery  
**Key new signals:**
```javascript
sleep_hours:       7.5,    // fills the null in fatigue_score formula
sleep_quality:     0.78,   // 0–1 score
hrv_morning:       52,     // ms — low HRV = poor recovery
recovery_score:    72,     // Whoop's own 0–100
body_battery:      65,     // Garmin's 0–100
resting_hr:        52,     // vs baseline
```

**Impact on risk engine:**
The existing fatigue formula becomes fully accurate:
```javascript
// Currently estimated — becomes real with sleep data
fatigue_score = (avg_rpe * 0.5) + ((7 - sleep_hours) * 0.3) + (hr_drift * 0.2)
```

**Auth:** Apple Health requires iOS app (not web). Garmin and Whoop have OAuth APIs.

---

### Generic CSV / manual log

For any source without an API:

```javascript
// src/hooks/useManualLog.js
// Accepts CSV upload or manual entry form
// Fields: date, type (run/gym/other), duration_min, rpe, notes
// Transforms to internal schema and merges with Strava activities
```

This is the lowest-friction way to add sleep, RPE, and cross-training
without building OAuth flows.

---

## 11. Multi-source data merging

When multiple sources are active, activities need to be deduplicated and merged.

**Strategy:**
```javascript
// src/utils/mergeActivities.js (to be created)

function mergeActivities(stravaActivities, hevyWorkouts, manualLogs) {
  // 1. Combine all arrays
  // 2. Deduplicate by date + type (same date, same type = duplicate)
  // 3. For overlapping fields (e.g. RPE from Hevy AND manual log),
  //    priority: manual > Hevy > Strava > estimated
  // 4. Return unified array with source field on each activity
}
```

**Source priority for conflicting signals:**
```
manual_log > hevy > garmin > apple_health > strava > estimated
```

---

## 12. UI expansion for multiple sources

### Sidebar widget pattern
Each source gets its own widget following `StravaWidget.jsx` as template:
- Connected state with disconnect button
- 3–4 key stats
- Data range shown
- Optional warning if data is stale

### Source selector (future)
When 3+ sources are connected, a source toggle in the sidebar lets users
see which data is influencing their risk scores.

---

## 13. Strava-specific notes

- **Rate limits:** 200 req/15min, 2000/day per app
- **Streams endpoint:** 1 call per activity — only fetch for long runs (>15km), cache permanently
- **Zones endpoint:** Requires expanded access — catch 401 gracefully
- **Token expiry:** 6 hours — currently requires reconnect, token refresh not implemented
- **Scope:** `activity:read,read` — sufficient for all current features
- **Client ID:** 254701 — hardcoded in useStrava.js and api/strava-token.js
- **Athlete limit:** 200 on free Strava API tier

---

## 14. Known limitations & future work

| Area | Current state | Future improvement |
|---|---|---|
| Token refresh | Reconnect required every 6h | Implement refresh_token flow |
| Sleep data | Defaulted/absent | Garmin/Whoop/Apple Health integration |
| RPE | Estimated from suffer_score | Manual log or Hevy input |
| Cadence | Null for most users | Requires GPS watch |
| Mobile layout | Functional but not optimised | Responsive layout pass |
| Gym data | Not integrated | Hevy API |
| Injury history | Not tracked | Manual input form |
| Multiple users | Works, 200 athlete Strava limit | Upgrade Strava API tier |
| Back/rear body view | T-pose, front only visible | Add rotate-to-back button |
| Blender zones | 18 zones | Can split thigh into quad/hamstring mesh |

---

## 15. Environment variables

| Variable | Location | Purpose |
|---|---|---|
| `STRAVA_CLIENT_SECRET` | Vercel env + `.env.local` | OAuth token exchange — server only |
| (none others currently) | — | — |

The Strava Client ID (254701) is hardcoded in two places — safe to be public per Strava docs:
- `src/hooks/useStrava.js` line ~12
- `api/strava-token.js` line ~15

---

## 16. Deployment

- **Hosting:** Vercel (free tier)
- **Repo:** GitHub `Sugs23/running-bodypain-guide`
- **Auto-deploy:** Vercel watches `main` branch — push to deploy
- **Serverless functions:** `/api/` folder auto-detected by Vercel
- **SPA routing:** `vercel.json` rewrites all non-asset routes to `index.html`
- **Local dev:** `npx vite` (no Strava OAuth) or `npx vercel dev` (full stack)

---

*This document is intended as a technical handoff reference. A new Claude instance reading this should be able to understand the full system, add a new data source, expand the 3D model, or modify the risk engine without needing to re-read the codebase from scratch.*
