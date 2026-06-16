import fs from 'fs';
import path from 'path';

// Helper to recursively list all files in a directory
function getFilesRecursive(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursive(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results;
}

async function main() {
  const distName = process.argv[2] || 'dist';
  const manifestName = process.argv[3] || 'Cloudflare.txt';
  const distDir = path.resolve(distName);
  
  if (!fs.existsSync(distDir)) {
    console.error(`Error: ${distName} directory does not exist! Run the matching build first.`);
    process.exit(1);
  }

  console.log(`Scanning ${distName} directory...`);
  const absolutePaths = getFilesRecursive(distDir);
  
  // Format to relative paths using forward slashes (Unix style, standard for manifest/scripts)
  const relativePaths = absolutePaths.map(filePath => {
    const rel = path.relative(path.resolve('.'), filePath);
    return rel.replace(/\\/g, '/');
  });

  // Write Cloudflare.txt
  console.log(`Writing ${manifestName} with ${relativePaths.length} files...`);
  fs.writeFileSync(manifestName, relativePaths.join('\n') + '\n', 'utf8');
  console.log('Manifest complete. ZIP creation is intentionally skipped.');
}

main().catch(err => {
  console.error('Error generating manifest or zip:', err);
  process.exit(1);
});
