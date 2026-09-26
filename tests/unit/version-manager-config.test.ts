import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  DEFAULT_VERSION_CALCULATION_MODE,
  VersionManagerConfigSchema,
} from '../../src/types';
import {readVersionManagerConfig} from '../../src/version-generator';

/**
 * version-manager-70i.18.2, S4 (70i.18 F7): absent, ok and invalid are three
 * different facts, and only "absent" is allowed to mean "use the defaults".
 */
describe('readVersionManagerConfig() reports absent, ok and invalid distinctly', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-config-'));
    configPath = path.join(dir, 'version-manager.json');
  });

  afterEach(() => {
    fs.rmSync(dir, {force: true, recursive: true});
  });

  function readWith(
    content: string,
  ): ReturnType<typeof readVersionManagerConfig> {
    fs.writeFileSync(configPath, content);
    return readVersionManagerConfig(configPath);
  }

  function expectInvalid(
    result: ReturnType<typeof readVersionManagerConfig>,
    ...fragments: string[]
  ): void {
    expect(result.outcome).toBe('invalid');
    const reason = result.outcome === 'invalid' ? result.reason : '';
    expect(reason).toContain('version-manager.json');
    for (const fragment of fragments) {
      expect(reason).toContain(fragment);
    }
  }

  test('no file is absent', () => {
    expect(readVersionManagerConfig(configPath)).toEqual({outcome: 'absent'});
  });

  test('a valid file is ok', () => {
    const result = readWith('{"versionMode": "package-json"}\n');

    expect(result.outcome).toBe('ok');
    expect(result.outcome === 'ok' && result.config.versionMode).toBe(
      'package-json',
    );
  });

  test('a file that is not JSON is invalid, and says so', () => {
    expectInvalid(
      readWith('{"versionMode": "package-json",\n'),
      'is not valid JSON',
    );
  });

  test('an unknown field is invalid, naming the field', () => {
    expectInvalid(
      readWith('{"versionMode": "package-json", "brnachSuffix": {}}\n'),
      'is not a valid version-manager config',
      'brnachSuffix',
    );
  });

  test('a versionMode that does not exist is invalid, naming the field', () => {
    expectInvalid(
      readWith('{"versionMode": "package-jsn"}\n'),
      'is not a valid version-manager config',
      'versionMode',
    );
  });

  test('the legacy runtimeVersion shape is still ok, and migrated', () => {
    const result = readWith(
      '{"runtimeVersion": "0.5.0", "versionCalculationMode": "add-to-patch"}\n',
    );

    expect(result.outcome).toBe('ok');
    expect(result.outcome === 'ok' && result.migrated).toBe(true);
    expect(result.outcome === 'ok' && result.config.versions.runtime).toBe(
      '0.5.0',
    );
  });
});

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
