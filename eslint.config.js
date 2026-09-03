// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // `marketing/` is a separate Node project (Remotion) with its own toolchain.
    ignores: ["dist/*", "marketing/**", "android/**"],
  }
]);
