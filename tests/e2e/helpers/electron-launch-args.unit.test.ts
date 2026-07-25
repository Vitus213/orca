import { describe, expect, it } from 'vitest'
import { getOrcaElectronLaunchArgs } from './electron-launch-args'

describe('getOrcaElectronLaunchArgs', () => {
  it('includes the Linux sandbox bypass required by raw Electron child processes', () => {
    expect(getOrcaElectronLaunchArgs('/tmp/main.js', false, 'linux')).toEqual([
      '--no-sandbox',
      '--disable-gpu',
      '--disable-gpu-compositing',
      '--disable-gpu-sandbox',
      '--disable-dev-shm-usage',
      '--in-process-gpu',
      '/tmp/main.js'
    ])
  })

  it('keeps headful and non-Linux invocations minimal', () => {
    expect(getOrcaElectronLaunchArgs('/tmp/main.js', true, 'linux')).toEqual([
      '--no-sandbox',
      '/tmp/main.js'
    ])
    expect(getOrcaElectronLaunchArgs('/tmp/main.js', false, 'darwin')).toEqual(['/tmp/main.js'])
  })
})
