/**
 * riskEngine.js — v2
 *
 * Philosophy:
 * - If data exists, use it. If null, that factor contributes zero.
 * - All thresholds scale against experience tier (lifetime km).
 * - Outputs per-muscle risk scores + dynamic reason strings.
 */

// ── Experience tiers ─────────────────────────────────────────────────────────

function getExperienceTier(allTimeKm) {
  if (!allTimeKm || allTimeKm < 500)  return 'beginner'
  if (allTimeKm < 2000)               return 'intermediate'
  return 'advanced'
}

// Multiplier on thresholds — beginners hit risk sooner
const TIER_MULTIPLIER = {
  beginner:     0.65,
  intermediate: 1.0,
  advanced:     1.35,
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeRiskScores(activities, athleteProfile) {
  if (!activities || activities.length === 0) return {}

  const tier       = getExperienceTier(athleteProfile?.all_time_km)
  const multiplier = TIER_MULTIPLIER[tier]

  // ── Load metrics ────────────────────────────────────────────────────────────

  const last7   = filterLastDays(activities, 7)
  const prev7   = filterDayRange(activities, 8, 14)
  const last28  = filterLastDays(activities, 28)
  const last14  = filterLastDays(activities, 14)

  const weekly_km        = sum(last7,  'actual_km')
  const prev_weekly_km   = sum(prev7,  'actual_km')
  const monthly_km       = sum(last28, 'actual_km')
  const long_run_km      = max(last7,  'actual_km')
  const consecutive_days = getConsecutiveRunDays(activities)
  const rest_days_since  = getDaysSinceLastRest(activities)

  const weekly_increase  = prev_weekly_km > 0
    ? (weekly_km - prev_weekly_km) / prev_weekly_km
    : 0

  // Elevation load
  const weekly_elev      = sum(last7, 'elevation_gain')
  const avg_elev_per_km  = weekly_km > 0 ? weekly_elev / weekly_km : 0

  // Suffer score signals (best proxy for effort without HR)
  const suffer_last7     = avg(last7.map(a => a.suffer_score).filter(Boolean))
  const suffer_prev7     = avg(prev7.map(a => a.suffer_score).filter(Boolean))
  const suffer_trend     = suffer_prev7 > 0
    ? (suffer_last7 - suffer_prev7) / suffer_prev7
    : 0
  // Positive suffer_trend = getting harder for same volume = fatigue accumulating

  // HR signals (only when available)
  const hr_activities    = last7.filter(a => a.avg_hr)
  const avg_hr_week      = hr_activities.length > 0
    ? avg(hr_activities.map(a => a.avg_hr))
    : null
  const hr_zone4_pct     = getHRZone4Pct(last7, athleteProfile?.hr_zones)
  // % of runs in Z4+ = high intensity load

  // Pace signal
  const avg_pace_week    = getAvgPaceNum(last7)
  const goal_pace        = 5.40
  const pace_deviation   = avg_pace_week
    ? Math.abs((avg_pace_week - goal_pace) / goal_pace)
    : 0

  // Gear signal
  const shoe_km          = getShoeDistance(activities)

  // ── Thresholds (scaled by experience tier) ──────────────────────────────────

  const T = {
    weekly_km_mod:    50  * multiplier,
    weekly_km_high:   65  * multiplier,
    long_run_mod:     22  * multiplier,
    long_run_high:    28  * multiplier,
    increase_mod:     0.15,   // spike thresholds same for all — physics don't care about experience
    increase_high:    0.30,
    consec_mod:       4,
    consec_high:      6,
    monthly_high:     200 * multiplier,
    elev_mod:         15,     // m/km — hilly run
    elev_high:        30,
    suffer_trend_mod: 0.20,
    suffer_trend_high:0.40,
    shoe_warn:        600,
  }

  // ── Per-muscle risk scores ───────────────────────────────────────────────────
  // Each muscle uses the most relevant combination of signals.
  // risk2(f1, f2) = average of two normalised factors, capped at 100.

  const scores = {

    // ── FOOT ──────────────────────────────────────────────────────────────────
    plantar_fascia: risk3(
      norm(weekly_km,        T.weekly_km_high),
      norm(long_run_km,      T.long_run_high),
      norm(avg_elev_per_km,  T.elev_mod),
    ),
    metatarsalgia: risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(avg_elev_per_km,  T.elev_high),
    ),
    sesamoid: risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(avg_elev_per_km,  T.elev_high),
    ),
    black_toenail: risk1(
      norm(long_run_km,      T.long_run_mod),
    ),
    foot_general: risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(long_run_km,      T.long_run_mod),
    ),

    // ── ANKLE ─────────────────────────────────────────────────────────────────
    achilles: risk3(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_mod),
      normSuffer(suffer_trend, T.suffer_trend_mod),
    ),
    ankle_lateral: risk2(
      norm(consecutive_days, T.consec_high),
      norm(weekly_km,        T.weekly_km_mod),
    ),
    ankle_medial: risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(avg_elev_per_km,  T.elev_mod),
    ),
    ankle_general: risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(consecutive_days, T.consec_mod),
    ),

    // ── LOWER LEG ─────────────────────────────────────────────────────────────
    shin_splints: risk3(
      norm(weekly_increase,  T.increase_high),  // #1 cause
      norm(weekly_km,        T.weekly_km_high),
      norm1(1 / Math.max(athleteProfile?.all_time_km ?? 100, 100) * 5000),
      // inverse of experience — beginners much higher risk
    ),
    calf_upper: risk3(
      norm(weekly_km,        T.weekly_km_mod),
      norm(long_run_km,      T.long_run_mod),
      normSuffer(suffer_trend, T.suffer_trend_mod),
    ),
    calf_lower: risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_mod),
    ),
    peroneal: risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(avg_elev_per_km,  T.elev_mod),
    ),
    lower_leg_general: risk2(
      norm(weekly_increase,  T.increase_mod),
      norm(weekly_km,        T.weekly_km_mod),
    ),

    // ── KNEE ──────────────────────────────────────────────────────────────────
    patellofemoral: risk3(
      norm(long_run_km,      T.long_run_high),
      norm(weekly_km,        T.weekly_km_high),
      norm(avg_elev_per_km,  T.elev_high),  // downhills load kneecap most
    ),
    it_band_knee: risk3(
      norm(long_run_km,      T.long_run_mod),
      norm(weekly_km,        T.weekly_km_high),
      normSuffer(suffer_trend, T.suffer_trend_mod),
    ),
    patellar_tendon: risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_mod),
    ),
    medial_knee: risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(avg_elev_per_km,  T.elev_mod),
    ),
    knee_general: risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(long_run_km,      T.long_run_mod),
    ),

    // ── THIGH ─────────────────────────────────────────────────────────────────
    quad: risk3(
      norm(long_run_km,      T.long_run_high),
      norm(weekly_km,        T.weekly_km_high),
      norm(avg_elev_per_km,  T.elev_high),  // downhill = eccentric quad load
    ),
    hamstring: risk3(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_mod),
      normSuffer(suffer_trend, T.suffer_trend_mod),
    ),
    adductor: risk1(
      norm(weekly_km,        T.monthly_high / 4),
    ),
    tfl: risk2(
      norm(long_run_km,      T.long_run_mod),
      norm(weekly_km,        T.weekly_km_mod),
    ),
    thigh_general: risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(long_run_km,      T.long_run_mod),
    ),

    // ── HIP ───────────────────────────────────────────────────────────────────
    glute_max: risk2(
      norm(long_run_km,      T.long_run_high),
      norm(weekly_km,        T.weekly_km_high),
    ),
    glute_med: risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(long_run_km,      T.long_run_mod),
    ),
    hip_flexor: risk2(
      norm(monthly_km,       T.monthly_high),
      norm(consecutive_days, T.consec_mod),
    ),
    it_band: risk2(
      norm(long_run_km,      T.long_run_mod),
      norm(weekly_km,        T.weekly_km_mod),
    ),
    piriformis: risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_high),
    ),
    hip_general: risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(long_run_km,      T.long_run_mod),
    ),

    // ── UPPER BODY ────────────────────────────────────────────────────────────
    lower_back: risk3(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_mod),
      normSuffer(suffer_trend, T.suffer_trend_mod),
    ),
    neck:       risk1(norm(consecutive_days, T.consec_high)),
    shoulder:   risk1(norm(consecutive_days, T.consec_high)),
    upper_back: risk1(norm(consecutive_days, T.consec_high)),
    core:       risk1(norm(weekly_increase, T.increase_high)),
  }

  // ── Summary metrics (prefixed _ for UI use) ──────────────────────────────────

  const readiness = computeReadiness({
    weekly_km, prev_weekly_km, long_run_km,
    weekly_increase, consecutive_days,
    suffer_trend, monthly_km, tier,
    target_km: T.weekly_km_mod,
  })

  return {
    ...scores,
    _weekly_km:        round1(weekly_km),
    _long_run_km:      round1(long_run_km),
    _weekly_increase:  Math.round(weekly_increase * 100),
    _consecutive_days: consecutive_days,
    _suffer_trend:     Math.round(suffer_trend * 100),
    _readiness:        Math.round(readiness),
    _tier:             tier,
    _shoe_km:          shoe_km,
    _monthly_km:       round1(monthly_km),
  }
}

// ── Readiness score ───────────────────────────────────────────────────────────

function computeReadiness({ weekly_km, prev_weekly_km, long_run_km,
  weekly_increase, consecutive_days, suffer_trend, monthly_km,
  target_km, tier }) {

  const multiplier = TIER_MULTIPLIER[tier]

  // Volume score — are you hitting your target week?
  const volume_score      = Math.min(weekly_km / target_km, 1)

  // Consistency score — running regularly without overreaching
  const consistency_score = prev_weekly_km > 0
    ? Math.max(0, 1 - Math.abs(weekly_increase) * 2)
    : 0.5

  // Recovery score — are you resting enough?
  const recovery_score    = Math.max(0, 1 - (consecutive_days - 3) / 4)

  // Effort score — is training getting harder week on week?
  const effort_score      = Math.max(0, 1 - suffer_trend * 2)

  // Base fitness — monthly volume relative to target
  const base_score        = Math.min(monthly_km / (target_km * 4), 1)

  return (
    volume_score      * 0.25 +
    consistency_score * 0.25 +
    recovery_score    * 0.20 +
    effort_score      * 0.15 +
    base_score        * 0.15
  ) * 100
}

// ── Dynamic reason strings ────────────────────────────────────────────────────
// Called by the risk widget to generate one-line human explanations.

export function getRiskReason(muscleId, riskScores) {
  const {
    _weekly_increase, _consecutive_days, _weekly_km,
    _long_run_km, _suffer_trend, _tier,
  } = riskScores

  const increase = _weekly_increase ?? 0
  const consec   = _consecutive_days ?? 0
  const sufferUp = _suffer_trend > 20

  // Muscle-specific reasons — most specific match wins
  const reasons = {
    shin_splints:    increase > 30  ? `Mileage up ${increase}% this week — #1 cause of shin splints`
                   : increase > 15  ? `${increase}% weekly increase exceeds safe limit`
                   : _tier === 'beginner' ? 'Low running base — shin load is high'
                   : 'Weekly volume elevated for your base',

    achilles:        consec >= 5    ? `${consec} consecutive run days — Achilles needs rest`
                   : sufferUp       ? 'Effort trending up — tendon under cumulative stress'
                   : `${_weekly_km}km this week straining the tendon`,

    patellofemoral:  _long_run_km > 20 ? `${_long_run_km}km long run — kneecap load elevated`
                   : increase > 20  ? `${increase}% mileage spike increases knee stress`
                   : 'Weekly volume above your current knee threshold',

    it_band_knee:    _long_run_km > 18 ? `${_long_run_km}km long run — IT band friction point`
                   : consec >= 4    ? `${consec} days running — IT band not recovering`
                   : 'Lateral knee load elevated this week',

    plantar_fascia:  _weekly_km > 45   ? `${_weekly_km}km this week — high plantar load`
                   : _long_run_km > 24 ? `${_long_run_km}km long run stresses the arch`
                   : 'Foot load above your current threshold',

    hamstring:       consec >= 5    ? `${consec} consecutive days — hamstrings not recovering`
                   : sufferUp       ? 'Effort rising weekly — hamstring fatigue building'
                   : 'Running load elevated for hamstring recovery',

    calf_upper:      sufferUp       ? 'Runs getting harder — calf strain risk rising'
                   : _weekly_km > 40 ? `${_weekly_km}km this week loading the gastrocnemius`
                   : 'Calf load above recovery threshold',

    lower_back:      consec >= 5    ? `${consec} consecutive days — core fatigue building`
                   : sufferUp       ? 'Effort trending up — lower back under load'
                   : 'Weekly volume straining the lumbar region',

    quad:            _long_run_km > 20 ? `${_long_run_km}km long run — eccentric quad load high`
                   : increase > 20  ? `${increase}% mileage spike — quads under stress`
                   : 'Long run distance elevating quad load',

    glute_med:       _weekly_km > 50   ? `${_weekly_km}km this week — abductor fatigue`
                   : increase > 25  ? `${increase}% spike — glute med under sudden load`
                   : 'Weekly volume above glute threshold',
  }

  return reasons[muscleId]
    ?? (increase > 20   ? `${increase}% mileage increase this week`
      : consec >= 4     ? `${consec} consecutive run days`
      : sufferUp        ? 'Effort trending up week on week'
      : `${_weekly_km}km this week above your threshold`)
}

// ── Risk level helpers ────────────────────────────────────────────────────────

export function getRiskLevel(score) {
  if (!score || score < 31) return null
  if (score >= 81) return { level: 'high',     label: 'High risk', color: '#E24B4A' }
  if (score >= 61) return { level: 'elevated', label: 'Elevated',  color: '#EF9F27' }
  return               { level: 'watch',    label: 'Watch',     color: '#FAC775' }
}

export function getReadinessLabel(score) {
  if (score >= 80) return { label: 'On track',  color: '#5DCAA5' }
  if (score >= 60) return { label: 'Watch',     color: '#FAC775' }
  if (score >= 40) return { label: 'At risk',   color: '#EF9F27' }
  return               { label: 'Off track', color: '#E24B4A' }
}

// Returns sorted list of at-risk muscles for the floating widget
export function getTopRisks(riskScores, limit = 10) {
  const MUSCLE_LABELS = {
    shin_splints:    { label: 'Shin splints',      zone: 'lower_leg',  muscle: 'shin_splints' },
    achilles:        { label: 'Achilles',           zone: 'ankle',      muscle: 'achilles' },
    patellofemoral:  { label: "Runner's knee",      zone: 'knee',       muscle: 'patellofemoral' },
    it_band_knee:    { label: 'IT band (knee)',      zone: 'knee',       muscle: 'it_band_knee' },
    plantar_fascia:  { label: 'Plantar fasciitis',  zone: 'foot',       muscle: 'plantar_fascia' },
    hamstring:       { label: 'Hamstrings',         zone: 'thigh',      muscle: 'hamstring' },
    calf_upper:      { label: 'Calf (upper)',        zone: 'lower_leg',  muscle: 'calf_upper' },
    calf_lower:      { label: 'Calf (lower)',        zone: 'lower_leg',  muscle: 'calf_lower' },
    lower_back:      { label: 'Lower back',         zone: 'lower_back', muscle: 'lower_back' },
    quad:            { label: 'Quads',              zone: 'thigh',      muscle: 'quad' },
    glute_med:       { label: 'Glute medius',       zone: 'hip',        muscle: 'glute_med' },
    it_band:         { label: 'IT band (hip)',       zone: 'hip',        muscle: 'it_band' },
    hip_flexor:      { label: 'Hip flexors',        zone: 'hip',        muscle: 'hip_flexor' },
    patellar_tendon: { label: 'Patellar tendon',    zone: 'knee',       muscle: 'patellar_tendon' },
    ankle_lateral:   { label: 'Outer ankle',        zone: 'ankle',      muscle: 'ankle_lateral' },
    metatarsalgia:   { label: 'Ball of foot',       zone: 'foot',       muscle: 'metatarsalgia' },
    piriformis:      { label: 'Piriformis',         zone: 'hip',        muscle: 'piriformis' },
    tfl:             { label: 'TFL / outer thigh',  zone: 'thigh',      muscle: 'tfl' },
    glute_max:       { label: 'Glute max',          zone: 'hip',        muscle: 'glute_max' },
    peroneal:        { label: 'Peroneal',           zone: 'lower_leg',  muscle: 'peroneal' },
  }

  return Object.entries(MUSCLE_LABELS)
    .map(([id, meta]) => ({
      ...meta,
      score:  riskScores[id] ?? 0,
      risk:   getRiskLevel(riskScores[id] ?? 0),
      reason: getRiskReason(id, riskScores),
    }))
    .filter(m => m.risk !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// ── Math helpers ──────────────────────────────────────────────────────────────

// Normalise a value against a threshold → 0 to 1
function norm(value, threshold) {
  if (!value || !threshold) return 0
  return Math.min(value / threshold, 1)
}

// Suffer trend: only counts positive trends (fatigue), ignores recovery
function normSuffer(trend, threshold) {
  if (!trend || trend <= 0) return 0
  return Math.min(trend / threshold, 1)
}

// Clamp a raw normalised value
function norm1(value) {
  return Math.min(Math.max(value, 0), 1)
}

function risk1(f1)         { return Math.min(Math.round(f1 * 100), 100) }
function risk2(f1, f2)     { return Math.min(Math.round(((f1 + f2) / 2) * 100), 100) }
function risk3(f1, f2, f3) { return Math.min(Math.round(((f1 + f2 + f3) / 3) * 100), 100) }

function avg(arr) {
  if (!arr || !arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function sum(arr, key) {
  return arr.reduce((acc, a) => acc + (a[key] ?? 0), 0)
}

function max(arr, key) {
  if (!arr.length) return 0
  return Math.max(...arr.map(a => a[key] ?? 0))
}

function round1(n) { return Math.round(n * 10) / 10 }

function filterLastDays(activities, days) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return activities.filter(a => new Date(a.date) >= cutoff)
}

function filterDayRange(activities, from, to) {
  const now   = new Date()
  const start = new Date(); start.setDate(now.getDate() - to)
  const end   = new Date(); end.setDate(now.getDate() - from)
  return activities.filter(a => {
    const d = new Date(a.date)
    return d >= start && d <= end
  })
}

function getConsecutiveRunDays(activities) {
  const dates  = [...new Set(activities.map(a => a.date))].sort().reverse()
  let streak   = 0
  let expected = new Date()
  expected.setHours(0, 0, 0, 0)

  for (const dateStr of dates) {
    const d    = new Date(dateStr)
    const diff = Math.round((expected - d) / (1000 * 60 * 60 * 24))
    if (diff <= 1) { streak++; expected = d }
    else break
  }
  return streak
}

function getDaysSinceLastRest(activities) {
  const dates = [...new Set(activities.map(a => a.date))].sort().reverse()
  let days    = 0
  let prev    = new Date()
  prev.setHours(0, 0, 0, 0)

  for (const dateStr of dates) {
    const d    = new Date(dateStr)
    const diff = Math.round((prev - d) / (1000 * 60 * 60 * 24))
    if (diff > 1) break
    days++
    prev = d
  }
  return days
}

function getAvgPaceNum(activities) {
  const paces = activities
    .map(a => a.avg_pace_num)
    .filter(Boolean)
  if (!paces.length) return null
  return avg(paces)
}

function getHRZone4Pct(activities, hrZones) {
  if (!hrZones) return null
  const zone4 = hrZones.find(z => z.zone === 4)
  if (!zone4) return null
  const hrActivities = activities.filter(a => a.avg_hr)
  if (!hrActivities.length) return null
  const inZ4 = hrActivities.filter(a => a.avg_hr >= zone4.min)
  return inZ4.length / hrActivities.length
}

function getShoeDistance(activities) {
  const gears = activities.map(a => a.gear).filter(Boolean)
  if (!gears.length) return null
  const latest = gears[0]
  return latest?.distance_km ?? null
}