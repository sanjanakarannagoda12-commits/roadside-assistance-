// context/AppContext.tsx
// Signed-in mechanic ("me" from the API) plus a few derived values screens already use.
import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Me } from '../services/authApi';

type Role = 'user' | 'provider' | null;

type AppContextType = {
  me: Me | null;
  setMe: (me: Me | null) => void;
  role: Role;
  setRole: (r: Role) => void;
  isVerified: boolean;
  setIsVerified: (v: boolean) => void;
  fullName: string;
  setFullName: (n: string) => void;
  /** Mirrors the server: true while the mechanic is online and receiving jobs. */
  online: boolean;
  setOnline: (v: boolean) => void;
  /** How location is being shared right now (set by LocationReporter). */
  tracking: 'off' | 'foreground' | 'background';
  setTracking: (t: 'off' | 'foreground' | 'background') => void;
  /** Bumped after a new profile photo is uploaded, so <Image> reloads it. */
  avatarVersion: number;
  bumpAvatar: () => void;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [me, setMeState] = useState<Me | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [fullName, setFullName] = useState('');
  const [online, setOnline] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(1);
  const [tracking, setTracking] = useState<'off' | 'foreground' | 'background'>('off');
  const bumpAvatar = useCallback(() => setAvatarVersion((v) => v + 1), []);

  const setMe = useCallback((next: Me | null) => {
    setMeState(next);
    setOnline(Boolean(next?.availability?.online));
    setRole(next ? 'provider' : null);
    setIsVerified(next?.user.status === 'approved');
    setFullName(next?.user.fullName ?? '');
  }, []);

  return (
    <AppContext.Provider
      value={{
        me,
        setMe,
        role,
        setRole,
        isVerified,
        setIsVerified,
        fullName,
        setFullName,
        online,
        setOnline,
        avatarVersion,
        bumpAvatar,
        tracking,
        setTracking,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
