import { useEffect, useRef, useState } from 'react'

function supportsWebGL() {
  if (typeof window === 'undefined') return false
  try {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2') || probe.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

export default function LandingBackground() {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [fallback, setFallback] = useState(() => !supportsWebGL())

  useEffect(() => {
    if (fallback) return undefined

    const canvas = canvasRef.current
    if (!canvas) return undefined

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let cancelled = false
    let dispose = null

    import('../lib/landingScene.js')
      .then(({ createLandingScene }) => {
        if (cancelled) return
        dispose = createLandingScene(canvas, {
          reducedMotion,
          onUnavailable: () => {
            setReady(false)
            setFallback(true)
          },
        })
        setReady(true)
      })
      .catch((error) => {
        console.warn('[DevScope] 3D landing background unavailable:', error)
        if (!cancelled) setFallback(true)
      })

    return () => {
      cancelled = true
      dispose?.()
    }
  }, [fallback])

  return (
    <div
      className="landing-bg"
      aria-hidden="true"
      data-ready={ready ? 'true' : 'false'}
      data-fallback={fallback ? 'true' : 'false'}
    >
      <div className="landing-bg__aurora landing-bg__aurora--one" />
      <div className="landing-bg__aurora landing-bg__aurora--two" />
      <div className="landing-bg__fallback">
        <span className="landing-bg__fallback-core" />
        <span className="landing-bg__fallback-ring" />
        <span className="landing-bg__fallback-ring landing-bg__fallback-ring--wide" />
      </div>
      <div className="landing-bg__canvas">
        <canvas ref={canvasRef} />
      </div>
      <div className="landing-bg__veil" />
      <div className="landing-bg__vignette" />
    </div>
  )
}
