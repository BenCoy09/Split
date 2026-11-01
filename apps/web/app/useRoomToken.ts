'use client';

import { useEffect, useState } from 'react';

export function useRoomToken(code: string, role: 'logs' | 'source') {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`split:token:${code}`);
      if (raw) {
        const saved = JSON.parse(raw) as { role?: string; token?: string };
        if (saved.role === role && saved.token) setToken(saved.token);
      }
    } catch {}
  }, [code, role]);

  return token;
}
