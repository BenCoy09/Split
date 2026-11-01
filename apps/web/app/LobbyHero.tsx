'use client';

import { lazy, Suspense, useEffect, useState } from 'react';

const LobbyHeroCanvas = lazy(() => import('./LobbyHeroCanvas'));

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function CssHero({ snap }: { snap: boolean }) {
  return (
    <div className={snap ? 'hero3d snapped' : 'hero3d'} aria-hidden="true">
      <span className="half teal" />
      <span className="half amber" />
    </div>
  );
}

export default function LobbyHero({ snap }: { snap: boolean }) {
  const [mode, setMode] = useState<'pending' | '3d' | 'css'>('pending');

  useEffect(() => {
    setMode(hasWebGL() ? '3d' : 'css');
  }, []);

  if (mode === 'pending' || mode === 'css') {
    return <CssHero snap={snap} />;
  }

  return (
    <Suspense fallback={<CssHero snap={snap} />}>
      <LobbyHeroCanvas snap={snap} />
    </Suspense>
  );
}
