// App.tsx
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './navigation/RootNavigator';
import { AppProvider } from './context/AppContext';
import { JobProvider } from './context/JobContext';
import LocationReporter from './components/LocationReporter';
import JobWatcher from './components/JobWatcher';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <JobProvider>
          <RootNavigator />
          <LocationReporter />
          <JobWatcher />
        </JobProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}