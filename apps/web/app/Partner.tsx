'use client';

type Partner = { role: string; at: number; ts: number } | null;

export default function Partner({ partner }: { partner: Partner }) {
  if (!partner) return null;
  const where = partner.role === 'source' ? `line ${partner.at}` : `log ${partner.at}`;
  return <p className="partner-chip">your partner is looking at {where}</p>;
}
