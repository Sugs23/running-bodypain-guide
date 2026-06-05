/**
 * riskEngine.js — v3.2
 *
 * Fix: sorting pileup at 60.
 *
 * v3.1 capped all no-symptom scores at exactly 60, so 10+ muscles all landed
 * at the same value and sorted by insertion order — bumping important muscles
 * like it_band_knee out of the top 10.
 *
 * v3.2 replaces the hard cap with Watch-band rescaling:
 *   raw 31 → 31, raw 100 → 60, everything in between proportional.
 *   Scores stay differentiated (achilles 52, it_band_knee 49, glute_med 40),
 *   all still label as Watch (no symptom = no Elevated/High), but ordered
 *   correctly by actual load level.
 *
 * With a logged symptom the gate still works normally:
 *   'noted' → clamp to 50–75 (Elevated possible)
 *   'sharp' → clamp to 65–100 (High possible)
 */

// ── Keyword maps for symptom parsing ─────────────────────────────────────────

const KEYWORD_MUSCLE_MAP = [
  { keywords: ['shin splints', 'shin', 'shins', 'tibia'],                      muscles: ['shin_splints', 'lower_leg_general'] },
  { keywords: ['achilles', 'heel cord', 'tendon behind ankle'],                 muscles: ['achilles', 'calf_lower'] },
  { keywords: ['calf', 'calves', 'gastroc', 'gastrocnemius'],                   muscles: ['calf_upper', 'calf_lower', 'achilles'] },
  { keywords: ['runner\'s knee', 'kneecap', 'patella', 'patellofemoral'],       muscles: ['patellofemoral', 'knee_general'] },
  { keywords: ['knee', 'knees'],                                                 muscles: ['patellofemoral', 'it_band_knee', 'knee_general'] },
  { keywords: ['it band', 'itb', 'outer knee', 'lateral knee', 'iliotibial'],  muscles: ['it_band_knee', 'it_band', 'tfl'] },
  { keywords: ['hamstring', 'hamstrings', 'back of thigh', 'pulled thigh'],    muscles: ['hamstring'] },
  { keywords: ['quad', 'quads', 'quadriceps', 'front of thigh'],               muscles: ['quad', 'tfl'] },
  { keywords: ['piriformis', 'deep hip', 'sciatic'],                           muscles: ['piriformis'] },
  { keywords: ['hip', 'outer hip'],                                             muscles: ['glute_med', 'hip_flexor', 'it_band'] },
  { keywords: ['glute', 'glutes', 'butt'],                                     muscles: ['glute_med', 'glute_max', 'piriformis'] },
  { keywords: ['lower back', 'lumbar', 'back pain'],                           muscles: ['lower_back'] },
  { keywords: ['plantar', 'arch pain', 'foot pain', 'ball of foot', 'heel pain'], muscles: ['plantar_fascia', 'foot_general'] },
  { keywords: ['ankle', 'ankles'],                                              muscles: ['ankle_lateral', 'ankle_medial', 'achilles'] },
  { keywords: ['peroneal', 'outer ankle', 'lateral ankle'],                    muscles: ['peroneal', 'ankle_lateral'] },
  { keywords: ['patellar tendon', 'below kneecap', 'patellar'],                muscles: ['patellar_tendon'] },
]

const SHARP_INDICATORS = [
  'sharp', 'pain', 'hurts', 'hurt', 'injury', 'injured', 'return of',
  'back again', 'acting up', 'flaring', 'flared', 'strain', 'strained',
  'snap', 'pop', 'popped', 'limping', 'limp', 'had to stop', 'cut short',
  "couldn't finish", 'tender', 'swollen', 'aching', 'stabbing', 'throbbing',
  'really bad', 'pretty bad', 'weak in the knees', 'awful', 'terrible',
]

const GENERAL_FATIGUE_KEYWORDS = [
  'tired', 'exhausted', 'heavy legs', 'heavy', 'sore', 'worn out',
  'struggling', 'rough', 'off day', "wasn't feeling well", 'not feeling well',
  'weak', 'drained', 'beat', 'sluggish', 'got adjusted', 'adjusted into the run',
]


// ── Symptom parsing ───────────────────────────────────────────────────────────

export function parseActivitySymptoms(activities) {
  const symptoms = []

  for (const activity of activities) {
    const text = [activity.name ?? '', activity.description ?? ''].join(' ').toLowerCase()
    if (!text.trim()) continue

    const hasSharp   = SHARP_INDICATORS.some(k => text.includes(k))
    const hasFatigue = GENERAL_FATIGUE_KEYWORDS.some(k => text.includes(k))
    const alreadyMatched = new Set()

    for (const { keywords, muscles } of KEYWORD_MUSCLE_MAP) {
      if (!keywords.some(k => text.includes(k))) continue
      const groupKey = muscles.join(',')
      if (alreadyMatched.has(groupKey)) continue
      alreadyMatched.add(groupKey)

      symptoms.push({
        muscleIds: muscles,
        date:      activity.date,
        type:      hasSharp ? 'sharp' : 'noted',
        text:      (activity.name ?? '').slice(0, 80),
      })
    }

    if (hasFatigue && alreadyMatched.size === 0) {
      symptoms.push({
        muscleIds: ['general'],
        date:      activity.date,
        type:      'general',
        text:      (activity.name ?? '').slice(0, 80),
      })
    }
  }

  return symptoms
}


// ── Experience + age calibration ──────────────────────────────────────────────

function getExperienceTier(allTimeKm, experienceLevel) {
  if (allTimeKm != null) {
    if (allTimeKm < 500)  return 'beginner'
    if (allTimeKm < 2000) return 'intermediate'
    return 'advanced'
  }
  const level = (experienceLevel ?? '').toLowerCase()
  if (level.includes('advanced'))     return 'advanced'
  if (level.includes('intermediate')) return 'intermediate'
  return 'beginner'
}

const TIER_MULTIPLIER = {
  beginner:     0.75,
  intermediate: 1.00,
  advanced:     1.30,
}

function getAgeMultiplier(age) {
  if (!age || age > 45) return 1.00
  if (age <= 25)        return 1.15
  if (age <= 30)        return 1.10
  if (age <= 35)        return 1.05
  return 1.00
}


// ── ACWR ─────────────────────────────────────────────────────────────────────

function computeACWR(acute_km, monthly_km) {
  const chronic_weekly = monthly_km / 4
  if (chronic_weekly <= 0) return 1.0
  return acute_km / chronic_weekly
}

function normACWR(acwr) {
  if (acwr <= 1.3) return 0
  return Math.min((acwr - 1.3) / 0.7, 1)
}

function acwrStatus(acwr) {
  if (acwr < 0.8)  return { status: 'low',     label: 'Undertrained', color: '#FAC775',
    note: 'Volume is low — fitness may be declining' }
  if (acwr <= 1.3) return { status: 'optimal', label: 'On track',     color: '#5DCAA5',
    note: 'Training load is well-balanced' }
  if (acwr <= 1.5) return { status: 'caution', label: 'Caution',      color: '#EF9F27',
    note: 'Load ramping — manage recovery and sleep this week' }
  return             { status: 'high',    label: 'High load',   color: '#E24B4A',
    note: 'Load jumped faster than your base — prioritise easy days and sleep' }
}

export function computeSystemicLoad(riskScores) {
  return {
    acwr:   riskScores._acwr   ?? 1.0,
    status: riskScores._acwr_status ?? 'optimal',
    label:  riskScores._acwr_label  ?? 'On track',
    note:   riskScores._acwr_note   ?? '',
    color:  riskScores._acwr_color  ?? '#5DCAA5',
  }
}


// ── Symptom gate ──────────────────────────────────────────────────────────────

/**
 * Watch-band rescaling (no symptom / general fatigue):
 *   Maps raw [31, 100] → [31, 60] proportionally.
 *   raw 100 → 60 (Watch ceiling), raw 31 → 31 (Watch floor).
 *   Scores stay in the Watch band but are differentiated — no pileup at 60.
 */
function watchBandScale(rawScore) {
  if (rawScore < 31) return rawScore
  return Math.round(31 + ((Math.min(rawScore, 100) - 31) / 69) * 29)
}

// Symptom gate — only applies when a relevant symptom is logged
const SYMPTOM_GATE = {
  noted: { cap: 75,  floor: 50 },  // Elevated possible, not High
  sharp: { cap: 100, floor: 65 },  // Full High possible
}

function getSymptomLevel(muscleId, symptoms, withinDays = 14) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - withinDays)

  const relevant = symptoms.filter(s => {
    const inWindow      = new Date(s.date) >= cutoff
    const matchesMuscle = s.muscleIds.includes(muscleId) || s.muscleIds.includes('all')
    return inWindow && matchesMuscle
  })

  if (!relevant.length) return null
  if (relevant.some(s => s.type === 'sharp'))   return 'sharp'
  if (relevant.some(s => s.type === 'noted'))   return 'noted'
  return 'general'
}

function applyGate(rawScore, symptomLevel) {
  // No symptom or just general fatigue → rescale into Watch band
  if (!symptomLevel || symptomLevel === 'general') {
    return watchBandScale(rawScore)
  }
  // Specific symptom → hard clamp with floor (can reach Elevated / High)
  const { cap, floor } = SYMPTOM_GATE[symptomLevel] ?? SYMPTOM_GATE.noted
  return Math.min(Math.max(rawScore, floor), cap)
}

// Upper body: cap below Watch (28) without a symptom — invisible on model and floater
function applyUpperBodyGate(rawScore, symptomLevel) {
  if (!symptomLevel || symptomLevel === 'general') return Math.min(rawScore, 28)
  const { cap, floor } = SYMPTOM_GATE[symptomLevel] ?? SYMPTOM_GATE.noted
  return Math.min(Math.max(rawScore, floor), cap)
}


// ── Main export ───────────────────────────────────────────────────────────────

export function computeRiskScores(activities, athleteProfile, symptoms = []) {
  if (!activities || activities.length === 0) return {}

  const tier       = getExperienceTier(
    athleteProfile?.all_time_km,
    athleteProfile?.experience_level,
  )
  const ageMult    = getAgeMultiplier(athleteProfile?.age)
  const multiplier = TIER_MULTIPLIER[tier] * ageMult

  // ── Load metrics ──────────────────────────────────────────────────────────

  const last7            = filterLastDays(activities, 7)
  const prev7            = filterDayRange(activities, 8, 14)
  const last28           = filterLastDays(activities, 28)

  const weekly_km        = sum(last7,  'actual_km')
  const prev_weekly_km   = sum(prev7,  'actual_km')
  const monthly_km       = sum(last28, 'actual_km')
  const long_run_km      = max(last7,  'actual_km')
  const consecutive_days = getConsecutiveRunDays(activities)
  const acwr             = computeACWR(weekly_km, monthly_km)

  const weekly_increase  = prev_weekly_km > 0
    ? (weekly_km - prev_weekly_km) / prev_weekly_km
    : 0

  const weekly_elev      = sum(last7, 'elevation_gain')
  const avg_elev_per_km  = weekly_km > 0 ? weekly_elev / weekly_km : 0

  const suffer_last7     = avg(last7.map(a => a.suffer_score).filter(Boolean))
  const suffer_prev7     = avg(prev7.map(a => a.suffer_score).filter(Boolean))
  const suffer_trend     = suffer_prev7 > 0
    ? (suffer_last7 - suffer_prev7) / suffer_prev7
    : 0

  const hr_zone4_pct     = getHRZone4Pct(last7, athleteProfile?.hr_zones)
  const avg_pace_week    = getAvgPaceNum(last7)
  const shoe_km          = getShoeDistance(activities)

  // ── Thresholds ────────────────────────────────────────────────────────────

  const T = {
    weekly_km_mod:     50  * multiplier,
    weekly_km_high:    70  * multiplier,
    long_run_mod:      22  * multiplier,
    long_run_high:     30  * multiplier,
    consec_mod:        4,
    consec_high:       6,
    monthly_high:      250 * multiplier,
    elev_mod:          15,
    elev_high:         30,
    suffer_trend_mod:  0.25,
    suffer_trend_high: 0.50,
    shoe_warn:         600,
  }

  const experience_shin_factor = { beginner: 0.80, intermediate: 0.30, advanced: 0.10 }[tier]

  // ── Scored helpers ────────────────────────────────────────────────────────
  // scored()          — lower body muscles (Watch-band rescaling without symptom)
  // upperBodyScored() — neck/shoulder/upper_back (invisible without symptom)
  // Both store raw score in rawScores for zone coloring reference (_raw).

  const rawScores = {}

  function scored(muscleId, rawScore) {
    rawScores[muscleId] = rawScore
    return applyGate(rawScore, getSymptomLevel(muscleId, symptoms))
  }

  function upperBodyScored(muscleId, rawScore) {
    rawScores[muscleId] = rawScore
    return applyUpperBodyGate(rawScore, getSymptomLevel(muscleId, symptoms))
  }

  // ── Per-muscle scores ─────────────────────────────────────────────────────

  const scores = {

    // ── FOOT ─────────────────────────────────────────────────────────────
    plantar_fascia: scored('plantar_fascia', risk3(
      norm(weekly_km,       T.weekly_km_high),
      norm(long_run_km,     T.long_run_high),
      norm(avg_elev_per_km, T.elev_mod),
    )),
    metatarsalgia: scored('metatarsalgia', risk2(
      norm(weekly_km,       T.weekly_km_mod),
      norm(avg_elev_per_km, T.elev_high),
    )),
    sesamoid: scored('sesamoid', risk2(
      norm(weekly_km,       T.weekly_km_mod),
      norm(avg_elev_per_km, T.elev_high),
    )),
    black_toenail: scored('black_toenail', risk1(
      norm(long_run_km,     T.long_run_mod),
    )),
    foot_general: scored('foot_general', risk2(
      norm(weekly_km,       T.weekly_km_mod),
      norm(long_run_km,     T.long_run_mod),
    )),

    // ── ANKLE ────────────────────────────────────────────────────────────
    achilles: scored('achilles', risk3(
      norm(consecutive_days, T.consec_mod),
      normSuffer(suffer_trend, T.suffer_trend_mod),
      normACWR(acwr) * 0.6,
    )),
    ankle_lateral: scored('ankle_lateral', risk2(
      norm(consecutive_days, T.consec_high),
      norm(weekly_km,        T.weekly_km_mod),
    )),
    ankle_medial: scored('ankle_medial', risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(avg_elev_per_km,  T.elev_mod),
    )),
    ankle_general: scored('ankle_general', risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(consecutive_days, T.consec_mod),
    )),

    // ── LOWER LEG ────────────────────────────────────────────────────────
    shin_splints: scored('shin_splints', risk3(
      normACWR(acwr),
      norm(weekly_km,       T.weekly_km_high),
      experience_shin_factor,
    )),
    calf_upper: scored('calf_upper', risk3(
      norm(weekly_km,       T.weekly_km_mod),
      norm(long_run_km,     T.long_run_mod),
      normSuffer(suffer_trend, T.suffer_trend_mod),
    )),
    calf_lower: scored('calf_lower', risk2(
      norm(weekly_km,       T.weekly_km_high),
      norm(consecutive_days, T.consec_mod),
    )),
    peroneal: scored('peroneal', risk2(
      norm(weekly_km,       T.weekly_km_high),
      norm(avg_elev_per_km, T.elev_mod),
    )),
    lower_leg_general: scored('lower_leg_general', risk2(
      normACWR(acwr),
      norm(weekly_km,       T.weekly_km_mod),
    )),

    // ── KNEE ─────────────────────────────────────────────────────────────
    patellofemoral: scored('patellofemoral', risk3(
      norm(avg_elev_per_km, T.elev_high),
      norm(long_run_km,     T.long_run_high),
      norm(weekly_km,       T.weekly_km_high),
    )),
    it_band_knee: scored('it_band_knee', risk3(
      norm(long_run_km,     T.long_run_mod),
      normACWR(acwr) * 0.9,
      normSuffer(suffer_trend, T.suffer_trend_mod),
    )),
    patellar_tendon: scored('patellar_tendon', risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_mod),
    )),
    medial_knee: scored('medial_knee', risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(avg_elev_per_km,  T.elev_mod),
    )),
    knee_general: scored('knee_general', risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(long_run_km,      T.long_run_mod),
    )),

    // ── THIGH ────────────────────────────────────────────────────────────
    quad: scored('quad', risk3(
      norm(avg_elev_per_km,  T.elev_high),
      norm(long_run_km,      T.long_run_high),
      norm(weekly_km,        T.weekly_km_high),
    )),
    hamstring: scored('hamstring', risk3(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_mod),
      normSuffer(suffer_trend, T.suffer_trend_mod),
    )),
    adductor: scored('adductor', risk1(
      norm(weekly_km,        T.monthly_high / 4),
    )),
    tfl: scored('tfl', risk2(
      norm(long_run_km,      T.long_run_mod),
      norm(weekly_km,        T.weekly_km_mod),
    )),
    thigh_general: scored('thigh_general', risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(long_run_km,      T.long_run_mod),
    )),

    // ── HIP ──────────────────────────────────────────────────────────────
    glute_max: scored('glute_max', risk2(
      norm(long_run_km,      T.long_run_high),
      norm(weekly_km,        T.weekly_km_high),
    )),
    glute_med: scored('glute_med', risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(long_run_km,      T.long_run_mod),
    )),
    hip_flexor: scored('hip_flexor', risk2(
      norm(monthly_km,       T.monthly_high),
      norm(consecutive_days, T.consec_mod),
    )),
    it_band: scored('it_band', risk2(
      norm(long_run_km,      T.long_run_mod),
      norm(weekly_km,        T.weekly_km_mod),
    )),
    piriformis: scored('piriformis', risk2(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_high),
    )),
    hip_general: scored('hip_general', risk2(
      norm(weekly_km,        T.weekly_km_mod),
      norm(long_run_km,      T.long_run_mod),
    )),

    // ── UPPER BODY ───────────────────────────────────────────────────────
    lower_back: scored('lower_back', risk3(
      norm(weekly_km,        T.weekly_km_high),
      norm(consecutive_days, T.consec_mod),
      normSuffer(suffer_trend, T.suffer_trend_mod),
    )),
    neck:       upperBodyScored('neck',       risk1(norm(consecutive_days, T.consec_high))),
    shoulder:   upperBodyScored('shoulder',   risk1(norm(consecutive_days, T.consec_high))),
    upper_back: upperBodyScored('upper_back', risk1(norm(consecutive_days, T.consec_high))),
    core:       upperBodyScored('core',       risk1(
      norm(consecutive_days, T.consec_high) * normSuffer(suffer_trend, T.suffer_trend_high),
    )),
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const systemicLoad = acwrStatus(acwr)

  const readiness = computeReadiness({
    weekly_km, prev_weekly_km, long_run_km,
    weekly_increase, consecutive_days,
    suffer_trend, monthly_km, tier,
    target_km: T.weekly_km_mod,
  })

  return {
    ...scores,
    _raw:              rawScores,
    _weekly_km:        round1(weekly_km),
    _long_run_km:      round1(long_run_km),
    _weekly_increase:  Math.round(weekly_increase * 100),
    _consecutive_days: consecutive_days,
    _suffer_trend:     Math.round(suffer_trend * 100),
    _readiness:        Math.round(readiness),
    _tier:             tier,
    _shoe_km:          shoe_km,
    _monthly_km:       round1(monthly_km),
    _acwr:             round1(acwr),
    _acwr_status:      systemicLoad.status,
    _acwr_label:       systemicLoad.label,
    _acwr_note:        systemicLoad.note,
    _acwr_color:       systemicLoad.color,
  }
}


// ── Readiness score ───────────────────────────────────────────────────────────

function computeReadiness({ weekly_km, prev_weekly_km, long_run_km,
  weekly_increase, consecutive_days, suffer_trend, monthly_km,
  target_km, tier }) {

  const volume_score      = Math.min(weekly_km / target_km, 1)
  const consistency_score = prev_weekly_km > 0
    ? Math.max(0, 1 - Math.abs(weekly_increase) * 2)
    : 0.5
  const recovery_score    = Math.max(0, 1 - (consecutive_days - 3) / 4)
  const effort_score      = Math.max(0, 1 - suffer_trend * 2)
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

export function getRiskReason(muscleId, riskScores, symptoms = []) {
  const {
    _consecutive_days, _weekly_km, _long_run_km,
    _suffer_trend, _tier, _acwr,
  } = riskScores

  const consec   = _consecutive_days ?? 0
  const sufferUp = (_suffer_trend ?? 0) > 20
  const acwr     = _acwr ?? 1.0
  const acwrHigh = acwr > 1.5
  const acwrMod  = acwr > 1.3

  const symptomLevel = getSymptomLevel(muscleId, symptoms)
  if (symptomLevel === 'sharp' || symptomLevel === 'noted') {
    const cutoff  = new Date(); cutoff.setDate(cutoff.getDate() - 14)
    const recent  = symptoms
      .filter(s => new Date(s.date) >= cutoff && s.muscleIds.includes(muscleId))
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0]

    if (recent) {
      const daysAgo = Math.round((Date.now() - new Date(recent.date)) / 86400000)
      const when    = daysAgo <= 1 ? 'today'
                    : daysAgo <= 3 ? `${daysAgo} days ago`
                    : `${daysAgo}d ago`
      const suffix  = symptomLevel === 'sharp'
        ? ' — take this seriously'
        : ' — load is elevated, monitor closely'
      return `You noted: "${recent.text.slice(0, 45)}" (${when})${suffix}`
    }
  }

  const reasons = {
    shin_splints:
      acwrHigh  ? `Training load jumped ${Math.round((acwr - 1) * 100)}% above your base — primary shin splint mechanism`
      : acwrMod  ? `Ramp rate above safe zone (ACWR ${acwr.toFixed(1)}) — shins need more base before more volume`
      : 'Weekly volume rising — building slowly is the main protection against shin splints',

    achilles:
      consec >= 5 ? `${consec} consecutive run days — Achilles needs a full rest day`
      : sufferUp  ? 'Effort trending up — tendon accumulating stress, watch for morning stiffness'
      : `${_weekly_km}km this week — Achilles load elevated, monitor for tightness`,

    patellofemoral:
      _long_run_km > 20 ? `${_long_run_km}km long run — kneecap load elevated, especially on downhills`
      : acwrMod          ? `Load ramp (ACWR ${acwr.toFixed(1)}) increasing knee joint stress`
      : 'Weekly volume above your current knee threshold — no symptoms yet',

    it_band_knee:
      acwrHigh           ? `Load ramp (ACWR ${acwr.toFixed(1)}) stressing the lateral chain — IT band typically loads past 15km`
      : _long_run_km > 18 ? `${_long_run_km}km long run — IT band friction builds past the 15km mark`
      : consec >= 4       ? `${consec} days running — IT band needs recovery time between long efforts`
      : 'Lateral knee load rising — tightness at ~15km is the early warning sign',

    plantar_fascia:
      _weekly_km > 55    ? `${_weekly_km}km this week — plantar load is high`
      : _long_run_km > 26 ? `${_long_run_km}km long run stressing the arch`
      : 'Volume rising — first step stiffness in the morning is the early warning sign',

    hamstring:
      consec >= 5 ? `${consec} consecutive days — hamstrings not recovering`
      : sufferUp  ? 'Effort rising week on week — hamstring fatigue accumulating'
      : 'Load elevated — watch for tightness at the start of runs',

    calf_upper:
      sufferUp          ? 'Runs getting harder for the same distance — gastrocnemius under stress'
      : _weekly_km > 50  ? `${_weekly_km}km this week loading the upper calf`
      : 'Calf load rising — monitor for tightness after harder sessions',

    lower_back:
      consec >= 5 ? `${consec} consecutive days — lumbar spine needs a break`
      : sufferUp  ? 'Effort trending up — lower back under accumulated load'
      : 'Weekly volume creating lower back stress — core strength is the best prevention',

    quad:
      _long_run_km > 20  ? `${_long_run_km}km long run — quads under eccentric load, especially downhills`
      : acwrMod           ? `Load spike — quads not yet adapted to this volume`
      : 'Long run distance elevating quad load',

    glute_med:
      _weekly_km > 60    ? `${_weekly_km}km this week — abductor fatigue building`
      : acwrMod           ? `Volume spike — glute med slow to adapt to sudden load increases`
      : 'Weekly volume above glute threshold — hip drops when fatigued, loads the knee',

    it_band:
      _long_run_km > 18  ? `${_long_run_km}km long run — TFL and upper IT band under sustained load`
      : acwrHigh          ? `Load ramp affecting lateral chain — glute med and TFL both loading up`
      : 'Volume rising — lateral hip chain building stress',

    tfl:
      _weekly_km > 40    ? `${_weekly_km}km this week — TFL (outer thigh) under sustained load`
      : 'Volume building — TFL fatigue can transfer into IT band pain',

    hip_flexor:
      consec >= 4 ? `${consec} consecutive running days — hip flexors shortening without rest`
      : 'Monthly volume high — hip flexors accumulating tightness',

    glute_max:
      _long_run_km > 25  ? `${_long_run_km}km long run — high propulsion demand on glute max`
      : 'Volume and long run distance loading the glutes',

    patellar_tendon:
      consec >= 5 ? `${consec} consecutive days — patellar tendon needs rest`
      : `${_weekly_km}km this week — tendon load accumulating`,
  }

  return reasons[muscleId]
    ?? (acwrHigh  ? `Load ramp above safe zone (ACWR ${acwr.toFixed(1)}) — manage this week`
      : acwrMod   ? `Training ramp above ideal — keep effort moderate`
      : consec >= 4 ? `${consec} consecutive run days — rest day soon`
      : sufferUp  ? 'Effort trending up week on week'
      : `${_weekly_km}km this week — monitor this area`)
}


// ── Risk level & readiness labels ─────────────────────────────────────────────

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


// ── Top risks for the floating widget ────────────────────────────────────────

const MUSCLE_LABELS = {
  shin_splints:    { label: 'Shin splints',      zone: 'lower_leg',  muscle: 'shin_splints' },
  achilles:        { label: 'Achilles',           zone: 'ankle',      muscle: 'achilles' },
  it_band_knee:    { label: 'IT band (knee)',      zone: 'knee',       muscle: 'it_band_knee' },
  patellofemoral:  { label: "Runner's knee",      zone: 'knee',       muscle: 'patellofemoral' },
  hamstring:       { label: 'Hamstrings',          zone: 'thigh',      muscle: 'hamstring' },
  plantar_fascia:  { label: 'Plantar fasciitis',  zone: 'foot',       muscle: 'plantar_fascia' },
  calf_upper:      { label: 'Calf (upper)',         zone: 'lower_leg',  muscle: 'calf_upper' },
  calf_lower:      { label: 'Calf (lower)',         zone: 'lower_leg',  muscle: 'calf_lower' },
  lower_back:      { label: 'Lower back',          zone: 'lower_back', muscle: 'lower_back' },
  quad:            { label: 'Quads',               zone: 'thigh',      muscle: 'quad' },
  glute_med:       { label: 'Glute medius',         zone: 'hip',        muscle: 'glute_med' },
  it_band:         { label: 'IT band (hip)',         zone: 'hip',        muscle: 'it_band' },
  hip_flexor:      { label: 'Hip flexors',          zone: 'hip',        muscle: 'hip_flexor' },
  patellar_tendon: { label: 'Patellar tendon',      zone: 'knee',       muscle: 'patellar_tendon' },
  ankle_lateral:   { label: 'Outer ankle',          zone: 'ankle',      muscle: 'ankle_lateral' },
  metatarsalgia:   { label: 'Ball of foot',         zone: 'foot',       muscle: 'metatarsalgia' },
  piriformis:      { label: 'Piriformis',           zone: 'hip',        muscle: 'piriformis' },
  tfl:             { label: 'TFL / outer thigh',    zone: 'thigh',      muscle: 'tfl' },
  glute_max:       { label: 'Glute max',            zone: 'hip',        muscle: 'glute_max' },
  peroneal:        { label: 'Peroneal',             zone: 'lower_leg',  muscle: 'peroneal' },
}

export function getTopRisks(riskScores, limit = 10, symptoms = []) {
  return Object.entries(MUSCLE_LABELS)
    .map(([id, meta]) => ({
      ...meta,
      score:      riskScores[id] ?? 0,
      risk:       getRiskLevel(riskScores[id] ?? 0),
      reason:     getRiskReason(id, riskScores, symptoms),
      hasSymptom: getSymptomLevel(id, symptoms) !== null,
    }))
    .filter(m => m.risk !== null)
    .sort((a, b) => {
      const levelOrder = { high: 0, elevated: 1, watch: 2 }
      const lo = (levelOrder[b.risk?.level] ?? 3) - (levelOrder[a.risk?.level] ?? 3)
      return lo !== 0 ? lo : b.score - a.score  // scores now differentiated — no pileup
    })
    .slice(0, limit)
}

export function getAtRiskSummary(riskScores, symptoms = []) {
  const all = getTopRisks(riskScores, 20, symptoms)
  return {
    confirmedCount: all.filter(m => m.risk?.level === 'elevated' || m.risk?.level === 'high').length,
    watchCount:     all.filter(m => m.risk?.level === 'watch').length,
    systemic:       computeSystemicLoad(riskScores),
  }
}


// ── Math helpers ──────────────────────────────────────────────────────────────

function norm(value, threshold) {
  if (!value || !threshold) return 0
  return Math.min(value / threshold, 1)
}

function normSuffer(trend, threshold) {
  if (!trend || trend <= 0) return 0
  return Math.min(trend / threshold, 1)
}

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
  const dates    = [...new Set(activities.map(a => a.date))].sort().reverse()
  let streak     = 0
  let expected   = new Date()
  expected.setHours(0, 0, 0, 0)

  for (const dateStr of dates) {
    const d    = new Date(dateStr)
    const diff = Math.round((expected - d) / (1000 * 60 * 60 * 24))
    if (diff <= 1) { streak++; expected = d }
    else break
  }
  return streak
}

function getAvgPaceNum(activities) {
  const paces = activities.map(a => a.avg_pace_num).filter(Boolean)
  if (!paces.length) return null
  return avg(paces)
}

function getHRZone4Pct(activities, hrZones) {
  if (!hrZones) return null
  const zone4 = hrZones.find(z => z.zone === 4)
  if (!zone4) return null
  const hrActivities = activities.filter(a => a.avg_hr)
  if (!hrActivities.length) return null
  return hrActivities.filter(a => a.avg_hr >= zone4.min).length / hrActivities.length
}

function getShoeDistance(activities) {
  const gears = activities.map(a => a.gear).filter(Boolean)
  if (!gears.length) return null
  return gears[0]?.distance_km ?? null
}
