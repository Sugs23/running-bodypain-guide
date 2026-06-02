import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { CAMERA_POSITIONS } from '../../utils/cameraPositions'
import * as THREE from 'three'

export function CameraRig() {
  const { camera } = useThree()
  const { cameraPosition } = useAppStore()
  const isAnimating = useRef(false)
  const targetPos   = useRef(new THREE.Vector3())
  const targetLook  = useRef(new THREE.Vector3())
  const prevPosition = useRef(cameraPosition)

  useEffect(() => {
    if (cameraPosition !== prevPosition.current) {
      prevPosition.current = cameraPosition
      isAnimating.current  = true
      const config = CAMERA_POSITIONS[cameraPosition] || CAMERA_POSITIONS.default
      targetPos.current.set(...config.pos)
      targetLook.current.set(...config.target)
    }
  }, [cameraPosition])

  useFrame(() => {
    if (!isAnimating.current) return

    const distPos  = camera.position.distanceTo(targetPos.current)

    if (distPos < 0.01) {
      isAnimating.current = false
      return
    }

    camera.position.lerp(targetPos.current, 0.07)

    const dir     = new THREE.Vector3()
    const desired = targetLook.current.clone().sub(camera.position).normalize()
    camera.getWorldDirection(dir)
    dir.lerp(desired, 0.07)
    camera.lookAt(camera.position.clone().add(dir))
  })

  return null
}