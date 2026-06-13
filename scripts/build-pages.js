#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const FILES_TO_COPY = ['index.html', 'styles.css', 'app.js', 'data.js'];
const DIRS_TO_COPY = ['data'];

function resetDir(dirPath){
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFileToDist(relativePath){
  const source = path.join(ROOT, relativePath);
  const target = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirToDist(relativePath){
  const source = path.join(ROOT, relativePath);
  const target = path.join(DIST, relativePath);
  fs.cpSync(source, target, { recursive: true });
}

resetDir(DIST);

for(const file of FILES_TO_COPY){
  copyFileToDist(file);
}

for(const dir of DIRS_TO_COPY){
  copyDirToDist(dir);
}

fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log(`GitHub Pages build complete: ${DIST}`);
