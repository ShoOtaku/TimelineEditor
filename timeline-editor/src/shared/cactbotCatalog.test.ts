import { describe, expect, it } from 'vitest'
import { buildCactbotCatalog, isAllowedCactbotPath } from './cactbotCatalog'

describe('cactbot catalog', () => {
  it('filters repository entries and pairs same-path localization files', () => {
    const files = buildCactbotCatalog({
      tree: [
        { type: 'blob', path: 'ui/raidboss/data/07-dt/ultimate/futures_rewritten_ultimate.txt', size: 4200 },
        { type: 'blob', path: 'ui/raidboss/data/07-dt/ultimate/futures_rewritten_ultimate.ts', size: 3100 },
        { type: 'blob', path: 'ui/raidboss/data/07-dt/raid/readme.md', size: 20 },
        { type: 'blob', path: 'ui/raidboss/data/raidboss_manifest.txt', size: 20 },
        { type: 'blob', path: 'ui/raidboss/data/99-custom/readme.txt', size: 20 },
        { type: 'blob', path: 'docs/timeline.txt', size: 10 }
      ]
    })

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      versionLabel: '7.0 金曦之遗辉',
      categoryLabel: '绝本',
      localizationPath: 'ui/raidboss/data/07-dt/ultimate/futures_rewritten_ultimate.ts'
    })
  })

  it('rejects paths outside the cactbot data tree or containing traversal', () => {
    expect(isAllowedCactbotPath('ui/raidboss/data/07-dt/raid/a.txt', '.txt')).toBe(true)
    expect(isAllowedCactbotPath('ui/raidboss/data/../secrets.txt', '.txt')).toBe(false)
    expect(isAllowedCactbotPath('https://example.com/a.txt', '.txt')).toBe(false)
  })
})
