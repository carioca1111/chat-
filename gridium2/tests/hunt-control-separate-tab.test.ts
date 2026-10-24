import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Hunt Control navigation', () => {
  it('keeps Hunt Control in a separate top-level tab from the Hunt route view', () => {
    const app = readFileSync(join(process.cwd(), 'src/renderer/src/App.tsx'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/hunt-assist.css'), 'utf8')

    expect(app).toContain("label: 'HUNT CTRL'")
    expect(app).toContain("huntSurface === 'control'")
    expect(app).toContain('? <HuntAssistPanel snapshot={snapshot} />')
    expect(app).toContain(': <HuntView accountId={snapshot.selectedAccount}')
    expect(app).not.toContain('<><HuntAssistPanel snapshot={snapshot} /><HuntView')
    expect(css).not.toContain('.hunt-page{top:332px}')
  })
})
