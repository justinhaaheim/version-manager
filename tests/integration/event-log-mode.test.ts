import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import {
  type CommitEvent,
  parseEventLog,
  VERSION_LOG_FILENAME,
  type VersionEvent,
} from '../../src/event-log';
import {UNION_MERGE_ATTRIBUTE} from '../../src/event-log-mode';
import {readVersion} from '../../src/version-reader';
import {
  activateHooks,
  setupEventLogModeRepo,
  setupRepoForInstall,
} from '../helpers/repo-fixtures';
import {TestRepo} from '../helpers/test-repo';

/**
 * Integration tests for EVENT-LOG MODE (version-manager-cza).
 *
 * The headline is a claim about GIT, not about our functions: two branches
 * that both append to version.jsonl merge WITHOUT CONFLICT, and the version
 * derived afterwards counts every commit from both sides. So every merge test
 * here drives real git in a real fixture repository with the real pre-commit
 * hook installed. Nothing is simulated.
 */

/** Real git plus a CLI subprocess per hooked commit; not fast. */
const TEST_TIMEOUT_MS = 60000;

/** Every event in the repo's log, with any unreadable line failing the test. */
function logEvents(repo: TestRepo): VersionEvent[] {
  const parsed = parseEventLog(repo.readFile(VERSION_LOG_FILENAME));
  expect(parsed.skippedLines).toEqual([]);
  return parsed.events;
}

/** Just the commit events, which are what the count is made of. */
function commitEvents(repo: TestRepo): CommitEvent[] {
  return logEvents(repo).filter(
    (event): event is CommitEvent => event.e === 'commit',
  );
}

/** Paths git reports as unmerged, i.e. actually conflicted. */
function unmergedPaths(repo: TestRepo): string[] {
  return repo
    .runGit('diff --name-only --diff-filter=U')
    .stdout.split('\n')
    .filter((line) => line !== '');
}

/** The version the public reader derives, with no git involved. */
function derivedVersion(repo: TestRepo): string {
  return readVersion(repo.getPath()).version;
}

/**
 * The shape the headline needs: main two hooked commits, a branch five, then
 * main one more, so both sides have appended since they diverged.
 *
 * @returns The branch name main is actually called here
 */
function divergeWithCommits(repo: TestRepo): string {
  const mainBranch = repo.runGit('rev-parse --abbrev-ref HEAD').stdout.trim();

  for (const index of [1, 2]) {
    repo.writeFile(`main-${index}.txt`, `${index}\n`);
    repo.makeCommit(`main ${index}`);
  }

  repo.runGit('checkout -b feature');
  for (const index of [1, 2, 3, 4, 5]) {
    repo.writeFile(`feature-${index}.txt`, `${index}\n`);
    repo.makeCommit(`feature ${index}`);
  }

  repo.runGit(`checkout ${mainBranch}`);
  repo.writeFile('main-3.txt', '3\n');
  repo.makeCommit('main 3');

  // Eight hooked commits in total, five of them only on the branch.
  expect(commitEvents(repo)).toHaveLength(3);

  return mainBranch;
}

describe('event-log mode (version-manager-cza)', () => {
  let repo: TestRepo;

  beforeEach(() => {
    repo = new TestRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  describe('THE HEADLINE: merging never conflicts and never loses evidence', () => {
    test(
      'a true merge of a five-commit branch is clean, and the version counts all eight',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);
        divergeWithCommits(repo);

        const merge = repo.runGit('merge --no-ff feature -m "merge feature"');

        // THE WHOLE POINT (E4): git's built-in union merge, with one
        // committed .gitattributes line and no git config anywhere.
        expect(merge.exitCode).toBe(0);
        expect(unmergedPaths(repo)).toEqual([]);
        expect(repo.readFile(VERSION_LOG_FILENAME)).not.toContain('<<<<<<<');

        // Every event from both sides survived: 2 + 5 + 1.
        expect(commitEvents(repo)).toHaveLength(8);

        // And the derived version reflects all eight, with nothing
        // reconciled, no policy applied and no merge driver registered.
        expect(derivedVersion(repo)).toBe('0.1.8');
        expect(
          repo
            .runGit('config --get merge.version-manager.driver')
            .stdout.trim(),
        ).toBe('');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a squash merge is clean too, and keeps all eight events',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);
        divergeWithCommits(repo);

        const merge = repo.runGit('merge --squash feature');

        expect(merge.exitCode).toBe(0);
        expect(unmergedPaths(repo)).toEqual([]);

        // A squash leaves the merged content staged and the commit to the
        // author; the union has already happened by this point.
        expect(commitEvents(repo)).toHaveLength(8);

        // That commit runs the pre-commit hook, which appends its own event.
        // Nine, not eight — and deliberately so: the squash IS a new commit.
        repo.makeCommit('squash feature', false);
        expect(commitEvents(repo)).toHaveLength(9);
        expect(derivedVersion(repo)).toBe('0.1.9');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'THE TRAILING NEWLINE: every line of a merged log holds exactly one object',
      () => {
        // E5. The harm is two JSON objects glued onto one line, which parses
        // as neither and silently costs the log an event. MEASURED while
        // writing this test (2026-09-19): git's built-in union merge does NOT
        // itself splice — handed a side whose last line has no newline it
        // normalises, putting the other side's line underneath. The splice
        // comes from the WRITE: appending to a file whose last line has no
        // newline. Both halves of the defence — a formatter that ends every
        // line in "\n", and an append that repairs a missing one — are
        // exercised here, through eight real hooked commits and a real merge.
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);
        divergeWithCommits(repo);

        expect(
          repo.runGit('merge --no-ff feature -m "merge feature"').exitCode,
        ).toBe(0);

        const text = repo.readFile(VERSION_LOG_FILENAME);
        const lines = text.split('\n').filter((line) => line !== '');

        // The strongest assertions first, so a failure names the real harm
        // rather than the cosmetic symptom.
        for (const [index, line] of lines.entries()) {
          // JSON.parse, not our parser: the failure guarded against is
          // text-level, so it must be caught by a text-level check.
          expect(() => JSON.parse(line) as unknown).not.toThrow();
          expect(line, `line ${index + 1} holds exactly one object`).toMatch(
            /^\{[^{}]*\}$/,
          );
        }

        expect(lines).toHaveLength(8);
        expect(text.endsWith('\n')).toBe(true);
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('deriving the version', () => {
    test(
      'zero setup: no version.jsonl at all derives package.json with a zero count (E6)',
      () => {
        setupEventLogModeRepo(repo, '0.3.0', 'add-to-patch');

        // Nothing has been installed and no log exists. This must not error.
        expect(repo.fileExists(VERSION_LOG_FILENAME)).toBe(false);

        const result = repo.runCli('--compact');

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('0.3.0');

        const reading = readVersion(repo.getPath());
        expect(reading).toMatchObject({
          base: '0.3.0',
          baseSource: 'package.json',
          commitCount: 0,
          logExists: false,
          version: '0.3.0',
        });
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'an empty version.jsonl is equally legal',
      () => {
        setupEventLogModeRepo(repo, '0.3.0', 'add-to-patch');
        repo.writeFile(VERSION_LOG_FILENAME, '');

        expect(readVersion(repo.getPath())).toMatchObject({
          commitCount: 0,
          logExists: true,
          version: '0.3.0',
        });
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'sequential commits raise the version — add-to-patch',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);

        const seen: string[] = [];
        for (const index of [1, 2, 3]) {
          repo.writeFile(`file-${index}.txt`, `${index}\n`);
          repo.makeCommit(`commit ${index}`);
          seen.push(derivedVersion(repo));
        }

        expect(seen).toEqual(['0.1.1', '0.1.2', '0.1.3']);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'sequential commits raise the version — append-commits',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'append-commits');
        activateHooks(repo);

        const seen: string[] = [];
        for (const index of [1, 2, 3]) {
          repo.writeFile(`file-${index}.txt`, `${index}\n`);
          repo.makeCommit(`commit ${index}`);
          seen.push(derivedVersion(repo));
        }

        expect(seen).toEqual(['0.1.0+1', '0.1.0+2', '0.1.0+3']);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'the commit event lands INSIDE the commit, not after it (E9)',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);

        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('a');

        // The committed log — not the working-tree one — carries the event,
        // and the working tree is clean afterwards.
        expect(repo.runGit(`show HEAD:${VERSION_LOG_FILENAME}`).stdout).toBe(
          repo.readFile(VERSION_LOG_FILENAME),
        );
        expect(repo.runGit('status --porcelain').stdout.trim()).toBe('');
        expect(commitEvents(repo)).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a log that exists but was never staged is added to the commit, and said so',
      () => {
        // The state a repository is in between `install` and the first
        // `git add`. The hook takes its other index path here — adding an
        // entry rather than rewriting one — so it is exercised deliberately
        // instead of only by whoever hits it first in real life.
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);

        repo.runGit(`rm --cached ${VERSION_LOG_FILENAME}`);
        repo.runGit('commit --no-verify -m "untrack the log"');
        expect(repo.runGit(`ls-files -- ${VERSION_LOG_FILENAME}`).stdout).toBe(
          '',
        );

        // Stage ONLY the author's file. `git add .` would stage the log too
        // and this test would silently measure the ordinary path instead —
        // which is exactly what it did until the negative control caught it.
        repo.writeFile('a.txt', 'a\n');
        repo.runGit('add a.txt');
        repo.makeCommit('a', false);

        // The log is in the commit, with the event in it.
        expect(
          repo.runGit(`show HEAD:${VERSION_LOG_FILENAME}`).stdout,
        ).toContain('"e":"commit"');
        expect(commitEvents(repo)).toHaveLength(1);
        expect(repo.runGit('status --porcelain').stdout.trim()).toBe('');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'each commit event records the branch it happened on',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);

        repo.writeFile('m.txt', 'm\n');
        repo.makeCommit('on main');
        repo.runGit('checkout -b feat/x');
        repo.writeFile('f.txt', 'f\n');
        repo.makeCommit('on feat');

        expect(commitEvents(repo).map((event) => event.b)).toEqual([
          'main',
          'feat/x',
        ]);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a corrupt line does not stop the version being derived, and is reported',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);

        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('a');

        repo.writeFile(
          VERSION_LOG_FILENAME,
          `${repo.readFile(VERSION_LOG_FILENAME)}{"e":"commit", TRUNCATED\n`,
        );

        // The reader still answers...
        const reading = readVersion(repo.getPath());
        expect(reading.version).toBe('0.1.1');
        expect(reading.commitCount).toBe(1);

        // ...and the damage is counted, not swallowed (critical rule 6).
        expect(reading.skippedLines).toHaveLength(1);
        expect(reading.skippedLines[0].lineNumber).toBe(2);

        // The CLI says so out loud rather than printing a calm number.
        const result = repo.runCli('--compact');
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toContain('skipped 1 unreadable line');
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('the public reader (src/version-reader.ts)', () => {
    test(
      'works with NO .git present at all',
      () => {
        // The consumer story: a source tarball, an EAS build, a CI checkout
        // with no history. This is what package-json mode's existence was
        // originally about, and it costs this mode nothing.
        setupEventLogModeRepo(repo, '0.2.0', 'add-to-patch');
        activateHooks(repo);

        for (const index of [1, 2, 3, 4]) {
          repo.writeFile(`file-${index}.txt`, `${index}\n`);
          repo.makeCommit(`commit ${index}`);
        }

        fs.renameSync(
          path.join(repo.getPath(), '.git'),
          path.join(repo.getPath(), '.git-renamed'),
        );

        expect(fs.existsSync(path.join(repo.getPath(), '.git'))).toBe(false);

        expect(readVersion(repo.getPath())).toMatchObject({
          base: '0.2.0',
          baseSource: 'package.json',
          commitCount: 4,
          version: '0.2.4',
        });

        // And the CLI, which does need git, fails honestly rather than
        // quietly reporting a version it could not measure.
        expect(repo.runCli('--compact').exitCode).not.toBe(0);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'reports baseSource so a caller can tell where the base came from',
      () => {
        setupEventLogModeRepo(repo, '0.2.0', 'add-to-patch');
        activateHooks(repo);

        expect(readVersion(repo.getPath()).baseSource).toBe('package.json');

        expect(repo.runCli('bump --minor').exitCode).toBe(0);

        expect(readVersion(repo.getPath())).toMatchObject({
          base: '0.3.0',
          baseSource: 'base-event',
        });
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('install (E4, E6)', () => {
    test(
      'installs the pre-commit hook and nothing else',
      () => {
        setupRepoForInstall(repo, 'event-log');

        const result = repo.runCli('install --non-interactive');
        expect(result.exitCode).toBe(0);

        // Only pre-commit. The post-* hooks exist to regenerate a file this
        // mode does not produce.
        const hooks = fs
          .readdirSync(repo.getHuskyHooksDir())
          .filter((name) => name !== '.keep')
          .sort();
        expect(hooks).toEqual(['pre-commit']);
        expect(repo.readHuskyHook('pre-commit')).toContain('--pre-commit');

        // No generated file, and no .d.ts beside it.
        expect(repo.fileExists('dynamic-version.local.json')).toBe(false);
        expect(repo.fileExists('dynamic-version.local.d.ts')).toBe(false);

        // No lifecycle scripts: they exist only to regenerate that file.
        const scripts = (
          repo.readPackageJson() as {scripts?: Record<string, string>}
        ).scripts;
        expect(scripts?.prebuild).toBeUndefined();
        expect(scripts?.predev).toBeUndefined();
        expect(scripts?.prestart).toBeUndefined();
        expect(scripts?.prepare).toBeUndefined();

        // The log and the union attribute, which ARE this mode's setup.
        expect(repo.fileExists(VERSION_LOG_FILENAME)).toBe(true);
        expect(repo.readFile(VERSION_LOG_FILENAME)).toBe('');
        expect(repo.readFile('.gitattributes')).toContain(
          UNION_MERGE_ATTRIBUTE,
        );
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'is idempotent: running it twice leaves ONE union entry',
      () => {
        setupRepoForInstall(repo, 'event-log');

        expect(repo.runCli('install --non-interactive').exitCode).toBe(0);
        expect(repo.runCli('install --non-interactive').exitCode).toBe(0);

        const matches = repo
          .readFile('.gitattributes')
          .split('\n')
          .filter((line) => line.trim() === UNION_MERGE_ATTRIBUTE);

        expect(matches).toHaveLength(1);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'preserves an existing .gitattributes and its unrelated entries',
      () => {
        setupRepoForInstall(repo, 'event-log');
        repo.writeFile('.gitattributes', '*.png binary\n*.md text=auto\n');

        expect(repo.runCli('install --non-interactive').exitCode).toBe(0);

        const content = repo.readFile('.gitattributes');
        expect(content).toContain('*.png binary');
        expect(content).toContain('*.md text=auto');
        expect(content).toContain(UNION_MERGE_ATTRIBUTE);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'leaves an existing log alone rather than truncating it',
      () => {
        setupRepoForInstall(repo, 'event-log');
        const existing =
          '{"b":"main","e":"commit","t":"2026-01-01T00:00:00.000Z"}\n';
        repo.writeFile(VERSION_LOG_FILENAME, existing);

        expect(repo.runCli('install --non-interactive').exitCode).toBe(0);

        expect(repo.readFile(VERSION_LOG_FILENAME)).toBe(existing);
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'a .gitattributes that already points the log elsewhere is left alone, loudly',
      () => {
        setupRepoForInstall(repo, 'event-log');
        repo.writeFile(
          '.gitattributes',
          `${VERSION_LOG_FILENAME} merge=someone-elses-driver\n`,
        );

        const result = repo.runCli('install --non-interactive');

        expect(result.exitCode).toBe(0);
        expect(repo.readFile('.gitattributes')).not.toContain('merge=union');
        expect(result.stderr).toContain('different merge driver');
      },
      TEST_TIMEOUT_MS,
    );
  });

  describe('bump (E2, E11)', () => {
    test(
      'appends a base event and does NOT edit package.json',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);

        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('a');
        expect(derivedVersion(repo)).toBe('0.1.1');

        const result = repo.runCli('bump --minor');
        expect(result.exitCode).toBe(0);

        // package.json's version is an ordinary human-bumped semver and this
        // mode never writes it (E11).
        expect(repo.readPackageJson().version).toBe('0.1.0');

        const events = logEvents(repo);
        expect(events[events.length - 1]).toMatchObject({
          e: 'base',
          v: '0.2.0',
        });

        // The base event wins and the count restarts from it.
        expect(readVersion(repo.getPath())).toMatchObject({
          base: '0.2.0',
          baseSource: 'base-event',
          commitCount: 0,
          version: '0.2.0',
        });
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'the next commit counts from the new base',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);

        expect(repo.runCli('bump --major').exitCode).toBe(0);
        repo.writeFile('a.txt', 'a\n');
        repo.makeCommit('a');

        expect(derivedVersion(repo)).toBe('1.0.1');
      },
      TEST_TIMEOUT_MS,
    );

    test(
      'bump --commit stages the log, not package.json',
      () => {
        setupEventLogModeRepo(repo, '0.1.0', 'add-to-patch');
        activateHooks(repo);

        // An unstaged edit to package.json that must NOT be swept into the
        // bump commit.
        const packageJson = repo.readPackageJson();
        repo.writeFile(
          'package.json',
          JSON.stringify({...packageJson, description: 'mid-edit'}, null, 2) +
            '\n',
        );

        expect(repo.runCli('bump --patch --commit').exitCode).toBe(0);

        const committed = repo.runGit('show HEAD:package.json').stdout;
        expect(committed).not.toContain('mid-edit');
        expect(
          repo.runGit(`show HEAD:${VERSION_LOG_FILENAME}`).stdout,
        ).toContain('"e":"base"');
      },
      TEST_TIMEOUT_MS,
    );
  });
});
