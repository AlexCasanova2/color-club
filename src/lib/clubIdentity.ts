import { colors } from '@/lib/theme';
import type { ClubIcon } from '@/types/domain';

export const clubColorChoices = [
  { name: 'Naranja', hex: colors.orange },
  { name: 'Azul', hex: colors.blue },
  { name: 'Rosa', hex: colors.pink },
  { name: 'Verde', hex: colors.green },
  { name: 'Violeta', hex: colors.lavender },
  { name: 'Amarillo', hex: colors.yellow },
];

export const clubIconChoices: Array<{ name: string; value: ClubIcon }> = [
  { name: 'Paleta', value: 'color-palette-outline' },
  { name: 'Cámara', value: 'camera-outline' },
  { name: 'Destellos', value: 'sparkles-outline' },
  { name: 'Personas', value: 'people-outline' },
  { name: 'Corazón', value: 'heart-outline' },
  { name: 'Planeta', value: 'planet-outline' },
  { name: 'Sol', value: 'sunny-outline' },
  { name: 'Flor', value: 'flower-outline' },
];

export function resolveClubIcon(icon?: string | null): ClubIcon {
  return clubIconChoices.some((choice) => choice.value === icon) ? icon as ClubIcon : 'color-palette-outline';
}
