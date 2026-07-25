import type { Page } from '@stablyai/playwright-test'

// Why: Electron can leave a CDP input dispatch pending while renderer pressure
// is high. A physical wheel does not make the user wait for that protocol
// response; bound this diagnostic path so callers can use their fallback.
export const CDP_WHEEL_ACTION_TIMEOUT_MS = 1_000

export type CdpWheelInput = Pick<Page['mouse'], 'move' | 'wheel'>

export type CdpWheelTarget = {
  x: number
  y: number
}

export type CdpWheelAttemptOutcome = 'completed' | 'timed-out'

export async function dispatchCdpWheelWithDeadline(
  mouse: CdpWheelInput,
  target: CdpWheelTarget,
  timeoutMs = CDP_WHEEL_ACTION_TIMEOUT_MS
): Promise<CdpWheelAttemptOutcome> {
  let expired = false
  let timeout: NodeJS.Timeout | undefined
  const cdpInput = (async () => {
    await mouse.move(target.x, target.y)
    // Do not inject a delayed wheel after the fallback already scrolled.
    if (!expired) {
      await mouse.wheel(0, -1200)
    }
  })()
  const deadline = new Promise<CdpWheelAttemptOutcome>((resolve) => {
    timeout = setTimeout(() => {
      expired = true
      resolve('timed-out')
    }, timeoutMs)
  })
  try {
    const outcome = await Promise.race([
      cdpInput.then((): CdpWheelAttemptOutcome => 'completed'),
      deadline
    ])
    if (outcome === 'timed-out') {
      // The protocol request is not cancellable. A delayed move cannot issue
      // the wheel because the expired guard prevents that later side effect.
      void cdpInput.catch(() => undefined)
    }
    return outcome
  } finally {
    clearTimeout(timeout)
  }
}
