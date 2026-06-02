import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { getRiskLevel } from '../../utils/riskEngine'

const ZONES = [
  { id: 'neck',       pos: [0,  1.62, 0],   size: [0.22, 0.18, 0.2],  shape: 'box' },
  { id: 'shoulder',   pos: [-0.42, 1.42, 0], size: [0.28, 0.22, 0.22], shape: 'box' },
  { id: 'shoulder',   pos: [0.42,  1.42, 0], size: [0.28, 0.22, 0.22], shape: 'box' },
  { id: 'upper_back', pos: [0,  1.25, -0.1], size: [0.55, 0.28, 0.18], shape: 'box' },
  { id: 'core',       pos: [0,  1.02,  0.05],size: [0.48, 0.22, 0.2],  shape: 'box' },
  { id: 'lower_back', pos: [0,  0.82, -0.1], size: [0.44, 0.22, 0.18], shape: 'box' },
  { id: 'hip',        pos: [-0.22, 0.6, 0],  size: [0.26, 0.28, 0.24], shape: 'box' },
  { id: 'hip',        pos: [0.22,  0.6, 0],  size: [0.26, 0.28, 0.24], shape: 'box' },
  { id: 'thigh',      pos: [-0.2,  0.22, 0], size: [0.22, 0.38, 0.22], shape: 'box' },
  { id: 'thigh',      pos: [0.2,   0.22, 0], size: [0.22, 0.38, 0.22], shape: 'box' },
  { id: 'knee',       pos: [-0.2, -0.18, 0], size: [0.21, 0.16, 0.2],  shape: 'box' },
  { id: 'knee',       pos: [0.2,  -0.18, 0], size: [0.21, 0.16, 0.2],  shape: 'box' },
  { id: 'lower_leg',  pos: [-0.19,-0.52, 0], size: [0.18, 0.36, 0.18], shape: 'box' },
  { id: 'lower_leg',  pos: [0.19, -0.52, 0], size: [0.18, 0.36, 0.18], shape: 'box' },
  { id: 'ankle',      pos: [-0.19,-0.78, 0], size: [0.17, 0.1,  0.18], shape: 'box' },
  { id: 'ankle',      pos: [0.19, -0.78, 0], size: [0.17, 0.1,  0.18], shape: 'box' },
  { id: 'foot',       pos: [-0.19,-0.92, 0.06],size:[0.17,0.1, 0.3],   shape: 'box' },
  { id: 'foot',       pos: [0.19, -0.92, 0.06],size:[0.17,0.1, 0.3],   shape: 'box' },
]

// Non-interactive body fill parts
const BODY_PARTS = [
  { pos: [0, 1.78, 0],   size: [0.32, 0.32, 0.3],  rx: 0.14 }, // head
  { pos: [0, 1.3,  0],   size: [0.52, 0.42, 0.28], rx: 0.08 }, // torso
  { pos: [-0.62, 1.3, 0], size: [0.18, 0.42, 0.18], rx: 0.08 }, // upper arm L
  { pos: [0.62,  1.3, 0], size: [0.18, 0.42, 0.18], rx: 0.08 }, // upper arm R
  { pos: [-0.62, 0.9, 0], size: [0.15, 0.36, 0.15], rx: 0.07 }, // lower arm L
  { pos: [0.62,  0.9, 0], size: [0.15, 0.36, 0.15], rx: 0.07 }, // lower arm R
]

function ZoneMesh({ zone, index }) {
  const [hovered, setHovered] = useState(false)
  const { selectedZone, selectZone, riskScores } = useAppStore()
  const active = selectedZone === zone.id
  const score  = riskScores?.[zone.id] ?? riskScores?.[`${zone.id}_general`] ?? 0
  const risk   = getRiskLevel(score)

  const color = active  ? '#378ADD'
    : hovered ? '#5a8fb5'
    : risk?.level === 'high'     ? '#E24B4A'
    : risk?.level === 'elevated' ? '#EF9F27'
    : risk?.level === 'watch'    ? '#c9a050'
    : '#2a3240'

  return (
    <mesh
      position={zone.pos}
      onClick={(e) => { e.stopPropagation(); selectZone(zone.id) }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <boxGeometry args={zone.size} />
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        metalness={0.1}
        transparent
        opacity={0.85}
        emissive={color}
        emissiveIntensity={hovered || active ? 0.3 : 0.05}
      />
    </mesh>
  )
}

export function BodyPlaceholder() {
  return (
    <group>
      {/* Non-interactive fill */}
      {BODY_PARTS.map((p, i) => (
        <mesh key={i} position={p.pos}>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color="#161d28" roughness={0.9} metalness={0.0} />
        </mesh>
      ))}

      {/* Interactive zones */}
      {ZONES.map((zone, i) => (
        <ZoneMesh key={`${zone.id}-${i}`} zone={zone} index={i} />
      ))}
    </group>
  )
}