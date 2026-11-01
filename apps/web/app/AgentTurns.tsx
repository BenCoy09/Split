type AgentTurn = {
  id: string;
  role: string;
  question: string;
  text: string;
  refusal: boolean;
  offline?: boolean;
  ts: number;
};

export default function AgentTurns({ turns }: { turns: AgentTurn[] }) {
  if (!turns.length) return null;
  return (
    <section className="agent">
      <h2>agent</h2>
      {turns.map((turn) =>
        turn.refusal ? (
          <div key={turn.id} className="refusal-banner">
            🔒 {turn.text}
          </div>
        ) : (
          <div key={turn.id} className="agent-turn">
            <p className="q">
              {turn.role} asked: {turn.question}
              {turn.offline ? ' · offline fallback' : ''}
            </p>
            <p className="a">{turn.text}</p>
          </div>
        )
      )}
    </section>
  );
}
