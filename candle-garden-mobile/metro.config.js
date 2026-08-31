const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const repositoryRoot = path.resolve(__dirname, '..');

// The mobile app consumes the same catalog snapshot as the Next.js storefront.
// Metro must watch the repository root so changes under packages/catalog are bundled.
config.watchFolders = [repositoryRoot];

module.exports = config;
