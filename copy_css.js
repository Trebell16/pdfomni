import fs from 'fs';

try {
  const source = 'h:/Github Repositories/pdflover/src/index.css';
  const dest = 'src/index.css';
  
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, dest);
    console.log('Successfully copied index.css from pdflover to pdflovercodex!');
  } else {
    console.error('Source index.css does not exist in pdflover!');
  }
} catch (e) {
  console.error('Error copying index.css:', e);
}
