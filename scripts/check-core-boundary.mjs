import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join, sep } from 'node:path';
import ts from 'typescript';

/** Only portable relative modules and the audited provider contract are permitted. */
export function inspectCoreSource(
  source,
  filename = 'source.ts',
  allowedDirectory = dirname(filename),
) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const failures = [];
  const forbiddenGlobals = new Set([
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'Date',
    'crypto',
    'process',
    'globalThis',
    'window',
    'global',
    'require',
    'setTimeout',
    'setInterval',
    'Function',
    'eval',
    'performance',
  ]);
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (
        (specifier.startsWith('./') || specifier.startsWith('../')) &&
        !resolve(dirname(filename), specifier).startsWith(resolve(allowedDirectory) + sep)
      ) {
        failures.push(`Relative import escapes the portable package: ${specifier}`);
      }
      if (
        !specifier.startsWith('./') &&
        !specifier.startsWith('../') &&
        specifier !== '@mobile-ai-rp/rp-provider'
      ) {
        failures.push(`Forbidden dependency: ${specifier}`);
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      failures.push('Dynamic imports are outside the core contract');
    }
    if (ts.isIdentifier(node) && forbiddenGlobals.has(node.text)) {
      failures.push(`Inject this capability instead: ${node.text}`);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.expression.getText(ast) === 'Math' &&
      node.name.text === 'random'
    ) {
      failures.push('Inject random values instead of Math.random');
    }
    if (ts.isElementAccessExpression(node) && node.expression.getText(ast) === 'Math') {
      failures.push('Computed Math access is outside the audited core subset');
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return [...new Set(failures)];
}

export function checkCoreBoundary(root) {
  const failures = [];
  for (const name of ['rp-core', 'rp-provider']) {
    const packageRoot = join(root, 'packages', name);
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    })) {
      if (name !== 'rp-core' || dependency !== '@mobile-ai-rp/rp-provider') {
        failures.push(`${name}: forbidden runtime dependency ${dependency}`);
      }
    }
    function scan(directory) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) scan(path);
        else if (/\.[cm]?tsx?$/.test(entry.name)) {
          for (const failure of inspectCoreSource(
            readFileSync(path, 'utf8'),
            path,
            join(packageRoot, 'src'),
          )) {
            failures.push(`${path}: ${failure}`);
          }
        }
      }
    }
    scan(join(packageRoot, 'src'));
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = checkCoreBoundary(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(
      'Core and provider contracts have no UI, database, network or ambient time/random dependencies.',
    );
  }
}
