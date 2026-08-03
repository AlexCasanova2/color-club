import { describe, expect, it } from 'vitest';
import {
  collageLayout,
  durationOptions,
  individualRandomChoice,
  photoCountOptions,
  resolveChallengeSelection,
  sharedRandomChoice,
} from './challengeRules';

describe('challenge presets', () => {
  it('keeps every supported duration and photo count available', () => {
    expect(durationOptions.map(({ value }) => value)).toEqual(['30min', '2h', '6h', '24h', '48h', '1week']);
    expect(photoCountOptions).toEqual([2, 4, 6, 8, 10, 12]);
  });
});

describe('resolveChallengeSelection', () => {
  it('keeps a manually selected color shared', () => {
    expect(resolveChallengeSelection('#E84A3C', '#3157D5')).toEqual({
      mode: 'shared_color',
      sharedColor: '#E84A3C',
      colorSelectionMode: 'manual',
    });
  });

  it('uses the generated color for shared random challenges', () => {
    expect(resolveChallengeSelection(sharedRandomChoice.hex, '#3157D5')).toEqual({
      mode: 'shared_color',
      sharedColor: '#3157D5',
      colorSelectionMode: 'shared_random',
    });
  });

  it('selects the individual random RPC mode', () => {
    expect(resolveChallengeSelection(individualRandomChoice.hex, '#3157D5')).toEqual({
      mode: 'individual_random',
      sharedColor: individualRandomChoice.hex,
      colorSelectionMode: 'individual_random',
    });
  });
});

describe('collageLayout', () => {
  it.each([
    [2, 1, 2],
    [4, 2, 2],
    [6, 2, 3],
    [8, 2, 4],
    [10, 2, 5],
    [12, 3, 4],
  ])('uses a 9:16 %i-photo grid with %i columns and %i rows', (photoCount, columns, rows) => {
    expect(collageLayout(photoCount)).toMatchObject({
      aspectRatio: 9 / 16,
      columns,
      rows,
    });
  });

  it('rejects empty collages', () => {
    expect(() => collageLayout(0)).toThrow('El collage debe incluir al menos una foto.');
  });
});
