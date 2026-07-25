import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchCdpWheelWithDeadline, type CdpWheelInput } from './artificial-opencode-cdp-wheel'

afterEach(() => {
  vi.useRealTimers()
})

describe('dispatchCdpWheelWithDeadline', () => {
  it('reports completion after dispatching the CDP move and wheel', async () => {
    const move = vi.fn(async () => {})
    const wheel = vi.fn(async () => {})
    const mouse: CdpWheelInput = { move, wheel }

    await expect(dispatchCdpWheelWithDeadline(mouse, { x: 12, y: 34 }, 50)).resolves.toBe(
      'completed'
    )
    expect(move).toHaveBeenCalledWith(12, 34)
    expect(wheel).toHaveBeenCalledWith(0, -1200)
  })

  it('releases DOM scroll fallbacks when CDP move remains pending', async () => {
    vi.useFakeTimers()
    let resolveMove: (() => void) | undefined
    const move = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMove = resolve
        })
    )
    const wheel = vi.fn(async () => {})
    const mouse: CdpWheelInput = { move, wheel }

    const attempt = dispatchCdpWheelWithDeadline(mouse, { x: 12, y: 34 }, 50)
    await vi.advanceTimersByTimeAsync(50)

    await expect(attempt).resolves.toBe('timed-out')
    resolveMove?.()
    await Promise.resolve()

    expect(wheel).not.toHaveBeenCalled()
  })
})
