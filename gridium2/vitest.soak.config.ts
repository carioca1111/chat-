import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/long-running-soak.test.ts', 'tests/runtime-lifecycle.test.ts'], pool: 'forks', maxWorkers: 1, poolOptions: { forks: { execArgv: ['--expose-gc'] } }, env: { GRIDIUM_SOAK_REPORT: '1' } } })
