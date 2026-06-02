/**
 * BottomDrawer.jsx
 * Fixed 30% height drawer. Canvas shrinks to fit above it.
 * No overlay — model stays fully interactive while drawer is open.
 */

import { useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { MuscleSelector } from './MuscleSelector'
import { PainPanel } from './PainPanel'
import zones from '../../content/zones.json'

const DRAWER_HEIGHT = '30vh'

export function BottomDrawer() {
  const { selectedZone, panelOpen, resetSelection } = useAppStore()

  const zone     = zones.find(z => z.id === selectedZone)
  const isOpen   = !!selectedZone
  const showMuscle = selectedZone && !zone?.direct && !panelOpen
  const showPanel  = panelOpen || (selectedZone && zone?.direct)

  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape') resetSelection()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{
      height:       isOpen ? DRAWER_HEIGHT : '0px',
      transition:   'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
      background:   '#080d14',
      borderTop:    isOpen ? '1px solid #1e2530' : 'none',
      display:      'flex',
      flexDirection:'column',
      overflow:     'hidden',
      flexShrink:   0,
    }}>
      {/* Header bar */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 24px 8px',
        borderBottom:   '1px solid #111820',
        flexShrink:     0,
      }}>
        {/* Handle */}
        <div style={{
          display:  'flex',
          alignItems: 'center',
          gap:      12,
        }}>
          <div style={{
            width:        32,
            height:       3,
            borderRadius: 2,
            background:   '#2a3040',
          }} />
          <span style={{
            fontSize:   14,
            fontWeight: 500,
            color:      '#f0f0f0',
          }}>
            {zone?.label ?? ''}
          </span>
        </div>

        <button
          onClick={resetSelection}
          style={{
            background: 'none',
            border:     'none',
            color:      '#444',
            cursor:     'pointer',
            fontSize:   16,
            lineHeight: 1,
            padding:    4,
          }}
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex:       1,
        overflowY:  'auto',
        padding:    '14px 24px 24px',
        scrollbarWidth: 'none',
      }}>
        {showMuscle && <MuscleSelector />}
        {showPanel  && <PainPanel />}
      </div>
    </div>
  )
}
