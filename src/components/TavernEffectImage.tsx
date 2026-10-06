import { useEffect, useState } from 'react'
import type { TavernEffect } from '../lib/tavern-presentation'

/** A fresh Blob URL gives each replay its own APNG animation clock. */
export default function TavernEffectImage({ effect, className }: { effect: TavernEffect; className?: string }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    let active = true, url = ''
    const request = new AbortController()
    void fetch(effect.url, { signal: request.signal, credentials: 'same-origin', cache: 'force-cache' }).then(async response => {
      if (!response.ok) throw new Error('演出素材暂时无法读取。')
      const blob = await response.blob()
      if (active) { url = URL.createObjectURL(blob); setSource(url) }
    }).catch(() => { if (active) setSource(effect.url) })
    return () => { active = false; request.abort(); if (url) URL.revokeObjectURL(url) }
  }, [effect.url])
  return source ? <img className={className} src={source} alt={effect.name} /> : null
}
