interface DiceArtwork { source: HTMLImageElement; foreground: HTMLCanvasElement; background: string }
const artwork = new Map<string, Promise<DiceArtwork | null>>()

/** Keep the original gold artwork, removing its flat backdrop for custom face colors. */
export function loadDiceArtwork(url: string) {
  const existing = artwork.get(url)
  if (existing) return existing
  const promise = new Promise<DiceArtwork | null>(resolve => {
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(image, 0, 0)
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), data = pixels.data
        const background = [data[0], data[1], data[2]], gold = [...background]
        let maximum = 0
        for (let i = 0; i < data.length; i += 4) {
          const distance = (data[i] - background[0]) ** 2 + (data[i + 1] - background[1]) ** 2 + (data[i + 2] - background[2]) ** 2
          if (distance > maximum) { maximum = distance; gold[0] = data[i]; gold[1] = data[i + 1]; gold[2] = data[i + 2] }
        }
        const delta = gold.map((n, i) => n - background[i]), length = delta.reduce((sum, n) => sum + n * n, 0)
        for (let i = 0; i < data.length; i += 4) {
          const alpha = length ? Math.max(0, Math.min(1, ((data[i] - background[0]) * delta[0] + (data[i + 1] - background[1]) * delta[1] + (data[i + 2] - background[2]) * delta[2]) / length)) : 0
          data[i] = gold[0]; data[i + 1] = gold[1]; data[i + 2] = gold[2]; data[i + 3] = Math.round(alpha * 255)
        }
        ctx.putImageData(pixels, 0, 0)
        resolve({ source: image, foreground: canvas, background: `#${background.map(n => n.toString(16).padStart(2, '0')).join('')}` })
      } catch { resolve(null) }
    }
    image.onerror = () => resolve(null)
    image.src = url
  })
  artwork.set(url, promise)
  return promise
}
