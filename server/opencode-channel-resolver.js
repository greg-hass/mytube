// Backward-compatibility re-export.
// All logic moved to llm-channel-resolver.js — this file is kept so
// existing test files and imports still resolve without changes.
//
// New code should import from ./llm-channel-resolver directly.

module.exports = require("./llm-channel-resolver");
