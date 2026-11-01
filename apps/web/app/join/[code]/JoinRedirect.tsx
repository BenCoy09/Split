'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinRedirect({
  code,
  role,
  token,
}: {
  code: string;
  role?: string;
  token?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'logs' && role !== 'source') {
      setError('This join link is missing a valid role.');
      return;
    }
    fetch(`/api/rooms/${code}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role, token }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            `Join failed (HTTP ${res.status} ${body?.error ?? ''}): ${body?.message ?? 'unknown error'}`
          );
        }
        try {
          sessionStorage.setItem(
            `split:token:${code}`,
            JSON.stringify({ role, token })
          );
        } catch {}
        router.replace(
          role === 'logs' ? `/logs?code=${code}` : `/source?code=${code}`
        );
      })
      .catch((err) => setError((err as Error).message));
  }, [code, role, token, router]);

  return (
    <main>
      {error ? (
        <>
          <h1>Could not join room {code}</h1>
          <p className="error">{error}</p>
        </>
      ) : (
        <p>
          Joining room {code} as {role ?? '…'}…
        </p>
      )}
    </main>
  );
}
