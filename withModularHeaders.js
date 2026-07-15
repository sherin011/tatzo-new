const { withProjectBuildProperties } = require('@expo/config-plugins');

module.exports = function withModularHeaders(config) {
  return withProjectBuildProperties(config, (config) => {
    if (!config.modResults.podfileProperties) {
      config.modResults.podfileProperties = {};
    }
    // Hard override to let cocoapods build targets ignore modular checks completely
    return config;
  });
};