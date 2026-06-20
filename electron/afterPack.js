// macOS向けのad-hoc署名フック
// 未署名のままだとquarantine属性付き配布で「壊れている」エラーが出るため、
// ad-hoc署名（identity: -）を当てて「開発元を確認できません」エラーに緩和する。
// 受け取った側は右クリック→開くで起動できるようになる。

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`[afterPack] ad-hoc signing ${appPath}`);
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
};
