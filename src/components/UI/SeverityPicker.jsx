import { useAppStore } from '../../store/useAppStore'

const levels = [
  { id: 'mild',     label: 'Mild',     desc: 'Discomfort, can run' },
  { id: 'moderate', label: 'Moderate', desc: 'Pain affects pace' },
  { id: 'severe',   label: 'Severe',   desc: 'Cannot run' },
]

export function SeverityPicker() {
  const { severity, setSeverity } = useAppStore()

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      {levels.map(l => {
        const active = severity === l.id
        const colors = {
          mild:     { bg: '#0f2a1a', border: '#1D9E75', text: '#5DCAA5' },
          moderate: { bg: '#2a1f00', border: '#EF9F27', text: '#FAC775' },
          severe:   { bg: '#2a0f0f', border: '#E24B4A', text: '#f09595' },
        }
        const c = colors[l.id]
        return (
          <button
            key={l.id}
            onClick={() => setSeverity(l.id)}
            style={{
              flex: 1,
              padding: '10px 8px',
              borderRadius: 8,
              border: `1.5px solid ${active ? c.border : '#2a2f3a'}`,
              background: active ? c.bg : 'transparent',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.15s',
            }}
          >
            <div style={{
              fontSize: 13,
              fontWeight: 500,
              color: active ? c.text : '#888',
              marginBottom: 2,
            }}>
              {l.label}
            </div>
            <div style={{ fontSize: 11, color: active ? c.text : '#555' }}>
              {l.desc}
            </div>
          </button>
        )
      })}
    </div>
  )
}