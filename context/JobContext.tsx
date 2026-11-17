// context/JobContext.tsx
// Holds the mechanic's current active job while it moves through the flow:
// accept → navigate → diagnose → services → parts & fees → bill → payment → done.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  Bill,
  IssueCategory,
  JobRequest,
  MechanicService,
  computeBill,
} from '../services/mechanicApi';

export interface ExtraPart {
  id: string;
  name: string;
  priceRs: number;
}

type JobContextType = {
  request: JobRequest | null;
  beforePhotoUri: string | null;
  issue: IssueCategory | null;
  note: string;
  services: MechanicService[];
  parts: ExtraPart[];
  discountRs: number;
  bill: Bill;

  beginJob: (r: JobRequest) => void;
  setBeforePhotoUri: (uri: string | null) => void;
  setIssue: (i: IssueCategory | null) => void;
  setNote: (n: string) => void;
  setServices: (s: MechanicService[]) => void;
  addPart: (name: string, priceRs: number) => void;
  removePart: (id: string) => void;
  setDiscountRs: (n: number) => void;
  /** After sending, the server's bill (calculated with Ridzo's current settings) replaces the preview. */
  setServerBill: (b: Bill | null) => void;
  clearJob: () => void;
};

const JobContext = createContext<JobContextType | undefined>(undefined);

export function JobProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<JobRequest | null>(null);
  const [beforePhotoUri, setBeforePhotoUri] = useState<string | null>(null);
  const [issue, setIssue] = useState<IssueCategory | null>(null);
  const [note, setNote] = useState('');
  const [services, setServices] = useState<MechanicService[]>([]);
  const [parts, setParts] = useState<ExtraPart[]>([]);
  const [discountRs, setDiscountRs] = useState(0);
  const [serverBill, setServerBill] = useState<Bill | null>(null);

  // Stable identities (useCallback): screens and the app launcher use these in effect dependencies.
  const clearJob = useCallback(() => {
    setRequest(null);
    setBeforePhotoUri(null);
    setIssue(null);
    setNote('');
    setServices([]);
    setParts([]);
    setDiscountRs(0);
    setServerBill(null);
  }, []);

  const beginJob = useCallback(
    (r: JobRequest) => {
      clearJob();
      setRequest(r);
      setIssue(r.issueCategory);
    },
    [clearJob],
  );

  const addPart = (name: string, priceRs: number) => {
    setServerBill(null);
    setParts((prev) => [...prev, { id: `${Date.now()}_${prev.length}`, name, priceRs }]);
  };

  const removePart = (id: string) => {
    setServerBill(null);
    setParts((prev) => prev.filter((p) => p.id !== id));
  };

  const preview = useMemo(
    () =>
      computeBill(
        services.map((s) => ({ label: s.name, amountRs: s.priceRs })),
        parts.map((p) => ({ label: p.name, amountRs: p.priceRs })),
        discountRs,
        request?.travelRs ?? 0,
      ),
    [services, parts, discountRs, request],
  );
  const bill = serverBill ?? preview;

  return (
    <JobContext.Provider
      value={{
        request,
        beforePhotoUri,
        issue,
        note,
        services,
        parts,
        discountRs,
        bill,
        beginJob,
        setBeforePhotoUri,
        setIssue,
        setNote,
        setServices,
        addPart,
        removePart,
        setDiscountRs,
        setServerBill,
        clearJob,
      }}
    >
      {children}
    </JobContext.Provider>
  );
}

export function useJob() {
  const ctx = useContext(JobContext);
  if (!ctx) throw new Error('useJob must be used inside JobProvider');
  return ctx;
}
