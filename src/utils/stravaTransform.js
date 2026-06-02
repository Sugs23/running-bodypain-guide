export function transformStravaActivities(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(a => a.type === 'Run' || a.sport_type === 'Run')
    .map(a => ({
      date:      a.start_date?.split('T')[0] ?? '',
      actual_km: Math.round((a.distance / 1000) * 100) / 100,
      time_min:  Math.round((a.moving_time / 60) * 10) / 10,
      avg_pace:  derivePace(a.moving_time, a.distance),
      avg_hr:    a.average_heartrate ?? null,
      name:      a.name ?? 'Run',
    }))
}

function derivePace(moving_time_sec, distance_m) {
  if (!distance_m || !moving_time_sec) return null
  const pace = (moving_time_sec / 60) / (distance_m / 1000)
  const mins = Math.floor(pace)
  const secs = Math.round((pace - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}