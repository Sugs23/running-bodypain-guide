import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { SeverityPicker } from './SeverityPicker'
import { RiskBadge } from './RiskBadge'

export function PainPanel() {
  const { selectedMuscle, selectedZone, severity, panelOpen, closePanel, riskScores } = useAppStore()
  const [data, setData] = useState(null)
  const [openSection, setOpenSection] = useState('why')

  const muscleId = selectedMuscle || (panelOpen ? selectedZone : null)

  useEffect(() => {
    if (!muscleId) { setData(null); return }
    import(`../../content/pain-data/${muscleId}.json`)
      .then(m => setData(m.default))
      .catch(() => setData(null))
  }, [muscleId])

  if (!panelOpen || !data) return null

  const level = data.severity_levels?.[severity]
  if (!level) return null

  const urgencyColors = { green: '#5DCAA5', amber: '#FAC775', red: '#E24B4A' }
  const urgencyColor  = urgencyColors[level.urgency_color] ?? '#888'

  const sections = [
    { id: 'why',      label: 'Why it aches',     items: level.why },
    { id: 'relief',   label: 'Short-term relief', items: level.relief },
    { id: 'prevent',  label: 'Prevention',        items: level.prevention },
  ]

  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h2 style={{ fontSize: 17, fontWeight: 500, color: '#f0f0f0' }}>{data.display_name}</h2>
            <RiskBadge muscleId={muscleId} riskScores={riskScores} />
          </div>
          <p style={{ fontSize: 12, color: '#666' }}>{data.subtitle}</p>
        </div>
        <button
          onClick={closePanel}
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {/* Can run badge */}
      <div style={{
        padding: '8px 12px',
        borderRadius: 8,
        marginBottom: 16,
        background: level.can_run === true ? '#0f2a1a' : level.can_run === false ? '#2a0f0f' : '#2a1f00',
        border: `1px solid ${urgencyColor}33`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 11, color: urgencyColor, fontWeight: 500 }}>{level.urgency_label}</span>
        <span style={{ fontSize: 11, color: '#888' }}>·</span>
        <span style={{ fontSize: 11, color: '#aaa' }}>{level.can_run_note}</span>
      </div>

      {/* Severity picker */}
      <SeverityPicker />

      {/* Sections */}
      {sections.map(s => (
        <div key={s.id} style={{ marginBottom: 8 }}>
          <button
            onClick={() => setOpenSection(openSection === s.id ? null : s.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: openSection === s.id ? '8px 8px 0 0' : 8,
              border: '1px solid #1e2530',
              background: '#111820',
              cursor: 'pointer',
              color: '#ccc',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {s.label}
            <span style={{ transform: openSection === s.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: 11 }}>▼</span>
          </button>
          {openSection === s.id && (
            <div style={{
              padding: '12px 14px',
              border: '1px solid #1e2530',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              background: '#0d1118',
            }}>
              {s.items?.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < s.items.length - 1 ? 10 : 0 }}>
                  <span style={{ color: '#378ADD', marginTop: 2, flexShrink: 0, fontSize: 12 }}>→</span>
                  <span style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* See physio */}
      {data.see_physio_if && (
        <div style={{
          marginTop: 16,
          padding: '12px 14px',
          borderRadius: 8,
          background: '#1a0f0f',
          border: '1px solid #E24B4A33',
        }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#E24B4A', marginBottom: 8 }}>See a physio if:</p>
          {data.see_physio_if.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: i < data.see_physio_if.length - 1 ? 6 : 0 }}>
              <span style={{ color: '#E24B4A', fontSize: 12, marginTop: 2 }}>!</span>
              <span style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}