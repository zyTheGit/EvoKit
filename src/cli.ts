#!/usr/bin/env node
/**
 * EvoKit CLI Entry Point
 *
 * Registers all built-in adapters and exposes commands:
 *   evokit install     — Install EvoKit for one or more AI coding assistants
 *   evokit uninstall   — Uninstall EvoKit for an AI coding assistant
 *   evokit init        — Alias for install (backward compat)
 *   evokit doctor      — System health check
 *   evokit evolve      — Run evolution audit
 *   evokit export      — Export learning data
 *   evokit import      — Import learning data
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';

// Register all built-in adapters (side-effect import)
import './adapters/index.js';

import { installCommand } from './install.js';
import { initCommand } from './commands/init.js';
import { evolveCommand } from './commands/evolve.js';
import { exportCommand } from './commands/export_cmd.js';
import { importCommand } from './commands/import_cmd.js';
import { doctorCommand } from './commands/doctor.js';
import { uninstallCommand } from './commands/uninstall.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('evokit')
  .description('EvoKit — Self-Evolving System Framework for AI Coding Assistants')
  .version(pkg.version);

program.addCommand(installCommand);
program.addCommand(initCommand);
program.addCommand(evolveCommand);
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(doctorCommand);
program.addCommand(uninstallCommand);

// Show help when no args
if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  program.parse(process.argv);
}
