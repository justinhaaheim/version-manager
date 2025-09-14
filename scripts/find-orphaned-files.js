#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Directories to scan
// eslint-disable-next-line no-undef
const srcDir = path.join(__dirname, '..', 'src');

// Files to check for orphans
const filesToCheck = glob.sync('**/*.{ts,tsx}', {
  cwd: srcDir,
  ignore: [
    '**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}',
    '**/*.d.ts',
    'app/**/*', // Expo Router pages are entry points
  ],
});

// Files that are entry points or configs (not imported but still needed)
const entryPoints = new Set([
  'app/_layout.tsx',
  'theme/tamagui.config.ts',
  'types/env.d.ts',
  'config/medicationConfig.ts', // Config file that exports data
]);

// Build import graph
const importGraph = new Map();
// const exportedFrom = new Map();

filesToCheck.forEach((file) => {
  const fullPath = path.join(srcDir, file);
  const content = fs.readFileSync(fullPath, 'utf-8');

  // Find all imports
  const imports = [];

  // Match various import patterns
  const importPatterns = [
    /import\s+.*?\s+from\s+['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]/g,
    /import\s*\(['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]\)/g,
    /require\s*\(['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]\)/g,
    /export\s+.*?\s+from\s+['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]/g,
  ];

  importPatterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      imports.push(match[1]);
    }
  });

  importGraph.set(file, imports);
});

// Resolve import paths to actual files
function resolveImport(fromFile, importPath) {
  const fromDir = path.dirname(fromFile);

  if (importPath.startsWith('@/')) {
    // Alias import
    importPath = importPath.replace('@/', '');
  } else if (importPath.startsWith('.')) {
    // Relative import
    importPath = path.join(fromDir, importPath);
  } else {
    // Node module, ignore
    return null;
  }

  // Try different extensions
  const extensions = [
    '',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '/index.ts',
    '/index.tsx',
  ];
  for (const ext of extensions) {
    const candidate = importPath + ext;
    if (filesToCheck.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

// Build reverse dependency graph (what files import each file)
const importedBy = new Map();
filesToCheck.forEach((file) => {
  importedBy.set(file, new Set());
});

filesToCheck.forEach((file) => {
  const imports = importGraph.get(file) || [];
  imports.forEach((imp) => {
    const resolved = resolveImport(file, imp);
    if (resolved && importedBy.has(resolved)) {
      importedBy.get(resolved).add(file);
    }
  });
});

// Find orphaned files
const orphaned = [];
filesToCheck.forEach((file) => {
  if (!entryPoints.has(file) && importedBy.get(file).size === 0) {
    // Check if it's in the app directory (Expo Router pages)
    if (!file.startsWith('app/')) {
      orphaned.push(file);
    }
  }
});

// Output results
if (orphaned.length === 0) {
  console.log('✅ No orphaned files found!');
} else {
  console.log(`Found ${orphaned.length} potentially orphaned files:\n`);
  orphaned.sort().forEach((file) => {
    const fullPath = path.join(srcDir, file);
    const stats = fs.statSync(fullPath);
    const size = (stats.size / 1024).toFixed(1);
    console.log(`  • ${file} (${size} KB)`);
  });

  console.log(
    '\nNote: Some files might be legitimate configs, type definitions, or test utilities.',
  );
  console.log('Review each file before deleting.');
}
