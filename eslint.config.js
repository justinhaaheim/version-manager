/* global require, module */
const jhaConfig = require('eslint-config-jha-react-node');

const config = [{ignores: ['dist/', 'tmp/']}, ...jhaConfig];

module.exports = config;
