/**
 * afterSign hook — called by electron-builder after packaging but before DMG creation.
 * Ad-hoc signs the .app bundle so macOS accepts it without a paid Developer ID cert.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  // Only needed on macOS
  if (electronPlatformName !== 'darwin') return;

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    console.log(`[afterSign] App not found at ${appPath}, skipping.`);
    return;
  }

  console.log(`[afterSign] Ad-hoc signing: ${appPath}`);
  try {
    execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: 'inherit' });
    console.log('[afterSign] ✓ Ad-hoc signing complete');
  } catch (err) {
    console.warn('[afterSign] codesign failed (non-fatal):', err.message);
  }
};
