export const emailConfirmationUrl = 'colorclub://auth/confirm';
export const passwordRecoveryUrl = 'colorclub://auth/reset-password';

export function authLinkType(url: string) {
  if (url.startsWith(emailConfirmationUrl)) return 'confirmation' as const;
  if (url.startsWith(passwordRecoveryUrl) || url.startsWith('colorclub://reset-password')) return 'recovery' as const;
  return null;
}
