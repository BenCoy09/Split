'use client';

import { useEffect, useState } from 'react';
import AgentTurns from './AgentTurns';
import AskAgent from './AskAgent';
import Patches, { type PatchRecord } from './Patches';
import Partner from './Partner';
import Verdict, { type Verdict as VerdictT } from './Verdict';
import { useRoomToken } from './useRoomToken';

type LogsView = {
  code: string;
  role: string;
  title: string;
  partner: { role: string; at: number; ts: number } | null;
  verdict: VerdictT;
  logs: { id: string; ts: number; label: string; value: unknown }[];
  tests: { name: string; status: string }[];
  agentTurns: {
    id: string;
    role: string;
    question: string;
    text: string;
    refusal: boolean;
    offline?: boolean;
    ts: number;
  }[];
  patches: PatchRecord[];
};

export default function LogsPane({ code }: { code: string }) {
  const [view, setView] = useState<LogsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useRoomToken(code, 'logs');

  useEffect(() => {
    const stream = new EventSource(`/api/rooms/${code}/stream?role=logs`);
    stream.addEventListener('state', (event) => {
      setView(JSON.parse((event as MessageEvent).data));
      setError(null);
    });
    stream.onerror = () => {
      setError('Lost connection to the room stream');
      stream.close();
    };
    return () => {
      stream.close();
    };
  }, [code]);

  async function look(at: number) {
    if (!token) return;
    try {
      await fetch(`/api/rooms/${code}/look`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'logs', token, at }),
      });
    } catch {}
  }

  if (error) {
    return (
      <main>
        <p className="error">{error}</p>
      </main>
    );
  }

  if (!view) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="pane pane-logs">
      <h1>{view.title}</h1>
      <p className="meta">
        room {view.code} · logs pane · live
      </p>
      <Partner partner={view.partner} />
      <section>
        <h2>runtime logs</h2>
        <ul>
          {view.logs.map((log, index) => (
            <li
              key={log.id}
              className="log-entry"
              onClick={() => look(index + 1)}
              title="share this position with your partner"
            >
              <span className="line-no">log {index + 1}</span>
              {log.label}: {String(log.value)}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>tests</h2>
        <ul>
          {view.tests.map((test) => (
            <li key={test.name} className={test.status}>
              {test.name} — {test.status}
            </li>
          ))}
        </ul>
      </section>
      <Verdict verdict={view.verdict} />
      <Patches code={view.code} role="logs" patches={view.patches} />
      <AgentTurns turns={view.agentTurns} />
      <AskAgent code={view.code} role="logs" onAsked={() => {}} />
    </main>
  );
}
