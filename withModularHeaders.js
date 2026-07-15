const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfileContent = fs.readFileSync(podfilePath, 'utf8');

      // Inject explicit clang permissions flag rules to block framework modules build failures
      const customPostInstall = `
    installer.pods_project.targets.each do |target|
      if target.name.start_with?('RNFBApp') || target.name.start_with?('react-native-firebase')
        target.build_configurations.each do |config|
          config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        end
      end
    end
`;

      if (podfileContent.includes('post_install do |installer|')) {
        podfileContent = podfileContent.replace(
          'post_install do |installer|',
          `post_install do |installer|${customPostInstall}`
        );
        fs.writeFileSync(podfilePath, podfileContent);
      }
      return config;
    },
  ]);
};