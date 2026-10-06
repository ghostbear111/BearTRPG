/// <reference lib="webworker" />
import { BrowserEditorApi } from './editor-api'
import builtins from '../../server/library-builtins.json'
import playKit from '../../server/library-play-kit.json'
import diceKit from '../../server/library-dice-kit.json'
const worker = globalThis as unknown as ServiceWorkerGlobalScope
const api = new BrowserEditorApi('bear-trpg-online-editor-v1', [...builtins, ...playKit, ...diceKit])
worker.addEventListener('install', event => event.waitUntil(worker.skipWaiting()))
worker.addEventListener('activate', event => event.waitUntil(worker.clients.claim()))
worker.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin === worker.location.origin && url.pathname.startsWith('/api/')) event.respondWith(api.handle(event.request))
})
