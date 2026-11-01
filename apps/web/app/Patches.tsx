'use client';

import { useEffect, useState } from 'react';

export type PatchRecord = {
  id: string;
  requestedBy: string;
  status: string;
  approvals: { logs: boolean; source: boolean };
  testResult: string | null;
  offline?: boolean;
  createdAt: number;
  diff?: string;
};

export default function Patches({
  code,
  role,
  patches,
}: {
  code: string;
  role: 'logs' | 'source';
  patches: PatchRecord[];
}) {
  const [token, setToken] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`split:token:${code}`);
      if (raw) {
        const saved = JSON.parse(raw) as { role?: string; token?: string };
        if (saved.role === role && saved.token) setToken(saved.token);
      }
    } catch {}
  }, [code, role]);

  async function approve(id: string) {
    if (!token || busyId) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/patches/${id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role, token }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          `Approve failed (HTTP ${res.status} ${body?.error ?? ''}): ${body?.message ?? 'unknown error'}`
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h2>patches</h2>
      {patches.length === 0 && <p>No patches yet.</p>}
      {patches.map((patch) => (
        <article key={patch.id} className="patch">
          <p className="meta">
            requested by {patch.requestedBy} · status {patch.status}
            {patch.offline ? ' · offline fallback' : ''}
            {patch.testResult ? ` · tests ${patch.testResult}` : ''}
          </p>
          {role === 'source' && patch.diff ? (
            <pre className="diff">
              <code>{patch.diff}</code>
            </pre>
          ) : null}
          <p>
            approvals: logs {patch.approvals.logs ? 'approved' : 'waiting'} · source{' '}
            {patch.approvals.source ? 'approved' : 'waiting'}
          </p>
          {patch.status === 'pending' ? (
            <button
              onClick={() => approve(patch.id)}
              disabled={!token || patch.approvals[role] || busyId === patch.id}
            >
              {patch.approvals[role]
                ? 'You approved'
                : busyId === patch.id
                  ? 'Approving…'
                  : `Approve as ${role}`}
            </button>
          ) : (
            <p className={patch.testResult === 'pass' ? 'result-pass' : 'result-fail'}>
              {patch.testResult === 'pass'
                ? 'Tests pass — patch applied'
                : 'Tests fail after patch'}
            </p>
          )}
        </article>
      ))}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
