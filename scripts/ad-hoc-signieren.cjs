/**
 * electron-builder-Haken (afterPack): signiert das fertige Programm „ad hoc“.
 *
 * Ohne kostenpflichtiges Apple-Zertifikat ist das die einzige Signatur, die
 * geht. Sie sorgt dafür, dass macOS das Programm als unverändert erkennt –
 * auf einem anderen Mac kommt dann beim ersten Start die normale Rückfrage
 * („Dennoch öffnen“) statt der Meldung „beschädigt“.
 */
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

exports.default = async function adHocSignieren(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const programm = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', programm], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', programm], { stdio: 'inherit' });
  console.log(`  • ad hoc signiert: ${programm}`);
};
