import {describe, expect, test} from 'bun:test';
import semver from 'semver';

import {
  applyBranchSuffix,
  decideBranchSuffix,
  isSuffixExemptBranch,
  sanitizeBranchName,
  stripPrerelease,
} from '../../src/branch-suffix';
import {
  calculateCodeVersion,
  calculatePreCommitVersion,
} from '../../src/version-generator';

const MAIN_BRANCHES = ['main', 'master'];

describe('sanitizeBranchName', () => {
  test('leaves an already-legal identifier alone', () => {
    expect(sanitizeBranchName('feat-x')).toBe('feat-x');
  });

  test('replaces slashes (D4a)', () => {
    expect(sanitizeBranchName('claude/add-alternate-version-mode-Hnq9X')).toBe(
      'claude-add-alternate-version-mode-Hnq9X',
    );
  });

  test('replaces dots, so the only dot in the suffix is the one before n (D4a)', () => {
    expect(sanitizeBranchName('release/1.2.x')).toBe('release-1-2-x');
  });

  test('replaces spaces and other punctuation (D4a)', () => {
    expect(sanitizeBranchName('my branch (wip)!')).toBe('my-branch-wip');
  });

  test('collapses runs of separators (D4b)', () => {
    expect(sanitizeBranchName('feat//__--x')).toBe('feat-x');
  });

  test('trims leading and trailing separators (D4c)', () => {
    expect(sanitizeBranchName('/feat/x/')).toBe('feat-x');
  });

  test('an all-punctuation name becomes the literal "branch" (D4d)', () => {
    expect(sanitizeBranchName('///')).toBe('branch');
    expect(sanitizeBranchName('!!!')).toBe('branch');
    expect(sanitizeBranchName('')).toBe('branch');
  });

  test('an all-digits name is prefixed with "b" (D4e)', () => {
    expect(sanitizeBranchName('007')).toBe('b007');
    expect(sanitizeBranchName('1234')).toBe('b1234');
  });

  test('sanitisation is lossy and may collide, by design (D4)', () => {
    expect(sanitizeBranchName('feat/x')).toBe(sanitizeBranchName('feat-x'));
  });
});

describe('sanitizeBranchName produces valid semver (AC 2)', () => {
  // semver.valid() is the authority here rather than a hand-rolled regex:
  // a regex written alongside the implementation would only re-assert the
  // implementation's own assumptions.
  const branches = [
    'claude/add-alternate-version-mode-Hnq9X',
    'release/1.2.x',
    'my branch (wip)!',
    'feat//__--x',
    'FEATURE/JIRA-123_do.the.thing',
    'users/justin/wip',
    '///',
    '007',
    '',
    '-leading-and-trailing-',
    'émoji-ẞ-branch',
    'a'.repeat(120),
  ];

  for (const branch of branches) {
    test(`branch ${JSON.stringify(branch)} yields a valid semver`, () => {
      const decorated = applyBranchSuffix(
        '0.32.1',
        sanitizeBranchName(branch),
        3,
      );
      expect(semver.valid(decorated)).toBe(decorated);
    });

    test(`branch ${JSON.stringify(branch)} yields a valid semver with build metadata`, () => {
      const decorated = applyBranchSuffix(
        '0.32.1+7',
        sanitizeBranchName(branch),
        3,
      );
      // semver.valid() returns the NORMALISED version, which drops build
      // metadata, so the check here is "parses as valid" plus an explicit
      // assertion that the +7 survived in the string we actually emit.
      expect(semver.valid(decorated)).not.toBeNull();
      expect(semver.parse(decorated)?.build).toEqual(['7']);
      expect(decorated.endsWith('+7')).toBe(true);
    });
  }
});

describe('stripPrerelease', () => {
  test('leaves a plain version alone', () => {
    expect(stripPrerelease('1.2.3')).toBe('1.2.3');
  });

  test('removes a branch suffix', () => {
    expect(stripPrerelease('1.2.3-feat-x.2')).toBe('1.2.3');
  });

  test('preserves +build metadata while removing the prerelease', () => {
    expect(stripPrerelease('1.2.3-feat-x.2+5')).toBe('1.2.3+5');
  });

  test('leaves +build metadata alone when there is no prerelease', () => {
    expect(stripPrerelease('1.2.3+5')).toBe('1.2.3+5');
  });

  test('does not touch hyphens that live inside build metadata', () => {
    expect(stripPrerelease('1.2.3+build-7')).toBe('1.2.3+build-7');
  });

  test('discards a hand-authored prerelease (D3, accepted limitation)', () => {
    expect(stripPrerelease('1.0.0-beta.1')).toBe('1.0.0');
  });
});

describe('applyBranchSuffix', () => {
  test('inserts the suffix after the core (D2)', () => {
    expect(applyBranchSuffix('0.32.3', 'feat-x', 3)).toBe('0.32.3-feat-x.3');
  });

  test('inserts the suffix BEFORE +build metadata (D2)', () => {
    expect(applyBranchSuffix('0.32.1+3', 'feat-x', 3)).toBe(
      '0.32.1-feat-x.3+3',
    );
  });

  test('is idempotent: re-applying replaces rather than compounds (D3)', () => {
    const once = applyBranchSuffix('0.1.0', 'feat-x', 1);
    const twice = applyBranchSuffix(once, 'feat-x', 2);
    expect(once).toBe('0.1.0-feat-x.1');
    expect(twice).toBe('0.1.0-feat-x.2');
  });

  test('n === 0 yields the undecorated version (D7)', () => {
    expect(applyBranchSuffix('0.32.3', 'feat-x', 0)).toBe('0.32.3');
  });

  test('a nonsense n yields the undecorated version rather than a broken one', () => {
    expect(applyBranchSuffix('0.32.3', 'feat-x', -1)).toBe('0.32.3');
    expect(applyBranchSuffix('0.32.3', 'feat-x', 1.5)).toBe('0.32.3');
    expect(applyBranchSuffix('0.32.3', 'feat-x', NaN)).toBe('0.32.3');
  });

  test('a decorated version sorts BEFORE the release it decorates (D2)', () => {
    expect(semver.lt('0.32.3-feat-x.3', '0.32.3')).toBe(true);
  });

  test('later commits on the same branch sort upward', () => {
    expect(semver.lt('0.32.3-feat-x.2', '0.32.3-feat-x.3')).toBe(true);
  });
});

describe('the landmine: an un-stripped suffix freezes the version', () => {
  // Pins WHY stripping has to happen before the calculation, per the bead:
  // both calculate functions return their input unchanged on a 4-part split,
  // so the failure is silent rather than loud.
  test('calculateCodeVersion freezes on a decorated input', () => {
    expect(calculateCodeVersion('0.1.0-feat-x.1', 3, 'add-to-patch')).toBe(
      '0.1.0-feat-x.1',
    );
  });

  test('calculatePreCommitVersion freezes on a decorated input', () => {
    expect(calculatePreCommitVersion('0.1.0-feat-x.1', 0, 'add-to-patch')).toBe(
      '0.1.0-feat-x.1',
    );
  });

  test('stripping first makes both of them move again', () => {
    expect(
      calculateCodeVersion(
        stripPrerelease('0.1.0-feat-x.1'),
        3,
        'add-to-patch',
      ),
    ).toBe('0.1.3');
    expect(
      calculatePreCommitVersion(
        stripPrerelease('0.1.1-feat-x.1'),
        0,
        'add-to-patch',
      ),
    ).toBe('0.1.2');
  });
});

describe('isSuffixExemptBranch', () => {
  test('configured main branches are exempt (D6)', () => {
    expect(isSuffixExemptBranch('main', MAIN_BRANCHES)).toBe(true);
    expect(isSuffixExemptBranch('master', MAIN_BRANCHES)).toBe(true);
  });

  test('detached HEAD is exempt (D6)', () => {
    expect(isSuffixExemptBranch('HEAD', MAIN_BRANCHES)).toBe(true);
  });

  test('detached HEAD is exempt even with a custom main branch list', () => {
    expect(isSuffixExemptBranch('HEAD', ['trunk'])).toBe(true);
  });

  test('any other branch is not exempt', () => {
    expect(isSuffixExemptBranch('feat-x', MAIN_BRANCHES)).toBe(false);
  });

  test('the list is configurable (D6)', () => {
    expect(isSuffixExemptBranch('trunk', ['trunk'])).toBe(true);
    expect(isSuffixExemptBranch('main', ['trunk'])).toBe(false);
  });
});

describe('decideBranchSuffix', () => {
  const measured = (count: number, ref = 'main') => ({
    mergeBase: {count, ref},
    total: count + 2,
  });

  test('off by default: no decoration, no warning (AC 1)', () => {
    expect(
      decideBranchSuffix({
        branch: 'feat-x',
        counts: measured(3),
        enabled: false,
        extraCommits: 0,
        mainBranches: MAIN_BRANCHES,
      }),
    ).toEqual({decoration: null, warning: null});
  });

  test('a main branch gets no decoration even with the knob on (D6)', () => {
    expect(
      decideBranchSuffix({
        branch: 'main',
        counts: measured(3),
        enabled: true,
        extraCommits: 0,
        mainBranches: MAIN_BRANCHES,
      }),
    ).toEqual({decoration: null, warning: null});
  });

  test('n comes from the merge-base count (D5)', () => {
    expect(
      decideBranchSuffix({
        branch: 'feat/x',
        counts: measured(3),
        enabled: true,
        extraCommits: 0,
        mainBranches: MAIN_BRANCHES,
      }),
    ).toEqual({
      decoration: {n: 3, sanitisedBranch: 'feat-x'},
      warning: null,
    });
  });

  test('the pre-commit path adds 1 for the about-to-happen commit (D5)', () => {
    expect(
      decideBranchSuffix({
        branch: 'feat-x',
        counts: measured(3),
        enabled: true,
        extraCommits: 1,
        mainBranches: MAIN_BRANCHES,
      }).decoration,
    ).toEqual({n: 4, sanitisedBranch: 'feat-x'});
  });

  test('n === 0 means no suffix (D7, AC 5)', () => {
    expect(
      decideBranchSuffix({
        branch: 'feat-x',
        counts: measured(0),
        enabled: true,
        extraCommits: 0,
        mainBranches: MAIN_BRANCHES,
      }),
    ).toEqual({decoration: null, warning: null});
  });

  test('no main branch resolves: falls back to the total count, and says so (AC 9)', () => {
    const decision = decideBranchSuffix({
      branch: 'feat-x',
      counts: {mergeBase: null, total: 9},
      enabled: true,
      extraCommits: 0,
      mainBranches: ['nope'],
    });

    expect(decision.decoration).toEqual({n: 9, sanitisedBranch: 'feat-x'});
    expect(decision.warning).toContain('none of the configured main branches');
  });

  test('no measurement at all: UNDECORATED version, never n = 0 (AC 9, rule 6)', () => {
    const decision = decideBranchSuffix({
      branch: 'feat-x',
      counts: {mergeBase: null, total: null},
      enabled: true,
      extraCommits: 0,
      mainBranches: MAIN_BRANCHES,
    });

    expect(decision.decoration).toBeNull();
    expect(decision.warning).toContain('could not count commits');
  });

  test('a failed measurement in the pre-commit path does not become "1"', () => {
    // The dangerous shape: extraCommits would turn a substituted 0 into a
    // plausible-looking n === 1. It must stay undecorated instead.
    const decision = decideBranchSuffix({
      branch: 'feat-x',
      counts: {mergeBase: null, total: null},
      enabled: true,
      extraCommits: 1,
      mainBranches: MAIN_BRANCHES,
    });

    expect(decision.decoration).toBeNull();
  });

  test('a real 0 and a failed measurement are distinguishable', () => {
    const measuredZero = decideBranchSuffix({
      branch: 'feat-x',
      counts: {mergeBase: {count: 0, ref: 'main'}, total: 5},
      enabled: true,
      extraCommits: 0,
      mainBranches: MAIN_BRANCHES,
    });
    const failed = decideBranchSuffix({
      branch: 'feat-x',
      counts: {mergeBase: null, total: null},
      enabled: true,
      extraCommits: 0,
      mainBranches: MAIN_BRANCHES,
    });

    expect(measuredZero.decoration).toBeNull();
    expect(measuredZero.warning).toBeNull();
    expect(failed.decoration).toBeNull();
    expect(failed.warning).not.toBeNull();
  });
});
