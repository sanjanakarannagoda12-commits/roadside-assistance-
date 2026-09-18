// App.tsx
import React from 'react';
import RootNavigator from './navigation/RootNavigator';
import { AppProvider } from './context/AppContext';

export default function App() {
  return (
    <AppProvider>
      <RootNavigator />
    </AppProvider>
  );
}