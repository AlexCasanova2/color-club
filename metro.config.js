const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo Go dev server can intermittently crash Jest worker children on some
// local Node/macOS combinations. Keeping Metro single-worker is slower but
// much more stable for this project during device testing.
config.maxWorkers = 1;

module.exports = config;
