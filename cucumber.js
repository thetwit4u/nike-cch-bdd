// Cucumber.js configuration
// Custom theme for @cucumber/pretty-formatter
// Keys are based on the formatter's theme tokens
// See: https://github.com/cucumber/pretty-formatter/blob/release/v2.1.0/javascript/src/theme.ts

/* eslint-disable @typescript-eslint/no-var-requires */
const { DEFAULT_THEME } = require('@cucumber/pretty-formatter');

const NIKE_PRETTY_THEME = {
  ...DEFAULT_THEME,
  // High-level structure
  'feature keyword': ['magenta', 'bold'],
  'feature name': ['magenta', 'underline'],
  'feature description': ['dim'],
  'rule keyword': ['cyan'],
  'scenario keyword': ['cyan', 'bold'],
  'scenario name': ['white', 'underline'],

  // Steps
  'step keyword': ['greenBright', 'bold'],
  'step text': ['white'],

  // Tags and locations
  tag: ['yellow'],
  location: ['dim'],

  // Docstrings and datatables
  'docstring delimiter': ['gray'],
  'docstring content': ['gray', 'italic'],
  'datatable border': ['gray'],
  'datatable content': ['white'],
};

module.exports = {
  default: {
    // Leave formatting to CLI scripts; theme applies when pretty-formatter is used
    formatOptions: {
      theme: NIKE_PRETTY_THEME,
    },
  },
};


