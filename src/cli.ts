#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { evolveCommand } from './commands/evolve.js';
import { exportCommand } from './commands/export_cmd.js';
import { importCommand } from './commands/import_cmd.js';
import { doctorCommand } from './commands/doctor.js';

const program = new Command();

program
  .name('evokit')
  .description('EvoKit — Self-Evolving System Framework for AI Coding Assistants')
  .version('0.3.0');

program.addCommand(initCommand);
program.addCommand(evolveCommand);
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(doctorCommand);

// Show help when no args
if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  program.parse(process.argv);
}
