import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'
import { CameraRig } from './CameraRig'
import { BodyModel } from './BodyModel'
import { Header } from '../Layout/Header'
import { RiskWidget } from '../UI/RiskWidget'

export function Scene() {
  return (
    <div style={{
      flex:      1,
      minHeight: 0,
      position:  'relative',
      display:   'flex',
      flexDirection: 'column',
    }}>
      <Header />
      <RiskWidget />
      <Canvas
        camera={{ position: [0, 0.5, 3.2], fov: 45 }}
        style={{ background: '#0a0f1a', flex: 1 }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[2, 4, 2]} intensity={1.0} />
        <directionalLight position={[-2, 2, -1]} intensity={0.3} />

        <Suspense fallback={null}>
          <BodyModel />
        </Suspense>

        <CameraRig />

        <OrbitControls
          enablePan={false}
          minDistance={1.2}
          maxDistance={5.0}
          target={[0, 0.5, 0]}
        />
      </Canvas>

      <div style={{ position: 'absolute', inset: 0, zIndex: -1 }} />
    </div>
  )
}