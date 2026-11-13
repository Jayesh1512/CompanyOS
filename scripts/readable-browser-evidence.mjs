import {readFile,writeFile} from 'node:fs/promises';
const p=JSON.parse(await readFile('artifacts/companyos/browser-proof.json','utf8'));
const lines=['FRESH CURRENT-BUILD BROWSER PROOF',`Run: ${p.runId}`,`Started: ${p.startedAt}`,`Completed: ${p.checkedAt}`,`Base commit: ${p.sourceCommit}`,p.sourceCommitScope,
 'Scope: actual isolated HTTP/browser application; fictional QA metadata; no provider fixtures, paid calls or financial effects.',
 `Navigated views: ${p.viewCoverage.length}`,`Provider effects: ${p.providerEffects}; financial version: ${p.financialVersion}`,''];
for(const s of p.scans)lines.push(`${s.image} captured ${s.capturedAt}`,`  sha256=${s.sha256}; bytes=${s.bytes}; viewport=${s.viewport}; documentWidth=${s.documentWidth}`,
 `  visible keyboard-focus checks=${s.focus.checked}; failures=${s.focus.failures.length}`);
lines.push('',`Reduced motion: ${JSON.stringify(p.reducedMotion)}`,p.actualEmptyState,p.actualErrorState,`Dismissing the error preserves its retry action: ${p.errorDismissKeepsRetry}`,
 'The images were captured by this run. Source and image byte consistency is checked by scripts/verify-browser-proof.mjs.');
await writeFile('docs/evidence/browser-proof-run.txt',lines.join('\n')+'\n');
