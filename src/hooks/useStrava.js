/**
 * useStrava.js
 * Handles Strava OAuth, data fetching, caching, and state updates.
 *
 * Fetch strategy:
 * - On connect: athlete profile + zones + stats + 90 days of activities (parallel)
 * - For long runs (>15km): activity streams (cached permanently per activity)
 * - Cache: localStorage with 6h TTL for activities, permanent for streams
 * - Rate limit budget: ~30 calls on connect + ~1 per new long run
 */

import { useAppStore } from '../store/useAppStore'
import {
  transformStravaActivities,
  transformAthleteProfile,
  transformActivityStreams,
  transformGear,
} from './stravaTransform'
import { computeRiskScores, parseActivitySymptoms } from '../utils/riskEngine'

const CLIENT_ID    = 254701
const REDIRECT_URI = 'https://bodypain-guide.vercel.app/auth/callback'
const CACHE_TTL_MS      = 6 * 60 * 60 * 1000   // 6 hours
const ACTIVITIES_DAYS   = 90
const LONG_RUN_KM       = 15
const STREAM_KEYS       = 'heartrate,cadence,altitude,grade_smooth,velocity_smooth,distance'

// ── Age override ──────────────────────────────────────────────────────────────
// Strava API doesn't expose DOB. Set this to your age.
// When friends use the app, this is the field to personalise per user.
const ATHLETE_AGE = 23

export function useStrava() {
  const {
    stravaToken,
    setActivities,
    setRiskScores,
    connectStrava,
    disconnectStrava,
  } = useAppStore()

  // ── OAuth ─────────────────────────────────────────────────────────────────

  function initiateOAuth() {
    const url = [
      'https://www.strava.com/oauth/authorize',
      `?client_id=${CLIENT_ID}`,
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
      '&response_type=code',
      '&scope=activity:read,read',
    ].join('')
    window.location.href = url
  }

  async function handleCallback(code) {
    try {
      const res  = await fetch('/api/strava-token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code }),
      })
      const data = await res.json()
      if (data.access_token) {
        sessionStorage.setItem('strava_token', data.access_token)
        connectStrava(data.access_token)
        await fetchAllData(data.access_token)
      }
    } catch (err) {
      console.error('Strava callback failed:', err)
    }
  }

  function restoreSession() {
    const token = sessionStorage.getItem('strava_token')
    if (!token) return
    connectStrava(token)
    const cached = loadCache()
    if (cached) {
      setActivities(cached.activities)
      // Patch age in at read time — cache may predate the age field being added
      const athleteProfile = { ...cached.athleteProfile, age: ATHLETE_AGE }
      const symptoms       = parseActivitySymptoms(cached.activities)
      const scores         = computeRiskScores(cached.activities, athleteProfile, symptoms)
      setRiskScores({ ...scores, _athleteProfile: athleteProfile })
    } else {
      fetchAllData(token)
    }
  }

  function disconnect() {
    sessionStorage.removeItem('strava_token')
    clearCache()
    disconnectStrava()
  }

  // ── Main data fetch ───────────────────────────────────────────────────────

  async function fetchAllData(token) {
    const t = token || stravaToken
    if (!t) return

    try {
      // First get athlete profile to get the ID
      const athleteRes = await stravaGet('/athlete', t)
      const athleteId  = athleteRes.id

      // Then fetch the rest in parallel
      const [zonesRes, statsRes, activitiesRaw] = await Promise.all([
        stravaGet('/athlete/zones', t).catch(() => null),
        stravaGet(`/athletes/${athleteId}/stats`, t).catch(() => null),
        fetchActivities(t),
      ])

      // age injected here — Strava doesn't provide DOB via API
      const athleteProfile = {
        ...transformAthleteProfile(athleteRes, statsRes, zonesRes),
        age: ATHLETE_AGE,
      }
      const activities = transformStravaActivities(activitiesRaw)

      // Fetch gear
      const gearMap = await fetchGear(activities, t)

      // Fetch streams for long runs
      const streams = await fetchLongRunStreams(activities, t)

      // Enrich activities
      const enriched = activities.map(a => ({
        ...a,
        streams: streams[a.id] ?? null,
        gear:    gearMap[a.gear_id] ?? null,
      }))

      // Parse symptoms from run titles/descriptions, then compute risk
      const symptoms = parseActivitySymptoms(enriched)
      const scores   = computeRiskScores(enriched, athleteProfile, symptoms)

      // Save to store
      setActivities(enriched)
      setRiskScores({ ...scores, _athleteProfile: athleteProfile })

      // Cache
      saveCache({ activities: enriched, athleteProfile })

    } catch (err) {
      console.error('Strava data fetch failed:', err)
    }
  }

  // ── Activity fetch (90 days) ──────────────────────────────────────────────

  async function fetchActivities(token) {
    const after = Math.floor(Date.now() / 1000) - ACTIVITIES_DAYS * 24 * 60 * 60
    const res   = await stravaGet(
      `/athlete/activities?after=${after}&per_page=200`,
      token
    )
    return Array.isArray(res) ? res : []
  }

  // ── Streams fetch (long runs only, cached) ────────────────────────────────

  async function fetchLongRunStreams(activities, token) {
    const longRuns = activities.filter(a => a.actual_km >= LONG_RUN_KM)
    const result   = {}

    // Load existing stream cache
    const streamCache = loadStreamCache()

    for (const run of longRuns) {
      // Use cache if available — never re-fetch streams
      if (streamCache[run.id]) {
        result[run.id] = streamCache[run.id]
        continue
      }

      try {
        const raw     = await stravaGet(
          `/activities/${run.id}/streams?keys=${STREAM_KEYS}&key_by_type=false`,
          token
        )
        const streams = transformActivityStreams(run.id, raw)
        result[run.id] = streams
        streamCache[run.id] = streams

        // Small delay to respect rate limits
        await sleep(100)
      } catch (err) {
        console.warn(`Stream fetch failed for activity ${run.id}:`, err)
      }
    }

    // Save updated stream cache
    saveStreamCache(streamCache)
    return result
  }

  // ── Gear fetch ────────────────────────────────────────────────────────────

  async function fetchGear(activities, token) {
    const gearIds = [...new Set(
      activities.map(a => a.gear_id).filter(Boolean)
    )]
    const result  = {}

    for (const id of gearIds) {
      try {
        const raw   = await stravaGet(`/gear/${id}`, token)
        result[id]  = transformGear(raw)
        await sleep(100)
      } catch (err) {
        console.warn(`Gear fetch failed for ${id}:`, err)
      }
    }

    return result
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function stravaGet(path, token) {
    const t   = token || stravaToken
    const res = await fetch(`https://www.strava.com/api/v3${path}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    if (!res.ok) throw new Error(`Strava API error: ${res.status} ${path}`)
    return res.json()
  }

  // ── Cache ─────────────────────────────────────────────────────────────────

  function saveCache(data) {
    try {
      localStorage.setItem('strava_cache', JSON.stringify({
        ts:   Date.now(),
        data,
      }))
    } catch (e) {
      console.warn('Cache save failed (storage full?):', e)
    }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem('strava_cache')
      if (!raw) return null
      const { ts, data } = JSON.parse(raw)
      if (Date.now() - ts > CACHE_TTL_MS) return null   // expired
      return data
    } catch {
      return null
    }
  }

  function saveStreamCache(streams) {
    try {
      localStorage.setItem('strava_streams', JSON.stringify(streams))
    } catch (e) {
      console.warn('Stream cache save failed:', e)
    }
  }

  function loadStreamCache() {
    try {
      const raw = localStorage.getItem('strava_streams')
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function clearCache() {
    localStorage.removeItem('strava_cache')
    localStorage.removeItem('strava_streams')
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
  }

  return {
    initiateOAuth,
    handleCallback,
    restoreSession,
    disconnect,
    fetchAllData,
  }
}
