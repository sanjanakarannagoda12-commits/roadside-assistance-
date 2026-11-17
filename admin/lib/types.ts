// Shapes returned by the Ridzo admin API (backend/src/routes/admin.ts).
export type MechanicStatus = 'onboarding' | 'pending_review' | 'approved' | 'rejected' | 'suspended';
export type DocType = 'nic' | 'license' | 'certificate' | 'toolkit';

export interface MechanicSummary {
  id: string;
  phone: string;
  fullName: string | null;
  serviceArea: string | null;
  status: MechanicStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  isOnline: boolean;
  createdAt: string;
}

export interface MechanicDetail {
  mechanic: MechanicSummary & { email: string | null; rejectionReason: string | null; lastSeenAt: string | null };
  documents: {
    docType: DocType;
    label: string;
    uploaded: boolean;
    status: 'uploaded' | 'approved' | 'rejected' | null;
    reason: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    uploadedAt: string | null;
    reviewedAt: string | null;
  }[];
  services: { key: string; name: string; category: string; priceRs: number }[];
  history: { id: string; action: string; adminName?: string; detail: Record<string, unknown>; createdAt: string }[];
  stats: {
    completedJobs: number;
    rating: number | null;
    ratingCount: number;
    offersLast30Days: { accepted: number; declined: number; expired: number };
    acceptanceRate: number | null;
  };
}

export interface CatalogService {
  key: string;
  category: string;
  name: string;
  durationLabel: string;
  priceRs: number;
  active: boolean;
  sortOrder: number;
}

export interface PricingConfig {
  travelBaseRs: number;
  travelBaseKm: number;
  travelPerKmRs: number;
  travelCapRs: number;
  nightMultiplier: number;
  nightStartHour: number;
  nightEndHour: number;
  roadFactor: number;
  maxRadiusKm: number;
  commissionRate: number;
  commissionOnTravel: boolean;
  updatedAt: string | null;
}

export interface PricingResponse {
  pricing: PricingConfig;
  examples: { distanceKm: number; dayRs: number; nightRs: number }[];
}

export const STATUS_LABEL: Record<MechanicStatus, string> = {
  onboarding: 'Signing up',
  pending_review: 'Waiting for review',
  approved: 'Approved',
  rejected: 'Needs fixes',
  suspended: 'Suspended',
};

export const formatRs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`;
export const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
    : '—';

export interface LiveAlert {
  id: string;
  kind: 'tracking_lost';
  createdAt: string;
  minutesSinceLocation: number | null;
  job: {
    id: string;
    status: string;
    customerName: string;
    customerPhone: string;
    issueSummary: string;
    address: string;
    acceptedAt: string | null;
  } | null;
  mechanic: {
    id: string;
    name: string | null;
    phone: string;
    lastSeenAt: string | null;
    kmAway: number | null;
    etaMin: number | null;
  } | null;
}
