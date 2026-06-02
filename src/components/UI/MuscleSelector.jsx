import { useAppStore } from '../../store/useAppStore'
import { RiskBadge } from './RiskBadge'
import muscles from '../../content/muscles.json'

export function MuscleSelector() {
  const { selectedZone, selectedMuscle, selectMuscle, riskScores } = useAppStore()
  if (!selectedZone) return null

  const list = muscles[selectedZone]
  if (!list) return null

  return (
    <div>
      <p style={{ fontSize: 12, color: '#666', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
        Where exactly?
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.map(m => {
          const active = selectedMuscle === m.id
          return (
            <button
              key={m.id}
              onClick={() => selectMuscle(m.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 8,
                border: `1px solid ${active ? '#378ADD' : '#1e2530'}`,
                background: active ? '#0d1f33' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: active ? '#B5D4F4' : '#ccc',
                  marginBottom: 1,
                }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 11, color: '#555' }}>{m.sub}</div>
              </div>
              <RiskBadge muscleId={m.id} riskScores={riskScores} />
            </button>
          )
        })}
      </div>
    </div>
  )
}