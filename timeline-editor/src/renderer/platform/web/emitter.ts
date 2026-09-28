/** 进程内事件发射器 —— 对齐 preload 的「注册回调返回退订函数」语义 */

export class Emitter<T> {
  private listeners = new Set<(value: T) => void>()

  on(callback: (value: T) => void): () => void {
    this.listeners.add(callback)
    return () => { this.listeners.delete(callback) }
  }

  emit(value: T): void {
    for (const listener of this.listeners) listener(value)
  }
}

export class VoidEmitter {
  private listeners = new Set<() => void>()

  on(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => { this.listeners.delete(callback) }
  }

  emit(): void {
    for (const listener of this.listeners) listener()
  }
}
