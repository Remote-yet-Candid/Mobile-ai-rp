import configPlugins from 'expo/config-plugins';
const { withAndroidManifest, withDangerousMod } = configPlugins;
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ADB reverse reaches a developer-owned mock on device loopback. Public endpoints
// retain HTTPS and system certificate validation; no user CA or trust-all policy.
const networkSecurity = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

export default function withGateZeroLoopback(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application[0].$;
    const previous = application['android:networkSecurityConfig'];
    if (previous && previous !== '@xml/gate0_network_security') {
      throw new Error('Review the existing network security configuration before changing it');
    }
    application['android:networkSecurityConfig'] = '@xml/gate0_network_security';
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const directory = join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'gate0_network_security.xml'), networkSecurity);
      return mod;
    },
  ]);
}
