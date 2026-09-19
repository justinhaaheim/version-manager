import {describe, expect, test} from 'bun:test';

import {assertVersionReplaced} from '../../src/script-manager';

/**
 * Unit tests for the post-condition on the hand-rolled JSON scanner
 * (version-manager-70i.13 F7).
 *
 * The guard's job is to make a scanner bug loud instead of silent, so these
 * tests hand it output a buggy scanner would produce rather than trying to
 * break the scanner itself. tests/integration/package-json-mode.test.ts has
 * the end-to-end case, where a real hooked commit is aborted by this guard.
 */
describe('assertVersionReplaced', () => {
  test('accepts a replacement that parses and carries the new version', () => {
    expect(() => {
      assertVersionReplaced({
        label: 'package.json',
        newVersion: '0.1.1',
        original: '{"name": "x", "version": "0.1.0"}',
        replaced: '{"name": "x", "version": "0.1.1"}',
      });
    }).not.toThrow();
  });

  test('refuses output that is no longer valid JSON', () => {
    // What a scanner that mislocated the span by one character would produce.
    expect(() => {
      assertVersionReplaced({
        label: 'package.json',
        newVersion: '0.1.1',
        original: '{"name": "x", "version": "0.1.0"}',
        replaced: '{"name": "x", "version": "0.1.1"}}',
      });
    }).toThrow(/Refusing to write package\.json.*no longer valid JSON/s);
  });

  test('refuses output whose version is not the one intended', () => {
    // The real disagreement this guard was written for: two top-level
    // `version` keys. JSON.parse takes the LAST, the scanner replaces the
    // FIRST, so the file is rewritten to no effect.
    expect(() => {
      assertVersionReplaced({
        label: 'package.json',
        newVersion: '9.9.10',
        original: '{"version": "0.1.0", "name": "x", "version": "9.9.9"}',
        replaced: '{"version": "9.9.10", "name": "x", "version": "9.9.9"}',
      });
    }).toThrow(/top-level version reads "9\.9\.9"/);
  });

  test('refuses output that lost its version entirely', () => {
    expect(() => {
      assertVersionReplaced({
        label: 'package.json',
        newVersion: '0.1.1',
        original: '{"name": "x", "version": "0.1.0"}',
        replaced: '{"name": "x"}',
      });
    }).toThrow(/top-level version reads undefined/);
  });

  test('tolerates an input that was not valid JSON to begin with', () => {
    // A half-finished working-tree edit. The author's own broken file is not
    // this hook's to block a commit over, and demanding a parseable output
    // from an unparseable input would do exactly that. Documented in
    // assertVersionReplaced().
    expect(() => {
      assertVersionReplaced({
        label: 'package.json',
        newVersion: '0.1.1',
        original: '{"name": "x", "version": "0.1.0",}',
        replaced: '{"name": "x", "version": "0.1.1",}',
      });
    }).not.toThrow();
  });
});
