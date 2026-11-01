'use client';

import { useEffect, useState } from 'react';
import AgentTurns from './AgentTurns';
import AskAgent from './AskAgent';
import Patches, { type PatchRecord } from './Patches';
import Partner from './Partner';
import Verdict, { type Verdict as VerdictT } from './Verdict';
import { useRoomToken } from './useRoomToken';

type SourceView = {
  code: string;
  role: string;
  title: string;
  partner: { role: string; at: number; ts: number } | null;
  verdict: VerdictT;
  source: { path: string; content: string }[];
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

export default function SourcePane({ code }: { code: string }) {
  const [view, setView] = useState<SourceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useRoomToken(code, 'source');

  useEffect(() => {
    const stream = new EventSource(`/api/rooms/${code}/stream?role=source`);
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
        body: JSON.stringify({ role: 'source', token, at }),
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
    <main className="pane pane-source">
      <h1>{view.title}</h1>
      <p className="meta">
        room {view.code} · source pane · live
      </p>
      <Partner partner={view.partner} />
      {view.source.map((file) => (
        <section key={file.path}>
          <h2>{file.path}</h2>
          <pre>
            <code>
              {file.content.split('\n').map((line, index) => (
                <span
                  key={index}
                  className="code-line"
                  onClick={() => look(index + 1)}
                >
                  <span className="line-no">{index + 1}</span>
                  {line}
                </span>
              ))}
            </code>
          </pre>
        </section>
      ))}
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
      <Patches code={view.code} role="source" patches={view.patches} />
      <AgentTurns turns={view.agentTurns} />
      <AskAgent code={view.code} role="source" onAsked={() => {}} />
    </main>
  );
}
