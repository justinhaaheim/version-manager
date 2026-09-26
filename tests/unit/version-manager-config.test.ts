import {describe, expect, test} from 'bun:test';

import {
  DEFAULT_VERSION_CALCULATION_MODE,
  VersionManagerConfigSchema,
} from '../../src/types';

/**
 * version-manager-70i.28, option (a): versionCalculationMode is optional like
 * every other field. It used to be the one required field, so a config holding
 * only `versionMode` failed the schema as a whole and every field in it was
 * ignored.
 */
describe('versionCalculationMode has a schema default (70i.28)', () => {
  test('a config of exactly {versionMode} parses, with the default calculation mode', () => {
    const result = VersionManagerConfigSchema.safeParse({
      versionMode: 'event-log',
    });

    expect(result.success).toBe(true);
    expect(result.data?.versionMode).toBe('event-log');
    expect(result.data?.versionCalculationMode).toBe(
      DEFAULT_VERSION_CALCULATION_MODE,
    );
  });

  test('the default is append-commits, the same one the absent-file path uses', () => {
    expect(DEFAULT_VERSION_CALCULATION_MODE).toBe('append-commits');
    expect(VersionManagerConfigSchema.parse({}).versionCalculationMode).toBe(
      'append-commits',
    );
  });

  test('an explicit calculation mode is kept', () => {
    expect(
      VersionManagerConfigSchema.parse({versionCalculationMode: 'add-to-patch'})
        .versionCalculationMode,
    ).toBe('add-to-patch');
  });

  test('an unknown calculation mode is still rejected, not defaulted', () => {
    expect(
      VersionManagerConfigSchema.safeParse({versionCalculationMode: 'bogus'})
        .success,
    ).toBe(false);
  });
});
