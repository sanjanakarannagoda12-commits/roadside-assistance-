// Builds the "me" response the app uses to decide which screen to show.
import type { Repo, User } from '../db/types.js';
import { DOC_TYPES, type DocType } from '../validation.js';

export type NextStep = 'details' | 'documents' | 'services' | 'submit' | null;

export interface DocState {
  status: 'uploaded' | 'approved' | 'rejected';
  reason: string | null; // why an admin rejected it
  uploadedAt: string;
}

export async function buildMe(repo: Repo, user: User) {
  const [docs, chosen, catalog] = await Promise.all([
    repo.listDocuments(user.id),
    repo.listServices(user.id),
    repo.listCatalog(),
  ]);

  const documents = Object.fromEntries(
    DOC_TYPES.map((t) => {
      const d = docs.find((x) => x.docType === t);
      return [t, d ? { status: d.status, reason: d.rejectionReason, uploadedAt: d.uploadedAt } : null];
    }),
  ) as Record<DocType, DocState | null>;

  const chosenKeys = new Set(chosen.map((s) => s.serviceKey));
  const services = catalog
    .filter((c) => c.active && chosenKeys.has(c.key))
    .map((c) => ({ key: c.key, category: c.category, name: c.name, durationLabel: c.durationLabel, priceRs: c.priceRs }));

  const detailsComplete = Boolean(user.fullName && user.serviceArea);
  // A rejected document must be replaced before the mechanic can resubmit.
  const documentsToFix = DOC_TYPES.filter((t) => !documents[t] || documents[t]!.status === 'rejected');
  const documentsComplete = documentsToFix.length === 0;
  const servicesComplete = services.length > 0;

  let nextStep: NextStep = null;
  if (user.status === 'onboarding' || user.status === 'rejected') {
    if (!detailsComplete) nextStep = 'details';
    else if (!documentsComplete) nextStep = 'documents';
    else if (!servicesComplete) nextStep = 'services';
    else nextStep = 'submit';
  }

  return {
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
      status: user.status,
      fullName: user.fullName,
      email: user.email,
      serviceArea: user.serviceArea,
      rejectionReason: user.rejectionReason,
    },
    onboarding: { detailsComplete, documents, documentsToFix, documentsComplete, servicesComplete, nextStep },
    services,
    availability: { online: user.isOnline, canGoOnline: user.status === 'approved', lastSeenAt: user.lastSeenAt },
  };
}

export type Me = Awaited<ReturnType<typeof buildMe>>;
