import { useAppStore } from '../../store/useAppStore'
import { ZoneSelector } from '../UI/ZoneSelector'
import { StravaWidget } from '../UI/StravaWidget'

export function Sidebar() {
  const { } = useAppStore()

  return (
    <div style={{
      width: 340,
      height: '100vh',
      background: '#080d14',
      borderRight: '1px solid #1a1f2a',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid #1a1f2a',
      }}>
        <h1 style={{
          fontSize: 15,
          fontWeight: 500,
          color: '#f0f0f0',
          letterSpacing: 0.3,
          marginBottom: 2,
        }}>
          Body Pain Guide
        </h1>
        <p style={{ fontSize: 11, color: '#444' }}>
          Select a zone to begin
        </p>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        scrollbarWidth: 'none',
      }}>
        <StravaWidget />
        <ZoneSelector />
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #1a1f2a',
        fontSize: 11,
        color: '#333',
      }}>
        Race: 27 Sep 2026 · Goal: sub 4h
      </div>
    </div>
  )
}