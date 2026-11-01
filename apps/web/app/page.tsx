'use client';

import { useState, type FormEvent } from 'react';
import LobbyHero from './LobbyHero';

type Created = {
  code: string;
  join: { logs: string; source: string };
};

export default function Lobby() {
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [heroSnap, setHeroSnap] = useState(false);

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setHeroSnap(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fixtureId: 'cart-cent' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setCreated(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function linkFor(joinPath: string) {
    const url = new URL(joinPath, window.location.origin);
    const role = url.searchParams.get('role');
    const token = url.searchParams.get('token');
    return `/join/${created!.code}?role=${role}&token=${token}`;
  }

  async function copy(link: string, key: string) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${link}`
      );
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <main>
      <LobbyHero snap={heroSnap} />
      <h1>SPLIT</h1>
      <p className="meta">
        One bug, two halves. Create a room and send each player their link.
      </p>
      <form onSubmit={createRoom}>
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create room'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      {created && (
        <section>
          <h2>room code</h2>
          <p className="room-code">{created.code}</p>
          <div className="links">
            <div className="link-row">
              <span className="link-label">logs player</span>
              <code>{linkFor(created.join.logs)}</code>
              <button type="button" onClick={() => copy(linkFor(created.join.logs), 'logs')}>
                {copied === 'logs' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="link-row">
              <span className="link-label">source player</span>
              <code>{linkFor(created.join.source)}</code>
              <button type="button" onClick={() => copy(linkFor(created.join.source), 'source')}>
                {copied === 'source' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2>have a code?</h2>
        <div className="forms">
          <form method="get" action="/source">
            <input
              name="code"
              placeholder="ROOM CODE"
              maxLength={6}
              minLength={6}
              required
            />
            <button type="submit">Source pane</button>
          </form>
          <form method="get" action="/logs">
            <input
              name="code"
              placeholder="ROOM CODE"
              maxLength={6}
              minLength={6}
              required
            />
            <button type="submit">Logs pane</button>
          </form>
        </div>
      </section>
    </main>
  );
}
