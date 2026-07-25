export function getOrcaElectronLaunchArgs(
  mainPath: string,
  headful: boolean,
  platform: NodeJS.Platform = process.platform
): string[] {
  if (platform !== 'linux') {
    return [mainPath]
  }

  // Why: raw Electron child processes do not receive Playwright's Linux
  // `--no-sandbox` launch switch. Keep every E2E Electron invocation viable
  // in CI, including the standalone process that activates a serve owner.
  const sandboxArgs = ['--no-sandbox']
  if (headful) {
    return [...sandboxArgs, mainPath]
  }

  // Why: Ubuntu CI can fail headless Electron when Chromium's GPU subprocess
  // cannot initialize; keep E2E on a low-process software path under Xvfb.
  return [
    ...sandboxArgs,
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--in-process-gpu',
    mainPath
  ]
}
