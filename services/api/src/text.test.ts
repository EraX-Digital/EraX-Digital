import { describe, expect, it } from 'vitest'
import { escapeLike, extractHashtags, extractMentions } from './text'

describe('social text', () => {
  it('extracts hashtags and mentions without treating them as queries', () => {
    expect(extractHashtags('Hello #EraX and #erax and #no')).toEqual(['erax', 'no'])
    expect(extractMentions('Hi @ada_1 and @ada_1')).toEqual(['ada_1'])
    expect(escapeLike(`100%_done\\'`)).toBe(`100\\%\\_done\\\\'`)
  })
})
