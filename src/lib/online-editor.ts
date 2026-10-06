export const STATIC_EDITOR = import.meta.env.MODE === 'pages'
export const editorAsset = (path: string) => STATIC_EDITOR ? new URL(path.replace(/^\//, ''), new URL(import.meta.env.BASE_URL, location.href)).href : path
export async function prepareOnlineEditor() {
  if (!STATIC_EDITOR) return
  if (!('serviceWorker' in navigator) || !globalThis.indexedDB) throw new Error('在线编辑器需要支持浏览器存储的现代浏览器。')
  const registration = await navigator.serviceWorker.register(editorAsset('editor-worker.js'), { type:'module', scope:new URL(import.meta.env.BASE_URL, location.href).pathname, updateViaCache:'none' })
  const scope = registration.scope
  if (!navigator.serviceWorker.controller?.scriptURL.startsWith(scope)) await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', change); reject(new Error('浏览器存储模块启动超时，请刷新重试。')) }, 20000)
    const change = () => { if (navigator.serviceWorker.controller?.scriptURL.startsWith(scope)) { clearTimeout(timeout); navigator.serviceWorker.removeEventListener('controllerchange', change); resolve() } }
    navigator.serviceWorker.addEventListener('controllerchange', change); change()
  })
}
