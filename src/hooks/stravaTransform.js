/**
 * stravaTransform.js
 * Transforms raw Strava API responses into the internal data schema.
 * Philosophy: collect everything available, normalise units, never discard.
 * Null values are preserved — the risk engine handles missing data gracefully.
 */

// ── Activity list transform ──────────────────────────────────────────────────

export function transformStravaActivities(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(a => a.type === 'Run' || a.sport_type === 'Run')
    .map(transformActivity)
}

export function transformActivity(a) {
  return {
    // Identity
    id:                   a.id,
    name:                 a.name ?? 'Run',
    date:                 a.start_date?.split('T')[0] ?? '',
    start_date:           a.start_date,
    timezone:             a.timezone,

    // Distance & time
    actual_km:            round2(a.distance / 1000),
    time_min:             round1(a.moving_time / 60),
    elapsed_min:          round1(a.elapsed_time / 60),
    rest_min:             round1((a.elapsed_time - a.moving_time) / 60), // stopped time

    // Pace & speed
    avg_pace:             derivePace(a.moving_time, a.distance),         // "5:24" min/km string
    avg_pace_num:         derivePaceNum(a.moving_time, a.distance),      // 5.4 min/km float
    avg_speed_kmh:        round2((a.average_speed ?? 0) * 3.6),
    max_speed_kmh:        round2((a.max_speed ?? 0) * 3.6),

    // Heart rate
    avg_hr:               a.average_heartrate ?? null,
    max_hr:               a.max_heartrate ?? null,

    // Cadence (Strava reports single-foot, multiply by 2 for total spm)
    avg_cadence:          a.average_cadence ? Math.round(a.average_cadence * 2) : null,

    // Elevation
    elevation_gain:       round1(a.total_elevation_gain ?? 0),
    elev_high:            round1(a.elev_high ?? 0),
    elev_low:             round1(a.elev_low ?? 0),
    elevation_per_km:     a.distance > 0
                            ? round2((a.total_elevation_gain ?? 0) / (a.distance / 1000))
                            : null,

    // Effort & load
    suffer_score:         a.suffer_score ?? null,           // Strava's effort score 0–200+
    perceived_exertion:   a.perceived_exertion ?? null,     // RPE 1–10 if manually logged
    kilojoules:           a.kilojoules ?? null,             // energy expenditure
    calories:             a.calories ?? null,

    // Run type context
    workout_type:         a.workout_type ?? 0,
    // 0 = default run, 1 = race, 2 = long run, 3 = workout
    workout_type_label:   WORKOUT_TYPE_LABELS[a.workout_type ?? 0],
    is_race:              a.workout_type === 1,
    is_long_run:          a.workout_type === 2,
    is_workout:           a.workout_type === 3,

    // Gear (shoe tracking)
    gear_id:              a.gear_id ?? null,

    // Flags
    trainer:              a.trainer ?? false,               // treadmill
    commute:              a.commute ?? false,

    // Derived flags useful for risk engine
    is_long:              (a.distance / 1000) >= 15,        // qualifies for stream fetch
    has_hr:               !!a.average_heartrate,
    has_cadence:          !!a.average_cadence,
  }
}

// ── Athlete profile transform ────────────────────────────────────────────────

export function transformAthleteProfile(athlete, stats, zones) {
  const hrZones = zones?.heart_rate?.zones ?? null

  return {
    // Identity
    id:               athlete.id,
    name:             `${athlete.firstname} ${athlete.lastname}`,
    sex:              athlete.sex ?? null,         // 'M' or 'F'
    city:             athlete.city ?? null,
    country:          athlete.country ?? null,
    premium:          athlete.summit ?? athlete.premium ?? false,

    // Physical
    weight_kg:        athlete.weight ?? null,

    // Experience (all-time volume = best proxy for injury resilience)
    all_time_km:      round1((stats?.all_run_totals?.distance ?? 0) / 1000),
    all_time_runs:    stats?.all_run_totals?.count ?? 0,
    all_time_elev:    round1((stats?.all_run_totals?.elevation_gain ?? 0)),

    // Year to date
    ytd_km:           round1((stats?.ytd_run_totals?.distance ?? 0) / 1000),
    ytd_runs:         stats?.ytd_run_totals?.count ?? 0,
    ytd_elev:         round1((stats?.ytd_run_totals?.elevation_gain ?? 0)),

    // Recent 4 weeks (Strava's own calculation)
    recent_4wk_km:    round1((stats?.recent_run_totals?.distance ?? 0) / 1000),
    recent_4wk_runs:  stats?.recent_run_totals?.count ?? 0,
    recent_4wk_elev:  round1((stats?.recent_run_totals?.elevation_gain ?? 0)),

    // HR zones (personal thresholds — more accurate than hardcoded 160bpm)
    hr_zones:         hrZones ? transformHRZones(hrZones) : null,
    // hr_zones = [{ zone: 1, min: 0, max: 115 }, { zone: 2, min: 115, max: 152 }, ...]
  }
}

function transformHRZones(zones) {
  return zones.map((z, i) => ({
    zone:  i + 1,
    min:   z.min,
    max:   z.max,
    label: HR_ZONE_LABELS[i] ?? `Z${i + 1}`,
  }))
}

// ── Activity streams transform ───────────────────────────────────────────────
// Streams are second-by-second arrays — summarise into useful metrics

export function transformActivityStreams(activityId, rawStreams) {
  const streams = {}
  rawStreams.forEach(s => { streams[s.type] = s.data })

  const hr        = streams.heartrate    ?? []
  const cadence   = streams.cadence      ?? []
  const altitude  = streams.altitude     ?? []
  const grade     = streams.grade_smooth ?? []
  const velocity  = streams.velocity_smooth ?? []
  const distance  = streams.distance    ?? []

  const totalPoints = hr.length || cadence.length || altitude.length || 1

  return {
    activity_id:          activityId,
    fetched_at:           new Date().toISOString(),

    // Heart rate analysis
    hr_available:         hr.length > 0,
    hr_drift:             hr.length > 20
                            ? round2(avg(hr.slice(-Math.floor(hr.length * 0.2)))
                              - avg(hr.slice(0, Math.floor(hr.length * 0.2))))
                            : null,
    // hr_drift: positive = HR rose over the run = fatigue signal
    hr_z4_pct:            null, // filled in by risk engine using athlete hr_zones
    hr_z5_pct:            null,
    hr_raw_last20pct:     hr.length > 5
                            ? avg(hr.slice(-Math.floor(hr.length * 0.2)))
                            : null,
    hr_raw_first20pct:    hr.length > 5
                            ? avg(hr.slice(0, Math.floor(hr.length * 0.2)))
                            : null,

    // Cadence analysis
    cadence_available:    cadence.length > 0,
    avg_cadence_spm:      cadence.length > 0
                            ? Math.round(avg(cadence) * 2)
                            : null,
    low_cadence_pct:      cadence.length > 0
                            ? round2(cadence.filter(c => c * 2 < 160).length / cadence.length * 100)
                            : null,
    // low_cadence_pct: % of run below 160spm = overstriding risk

    // Elevation analysis
    altitude_available:   altitude.length > 0,
    downhill_m:           altitude.length > 1
                            ? round1(calcDownhill(altitude))
                            : null,
    uphill_m:             altitude.length > 1
                            ? round1(calcUphill(altitude))
                            : null,
    downhill_pct:         altitude.length > 1 && distance.length > 1
                            ? round2(calcDownhillPct(altitude, distance))
                            : null,
    // downhill_pct: % of distance run downhill = quad/knee eccentric load

    // Grade analysis
    grade_available:      grade.length > 0,
    avg_grade:            grade.length > 0 ? round2(avg(grade)) : null,
    steep_downhill_pct:   grade.length > 0
                            ? round2(grade.filter(g => g < -5).length / grade.length * 100)
                            : null,
    // steep_downhill_pct: % run on >5% downgrade = high knee/quad risk

    // Pace variability
    velocity_available:   velocity.length > 0,
    pace_variability:     velocity.length > 10
                            ? round2(stdDev(velocity) / avg(velocity) * 100)
                            : null,
    // pace_variability: high = inconsistent effort = fatigue or race-like effort
    max_speed_kmh:        velocity.length > 0
                            ? round2(Math.max(...velocity) * 3.6)
                            : null,
  }
}

// ── Gear transform ───────────────────────────────────────────────────────────

export function transformGear(gear) {
  return {
    id:           gear.id,
    name:         gear.name,
    brand:        gear.brand_name ?? null,
    model:        gear.model_name ?? null,
    distance_km:  round1((gear.converted_distance ?? gear.distance ?? 0)),
    // Strava returns distance in km for gear endpoint
    retired:      gear.retired ?? false,
    risk_level:   gear.converted_distance > 700 ? 'high'
                : gear.converted_distance > 500 ? 'watch'
                : 'ok',
    // Shoes should be replaced every 600–800 km
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function derivePace(moving_time_sec, distance_m) {
  if (!distance_m || !moving_time_sec) return null
  const pace = (moving_time_sec / 60) / (distance_m / 1000)
  const mins = Math.floor(pace)
  const secs = Math.round((pace - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function derivePaceNum(moving_time_sec, distance_m) {
  if (!distance_m || !moving_time_sec) return null
  return round2((moving_time_sec / 60) / (distance_m / 1000))
}

function avg(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function stdDev(arr) {
  if (arr.length < 2) return 0
  const mean = avg(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
}

function calcDownhill(altitude) {
  let total = 0
  for (let i = 1; i < altitude.length; i++) {
    const diff = altitude[i - 1] - altitude[i]
    if (diff > 0) total += diff
  }
  return total
}

function calcUphill(altitude) {
  let total = 0
  for (let i = 1; i < altitude.length; i++) {
    const diff = altitude[i] - altitude[i - 1]
    if (diff > 0) total += diff
  }
  return total
}

function calcDownhillPct(altitude, distance) {
  let downhillDist = 0
  const totalDist  = distance[distance.length - 1] || 1
  for (let i = 1; i < altitude.length; i++) {
    if (altitude[i] < altitude[i - 1]) {
      downhillDist += (distance[i] - distance[i - 1])
    }
  }
  return (downhillDist / totalDist) * 100
}

function round1(n) { return Math.round(n * 10) / 10 }
function round2(n) { return Math.round(n * 100) / 100 }

const WORKOUT_TYPE_LABELS = {
  0: 'Easy run',
  1: 'Race',
  2: 'Long run',
  3: 'Workout',
}

const HR_ZONE_LABELS = [
  'Z1 Recovery',
  'Z2 Aerobic',
  'Z3 Tempo',
  'Z4 Threshold',
  'Z5 Max',
]