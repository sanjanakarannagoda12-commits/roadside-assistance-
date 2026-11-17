// components/JobWatcher.tsx
// While the mechanic has a job open, checks every 10 s (and whenever the app comes back to the front)
// that it's still theirs. The customer can cancel, or Ridzo can give the job to someone else if this
// mechanic stopped sharing location — then we tell them and go back to Home.
// Renders nothing; mounted once in App.tsx.
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useJob } from '../context/JobContext';
import { getJobOwnership } from '../services/mechanicApi';
import { navigationRef } from '../navigation/RootNavigator';

const CHECK_MS = 10000;

export default function JobWatcher() {
  const { request, clearJob } = useJob();
  const jobId = request?.id;
  const told = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;

    const check = async () => {
      if (stopped || AppState.currentState !== 'active') return;
      try {
        const { state, message } = await getJobOwnership(jobId);
        if ((state === 'cancelled' || state === 'reassigned') && told.current !== jobId) {
          told.current = jobId;
          clearJob();
          if (navigationRef.isReady()) navigationRef.reset({ index: 0, routes: [{ name: 'HomeMechanic' }] });
          Alert.alert(state === 'cancelled' ? 'Request cancelled' : 'Job reassigned', message ?? '');
        }
      } catch {
        // offline — check again later
      }
    };

    const timer = setInterval(check, CHECK_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [jobId, clearJob]);

  return null;
}
