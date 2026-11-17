'use client';
// Re-fetches the current page's server data every few seconds (live dashboards).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
