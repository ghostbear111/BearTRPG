/** Cache ownership stays outside any individual R3F canvas. */
export class SharedResourceCache<T> {
  private entries = new Map<string, { value: T; references: number; lastUsed: number }>()
  private sequence = 0
  private collection: ReturnType<typeof setTimeout> | undefined

  constructor(private create: (key: string) => T, private dispose: (resource: T) => void, private keepUnused = 4) {}

  acquire(key: string): { value: T; release: () => void } {
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { value: this.create(key), references: 0, lastUsed: 0 }
      this.entries.set(key, entry)
    }
    const retained = entry
    retained.references += 1
    retained.lastUsed = ++this.sequence
    let released = false
    return {
      value: retained.value,
      release: () => {
        if (released) return
        released = true
        retained.references -= 1
        retained.lastUsed = ++this.sequence
        // A StrictMode cleanup/re-attach happens before this collection runs.
        // Active previews and tables therefore never dispose each other's GPU data.
        if (this.collection === undefined) this.collection = setTimeout(() => {
          this.collection = undefined
          this.collect()
        }, 0)
      },
    }
  }

  private collect() {
    const unused = [...this.entries.entries()].filter(([, entry]) => entry.references === 0)
      .sort((a, b) => b[1].lastUsed - a[1].lastUsed)
    unused.slice(this.keepUnused).forEach(([key, entry]) => {
      this.entries.delete(key)
      this.dispose(entry.value)
    })
  }
}
