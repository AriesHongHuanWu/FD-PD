const fs = require('fs');
const path = require('path');

const destDir = path.join(__dirname, 'dist');

// Ensure dist directory exists
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir);

// Helpers
function copyFile(file) {
    fs.copyFileSync(path.join(__dirname, file), path.join(destDir, file));
    console.log(`Copied ${file}`);
}

function copyDir(dir) {
    const src = path.join(__dirname, dir);
    const dest = path.join(destDir, dir);

    if (!fs.existsSync(dest)) fs.mkdirSync(dest);

    const files = fs.readdirSync(src);
    for (const file of files) {
        const srcFile = path.join(src, file);
        const destFile = path.join(dest, file);
        if (fs.statSync(srcFile).isDirectory()) {
            copyDir(path.join(dir, file));
        } else {
            fs.copyFileSync(srcFile, destFile);
        }
    }
    console.log(`Copied ${dir}/`);
}

// Execution
try {
    copyFile('index.html');
    copyDir('css');
    copyDir('js');
    console.log('Build successful! Files copied to /dist');
} catch (e) {
    console.error('Build failed:', e);
    process.exit(1);
}
