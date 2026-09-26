import {describe, expect, test} from 'bun:test';

import {
  appendTopLevelStringProperty,
  findTopLevelStringValueSpan,
  replaceTopLevelStringValue,
} from '../../src/json-text-edit';

/**
 * install --mode (version-manager-70i.7, M2) adds versionMode to a config
 * that lacks it without reformatting anything else.
 */
describe('appendTopLevelStringProperty', () => {
  test('copies a 4-space layout and appends after a nested object', () => {
    const text =
      '{\n    "a": "x",\n    "nested": {\n        "k": "v"\n    }\n}\n';

    expect(appendTopLevelStringProperty(text, 'mode', 'm')).toBe(
      '{\n    "a": "x",\n    "nested": {\n        "k": "v"\n    },\n    "mode": "m"\n}\n',
    );
  });

  test('copies tabs and the colon spacing of the last key', () => {
    const text = '{\n\t"a" :  1,\n\t"b" :  [1, 2]\n}';

    expect(appendTopLevelStringProperty(text, 'mode', 'm')).toBe(
      '{\n\t"a" :  1,\n\t"b" :  [1, 2],\n\t"mode" :  "m"\n}',
    );
  });

  test('keeps a one-line object on one line', () => {
    expect(appendTopLevelStringProperty('{"a": 1}', 'mode', 'm')).toBe(
      '{"a": 1, "mode": "m"}',
    );
  });

  test('gives an empty object a line of its own', () => {
    expect(appendTopLevelStringProperty('{}\n', 'mode', 'm')).toBe(
      '{\n  "mode": "m"\n}\n',
    );
  });

  test('a nested key of the same name is not the top-level one', () => {
    const text = '{\n  "versions": {"mode": "inner"}\n}\n';
    const edited = appendTopLevelStringProperty(text, 'mode', 'm');

    expect(JSON.parse(edited)).toEqual({mode: 'm', versions: {mode: 'inner'}});
  });

  test('refuses to add a second top-level copy of the key', () => {
    expect(() =>
      appendTopLevelStringProperty('{"mode": "a"}', 'mode', 'b'),
    ).toThrow('already a top-level property');
  });

  test('refuses text whose root is not an object', () => {
    expect(() => appendTopLevelStringProperty('[1]', 'mode', 'b')).toThrow(
      'does not have an object at its root',
    );
  });
});

/**
 * Unit tests for the surgical JSON editor behind version-manager-70i.3 / D9.
 *
 * The pre-commit hook rewrites a package.json that may be half-edited in the
 * working tree, so every byte it does NOT mean to touch must survive. These
 * tests are the byte-level half of that guarantee; the integration tests in
 * tests/integration/package-json-mode.test.ts are the end-to-end half.
 */
describe('replaceTopLevelStringValue', () => {
  test('replaces only the value and leaves every other byte alone', () => {
    const text = '{\n  "name": "p",\n  "version": "1.0.0"\n}\n';

    expect(replaceTopLevelStringValue(text, 'version', '1.0.1')).toBe(
      '{\n  "name": "p",\n  "version": "1.0.1"\n}\n',
    );
  });

  test('preserves unusual indentation, key order and the trailing newline', () => {
    const text =
      '{\n' +
      '\t"version":"0.1.0",\n' +
      '\n' +
      '    "scripts": {\n' +
      '        "build": "tsc"\n' +
      '    },\n' +
      '    "name": "weird"\n' +
      '}\n';

    const edited = replaceTopLevelStringValue(text, 'version', '0.1.1');

    expect(edited).toBe(text.replace('"0.1.0"', '"0.1.1"'));
    // Spelled out so a failure says WHICH property of the file was lost.
    expect(edited?.startsWith('{\n\t"version":"0.1.1",')).toBe(true);
    expect(edited?.endsWith('}\n')).toBe(true);
    expect(edited).toContain('        "build": "tsc"');
  });

  test('a file with NO trailing newline does not gain one', () => {
    const text = '{"version": "1.0.0"}';

    expect(replaceTopLevelStringValue(text, 'version', '2.0.0')).toBe(
      '{"version": "2.0.0"}',
    );
  });

  test('ignores a nested "version" key and edits the top-level one', () => {
    // A dependency named `version` is a real package on npm, and nested
    // `version` keys are everywhere in overrides/volta/pnpm blocks.
    const text =
      '{\n' +
      '  "dependencies": {"version": "^7.0.0"},\n' +
      '  "volta": {"node": "20.0.0"},\n' +
      '  "version": "1.2.3",\n' +
      '  "overrides": {"foo": {"version": "9.9.9"}}\n' +
      '}\n';

    const edited = replaceTopLevelStringValue(text, 'version', '1.2.4');

    expect(edited).toContain('"version": "1.2.4",');
    expect(edited).toContain('"dependencies": {"version": "^7.0.0"}');
    expect(edited).toContain('{"foo": {"version": "9.9.9"}}');
  });

  test('ignores a nested "version" key that comes AFTER no top-level one', () => {
    const text = '{\n  "dependencies": {"version": "^7.0.0"}\n}\n';

    expect(findTopLevelStringValueSpan(text, 'version')).toBeNull();
    expect(replaceTopLevelStringValue(text, 'version', '1.0.0')).toBeNull();
  });

  test('ignores "version" appearing inside an array or a string value', () => {
    const text =
      '{\n' +
      '  "keywords": ["version", "semver"],\n' +
      '  "description": "sets \\"version\\": \\"9.9.9\\" for you",\n' +
      '  "version": "1.0.0"\n' +
      '}\n';

    const edited = replaceTopLevelStringValue(text, 'version', '1.0.1');

    expect(edited).toContain('"keywords": ["version", "semver"]');
    expect(edited).toContain('sets \\"version\\": \\"9.9.9\\" for you');
    expect(edited).toContain('"version": "1.0.1"');
  });

  test('handles a nested object that itself contains braces in strings', () => {
    const text =
      '{\n' +
      '  "scripts": {"x": "echo {not a brace}"},\n' +
      '  "version": "1.0.0"\n' +
      '}\n';

    expect(replaceTopLevelStringValue(text, 'version', '1.0.1')).toContain(
      '"version": "1.0.1"',
    );
  });

  test('returns null when the value is not a string', () => {
    expect(
      replaceTopLevelStringValue('{"version": null}', 'version', '1.0.0'),
    ).toBeNull();
    expect(
      replaceTopLevelStringValue('{"version": 1}', 'version', '1.0.0'),
    ).toBeNull();
    expect(
      replaceTopLevelStringValue('{"version": {"a": "b"}}', 'version', '1.0.0'),
    ).toBeNull();
  });

  test('returns null when the key is absent', () => {
    expect(
      replaceTopLevelStringValue('{"name": "p"}', 'version', '1.0.0'),
    ).toBeNull();
  });

  test('escapes the replacement value rather than injecting it raw', () => {
    // Not a version anyone should have, but the edit must stay valid JSON.
    const edited = replaceTopLevelStringValue(
      '{"version": "1.0.0"}',
      'version',
      '1.0.0"; DROP',
    );

    expect(edited).toBe('{"version": "1.0.0\\"; DROP"}');
    expect(JSON.parse(edited ?? '') as {version: string}).toEqual({
      version: '1.0.0"; DROP',
    });
  });

  test('tolerates whitespace around the colon', () => {
    expect(
      replaceTopLevelStringValue('{ "version"  :  "1.0.0" }', 'version', '2'),
    ).toBe('{ "version"  :  "2" }');
  });

  test('throws on an unterminated string rather than editing blind', () => {
    // Failure is not absence (critical rule 6): a truncated file must not
    // quietly read as "no version key here".
    expect(() =>
      replaceTopLevelStringValue('{"version": "1.0.0', 'version', '1.0.1'),
    ).toThrow('Unterminated string literal');
  });

  test('span points exactly at the value token, quotes included', () => {
    const text = '{"version": "1.0.0"}';
    const span = findTopLevelStringValueSpan(text, 'version');

    expect(span).not.toBeNull();
    expect(text.slice(span?.start, span?.end)).toBe('"1.0.0"');
  });
});
