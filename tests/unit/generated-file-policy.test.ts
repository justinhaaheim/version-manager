import {describe, expect, test} from 'bun:test';

import {
  DEFAULT_OUTPUT_PATH,
  resolveOutputPathOption,
  shouldWriteGeneratedFiles,
} from '../../src/generated-file-policy';

/**
 * The write decision for the generated version file
 * (version-manager-70i.2, D12).
 */
describe('generated file policy', () => {
  describe('resolveOutputPathOption', () => {
    test('an absent --output is not explicit and falls back to the default path', () => {
      expect(resolveOutputPathOption(undefined)).toEqual({
        explicit: false,
        path: DEFAULT_OUTPUT_PATH,
      });
    });

    test('a supplied --output is explicit and keeps the path', () => {
      expect(resolveOutputPathOption('./build/version.json')).toEqual({
        explicit: true,
        path: './build/version.json',
      });
    });

    test('an empty --output counts as absent, not as a path', () => {
      // `--output` typed with no value after it parses to ''. Writing to ''
      // can only throw. Measured against the pre-change build: that
      // invocation used to fall back to the default path and exit 0, so
      // treating '' as absent is what keeps dynamic-file mode unchanged.
      expect(resolveOutputPathOption('')).toEqual({
        explicit: false,
        path: DEFAULT_OUTPUT_PATH,
      });
    });

    test('--output set to the default PATH is still explicit', () => {
      // The reason this function exists. Provenance cannot be recovered by
      // comparing the value against the default string: a user who types
      // `--output ./dynamic-version.local.json` asked for a file, and a user
      // who typed nothing did not. Reading it off the yargs default would
      // conflate the two.
      const option = resolveOutputPathOption(DEFAULT_OUTPUT_PATH);

      expect(option.explicit).toBe(true);
      expect(option.path).toBe(DEFAULT_OUTPUT_PATH);
    });
  });

  describe('shouldWriteGeneratedFiles', () => {
    test('dynamic-file mode always writes', () => {
      expect(
        shouldWriteGeneratedFiles('dynamic-file', {
          explicit: false,
          path: DEFAULT_OUTPUT_PATH,
        }),
      ).toBe(true);

      expect(
        shouldWriteGeneratedFiles('dynamic-file', {
          explicit: true,
          path: './somewhere.json',
        }),
      ).toBe(true);
    });

    test('package-json mode writes nothing unless --output was explicit', () => {
      expect(
        shouldWriteGeneratedFiles('package-json', {
          explicit: false,
          path: DEFAULT_OUTPUT_PATH,
        }),
      ).toBe(false);

      expect(
        shouldWriteGeneratedFiles('package-json', {
          explicit: true,
          path: './somewhere.json',
        }),
      ).toBe(true);
    });
  });
});
