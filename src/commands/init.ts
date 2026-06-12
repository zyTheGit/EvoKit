import { Command } from 'commander';
import pc from 'picocolors';
import fse from 'fs-extra';
import { resolveTemplateDir, installTemplate, verifyInstallation } from '../core/template.js';
import { BootCheck } from '../core/template.js';

export const initCommand = new Command('init')
  .description('Initialize EvoKit in a home directory')
  .argument('[directory]', 'Target home directory (default: $HOME)')
  .option('--template <path>', 'Path to template directory')
  .option('--branch <name>', 'GitHub branch to download template from', 'main')
  .option('--dry-run', 'Preview installation without modifying files')
  .option('--verify', 'Run boot verification after installation')
  .action(async (directory, options) => {
    const homeDir = directory || process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      console.error(pc.red('Error: Could not determine home directory.'));
      console.error('  Specify it as an argument: evokit init /path/to/home');
      process.exit(1);
    }

    const claudeDir = `${homeDir}/.claude`;
    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║   EvoKit — Self-Evolving System Install   ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log('');
    console.log(`  Target: ${claudeDir}${options.dryRun ? pc.yellow(' (DRY RUN)') : ''}`);
    console.log('');

    // Resolve template
    let templateDir: string;
    let cleanup: (() => void) | null = null;
    try {
      const result = await resolveTemplateDir(options.template, options.branch);
      templateDir = result.templateDir;
      cleanup = result.cleanup;
      console.log(`  Template: ${templateDir}`);
    } catch (err: any) {
      console.error(pc.red(`\n❌ ${err.message}`));
      process.exit(1);
    }

    // Install
    console.log(pc.cyan('\n📁 Installing template files...'));
    const summary = installTemplate(homeDir, templateDir, options.dryRun);
    console.log(`  ✓ Created ${summary.filesCreated} file(s), skipped ${summary.filesSkipped} existing`);
    console.log(`  ✓ ${summary.hooksInstalled} hook(s) installed`);
    console.log(`  ✓ ${summary.rulesInstalled} rule(s) installed`);
    console.log(`  ✓ ${summary.agentsInstalled} agent(s) installed`);
    console.log(`  ✓ ${summary.commandsInstalled} command(s) installed`);

    // Cleanup temp dir
    if (cleanup) cleanup();

    // Done
    console.log('');
    if (options.dryRun) {
      console.log(pc.green('✅ Dry run complete — no files were modified'));
    } else if (options.verify) {
      console.log(pc.cyan('\n🔍 Running verification...'));
      const checks = verifyInstallation(homeDir);
      let allPass = true;
      for (const check of checks) {
        const icon = check.pass ? pc.green('✓') : pc.red('✗');
        console.log(`  ${icon} ${check.name}${check.detail ? pc.yellow(` — ${check.detail}`) : ''}`);
        if (!check.pass) allPass = false;
      }
      console.log('');
      if (allPass) {
        console.log(pc.green('✅ Verification passed'));
      } else {
        console.log(pc.yellow('⚠️  Some checks failed — see details above'));
      }
    } else {
      console.log(pc.green('✅ EvoKit installed successfully!'));
      console.log('');
      console.log(pc.cyan('  Next steps:'));
      console.log('  1. Start Claude Code');
      console.log('  2. Run /boot to verify system health');
      console.log('  3. Or run: evokit doctor');
    }
    console.log('');
  });
