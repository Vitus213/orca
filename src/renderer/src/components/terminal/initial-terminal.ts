export function shouldAutoCreateInitialTerminal(
  renderableTabCount: number,
  initialTerminalHandled = false
): boolean {
  // Why: the tab-group model is now the source of truth for visible worktree
  // content. A truly new worktree with no renderable tabs needs a terminal,
  // but a durable close records that the empty state was intentional.
  return renderableTabCount === 0 && !initialTerminalHandled
}
