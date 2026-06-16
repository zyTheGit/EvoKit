'use strict';
const fs = require('fs');

function mergeConfig(settingsPath, templatePath) {
  try {
    const home = process.env.HOME || '';

    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return [false, `File not found: ${settingsPath}`];
      return [false, `Invalid JSON in ${settingsPath}: ${e.message}`];
    }

    let templateRaw;
    try {
      templateRaw = fs.readFileSync(templatePath, 'utf8');
    } catch (e) {
      return [false, `Template not found: ${templatePath}`];
    }
    let template;
    try {
      template = JSON.parse(templateRaw.replace(/__HOME__/g, home));
    } catch (e) {
      return [false, `Invalid JSON in template after __HOME__ replacement: ${e.message}`];
    }

    let changed = false;

    // Merge hooks — add only missing hook events
    const tHooks = template.hooks || {};
    if (Object.keys(tHooks).length) {
      const eHooks = (settings.hooks && typeof settings.hooks === 'object') ? {...settings.hooks} : {};
      const mHooks = {...eHooks};
      for (const [event, hooksList] of Object.entries(tHooks)) {
        if (!(event in eHooks)) {
          mHooks[event] = hooksList;
          changed = true;
        }
      }
      if (changed) settings.hooks = mHooks;
    }

    const tAuto = template.autoMemoryEnabled !== false;
    if (settings.autoMemoryEnabled !== tAuto) {
      settings.autoMemoryEnabled = tAuto;
      changed = true;
    }

    const tEnv = template.env || {};
    const eEnv = (settings.env && typeof settings.env === 'object') ? {...settings.env} : {};
    const mEnv = {...eEnv};
    for (const [k, v] of Object.entries(tEnv)) {
      if (eEnv[k] !== v) { mEnv[k] = v; changed = true; }
    }
    settings.env = mEnv;

    if (!changed) {
      try { fs.unlinkSync(settingsPath + '.bak.merge'); } catch {}
      return [false, null]; // SKIPPED
    }

    const tmpPath = settingsPath + '.merge.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + '\n');
    JSON.parse(fs.readFileSync(tmpPath, 'utf8'));

    const backupPath = settingsPath + '.bak.evokit';
    try { fs.unlinkSync(backupPath); } catch {}
    try {
      fs.renameSync(settingsPath, backupPath);
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch {}
      return [false, `Cannot backup ${settingsPath}: ${e.message}`];
    }

    try {
      fs.renameSync(tmpPath, settingsPath);
    } catch (e) {
      try { fs.renameSync(backupPath, settingsPath); } catch {}
      try { fs.unlinkSync(tmpPath); } catch {}
      return [false, `Cannot write ${settingsPath}: ${e.message}`];
    }

    try { fs.unlinkSync(settingsPath + '.bak.merge'); } catch {}
    return [true, null]; // MERGED
  } catch (e) {
    return [false, `Unexpected error: ${e.message}`];
  }
}

const [changed, err] = mergeConfig(process.argv[2], process.argv[3]);
if (err) {
  console.log('ERROR');
  process.stderr.write('MERGE_ERROR: ' + err + '\n');
  process.exit(1);
} else if (changed) {
  console.log('MERGED');
  process.exit(0);
} else {
  console.log('SKIPPED');
  process.exit(0);
}
