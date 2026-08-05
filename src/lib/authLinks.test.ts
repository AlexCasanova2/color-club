import { describe, expect, it } from 'vitest';
import { authLinkType, emailConfirmationUrl, passwordRecoveryUrl } from './authLinks';

describe('authLinkType', () => {
  it('recognizes email confirmation callbacks', () => {
    expect(authLinkType(`${emailConfirmationUrl}?code=confirmation-code`)).toBe('confirmation');
  });

  it('recognizes current and legacy password recovery callbacks', () => {
    expect(authLinkType(`${passwordRecoveryUrl}?code=recovery-code`)).toBe('recovery');
    expect(authLinkType('colorclub://reset-password?code=legacy-code')).toBe('recovery');
  });

  it('ignores unrelated deep links', () => {
    expect(authLinkType('colorclub://club/123')).toBeNull();
  });
});
