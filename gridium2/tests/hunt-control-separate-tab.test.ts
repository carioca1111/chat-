import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Hunt Control navigation', () => {
  it('keeps Hunt Control in a separate top-level tab from the Hunt route view', () => {
    const app = readFileSync(join(process.cwd(), 'src/renderer/src/App.tsx'), 'utf8')
    const separationCss = readFileSync(join(process.cwd(), 'src/renderer/src/hunt-control-separation.css'), 'utf8')

    expect(app).toContain("label: 'HUNT CTRL'")
    expect(app).toContain("huntSurface === 'control'")
    expect(app).toContain('? <HuntAssistPanel snapshot={snapshot} />')
    expect(app).toContain(': <HuntView accountId={snapshot.selectedAccount}')
    expect(app).not.toContain('<><HuntAssistPanel snapshot={snapshot} /><HuntView')
    expect(separationCss).toContain('.hunt-page{top:72px}')
  })

  it('keeps capture and kill goals independently editable without committing every keystroke', () => {
    const panel = readFileSync(join(process.cwd(), 'src/renderer/src/HuntAssistPanel.tsx'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/hunt-assist.css'), 'utf8')

    expect(panel).toContain('META DE CAPTURAS')
    expect(panel).toContain('META DE ABATES')
    expect(panel).toContain('killGoalKey')
    expect(panel).toContain('function GoalEditor')
    expect(panel).toContain('onInput={(event) => setDraft')
    expect(panel).toContain('onBlur={commit}')
    expect(panel).toContain("event.key === 'Enter'")
    expect(css).toContain('bottom:38px')
    expect(css).not.toContain('.hunt-page{top:332px}')
  })
})
