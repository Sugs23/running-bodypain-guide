import { useAppStore } from '../../store/useAppStore'
import { getRiskLevel } from '../../utils/riskEngine'
import zones from '../../content/zones.json'

export function ZoneSelector() {
  const { selectedZone, selectZone, resetSelection, riskScores } = useAppStore()

  const upper = zones.filter(z => z.direct)
  const lower = zones.filter(z => !z.direct)

  function getZoneRisk(zone) {
    const ids = zone.id === 'lower_back' ? ['lower_back'] : [zone.id, `${zone.id}_general`]
    const scores = ids.map(id => riskScores?.[id] ?? 0)
    return Math.max(...scores)
  }

  function ZoneButton({ zone }) {
    const active = selectedZone === zone.id
    const score  = getZoneRisk(zone)
    const risk   = getRiskLevel(score)

    return (
      <button
        onClick={() => active ? resetSelection() : selectZone(zone.id)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 12px',
          borderRadius: 7,
          border: `1px solid ${active ? '#378ADD' : '#1e2530'}`,
          background: active ? '#0d1f33' : 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.15s',
          marginBottom: 4,
        }}
      >
        <span style={{
          fontSize: 13,
          color: active ? '#B5D4F4' : '#aaa',
          fontWeight: active ? 500 : 400,
        }}>
          {zone.label}
        </span>
        {risk && (
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: risk.color,
            flexShrink: 0,
            boxShadow: `0 0 6px ${risk.color}88`,
          }} />
        )}
      </button>
    )
  }

  return (
    <div>
      <p style={{
        fontSize: 11,
        color: '#444',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
      }}>
        Upper body
      </p>
      {upper.map(z => <ZoneButton key={z.id} zone={z} />)}

      <p style={{
        fontSize: 11,
        color: '#444',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 16,
        marginBottom: 8,
      }}>
        Lower body
      </p>
      {lower.map(z => <ZoneButton key={z.id} zone={z} />)}
    </div>
  )
}