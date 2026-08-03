import type { DurationPreset } from '../types/domain';

export const durationOptions: ReadonlyArray<{ value: DurationPreset; label: string }> = [
  { value: '30min', label: '30 min' },
  { value: '2h', label: '2 horas' },
  { value: '6h', label: '6 horas' },
  { value: '24h', label: '24 horas' },
  { value: '48h', label: '48 horas' },
  { value: '1week', label: '1 semana' },
];

export const photoCountOptions = [2, 4, 6, 8, 10, 12] as const;
export const sharedRandomChoice = { name: 'Color compartido aleatorio', hex: 'shared-random' } as const;
export const individualRandomChoice = { name: 'Color aleatorio individual', hex: 'individual-random' } as const;

export function resolveChallengeSelection(selectedColor: string, randomColor: string) {
  if (selectedColor === individualRandomChoice.hex) {
    return {
      mode: 'individual_random' as const,
      sharedColor: selectedColor,
      colorSelectionMode: 'individual_random' as const,
    };
  }

  if (selectedColor === sharedRandomChoice.hex) {
    return {
      mode: 'shared_color' as const,
      sharedColor: randomColor,
      colorSelectionMode: 'shared_random' as const,
    };
  }

  return {
    mode: 'shared_color' as const,
    sharedColor: selectedColor,
    colorSelectionMode: 'manual' as const,
  };
}

export function collageLayout(photoCount: number) {
  if (photoCount <= 0) throw new Error('El collage debe incluir al menos una foto.');

  const columns = photoCount === 2 ? 1 : photoCount === 12 ? 3 : 2;
  const rows = Math.ceil(photoCount / columns);
  const aspectRatio = 9 / 16;

  return {
    aspectRatio,
    columns,
    rows,
    slotAspectRatio: aspectRatio * rows / columns,
  };
}
