/* global require, module */
const jhaConfig = require('eslint-config-jha-react-node');

const config = [
  {
    ignores: ['dist/', 'tmp/', '*.local.d.ts', '**/.claude/worktrees/'],
  },
  ...jhaConfig,
];

module.exports = config;
