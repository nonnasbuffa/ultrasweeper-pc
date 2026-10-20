// Copies the game from the desktop app folder into app/, so this repo holds everything needed to build.
const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '..', '..', 'Offline Minesweeper', 'resources', 'app');
const target = path.resolve(__dirname, '..', 'app');

if (!fs.existsSync(source)) {
  console.log(`No game folder at ${source}; keeping the app/ already in this repo.`);
  process.exit(0);
}
const main = fs.readFileSync(path.join(source, 'electron-main.js'), 'utf8');
if (main.includes('TEST-HARNESS')) throw new Error('electron-main.js still contains the test hook; not copying.');

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`Copied game from ${source} to ${target}`);
