import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  focusActiveTerminalInput,
  getTerminalContent,
  sendToTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

// Repro for the permanent frozen-pane state behind issue #8104-class reports:
// once a pane's xterm WriteBuffer wedges (an escaping throw from an unguarded
// write callback, or a write into a disposed terminal silently dropping its
// completion — both verified against vendored xterm 6.1.0-beta.287), every
// later write queues forever: output stops rendering while the PTY stays
// alive. The replay guard's probe certifies the wedge and fires the
// terminal_replay_guard_wedged_release breadcrumb ("pane likely needs
// recovery") — but nothing performs that recovery, so the pane stays a fossil
// until the user reloads the window. These tests pin the recovery contract.

async function wedgeActivePaneWritePipeline(
  page: Parameters<typeof waitForSessionReady>[0]
): Promise<string> {
  const callbackMarker = `__e2eWedgeCallbackRan_${Date.now()}`
  await page.evaluate((marker) => {
    const state = window.__store?.getState()
    const worktreeId = state?.activeWorktreeId
    const tabId =
      state?.activeTabType === 'terminal'
        ? state.activeTabId
        : worktreeId
          ? (state?.activeTabIdByWorktree?.[worktreeId] ?? null)
          : null
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    if (!pane) {
      throw new Error('No active terminal pane to wedge')
    }
    // Same escape class as issue #2836: WriteBuffer._innerWrite invokes write
    // callbacks with no try/catch; a synchronous throw skips the loop's tail
    // re-schedule and write() only re-arms on an EMPTY buffer, so the pipeline
    // never drains again.
    pane.terminal.write('', () => {
      ;(window as unknown as Record<string, boolean>)[marker] = true
      throw new Error('e2e: simulated unguarded write-completion throw')
    })
  }, callbackMarker)
  return callbackMarker
}

test.describe('Wedged terminal write pipeline recovery', () => {
  test('pane recovers rendering and input after its write pipeline wedges', async ({
    orcaPage
  }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    await waitForActiveTerminalManager(orcaPage, 30_000)
    const ptyId = await waitForActivePanePtyId(orcaPage)
    await focusActiveTerminalInput(orcaPage)

    // Prove the pane is healthy first.
    const runId = Date.now()
    const beforeMarker = `WEDGE_BASELINE_${runId}`
    await orcaPage.keyboard.type(`echo ${beforeMarker}`, { delay: 20 })
    await orcaPage.keyboard.press('Enter')
    await expect
      .poll(async () => (await getTerminalContent(orcaPage)).includes(beforeMarker), {
        timeout: 15_000,
        message: 'Baseline echo did not render - pane unhealthy before wedge'
      })
      .toBe(true)

    const callbackMarker = await wedgeActivePaneWritePipeline(orcaPage)
    // The old test raced the injection with the next typed command. A passing
    // run could therefore render that command before the callback wedged
    // WriteBuffer, while a slow runner wedged too late to exercise recovery.
    // Wait for the exact failure callback before generating the PTY output that
    // must trigger the scheduler's probe-certified recovery path.
    await expect
      .poll(
        () =>
          orcaPage.evaluate(
            (marker) => (window as unknown as Record<string, boolean>)[marker] === true,
            callbackMarker
          ),
        {
          timeout: 10_000,
          message: 'The simulated unguarded xterm write callback never ran'
        }
      )
      .toBe(true)

    // Inject output through the PTY control plane rather than relying on an
    // xterm keyboard event after its callback loop has crashed. The recovery
    // contract is that the live PTY's next output rebuilds rendering.
    const afterMarker = `WEDGE_RECOVERED_${runId}`
    await sendToTerminal(orcaPage, ptyId, `echo ${afterMarker}\r`)

    await expect
      .poll(async () => (await getTerminalContent(orcaPage)).includes(afterMarker), {
        timeout: 45_000,
        message:
          'Pane never rendered PTY output after the write pipeline wedged - wedged pane was not recovered'
      })
      .toBe(true)

    // The fresh xterm must accept end-to-end input after recovery.
    await focusActiveTerminalInput(orcaPage)
    const typedMarker = `WEDGE_INPUT_${runId}`
    await orcaPage.keyboard.type(`echo ${typedMarker}`, { delay: 20 })
    await orcaPage.keyboard.press('Enter')
    await expect
      .poll(async () => (await getTerminalContent(orcaPage)).includes(typedMarker), {
        timeout: 15_000,
        message: 'Typed input never reached the PTY after write-pipeline recovery'
      })
      .toBe(true)
  })

  test('pane recovers after its xterm is disposed under live bindings (zombie pane)', async ({
    orcaPage
  }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    await waitForActiveTerminalManager(orcaPage, 30_000)
    const ptyId = await waitForActivePanePtyId(orcaPage)
    await focusActiveTerminalInput(orcaPage)

    const runId = Date.now()
    const beforeMarker = `ZOMBIE_BASELINE_${runId}`
    await orcaPage.keyboard.type(`echo ${beforeMarker}`, { delay: 20 })
    await orcaPage.keyboard.press('Enter')
    await expect
      .poll(async () => (await getTerminalContent(orcaPage)).includes(beforeMarker), {
        timeout: 15_000,
        message: 'Baseline echo did not render — pane unhealthy before dispose'
      })
      .toBe(true)

    // The production zombie: disposePane/teardown raced pane bindings, leaving
    // delivery and input routed at a disposed xterm. write() on a disposed
    // terminal silently drops its completion callback (verified against
    // 6.1.0-beta.287), so delivery acks leak and keyboard onData never fires —
    // the pane looks painted but is a fossil: input dead, output dead, PTY alive.
    await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      const worktreeId = state?.activeWorktreeId
      const tabId =
        state?.activeTabType === 'terminal'
          ? state.activeTabId
          : worktreeId
            ? (state?.activeTabIdByWorktree?.[worktreeId] ?? null)
            : null
      const manager = tabId ? window.__paneManagers?.get(tabId) : null
      const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
      if (!pane) {
        throw new Error('No active terminal pane to dispose')
      }
      pane.terminal.dispose()
    })

    // Generate PTY output daemon-side; delivery into the disposed xterm is the
    // health signal recovery must catch (typing can't be one here — a disposed
    // xterm emits no onData at all).
    const outputMarker = `ZOMBIE_OUTPUT_${runId}`
    await sendToTerminal(orcaPage, ptyId, `echo ${outputMarker}\r`)

    await expect
      .poll(async () => (await getTerminalContent(orcaPage)).includes(outputMarker), {
        timeout: 45_000,
        message:
          'Output written after the pane xterm was disposed never rendered — zombie pane was not recovered'
      })
      .toBe(true)

    // Input must be live again end-to-end after recovery.
    await focusActiveTerminalInput(orcaPage)
    const typedMarker = `ZOMBIE_INPUT_${runId}`
    await orcaPage.keyboard.type(`echo ${typedMarker}`, { delay: 20 })
    await orcaPage.keyboard.press('Enter')
    await expect
      .poll(async () => (await getTerminalContent(orcaPage)).includes(typedMarker), {
        timeout: 15_000,
        message: 'Typed input never reached the PTY after zombie-pane recovery'
      })
      .toBe(true)
  })
})
