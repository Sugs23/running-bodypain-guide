import { useGLTF } from '@react-three/drei'
import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { getRiskLevel } from '../../utils/riskEngine'

const MESH_TO_ZONE = {
  zone_neck:            'neck',
  zone_shoulder_left:   'shoulder',
  zone_shoulder_right:  'shoulder',
  zone_upper_back:      'upper_back',
  zone_lower_back:      'lower_back',
  zone_core:            'core',
  zone_hip_left:        'hip',
  zone_hip_right:       'hip',
  zone_thigh_left:      'thigh',
  zone_thigh_right:     'thigh',
  zone_knee_left:       'knee',
  zone_knee_right:      'knee',
  zone_lower_leg_left:  'lower_leg',
  zone_lower_leg_right: 'lower_leg',
  zone_ankle_left:      'ankle',
  zone_ankle_right:     'ankle',
  zone_foot_left:       'foot',
  zone_foot_right:      'foot',
}

function ZoneMesh({ name, geometry, zoneId }) {
  const [hovered, setHovered] = useState(false)
  const { selectedZone, selectZone, riskScores } = useAppStore()
  const active = selectedZone === zoneId

  const score = riskScores?.[zoneId] ?? riskScores?.[`${zoneId}_general`] ?? 0
  const risk  = getRiskLevel(score)

  const color = active              ? '#378ADD'
    : hovered                       ? '#5a8fb5'
    : risk?.level === 'high'        ? '#E24B4A'
    : risk?.level === 'elevated'    ? '#EF9F27'
    : risk?.level === 'watch'       ? '#c9a050'
    : '#1e2530'

  return (
    <mesh
      geometry={geometry}
      onClick={(e) => { e.stopPropagation(); selectZone(zoneId) }}
      onPointerEnter={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
      onPointerLeave={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'default' }}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.75}
        metalness={0.05}
        emissive={color}
        emissiveIntensity={hovered || active ? 0.25 : 0.03}
      />
    </mesh>
  )
}

function BaseMesh({ geometry }) {
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#1e2530"
        roughness={0.9}
        metalness={0.0}
      />
    </mesh>
  )
}

export function BodyModel() {
  const { nodes } = useGLTF('/models/body.glb')

  const zoneMeshes = []
  const baseMeshes = []

  Object.entries(nodes).forEach(([name, node]) => {
    if (!node.geometry) return
    if (MESH_TO_ZONE[name]) {
      zoneMeshes.push({ name, geometry: node.geometry, zoneId: MESH_TO_ZONE[name] })
    } else {
      baseMeshes.push({ name, geometry: node.geometry })
    }
  })

  return (
    <group>
      {baseMeshes.map(m => (
        <BaseMesh key={m.name} geometry={m.geometry} />
      ))}
      {zoneMeshes.map(m => (
        <ZoneMesh key={m.name} name={m.name} geometry={m.geometry} zoneId={m.zoneId} />
      ))}
    </group>
  )
}

useGLTF.preload('/models/body.glb')