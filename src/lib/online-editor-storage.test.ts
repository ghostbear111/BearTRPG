import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { BrowserEditorApi } from '../browser/editor-api'
import { createLibraryDraft } from './object-library'
import { blankAdventure } from './adventure-engine'
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGr8AAAAASUVORK5CYII='), c=>c.charCodeAt(0))
const call = (api: BrowserEditorApi, path: string, method = 'GET', body?: unknown) => api.handle(new Request(`https://editor.example${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }))
const upload = (api: BrowserEditorApi, bytes: Uint8Array<ArrayBuffer> = PNG, mime = 'image/png') => api.handle(new Request('https://editor.example/api/resources', { method:'POST', headers:{'Content-Type':mime}, body:bytes }))
describe('online editor browser persistence',()=>{
 it('persists resources, immutable templates and deletion across worker restarts',async()=>{
  const factory=new IDBFactory(), seed=createLibraryDraft('dice'), first=new BrowserEditorApi('restart',[seed],factory)
  const entries=(await (await call(first,'/api/library')).json()).entries
  const uploaded=await (await upload(first)).json(), duplicate=await (await upload(first)).json()
  expect(duplicate.sha256).toBe(uploaded.sha256)
  const draft=createLibraryDraft('card');draft.template.texture=uploaded.url
  const saved=await (await call(first,'/api/library','POST',draft)).json()
  await call(first,`/api/library/${entries[0].id}`,'DELETE');await first.close()
  const restarted=new BrowserEditorApi('restart',[seed],factory)
  expect((await (await call(restarted,'/api/library')).json()).entries.map((e:any)=>e.id)).toEqual([saved.id])
  expect(new Uint8Array(await (await call(restarted,uploaded.url)).arrayBuffer())).toEqual(PNG)
  expect((await call(restarted,`/api/library/${entries[0].id}?revision=1`)).status).toBe(200)
  await restarted.close()
 })
 it('prevents stale concurrent edits from overwriting a newer template',async()=>{
  const factory=new IDBFactory(), a=new BrowserEditorApi('conflict',[],factory), b=new BrowserEditorApi('conflict',[],factory)
  const saved=await (await call(a,'/api/library','POST',createLibraryDraft('token'))).json()
  const draft=createLibraryDraft('token'), bodies=[{...draft,name:'first',expectedRevision:1},{...draft,name:'second',expectedRevision:1}]
  const replies=await Promise.all(bodies.map((body,i)=>call(i?a:b,`/api/library/${saved.id}`,'PUT',body)))
  expect(replies.map(r=>r.status).sort()).toEqual([200,409])
  expect((await (await call(a,`/api/library/${saved.id}`)).json()).revision).toBe(2)
  expect((await (await call(a,`/api/library/${saved.id}?revision=1`)).json()).name).toBe(saved.name)
  await a.close();await b.close()
 })
 it('deduplicates concurrent imports and keeps later author edits',async()=>{
  const factory=new IDBFactory(), a=new BrowserEditorApi('imports',[],factory), b=new BrowserEditorApi('imports',[],factory), definition=blankAdventure()
  const replies=await Promise.all([a,b].map(api=>call(api,'/api/adventures/import','POST',{definition}).then(r=>r.json())))
  expect(replies.map(r=>r.created).sort()).toEqual([false,true]);expect(replies[0].definition.id).toBe(replies[1].definition.id)
  const saved=replies[0].definition
  expect((await call(a,`/api/adventures/${saved.id}`,'PUT',{definition:{...saved,title:'重新创作'},expectedRevision:1})).status).toBe(200)
  const again=await (await call(b,'/api/adventures/import','POST',{definition})).json()
  expect(again.created).toBe(false);expect(again.definition.title).toBe('重新创作')
  expect((await (await call(a,'/api/adventures')).json()).adventures).toHaveLength(1)
  await a.close();await b.close()
 })
 it('saves authored works and rejects missing resources without creating partial records',async()=>{
  const factory=new IDBFactory(), a=new BrowserEditorApi('works',[],factory), definition=blankAdventure()
  definition.title='在线原创故事'
  const saved=await (await call(a,'/api/adventures','POST',{definition})).json()
  expect(saved.revision).toBe(1)
  const updated=await call(a,`/api/adventures/${saved.id}`,'PUT',{definition:{...saved,title:'第二版'},expectedRevision:1})
  expect(updated.status).toBe(200)
  expect((await call(a,`/api/adventures/${saved.id}`,'PUT',{definition:saved,expectedRevision:1})).status).toBe(409)
  const draft=createLibraryDraft('card');draft.template.texture='/api/resources/'+'a'.repeat(64)
  expect((await call(a,'/api/library','POST',draft)).status).toBe(400)
  expect((await (await call(a,'/api/library')).json()).entries).toHaveLength(0)
  expect((await (await call(a,`/api/adventures/${saved.id}?revision=1`)).json()).title).toBe(definition.title)
  expect((await upload(a,PNG,'image/webp')).status).toBe(415)
  expect((await upload(a,new Uint8Array([1,2,3]))).status).toBe(400)
  expect((await call(a,'/api/chat','POST',{apiKey:'private-test'})).status).toBe(501)
  await a.close()
 })
})
