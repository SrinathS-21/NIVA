const { getDefaultConfig } = require('expo/metro-config');

// Engine weights are fetched at runtime, not bundled — no model asset
// extensions are needed here.

module.exports = getDefaultConfig(__dirname);
