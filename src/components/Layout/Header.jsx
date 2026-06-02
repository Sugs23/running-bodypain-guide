import { useAppStore } from '../../store/useAppStore'
import zones from '../../content/zones.json'
import muscles from '../../content/muscles.json'

export function Header() {
  const { selectedZone, selectedMuscle, panelOpen, resetSelection, closePanel } = useAppStore()

  const zone   = zones.find(z => z.id === selectedZone)
  const muscle = selectedZone && muscles[selectedZone]?.find(m => m.id === selectedMuscle)

  if (!selectedZone) return null

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: '#080d14cc',
      backdropFilter: 'blur(8px)',
      border: '1px solid #1e2530',
      borderRadius: 99,
      padding: '6px 14px',
      fontSize: 13,
      zIndex: 10,
    }}>
      <button
        onClick={resetSelection}
        style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13 }}
      >
        Body
      </button>
      {zone && (
        <>
          <span style={{ color: '#333' }}>›</span>
          <button
            onClick={closePanel}
            style={{
              background: 'none',
              border: 'none',
              color: panelOpen ? '#666' : '#B5D4F4',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {zone.label}
          </button>
        </>
      )}
      {muscle && (
        <>
          <span style={{ color: '#333' }}>›</span>
          <span style={{ color: '#B5D4F4' }}>{muscle.label}</span>
        </>
      )}
    </div>
  )
}