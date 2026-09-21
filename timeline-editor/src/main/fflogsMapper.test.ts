import { describe, expect, it } from 'vitest'

import { extractApiError, mergeCastPages, parseReportInfo } from './fflogsMapper'

describe('parseReportInfo', () => {
  it('提取契约字段并裁剪 fights 与 actors', () => {
    const raw = {
      title: '测试报告',
      start: 1000,
      end: 2000,
      lang: 'cn',
      fights: [
        {
          id: 1,
          start_time: 1000,
          end_time: 1500,
          name: 'Boss A',
          zoneName: '某副本',
          kill: true,
          boss: 1234,
          extraField: '应被丢弃'
        },
        { id: 'bad', start_time: 1, end_time: 2 },
        'not-an-object'
      ],
      friendlies: [
        { id: 10, name: '玩家一', type: 'Paladin', subType: 'Tank', icon: 'PLD', extra: 1 }
      ],
      enemies: [
        { id: 20, name: 'Boss', type: 'Boss' }
      ],
      ignored: true
    }

    expect(parseReportInfo(raw, 'ABC123')).toEqual({
      code: 'ABC123',
      title: '测试报告',
      start: 1000,
      end: 2000,
      lang: 'cn',
      fights: [
        { id: 1, start_time: 1000, end_time: 1500, name: 'Boss A', zoneName: '某副本', kill: true, boss: 1234 }
      ],
      friendlies: [
        { id: 10, name: '玩家一', type: 'Paladin', subType: 'Tank', icon: 'PLD' }
      ],
      enemies: [
        { id: 20, name: 'Boss', type: 'Boss', subType: undefined, icon: undefined }
      ]
    })
  })

  it('缺 title/lang 时回退默认值', () => {
    const info = parseReportInfo({ fights: [], friendlies: [], enemies: [] }, 'XYZ789')
    expect(info.code).toBe('XYZ789')
    expect(info.title).toBe('XYZ789')
    expect(info.start).toBe(0)
    expect(info.end).toBe(0)
    expect(info.lang).toBeUndefined()
    expect(info.fights).toEqual([])
  })

  it('raw 不是对象或缺 fights 时抛错', () => {
    expect(() => parseReportInfo(null, 'ABC123')).toThrow()
    expect(() => parseReportInfo('oops', 'ABC123')).toThrow()
    expect(() => parseReportInfo({ title: '无 fights' }, 'ABC123')).toThrow()
  })

  it('响应含 error 字段时抛出该错误文本', () => {
    expect(() => parseReportInfo({ status: 400, error: 'Invalid report code' }, 'ABC123'))
      .toThrow('Invalid report code')
  })
})

describe('mergeCastPages', () => {
  it('合并分页并过滤无 ability.name 的事件', () => {
    const pages = [
      {
        events: [
          { timestamp: 100, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: { name: '圣灵', guid: 7384, extra: 'drop' } },
          { timestamp: 200, type: 'cast', sourceID: 2, ability: { guid: 1 } },
          { timestamp: 300, type: 'begincast', sourceID: 3, ability: null },
          'garbage'
        ]
      },
      {
        events: [
          { timestamp: 400, type: 'cast', sourceID: 1, sourceIsFriendly: false, ability: { name: '攻击' } }
        ]
      },
      { notEvents: true },
      null
    ]

    expect(mergeCastPages(pages)).toEqual([
      { timestamp: 100, type: 'cast', sourceID: 1, sourceIsFriendly: true, ability: { name: '圣灵', guid: 7384 } },
      { timestamp: 400, type: 'cast', sourceID: 1, sourceIsFriendly: false, ability: { name: '攻击', guid: undefined } }
    ])
  })

  it('空输入返回空数组', () => {
    expect(mergeCastPages([])).toEqual([])
  })
})

describe('extractApiError', () => {
  it('提取 {status, error} 形式的错误文本', () => {
    expect(extractApiError({ status: 400, error: 'This report is private' })).toBe('This report is private')
  })

  it('正常响应返回 null', () => {
    expect(extractApiError({ fights: [] })).toBeNull()
    expect(extractApiError(null)).toBeNull()
    expect(extractApiError({ error: '' })).toBeNull()
    expect(extractApiError({ error: 42 })).toBeNull()
  })
})
