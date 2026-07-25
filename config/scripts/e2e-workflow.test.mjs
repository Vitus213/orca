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
