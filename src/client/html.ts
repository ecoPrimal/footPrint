// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * HTML escaping utility. Prevents XSS when interpolating user data
 * into innerHTML strings.
 */
export function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
