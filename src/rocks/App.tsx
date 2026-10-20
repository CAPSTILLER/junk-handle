import { useEffect, useState } from 'react'
import { Embed, Forge, Home, Owner, Preview, View } from './pages'
import { Shell } from './ui'

function route() {
  const p = location.pathname.replace(/\/+$/, '').replace(/\.html$/, '')
  let m
  if (p === '/rocks' || p === '' || p === '/rocks/index') return <Home />
  if (p === '/rocks/preview') return <Preview />
  if (p === '/rocks/forge') return <Forge />
  if (p === '/rocks/view') return <View />
  if ((m = p.match(/^\/rocks\/embed\/(\d{1,12})$/))) return <Embed id={BigInt(m[1])} />
  if ((m = p.match(/^\/rocks\/(\d{1,12})$/))) return <Owner id={BigInt(m[1])} />
  return <Shell active=""><div className="empty">Page not found. <a href="/rocks">Back to CAPs Rocks</a></div></Shell>
}

export default function App() {
  const [, tick] = useState(0)
  useEffect(() => {
    const on = () => { tick((n) => n + 1); window.scrollTo(0, 0) }
    addEventListener('popstate', on)
    return () => removeEventListener('popstate', on)
  }, [])
  return route()
}
