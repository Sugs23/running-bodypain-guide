/**
 * RiskWidget.jsx
 * Floating risk beacon — top right of the 3D canvas.
 * Shows count of at-risk muscles. Click to expand ranked list.
 * Each item is clickable — opens the pain panel directly.
 */

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { getTopRisks, getRiskLevel } from '../../utils/riskEngine'

const LEVEL_COLORS = {
  high:     '#E24B4A',
  elevated: '#EF9F27',
  watch:    '#FAC775',
}

const LEVEL_BG = {
  high:     '#2a0f0f',
  elevated: '#2a1f00',
  watch:    '#1f1a00',
}

export function RiskWidget() {
  const { riskScores, selectZone, selectMuscle } = useAppStore()
  const [open, setOpen]   = useState(false)
  const ref               = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const risks = getTopRisks(riskScores)
  if (!risks.length) return null

  // Top colour = highest risk level present
  const topColor = risks[0]?.risk?.color ?? '#FAC775'
  const topLevel = risks[0]?.risk?.level ?? 'watch'

  // Counts per level
  const highCount     = risks.filter(r => r.risk?.level === 'high').length
  const elevatedCount = risks.filter(r => r.risk?.level === 'elevated').length
  const watchCount    = risks.filter(r => r.risk?.level === 'watch').length

  function handleMuscleClick(item) {
    selectZone(item.zone)
    // Small delay so zone selection registers before muscle
    setTimeout(() => selectMuscle(item.muscle), 50)
    setOpen(false)
  }

  return (
    <div
      ref={ref}
      style={{
        position:   'absolute',
        top:        16,
        right:      16,
        zIndex:     20,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {/* Beacon button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          8,
          padding:      '7px 12px',
          borderRadius: 99,
          border:       `1px solid ${topColor}55`,
          background:   LEVEL_BG[topLevel],
          cursor:       'pointer',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Pulsing dot */}
        <span style={{
          width:        8,
          height:       8,
          borderRadius: '50%',
          background:   topColor,
          display:      'inline-block',
          boxShadow:    `0 0 8px ${topColor}`,
          animation:    topLevel === 'high' ? 'pulse 1.5s infinite' : 'none',
        }} />
        <span style={{ fontSize: 12, color: topColor, fontWeight: 500 }}>
          {risks.length} at risk
        </span>
        {/* Level badges */}
        <span style={{ display: 'flex', gap: 4 }}>
          {highCount > 0 && (
            <Badge count={highCount} color={LEVEL_COLORS.high} />
          )}
          {elevatedCount > 0 && (
            <Badge count={elevatedCount} color={LEVEL_COLORS.elevated} />
          )}
          {watchCount > 0 && (
            <Badge count={watchCount} color={LEVEL_COLORS.watch} />
          )}
        </span>
        <span style={{ fontSize: 10, color: '#555', marginLeft: 2 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:     'absolute',
          top:          '100%',
          right:        0,
          marginTop:    8,
          width:        300,
          background:   '#0a0f1a',
          border:       '1px solid #1e2530',
          borderRadius: 10,
          overflow:     'hidden',
          boxShadow:    '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {/* Header */}
          <div style={{
            padding:      '10px 14px',
            borderBottom: '1px solid #1e2530',
            fontSize:     11,
            color:        '#555',
            textTransform:'uppercase',
            letterSpacing:1,
          }}>
            Risk summary — click to open
          </div>

          {/* Risk list */}
          {risks.map((item, i) => (
            <button
              key={item.muscle}
              onClick={() => handleMuscleClick(item)}
              style={{
                width:        '100%',
                display:      'flex',
                alignItems:   'flex-start',
                gap:          10,
                padding:      '10px 14px',
                borderBottom: i < risks.length - 1 ? '1px solid #111820' : 'none',
                background:   'transparent',
                cursor:       'pointer',
                textAlign:    'left',
                transition:   'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#111820'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Rank */}
              <span style={{
                fontSize:   11,
                color:      '#333',
                width:      16,
                flexShrink: 0,
                marginTop:  2,
              }}>
                {i + 1}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        6,
                  marginBottom: 3,
                }}>
                  <span style={{
                    fontSize:   13,
                    fontWeight: 500,
                    color:      '#ddd',
                  }}>
                    {item.label}
                  </span>
                  <span style={{
                    fontSize:     10,
                    fontWeight:   500,
                    color:        item.risk.color,
                    background:   item.risk.color + '22',
                    border:       `1px solid ${item.risk.color}44`,
                    borderRadius: 99,
                    padding:      '1px 6px',
                    whiteSpace:   'nowrap',
                  }}>
                    {item.risk.label}
                  </span>
                </div>
                <div style={{
                  fontSize:  11,
                  color:     '#555',
                  lineHeight:1.4,
                  overflow:  'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.reason}
                </div>
              </div>

              {/* Score bar */}
              <div style={{
                width:        28,
                flexShrink:   0,
                display:      'flex',
                flexDirection:'column',
                alignItems:   'center',
                gap:          3,
                marginTop:    2,
              }}>
                <span style={{
                  fontSize:   11,
                  color:      item.risk.color,
                  fontWeight: 500,
                }}>
                  {item.score}
                </span>
                <div style={{
                  width:        4,
                  height:       24,
                  background:   '#1e2530',
                  borderRadius: 2,
                  overflow:     'hidden',
                }}>
                  <div style={{
                    width:        '100%',
                    height:       `${item.score}%`,
                    background:   item.risk.color,
                    borderRadius: 2,
                    marginTop:    `${100 - item.score}%`,
                  }} />
                </div>
              </div>
            </button>
          ))}

          {/* Footer */}
          <div style={{
            padding:   '8px 14px',
            borderTop: '1px solid #1e2530',
            fontSize:  10,
            color:     '#333',
          }}>
            Based on your last 90 days of Strava data
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

function Badge({ count, color }) {
  return (
    <span style={{
      fontSize:     10,
      fontWeight:   600,
      color:        color,
      background:   color + '22',
      borderRadius: 99,
      padding:      '1px 5px',
      minWidth:     16,
      textAlign:    'center',
    }}>
      {count}
    </span>
  )
}
