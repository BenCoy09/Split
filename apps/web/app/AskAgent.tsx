'use client';

import { useState, type FormEvent } from 'react';

export default function AskAgent({
  code,
  role,
  onAsked,
}: {
  code: string;
  role: string;
  onAsked: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/agent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role, question }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          `Ask failed (HTTP ${res.status} ${body?.error ?? ''}): ${body?.message ?? 'unknown error'}`
        );
      }
      setQuestion('');
      onAsked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function requestPatch() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/patch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          `Patch request failed (HTTP ${res.status} ${body?.error ?? ''}): ${body?.message ?? 'unknown error'}`
        );
      }
      onAsked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>ask the agent</h2>
      <form onSubmit={submit}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about what you can see…"
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
        <button type="button" onClick={requestPatch} disabled={busy}>
          {busy ? 'Working…' : 'Request a fix'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
