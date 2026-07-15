const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfileContent = fs.readFileSync(podfilePath, 'utf8');

      const patchCode = [
        '    # Force bypass non-modular header compiler errors for firebase modules',
        '    installer.pods_project.targets.each do |target|',
        "      if target.name.start_with?('RNFBApp') || target.name.start_with?('react-native-firebase')",
        '        target.build_configurations.each do |config|',
        "          config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
        '        end',
        '      end',
        '    end'
      ].join('\n');

      if (/post_install\s+do\s+\|[a-zA-Z_]+\|/.test(podfileContent)) {
        podfileContent = podfileContent.replace(
          /(post_install\s+do\s+\|([a-zA-Z_]+)\|)/,
          '$1\n    installer = $2\n' + patchCode
        );
      } else {
        podfileContent += '\npost_install do |installer|\n' + patchCode + '\nend\n';
      }

      fs.writeFileSync(podfilePath, podfileContent);
      return config;
    },
  ]);
}

module.exports = withModularHeaders;