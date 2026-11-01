'use client';

import { type PatchRecord } from './Patches';

export type Verdict = {
  solved: boolean;
  timeTakenMs: number | null;
  patchesTried: number;
  patches: PatchRecord[];
};

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const minutes = String(Math.floor(total / 60));
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function Verdict({ verdict }: { verdict: Verdict }) {
  return (
    <section className={verdict.solved ? 'verdict solved' : 'verdict'}>
      <h2>verdict</h2>
      {verdict.solved ? (
        <p className="result-pass">Solved in {formatTime(verdict.timeTakenMs ?? 0)}</p>
      ) : (
        <p className="meta">Not solved yet — keep digging.</p>
      )}
      <p>
        patches tried: {verdict.patchesTried} · patches proposed: {verdict.patches.length}
      </p>
      {verdict.patches.map((patch) => (
        <p key={patch.id} className="meta">
          patch by {patch.requestedBy}
          {patch.offline ? ' (offline fallback)' : ''} — approved by{' '}
          {patch.approvals.logs ? 'logs' : 'nobody'}
          {patch.approvals.source ? ' + source' : ''} · {patch.status}
          {patch.testResult ? ` · tests ${patch.testResult}` : ''}
        </p>
      ))}
    </section>
  );
}
