import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const projectDir = resolve(import.meta.dirname, '../..')

describe('E2E workflow', () => {
  it('gives GitHub-backed Electron tests scoped gh credentials', () => {
    const workflow = parse(readFileSync(join(projectDir, '.github/workflows/e2e.yml'), 'utf8'))

    for (const jobName of ['e2e', 'ssh-docker-watcher-isolation']) {
      const job = workflow.jobs[jobName]
      const testStep = job.steps.find(
        (step) => typeof step.run === 'string' && step.run.includes('pnpm run test:e2e')
      )

      expect(job.permissions).toMatchObject({
        contents: 'read',
        issues: 'read',
        'pull-requests': 'read'
      })
      expect(testStep).toMatchObject({ env: { GH_TOKEN: '${{ github.token }}' } })
    }
  })

  it('isolates the slow TUI wheel drain checks from regular hash shards', () => {
    const workflow = parse(readFileSync(join(projectDir, '.github/workflows/e2e.yml'), 'utf8'))
    const e2eJob = workflow.jobs.e2e
    const regularShards = e2eJob.strategy.matrix.include.filter((entry) =>
      /^\d+-of-10$/.test(entry.shard_name)
    )
    const isolatedWheelJobs = e2eJob.strategy.matrix.include.filter(
      (entry) => entry.shard_name === 'terminal-tui-wheel-drain'
    )
    const testStep = e2eJob.steps.find(
      (step) => typeof step.run === 'string' && step.run.includes('pnpm run test:e2e')
    )
    const wheelDrainSpec = readFileSync(
      join(projectDir, 'tests/e2e/terminal-tui-wheel-drain.spec.ts'),
      'utf8'
    )

    expect(testStep.run).toContain('pnpm run test:e2e ${{ matrix.test_args }}')
    expect(e2eJob.strategy['max-parallel']).toBe(10)
    expect(regularShards).toHaveLength(10)
    expect(
      regularShards.every((entry) =>
        /^--shard=\d+\/10 --grep-invert @ci-isolated$/.test(entry.test_args)
      )
    ).toBe(true)
    expect(isolatedWheelJobs).toEqual([
      expect.objectContaining({
        test_args: 'tests/e2e/terminal-tui-wheel-drain.spec.ts'
      })
    ])
    expect(wheelDrainSpec).toContain("test.describe('terminal TUI wheel report drain @ci-isolated'")
  })

  it('passes GitHub read scopes into the release caller', () => {
    const workflow = parse(
      readFileSync(join(projectDir, '.github/workflows/release-cut.yml'), 'utf8')
    )

    expect(workflow.jobs.e2e.permissions).toMatchObject({
      contents: 'read',
      issues: 'read',
      'pull-requests': 'read'
    })
  })
})
