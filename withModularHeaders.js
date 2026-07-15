const { withBuildProperties } = require('expo-build-properties');

module.exports = function withModularHeaders(config) {
  // Use Expo's official build properties plugin mapping wrapper under the hood
  return withBuildProperties(config, {
    ios: {
      useFrameworks: 'static',
      extraPods: [
        {
          name: 'FirebaseCore',
          modular_headers: true
        },
        {
          name: 'FirebaseCoreInternal',
          modular_headers: true
        }
      ]
    }
  });
};