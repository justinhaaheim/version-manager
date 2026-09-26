import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Which git invocations the stub fails, matched against ALL of git's
 * arguments joined with single spaces. Each is a literal string, not a
 * pattern: the helper does the shell quoting.
 */
export type GitStubMatch =
  /** The arguments start with this, e.g. 'update-index' or 'rev-list'. */
  | {prefix: string}
  /** The arguments contain this anywhere, e.g. 'HEAD:package.json'. */
  | {contains: string};

export interface FailingGitStubOptions {
  /**
   * How the stub is put in front of the real git.
   *
   * 'exec-path' — for a failure INSIDE A HOOK. git PREPENDS its exec-path to
   * PATH before running a hook, and on macOS that directory contains a `git`
   * binary of its own, so a stub merely first on PATH is shadowed and never
   * called (measured by the 70i.4 player). Pointing GIT_EXEC_PATH at the
   * stub's directory puts it in that same privileged position. A directory
   * holding only the stub is enough; `git commit` needs no helper from it.
   *
   * 'path' — for a failure in a plain CLI run, where nothing prepends
   * anything and first on PATH is enough.
   */
  delivery: 'exec-path' | 'path';
  /**
   * Fail the Nth matching call and every one after it; earlier matching calls
   * pass through. Default 1. This is how a test fails one read of a path and
   * not an earlier read of the same path.
   */
  failFromCall?: number;
  /**
   * Names the stub's files and appears in its stderr, as "stub git:
   * deliberate <label> failure". Must be safe in a filename.
   */
  label: string;
  match: GitStubMatch;
}

export interface FailingGitStub {
  /** The env to run the command under test with. */
  envOverrides: Record<string, string>;
  /**
   * Touched when the stub fails a call. A test asserts it exists, so it
   * cannot pass for some reason other than the induced failure.
   */
  marker: string;
}

/** A literal as a double-quoted shell word. */
function shellQuote(literal: string): string {
  return `"${literal.replace(/(["\\$`])/g, '\\$1')}"`;
}

/**
 * Make chosen git invocations fail, passing every other invocation through to
 * the real git.
 *
 * This is how a git failure is induced FOR REAL rather than mocked: only the
 * matching call breaks, and everything else — including the `git commit` that
 * triggers a hook — runs normally. Generalised out of
 * tests/integration/package-json-mode.test.ts (version-manager-70i.18.1), which
 * could only match git's first argument.
 *
 * @param repoPath - The fixture repository; the stub lives inside it and dies
 *   with it
 * @param options - What to fail, how to deliver the stub, and from which call
 * @returns The env overrides to run with, and the marker file's path
 */
export function stubFailingGit(
  repoPath: string,
  options: FailingGitStubOptions,
): FailingGitStub {
  const realGit = execSync('command -v git', {encoding: 'utf-8'}).trim();
  const stubDir = path.join(repoPath, `stub-git-${options.label}`);
  const marker = path.join(repoPath, `stub-git-${options.label}-was-called`);
  const counter = path.join(repoPath, `stub-git-${options.label}-calls`);
  const pattern =
    'prefix' in options.match
      ? `${shellQuote(options.match.prefix)}*`
      : `*${shellQuote(options.match.contains)}*`;

  fs.mkdirSync(stubDir, {recursive: true});
  fs.writeFileSync(
    path.join(stubDir, 'git'),
    [
      '#!/bin/sh',
      'case "$*" in',
      `  ${pattern})`,
      `    calls=$(( $(cat "${counter}" 2>/dev/null || echo 0) + 1 ))`,
      `    echo "$calls" > "${counter}"`,
      `    if [ "$calls" -ge ${options.failFromCall ?? 1} ]; then`,
      `      touch "${marker}"`,
      `      echo "stub git: deliberate ${options.label} failure" >&2`,
      // 128, git's own exit for a fatal error. NOT 1: for `rev-parse
      // --verify --quiet` and `symbolic-ref --quiet`, exit 1 with no output
      // is a legitimate ANSWER (path absent, HEAD detached), so a stub that
      // exits 1 simulates a real state rather than a failure (measured).
      '      exit 128',
      '    fi',
      '    ;;',
      'esac',
      `exec "${realGit}" "$@"`,
      '',
    ].join('\n'),
  );
  fs.chmodSync(path.join(stubDir, 'git'), 0o755);

  return {
    envOverrides:
      options.delivery === 'exec-path'
        ? {GIT_EXEC_PATH: stubDir}
        : {PATH: `${stubDir}:${process.env.PATH ?? ''}`},
    marker,
  };
}
