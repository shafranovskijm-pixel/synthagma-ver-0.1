import path from 'node:path';

export function checkVitestReport(report, expected, sourceRoot) {
  const fail = message => { throw new Error(expected.id + ': ' + message); };
  if (!report || report.success !== true || !Array.isArray(report.testResults)) fail('missing successful JSON report');
  const actualFiles = new Map();
  const names = new Set();
  let assertions = 0;
  for (const file of report.testResults) {
    if (typeof file.name !== 'string') fail('missing test file identity');
    const relative = path.relative(sourceRoot, file.name).split(path.sep).join('/');
    if (!Object.hasOwn(expected.files, relative) || actualFiles.has(relative)) fail('unexpected or duplicate test file: ' + relative);
    if (file.status !== 'passed' || !Array.isArray(file.assertionResults)) fail('test file did not pass: ' + relative);
    if (file.assertionResults.length !== expected.files[relative]) fail('wrong executed assertion count: ' + relative);
    for (const assertion of file.assertionResults) {
      if (assertion.status !== 'passed' || typeof assertion.fullName !== 'string' || !assertion.fullName) fail('skipped, failed, todo, or unidentified assertion');
      const identity = relative + '\0' + assertion.fullName;
      if (names.has(identity)) fail('duplicate assertion identity');
      names.add(identity);
      assertions++;
    }
    actualFiles.set(relative, file.assertionResults.length);
  }
  if (actualFiles.size !== Object.keys(expected.files).length) fail('a required test file was not executed');
  if (assertions !== expected.cases || report.numTotalTests !== expected.cases || report.numPassedTests !== expected.cases) fail('wrong total executed/passed count');
  for (const key of ['numFailedTests', 'numPendingTests', 'numTodoTests']) {
    if (report[key] !== undefined && report[key] !== 0) fail('nonzero ' + key);
  }
  return { id: expected.id, executed: assertions, passed: assertions, files: Object.fromEntries(actualFiles), allAssertionNames: [...names].map(name => name.replace('\0', ' :: ')) };
}
