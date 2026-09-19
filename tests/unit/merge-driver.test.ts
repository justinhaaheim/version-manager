import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  MERGE_DRIVER_ATTRIBUTE,
  MERGE_DRIVER_NAME,
  runMergeDriver,
} from '../../src/merge-driver';

/**
 * Unit tests for the merge driver's own decision-making (70i.8).
 *
 * These call runMergeDriver() on three real files, the way git does, without
 * a repository — so the FALLBACK paths can be exercised, which is where the
 * damage would be if this were wrong. The end-to-end behaviour under real
 * git merges is pinned in tests/integration/merge-driver.test.ts.
 */

/** A package.json with room to merge in: separate blocks, several lines apart. */
function packageJsonText({
  dependency = 'left-pad',
  script = 'build',
  version,
}: {
  dependency?: string;
  script?: string;
  version: string;
}): string {
  return [
    '{',
    '  "name": "fixture",',
    `  "version": "${version}",`,
    '  "scripts": {',
    `    "${script}": "tsc"`,
    '  },',
    '  "license": "MIT",',
    '  "dependencies": {',
    `    "${dependency}": "1.0.0"`,
    '  }',
    '}',
    '',
  ].join('\n');
}

describe('runMergeDriver', () => {
  let dir: string;

  const write = (name: string, contents: string): string => {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, contents);
    return filePath;
  };

  /** Lay out the three files git would hand the driver. */
  const threeWay = (ancestor: string, ours: string, theirs: string) => ({
    ancestor: write('ancestor.json', ancestor),
    ours: write('ours.json', ours),
    theirs: write('theirs.json', theirs),
  });

  const resultText = (): string =>
    fs.readFileSync(path.join(dir, 'ours.json'), 'utf-8');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-merge-driver-'));
  });

  afterEach(() => {
    fs.rmSync(dir, {force: true, recursive: true});
  });

  test('a version-only divergence merges cleanly, keeping OURS (D11)', () => {
    const result = runMergeDriver(
      threeWay(
        packageJsonText({version: '0.1.0'}),
        packageJsonText({version: '0.1.1'}),
        packageJsonText({version: '0.1.5'}),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(result.neutralised).toBe(true);
    expect(resultText()).toContain('"version": "0.1.1"');
    expect(resultText()).not.toContain('0.1.5');
    expect(resultText()).not.toContain('<<<<<<<');
  });

  test('changes elsewhere on both sides survive alongside our version', () => {
    const result = runMergeDriver(
      threeWay(
        packageJsonText({version: '0.1.0'}),
        packageJsonText({script: 'lint', version: '0.1.1'}),
        packageJsonText({dependency: 'right-pad', version: '0.1.5'}),
      ),
    );

    expect(result.exitCode).toBe(0);
    expect(resultText()).toContain('"lint"');
    expect(resultText()).toContain('"right-pad"');
    expect(resultText()).toContain('"version": "0.1.1"');
  });

  test('a real disagreement elsewhere still conflicts, and says so in the exit code', () => {
    const result = runMergeDriver(
      threeWay(
        packageJsonText({dependency: 'left-pad', version: '0.1.0'}),
        packageJsonText({dependency: 'ours-pad', version: '0.1.1'}),
        packageJsonText({dependency: 'theirs-pad', version: '0.1.5'}),
      ),
    );

    // git reads a non-zero exit as "conflicts". Neutralising the version must
    // never turn a genuine disagreement into a silent win for one side.
    expect(result.exitCode).not.toBe(0);
    expect(resultText()).toContain('<<<<<<<');
    expect(resultText()).toContain('ours-pad');
    expect(resultText()).toContain('theirs-pad');
    // ...and the version itself is settled, not inside the markers.
    expect(resultText().slice(0, resultText().indexOf('<<<<<<<'))).toContain(
      '"version": "0.1.1"',
    );
  });

  describe('every failure falls back to a plain merge, never to a guess', () => {
    test('our copy has no top-level version: merge normally and say why', () => {
      const ours = '{\n  "name": "fixture"\n}\n';

      const result = runMergeDriver(
        threeWay(ours, ours, '{\n  "name": "renamed"\n}\n'),
      );

      expect(result.neutralised).toBe(false);
      expect(result.note).toContain('no top-level "version"');
      // The merge still happened: theirs is the only side that changed.
      expect(result.exitCode).toBe(0);
      expect(resultText()).toContain('renamed');
    });

    test('our copy is not valid JSON: merge normally and say why', () => {
      const result = runMergeDriver(
        threeWay(
          packageJsonText({version: '0.1.0'}),
          '{\n  "version": "0.1.1,\n', // unterminated string
          packageJsonText({version: '0.1.5'}),
        ),
      );

      expect(result.neutralised).toBe(false);
      expect(result.note).not.toBeNull();
      // Whatever else happens, the driver never claims a clean merge it did
      // not make: this one conflicts and git will show the author both sides.
      expect(result.exitCode).not.toBe(0);
    });

    test('two top-level version keys: the version is NOT propagated (F7 shape)', () => {
      // Valid JSON whose effective version is the LAST key, while the scanner
      // reads the FIRST. Guessing between them would write a version nobody
      // chose into the merge result.
      const ours = '{\n  "version": "0.1.1",\n  "version": "9.9.9"\n}\n';

      const result = runMergeDriver(
        threeWay(
          '{\n  "version": "0.1.0"\n}\n',
          ours,
          '{\n  "version": "0.1.5"\n}\n',
        ),
      );

      expect(result.neutralised).toBe(false);
      expect(result.note).toContain('two top-level "version" keys');
    });

    test('an unreadable input: merge normally and say why', () => {
      const paths = threeWay(
        packageJsonText({version: '0.1.0'}),
        packageJsonText({version: '0.1.1'}),
        packageJsonText({version: '0.1.5'}),
      );
      fs.rmSync(paths.theirs);

      const result = runMergeDriver(paths);

      expect(result.neutralised).toBe(false);
      expect(result.note).not.toBeNull();
    });
  });

  test('the merged result is left in the OURS file, as git requires', () => {
    const paths = threeWay(
      packageJsonText({version: '0.1.0'}),
      packageJsonText({script: 'lint', version: '0.1.1'}),
      packageJsonText({dependency: 'right-pad', version: '0.1.5'}),
    );

    runMergeDriver(paths);

    expect(fs.readFileSync(paths.ours, 'utf-8')).toContain('right-pad');
  });
});

describe('the registration constants', () => {
  test('the .gitattributes line names the driver git config will carry', () => {
    expect(MERGE_DRIVER_ATTRIBUTE).toBe(
      `package.json merge=${MERGE_DRIVER_NAME}`,
    );
  });
});
