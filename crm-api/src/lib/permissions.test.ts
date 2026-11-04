import { describe, expect, it } from 'vitest'

import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from './permissions.js'

describe('role permission matrix', () => {
  it('only references known permissions, with no duplicates', () => {
    for (const role of ROLES) {
      const list = ROLE_PERMISSIONS[role]
      expect(list.every((p) => (PERMISSIONS as readonly string[]).includes(p))).toBe(true)
      expect(new Set(list).size).toBe(list.length)
    }
  })

  it('gives ADMIN everything and only ADMIN user/settings/audit management', () => {
    expect(new Set(ROLE_PERMISSIONS.ADMIN)).toEqual(new Set(PERMISSIONS))
    for (const role of ['MANAGER', 'SALES', 'SUPPORT'] as const) {
      expect(ROLE_PERMISSIONS[role]).not.toContain('users:manage')
      expect(ROLE_PERMISSIONS[role]).not.toContain('settings:manage')
      expect(ROLE_PERMISSIONS[role]).not.toContain('audit:read')
    }
  })

  it('keeps roles in a sensible order of power for CRM data', () => {
    const count = (r: (typeof ROLES)[number]) => ROLE_PERMISSIONS[r].length
    expect(count('ADMIN')).toBeGreaterThan(count('MANAGER'))
    expect(count('MANAGER')).toBeGreaterThan(count('SALES'))
    expect(count('SALES')).toBeGreaterThan(count('SUPPORT'))
    expect(ROLE_PERMISSIONS.SALES).not.toContain('deals:delete')
    // Sales may remove contacts they own, but not anyone's.
    expect(ROLE_PERMISSIONS.SALES).toContain('contacts:delete_own')
    expect(ROLE_PERMISSIONS.SALES).not.toContain('contacts:delete')
    expect(ROLE_PERMISSIONS.SUPPORT).not.toContain('contacts:delete_own')
    // Only managers (and admins) may take contact data out of the system.
    expect(ROLE_PERMISSIONS.MANAGER).toContain('contacts:export')
    expect(ROLE_PERMISSIONS.SALES).not.toContain('contacts:export')
    expect(ROLE_PERMISSIONS.SUPPORT).not.toContain('contacts:export')
    // Renaming or deleting a tag changes every record that uses it: managers and admins only.
    expect(ROLE_PERMISSIONS.MANAGER).toContain('tags:manage')
    expect(ROLE_PERMISSIONS.SALES).not.toContain('tags:manage')
    expect(ROLE_PERMISSIONS.SUPPORT).not.toContain('tags:manage')
    expect(ROLE_PERMISSIONS.SUPPORT).not.toContain('deals:write')
    expect(ROLE_PERMISSIONS.SUPPORT).not.toContain('leads:read')
  })
})
