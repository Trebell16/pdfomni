import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

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
  const zipName = process.argv[4] || 'dist.zip';
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

  // Generate ZIP archive by reading paths from Cloudflare.txt
  console.log(`Creating ${zipName} from files listed in ${manifestName}...`);
  const manifestContent = fs.readFileSync(manifestName, 'utf8');
  const filesToZip = manifestContent.split('\n').map(line => line.trim()).filter(Boolean);

  const zip = new JSZip();

  for (const fileRelPath of filesToZip) {
    const absoluteFilePath = path.resolve(fileRelPath);
    if (fs.existsSync(absoluteFilePath)) {
      const fileData = fs.readFileSync(absoluteFilePath);
      // We want to preserve the relative path inside the zip file, BUT strip 'dist/' prefix
      // so when extracted, it extracts the contents directly, OR keep 'dist/' prefix if requested.
      // Wait, "make a zip of all those files" usually means keeping the structure listed.
      // Let's preserve the exact path in Cloudflare.txt so it's a direct package.
      zip.file(fileRelPath, fileData);
    } else {
      console.warn(`Warning: File listed in Cloudflare.txt not found: ${fileRelPath}`);
    }
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  fs.writeFileSync(zipName, zipBuffer);
  console.log(`Successfully created ${zipName}!`);
}

main().catch(err => {
  console.error('Error generating manifest or zip:', err);
  process.exit(1);
});
