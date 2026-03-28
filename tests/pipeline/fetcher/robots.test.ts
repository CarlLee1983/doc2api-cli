import { describe, expect, test } from 'bun:test'
import { PERMISSIVE_RULES, parseRobotsTxt } from '../../../src/pipeline/fetcher/robots'

const EXAMPLE_ROBOTS = `
User-agent: *
Disallow: /admin
Disallow: /private/
Allow: /admin/public

User-agent: doc2api
Disallow: /secret
Crawl-delay: 2
`

describe('parseRobotsTxt', () => {
  describe('basic Disallow rules', () => {
    test('blocks disallowed path', () => {
      const rules = parseRobotsTxt('User-agent: *\nDisallow: /admin\n', '*')
      expect(rules.isAllowed('/admin')).toBe(false)
    })

    test('blocks sub-paths of disallowed prefix', () => {
      const rules = parseRobotsTxt('User-agent: *\nDisallow: /admin\n', '*')
      expect(rules.isAllowed('/admin/settings')).toBe(false)
    })

    test('allows unrelated path', () => {
      const rules = parseRobotsTxt('User-agent: *\nDisallow: /admin\n', '*')
      expect(rules.isAllowed('/public')).toBe(true)
    })
  })

  describe('Disallow: / blocks everything', () => {
    test('blocks root', () => {
      const rules = parseRobotsTxt('User-agent: *\nDisallow: /\n', '*')
      expect(rules.isAllowed('/')).toBe(false)
    })

    test('blocks all sub-paths', () => {
      const rules = parseRobotsTxt('User-agent: *\nDisallow: /\n', '*')
      expect(rules.isAllowed('/anything')).toBe(false)
      expect(rules.isAllowed('/a/b/c')).toBe(false)
    })
  })

  describe('empty Disallow allows everything', () => {
    test('empty Disallow means allow all', () => {
      const rules = parseRobotsTxt('User-agent: *\nDisallow:\n', '*')
      expect(rules.isAllowed('/')).toBe(true)
      expect(rules.isAllowed('/admin')).toBe(true)
    })
  })

  describe('Allow overrides Disallow when more specific', () => {
    test('Allow: /admin/public overrides Disallow: /admin', () => {
      const content = 'User-agent: *\nDisallow: /admin\nAllow: /admin/public\n'
      const rules = parseRobotsTxt(content, 'other-bot')
      expect(rules.isAllowed('/admin/public')).toBe(true)
      expect(rules.isAllowed('/admin/private')).toBe(false)
      expect(rules.isAllowed('/admin')).toBe(false)
    })
  })

  describe('specific user-agent takes precedence over wildcard', () => {
    test('doc2api uses specific rules, not wildcard', () => {
      const rules = parseRobotsTxt(EXAMPLE_ROBOTS, 'doc2api')
      // specific agent: Disallow /secret only
      expect(rules.isAllowed('/secret')).toBe(false)
      // wildcard has /admin blocked, but specific agent does not
      expect(rules.isAllowed('/admin')).toBe(true)
      expect(rules.isAllowed('/public')).toBe(true)
    })

    test('other-bot falls back to wildcard rules', () => {
      const rules = parseRobotsTxt(EXAMPLE_ROBOTS, 'other-bot')
      expect(rules.isAllowed('/admin')).toBe(false)
      expect(rules.isAllowed('/admin/public')).toBe(true)
      expect(rules.isAllowed('/secret')).toBe(true)
    })
  })

  describe('Crawl-delay extraction', () => {
    test('extracts crawl delay for matching agent', () => {
      const rules = parseRobotsTxt(EXAMPLE_ROBOTS, 'doc2api')
      expect(rules.crawlDelay).toBe(2)
    })

    test('returns null when no crawl delay specified', () => {
      const rules = parseRobotsTxt(EXAMPLE_ROBOTS, 'other-bot')
      expect(rules.crawlDelay).toBeNull()
    })

    test('extracts decimal crawl delay', () => {
      const content = 'User-agent: *\nDisallow:\nCrawl-delay: 0.5\n'
      const rules = parseRobotsTxt(content, 'any-bot')
      expect(rules.crawlDelay).toBe(0.5)
    })
  })

  describe('case-insensitive user-agent matching', () => {
    test('matches uppercase User-agent value case-insensitively', () => {
      const content = 'User-agent: DOC2API\nDisallow: /secret\n'
      const rules = parseRobotsTxt(content, 'doc2api')
      expect(rules.isAllowed('/secret')).toBe(false)
    })

    test('prefix match: doc2api matches doc2api/0.3.0 pattern', () => {
      const content = 'User-agent: doc2api\nDisallow: /secret\n'
      const rules = parseRobotsTxt(content, 'doc2api/0.3.0')
      expect(rules.isAllowed('/secret')).toBe(false)
    })
  })

  describe('multiple user-agent groups', () => {
    test('each bot gets its own rules', () => {
      const content = [
        'User-agent: bot-a',
        'Disallow: /a',
        '',
        'User-agent: bot-b',
        'Disallow: /b',
      ].join('\n')
      const rulesA = parseRobotsTxt(content, 'bot-a')
      const rulesB = parseRobotsTxt(content, 'bot-b')
      expect(rulesA.isAllowed('/a')).toBe(false)
      expect(rulesA.isAllowed('/b')).toBe(true)
      expect(rulesB.isAllowed('/b')).toBe(false)
      expect(rulesB.isAllowed('/a')).toBe(true)
    })

    test('multiple agents in same group', () => {
      const content = ['User-agent: bot-a', 'User-agent: bot-b', 'Disallow: /shared'].join('\n')
      const rulesA = parseRobotsTxt(content, 'bot-a')
      const rulesB = parseRobotsTxt(content, 'bot-b')
      expect(rulesA.isAllowed('/shared')).toBe(false)
      expect(rulesB.isAllowed('/shared')).toBe(false)
    })
  })

  describe('malformed and empty content', () => {
    test('empty string returns permissive rules', () => {
      const rules = parseRobotsTxt('', 'any-bot')
      expect(rules.isAllowed('/anything')).toBe(true)
      expect(rules.crawlDelay).toBeNull()
    })

    test('whitespace-only content returns permissive rules', () => {
      const rules = parseRobotsTxt('   \n\n   ', 'any-bot')
      expect(rules.isAllowed('/anything')).toBe(true)
    })

    test('lines without colons are ignored', () => {
      const content = 'this is garbage\nUser-agent: *\nDisallow: /blocked\n'
      const rules = parseRobotsTxt(content, 'any-bot')
      expect(rules.isAllowed('/blocked')).toBe(false)
    })

    test('no matching agent returns permissive rules', () => {
      const content = 'User-agent: specific-bot\nDisallow: /secret\n'
      const rules = parseRobotsTxt(content, 'unrelated-bot')
      expect(rules.isAllowed('/secret')).toBe(true)
    })
  })

  describe('comments are ignored', () => {
    test('inline comments after #', () => {
      const content = ['User-agent: * # everyone', 'Disallow: /admin # block admin'].join('\n')
      const rules = parseRobotsTxt(content, 'any-bot')
      expect(rules.isAllowed('/admin')).toBe(false)
    })

    test('full-line comments', () => {
      const content = [
        '# This is a robots.txt comment',
        'User-agent: *',
        '# another comment',
        'Disallow: /private',
      ].join('\n')
      const rules = parseRobotsTxt(content, 'any-bot')
      expect(rules.isAllowed('/private')).toBe(false)
      expect(rules.isAllowed('/public')).toBe(true)
    })
  })

  describe('path prefix matching without trailing slash', () => {
    test('Disallow: /admin blocks /admin and sub-paths', () => {
      const rules = parseRobotsTxt('User-agent: *\nDisallow: /admin\n', 'bot')
      expect(rules.isAllowed('/admin')).toBe(false)
      expect(rules.isAllowed('/admin/users')).toBe(false)
      expect(rules.isAllowed('/administrator')).toBe(false)
    })

    test('Disallow: /private/ with trailing slash', () => {
      const rules = parseRobotsTxt('User-agent: *\nDisallow: /private/\n', 'bot')
      expect(rules.isAllowed('/private/')).toBe(false)
      expect(rules.isAllowed('/private/doc')).toBe(false)
      // /private without slash is NOT blocked by /private/
      expect(rules.isAllowed('/private')).toBe(true)
    })
  })

  describe('PERMISSIVE_RULES export', () => {
    test('always allows any path', () => {
      expect(PERMISSIVE_RULES.isAllowed('/')).toBe(true)
      expect(PERMISSIVE_RULES.isAllowed('/admin')).toBe(true)
      expect(PERMISSIVE_RULES.isAllowed('/secret/path')).toBe(true)
    })

    test('crawlDelay is null', () => {
      expect(PERMISSIVE_RULES.crawlDelay).toBeNull()
    })
  })
})
