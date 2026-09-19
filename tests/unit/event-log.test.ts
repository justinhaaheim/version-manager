import {describe, expect, test} from 'bun:test';

import {
  countCommitEventsOnBranch,
  deriveVersion,
  describeSkippedLines,
  formatBaseEvent,
  formatCommitEvent,
  parseEventLog,
  type VersionEvent,
} from '../../src/event-log';

/**
 * Unit tests for the event log itself (version-manager-cza, E2-E6).
 *
 * Everything here is pure: no git, no temp repositories, no files. The real
 * git behaviour — that a merge of two branches' logs unions cleanly — is in
 * tests/integration/event-log-mode.test.ts, because it is a claim about git
 * and can only be measured by running git.
 */

/** A commit event line, at a chosen time. */
function commit(branch: string, iso: string): string {
  return `${JSON.stringify({b: branch, e: 'commit', t: iso})}\n`;
}

/** A base event line, at a chosen time. */
function base(version: string, iso: string): string {
  return `${JSON.stringify({e: 'base', t: iso, v: version})}\n`;
}

function eventsOf(text: string): VersionEvent[] {
  const parsed = parseEventLog(text);
  expect(parsed.skippedLines).toEqual([]);
  return parsed.events;
}

describe('parseEventLog', () => {
  test('an absent log is an empty log, not an error (E6)', () => {
    expect(parseEventLog('')).toEqual({events: [], skippedLines: []});
  });

  test('a blank line is not a skipped line', () => {
    // A file that ends in "\n" has an empty final element by construction
    // (E5). Reporting that as damage would make every healthy log look broken.
    const parsed = parseEventLog(
      `${commit('main', '2026-01-01T00:00:00.000Z')}\n   \n`,
    );

    expect(parsed.events).toHaveLength(1);
    expect(parsed.skippedLines).toEqual([]);
  });

  test('reads both event kinds', () => {
    const parsed = parseEventLog(
      base('0.4.0', '2026-01-01T00:00:00.000Z') +
        commit('main', '2026-01-02T00:00:00.000Z'),
    );

    expect(parsed.events).toEqual([
      {e: 'base', t: '2026-01-01T00:00:00.000Z', v: '0.4.0'},
      {b: 'main', e: 'commit', t: '2026-01-02T00:00:00.000Z'},
    ]);
  });

  test('an unknown FIELD is ignored, so an old reader can read a new log', () => {
    const parsed = parseEventLog(
      `${JSON.stringify({
        b: 'main',
        e: 'commit',
        somethingNewer: 42,
        t: '2026-01-01T00:00:00.000Z',
      })}\n`,
    );

    expect(parsed.events).toHaveLength(1);
    expect(parsed.skippedLines).toEqual([]);
  });

  test('a corrupt line is skipped AND reported, never swallowed', () => {
    const parsed = parseEventLog(
      commit('main', '2026-01-01T00:00:00.000Z') +
        'not json at all\n' +
        commit('main', '2026-01-02T00:00:00.000Z'),
    );

    // The version is still derivable...
    expect(parsed.events).toHaveLength(2);

    // ...and the damage is named, with the line number (critical rule 6).
    expect(parsed.skippedLines).toHaveLength(1);
    expect(parsed.skippedLines[0].lineNumber).toBe(2);
    expect(parsed.skippedLines[0].reason).toContain('not valid JSON');
    expect(parsed.skippedLines[0].text).toBe('not json at all');
  });

  test('an unparseable timestamp is skipped rather than sorted as NaN', () => {
    // Date.parse('whenever') is NaN, which compares false against every
    // other number: accepting it would silently reorder the log.
    const parsed = parseEventLog(
      `${JSON.stringify({b: 'main', e: 'commit', t: 'whenever'})}\n`,
    );

    expect(parsed.events).toEqual([]);
    expect(parsed.skippedLines).toHaveLength(1);
  });

  test('an unknown event KIND is reported, not counted as a commit', () => {
    const parsed = parseEventLog(
      `${JSON.stringify({e: 'tag', t: '2026-01-01T00:00:00.000Z'})}\n`,
    );

    expect(parsed.events).toEqual([]);
    expect(parsed.skippedLines).toHaveLength(1);
  });

  test('describeSkippedLines says nothing when nothing was skipped', () => {
    // Silence is a claim: "checked, and the log is intact".
    expect(describeSkippedLines([])).toBeNull();
  });

  test('describeSkippedLines names the count and the lines', () => {
    const parsed = parseEventLog('nope\nalso nope\n');
    const message = describeSkippedLines(parsed.skippedLines);

    expect(message).toContain('skipped 2 unreadable lines');
    expect(message).toContain('line 1');
    expect(message).toContain('line 2');
  });
});

describe('deriveVersion (E3)', () => {
  test('an empty log derives package.json version with a zero count', () => {
    expect(
      deriveVersion({
        calculationMode: 'add-to-patch',
        events: [],
        packageVersion: '0.1.0',
      }),
    ).toMatchObject({
      base: '0.1.0',
      baseSource: 'package.json',
      commitCount: 0,
      version: '0.1.0',
    });
  });

  test('commit events raise the version — add-to-patch', () => {
    const events = eventsOf(
      commit('main', '2026-01-01T00:00:00.000Z') +
        commit('main', '2026-01-02T00:00:00.000Z') +
        commit('main', '2026-01-03T00:00:00.000Z'),
    );

    expect(
      deriveVersion({
        calculationMode: 'add-to-patch',
        events,
        packageVersion: '0.1.0',
      }),
    ).toMatchObject({commitCount: 3, version: '0.1.3'});
  });

  test('commit events raise the version — append-commits', () => {
    const events = eventsOf(
      commit('main', '2026-01-01T00:00:00.000Z') +
        commit('main', '2026-01-02T00:00:00.000Z'),
    );

    expect(
      deriveVersion({
        calculationMode: 'append-commits',
        events,
        packageVersion: '0.1.0',
      }),
    ).toMatchObject({commitCount: 2, version: '0.1.0+2'});
  });

  test('a base event overrides package.json and restarts the count', () => {
    const events = eventsOf(
      commit('main', '2026-01-01T00:00:00.000Z') +
        commit('main', '2026-01-02T00:00:00.000Z') +
        base('0.9.0', '2026-01-03T00:00:00.000Z') +
        commit('main', '2026-01-04T00:00:00.000Z'),
    );

    expect(
      deriveVersion({
        calculationMode: 'add-to-patch',
        events,
        packageVersion: '0.1.0',
      }),
    ).toMatchObject({
      base: '0.9.0',
      baseSource: 'base-event',
      commitCount: 1,
      version: '0.9.1',
    });
  });

  test('two base events: the later TIMESTAMP wins, not the later line', () => {
    // After a union merge the file is two branches' lines interleaved by
    // text, so file position says nothing about when anything happened.
    const events = eventsOf(
      base('0.9.0', '2026-01-05T00:00:00.000Z') +
        base('0.8.0', '2026-01-02T00:00:00.000Z') +
        commit('main', '2026-01-06T00:00:00.000Z'),
    );

    expect(
      deriveVersion({
        calculationMode: 'add-to-patch',
        events,
        packageVersion: '0.1.0',
      }),
    ).toMatchObject({base: '0.9.0', commitCount: 1, version: '0.9.1'});
  });

  test('commits BEFORE the winning base event are not counted', () => {
    const events = eventsOf(
      commit('main', '2026-01-01T00:00:00.000Z') +
        base('0.9.0', '2026-01-02T00:00:00.000Z'),
    );

    expect(
      deriveVersion({
        calculationMode: 'add-to-patch',
        events,
        packageVersion: '0.1.0',
      }),
    ).toMatchObject({commitCount: 0, version: '0.9.0'});
  });

  test('the count is the same whichever order the lines arrived in', () => {
    // THE PROPERTY THE WHOLE DESIGN RESTS ON: evidence unions associatively,
    // so a merge cannot change the answer.
    const lines = [
      commit('main', '2026-01-01T00:00:00.000Z'),
      commit('feat', '2026-01-02T00:00:00.000Z'),
      commit('main', '2026-01-03T00:00:00.000Z'),
      commit('feat', '2026-01-04T00:00:00.000Z'),
    ];

    const forwards = deriveVersion({
      calculationMode: 'add-to-patch',
      events: eventsOf(lines.join('')),
      packageVersion: '0.1.0',
    });
    const backwards = deriveVersion({
      calculationMode: 'add-to-patch',
      events: eventsOf([...lines].reverse().join('')),
      packageVersion: '0.1.0',
    });

    expect(forwards.version).toBe('0.1.4');
    expect(backwards.version).toBe(forwards.version);
  });

  test('baseSource tells the caller which base it used', () => {
    expect(
      deriveVersion({
        calculationMode: 'add-to-patch',
        events: [],
        packageVersion: '0.1.0',
      }).baseSource,
    ).toBe('package.json');

    expect(
      deriveVersion({
        calculationMode: 'add-to-patch',
        events: eventsOf(base('2.0.0', '2026-01-01T00:00:00.000Z')),
        packageVersion: '0.1.0',
      }).baseSource,
    ).toBe('base-event');
  });

  test('no base event and no package.json version THROWS', () => {
    // Not "the version is 0.0.0", and not an empty answer either: there is
    // nothing to measure from (critical rule 6).
    expect(() =>
      deriveVersion({
        calculationMode: 'add-to-patch',
        events: [],
        packageVersion: null,
      }),
    ).toThrow(/no base event/);
  });

  test('a base event alone is enough — package.json need not have a version', () => {
    expect(
      deriveVersion({
        calculationMode: 'add-to-patch',
        events: eventsOf(base('3.1.0', '2026-01-01T00:00:00.000Z')),
        packageVersion: null,
      }),
    ).toMatchObject({base: '3.1.0', baseSource: 'base-event'});
  });
});

describe('countCommitEventsOnBranch (E12)', () => {
  test('counts only the branch asked for, out of the counted commits', () => {
    const derived = deriveVersion({
      calculationMode: 'add-to-patch',
      events: eventsOf(
        commit('main', '2026-01-01T00:00:00.000Z') +
          commit('feat-a', '2026-01-02T00:00:00.000Z') +
          commit('feat-a', '2026-01-03T00:00:00.000Z') +
          commit('feat-b', '2026-01-04T00:00:00.000Z'),
      ),
      packageVersion: '0.1.0',
    });

    expect(countCommitEventsOnBranch(derived.countedCommits, 'feat-a')).toBe(2);
    expect(countCommitEventsOnBranch(derived.countedCommits, 'feat-b')).toBe(1);
    expect(countCommitEventsOnBranch(derived.countedCommits, 'main')).toBe(1);
    expect(countCommitEventsOnBranch(derived.countedCommits, 'nope')).toBe(0);
  });
});

describe('the formatters (E5)', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  test('a commit event is exactly one line ending in a newline', () => {
    const line = formatCommitEvent('main', now);

    expect(line).toBe(
      '{"b":"main","e":"commit","t":"2026-01-01T00:00:00.000Z"}\n',
    );
    expect(line.endsWith('\n')).toBe(true);
    expect(line.split('\n').filter((part) => part !== '')).toHaveLength(1);
  });

  test('a base event is exactly one line ending in a newline', () => {
    const line = formatBaseEvent('1.2.3', now);

    expect(line).toBe(
      '{"e":"base","t":"2026-01-01T00:00:00.000Z","v":"1.2.3"}\n',
    );
    expect(line.endsWith('\n')).toBe(true);
  });

  test('what the formatters write is what the parser reads', () => {
    const parsed = parseEventLog(
      formatBaseEvent('1.2.3', now) + formatCommitEvent('feat/x', now),
    );

    expect(parsed.skippedLines).toEqual([]);
    expect(parsed.events).toHaveLength(2);
  });

  test('a branch name with awkward characters survives verbatim', () => {
    const parsed = parseEventLog(formatCommitEvent('feat/"quoted"\\x', now));

    expect(parsed.skippedLines).toEqual([]);
    expect(parsed.events[0]).toMatchObject({b: 'feat/"quoted"\\x'});
  });
});
