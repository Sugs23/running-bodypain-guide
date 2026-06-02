import { useEffect, useState } from 'react'
import { Scene } from './components/Scene'
import { Sidebar } from './components/Layout/Sidebar'
import { BottomDrawer } from './components/UI/BottomDrawer'
import { useStrava } from './hooks/useStrava'

export default function App() {
  const { handleCallback, restoreSession } = useStrava()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    if (code) {
      window.history.replaceState({}, '', '/')
      handleCallback(code).then(() => setReady(true))
    } else {
      restoreSession()
      setReady(true)
    }
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{
        flex:          1,
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
        minWidth:      0,
      }}>
        <Scene />
        <BottomDrawer />
      </div>
    </div>
  )
}