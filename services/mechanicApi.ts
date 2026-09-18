// services/mechanicApi.ts
//
// Frontend/backend contract for the mechanic dashboard.
// Once the backend crew has a real endpoint, replace the body of
// getDashboardSummary() with an actual fetch/Supabase call that returns
// this exact shape — nothing in HomeMechanicScreen.tsx needs to change.
//
// Suggested endpoint: GET /mechanic/:mechanicId/dashboard-summary
// Expected JSON response:
// {
//   "todayEarningsRs": 4250,
//   "todayJobs": 3,
//   "rating": 4.8,
//   "specialty": "Tyres & brakes"
// }

export interface MechanicDashboardSummary {
  todayEarningsRs: number;
  todayJobs: number;
  rating: number;
  specialty: string;
}

// TODO(backend): swap this mock for a real call once the endpoint exists, e.g:
// export async function getDashboardSummary(mechanicId: string): Promise<MechanicDashboardSummary> {
//   const res = await fetch(`${API_BASE_URL}/mechanic/${mechanicId}/dashboard-summary`);
//   if (!res.ok) throw new Error('Failed to load dashboard summary');
//   return res.json();
// }
export async function getDashboardSummary(): Promise<MechanicDashboardSummary> {
  // Simulated network delay so loading states can be tested honestly.
  await new Promise((resolve) => setTimeout(resolve, 600));
  return {
    todayEarningsRs: 4250,
    todayJobs: 3,
    rating: 4.8,
    specialty: 'Tyres & brakes',
  };
}