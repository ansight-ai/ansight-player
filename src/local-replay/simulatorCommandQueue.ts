/** Preserve gesture and key event order when control falls back to HTTP. */
export function createSimulatorCommandQueue() {
  let pending: Promise<void> = Promise.resolve()

  return {
    enqueue<T>(send: () => Promise<T>): Promise<T> {
      const result = pending.then(send)
      // A failed command still reports its error, but must not block later input.
      pending = result.then(() => undefined, () => undefined)
      return result
    },
  }
}
