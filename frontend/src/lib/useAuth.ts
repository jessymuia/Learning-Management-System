'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, tokens } from './api';

export function useRequireAuth() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokens.access) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  return ready;
}

export function useIdentity() {
  const [identity, setIdentity] = useState<{ userId: string; tenantId: string; email: string } | null>(null);
  useEffect(() => {
    auth.me().then(setIdentity).catch(() => setIdentity(null));
  }, []);
  return identity;
}
