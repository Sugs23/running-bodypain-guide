import { useAppStore } from '../../store/useAppStore'
import { useStrava } from '../../hooks/useStrava'
import { getReadinessLabel } from '../../utils/riskEngine'

export function StravaWidget() {
  const { stravaConnected, riskScores } = useAppStore()
  const { initiateOAuth, disconnect }   = useStrava()

  if (!stravaConnected) {
    return (
      <div style={{
        padding: '12px 14px',
        borderRadius: 8,
        border: '1px solid #1e2530',
        background: '#0d1118',
        marginBottom: 16,
      }}>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>
          Connect Strava to see your personal injury risk based on recent training
        </p>
        <button
          onClick={initiateOAuth}
          style={{
            width: '100%',
            padding: '8px 0',
            borderRadius: 6,
            border: '1px solid #FC4C02',
            background: 'transparent',
            color: '#FC4C02',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Connect Strava
        </button>
      </div>
    )
  }

  const readiness = riskScores._readiness ?? 0
  const rl        = getReadinessLabel(readiness)
  const weeklyKm  = riskScores._weekly_km ?? 0
  const longRun   = riskScores._long_run_km ?? 0
  const increase  = riskScores._weekly_increase ?? 0

  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 8,
      border: '1px solid #1e2530',
      background: '#0d1118',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: '#FC4C02', fontWeight: 500 }}>● STRAVA</span>
        <button
          onClick={disconnect}
          style={{ background: 'none', border: 'none', color: '#444', fontSize: 11, cursor: 'pointer' }}
        >
          disconnect
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        {[
          { label: 'This week',  value: `${weeklyKm} km` },
          { label: 'Long run',   value: `${longRun} km` },
          { label: 'Readiness',  value: rl.label, color: rl.color },
          { label: 'WoW change', value: `${increase > 0 ? '+' : ''}${increase}%`, color: increase > 15 ? '#E24B4A' : '#888' },
        ].map(stat => (
          <div key={stat.label} style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: '#111820',
            border: '1px solid #1e2530',
          }}>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>{stat.label}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: stat.color ?? '#ccc' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {increase > 15 && (
        <div style={{
          padding: '6px 10px',
          borderRadius: 6,
          background: '#2a0f0f',
          border: '1px solid #E24B4A44',
          fontSize: 11,
          color: '#f09595',
        }}>
          ⚠ Weekly mileage up {increase}% — injury risk elevated
        </div>
      )}
    </div>
  )
}