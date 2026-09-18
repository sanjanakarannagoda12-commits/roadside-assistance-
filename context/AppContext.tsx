// context/AppContext.tsx
import React, { createContext, useContext, useState } from 'react';

type Role = 'user' | 'provider' | null;

type AppContextType = {
  role: Role;
  setRole: (r: Role) => void;
  isVerified: boolean;
  setIsVerified: (v: boolean) => void;
  fullName: string;
  setFullName: (n: string) => void;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [fullName, setFullName] = useState('');

  return (
    <AppContext.Provider value={{ role, setRole, isVerified, setIsVerified, fullName, setFullName }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}