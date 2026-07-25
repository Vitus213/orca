import { describe, expect, it } from 'vitest'
import { expectMainPressureAndTyping } from './artificial-opencode-main-pressure-scenario'

function assertMainPressureTyping(timerDriftBudgetMs: number): void {
  expectMainPressureAndTyping({
    ackGate: { heldAckChars: 1 },
    mainPressure: { peakRendererInFlightChars: 2 * 1024 * 1024 },
    maxMedianKeyLatencyMs: 75,
    maxTimerDriftMs: timerDriftBudgetMs,
    maxWorstKeyLatencyMs: 3_000,
    measurement: {
      medianLatencyMs: 10,
      worstLatencyMs: 40,
      // GitHub run 30143951832: the interactive key path remained responsive
      // while one renderer timer was delayed 316.7ms by the loaded shard.
      maxTimerDriftMs: 316.7
    },
    pressureBeforeTyping: {
      peakPendingChars: 1,
      peakRendererInFlightChars: 2 * 1024 * 1024,
      ackGatedFlushSkipCount: 1
    },
    scheduler: { peakQueuedChars: 0, droppedBacklogCount: 0 }
  })
}

describe('OpenCode main-pressure timer budget', () => {
  it('uses the under-load timer budget for an ACK-backpressured responsive pane', () => {
    expect(() => assertMainPressureTyping(2_500)).not.toThrow()
    expect(() => assertMainPressureTyping(250)).toThrow()
  })
})
