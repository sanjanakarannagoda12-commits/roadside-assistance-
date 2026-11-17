// navigation/RootNavigator.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import { ApiError, loadTokens, setOnSessionExpired } from '../services/apiClient';
import { getMe, routeForMe } from '../services/authApi';
import { RESUME_ROUTE, getActiveJob } from '../services/mechanicApi';
import { useJob } from '../context/JobContext';

import GetStartedScreen from '../screens/GetStartedScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import SignUpRoleScreen from '../screens/SignUpRoleScreen';
import SignUpScreen from '../screens/SignUpScreen';
import VerifyDocumentsScreen from '../screens/VerifyDocumentsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import HomeMechanicScreen from '../screens/HomeMechanicScreen';
import OTPScreen from '../screens/OTPScreen';
import BasicDetailsScreen from '../screens/BasicDetailsScreen';
import SpecialtiesPricingScreen from '../screens/SpecialtiesPricingScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import UnderReviewScreen from '../screens/UnderReviewScreen';
import IncomingRequestScreen from '../screens/IncomingRequestScreen';
import NavigateToCustomerScreen from '../screens/NavigateToCustomerScreen';
import DiagnoseScreen from '../screens/DiagnoseScreen';
import SelectServicesScreen from '../screens/SelectServicesScreen';
import PartsFeesScreen from '../screens/PartsFeesScreen';
import BillSummaryScreen from '../screens/BillSummaryScreen';
import AwaitingPaymentScreen from '../screens/AwaitingPaymentScreen';
import JobCompleteScreen from '../screens/JobCompleteScreen';
import EarningsScreen from '../screens/EarningsScreen';

const Stack = createNativeStackNavigator();

// Temporary placeholders until Search and Messages screens are built
function PlaceholderScreen({ route }: any) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{route.name} — coming soon</Text>
    </View>
  );
}

export const navigationRef = createNavigationContainerRef<any>();

export default function RootNavigator() {
  const { setMe } = useAppContext();
  const { beginJob } = useJob();
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [bootError, setBootError] = useState('');

  // On launch: if this device has a saved session, load the mechanic and skip login.
  const restoreSession = useCallback(async () => {
    setBootError('');
    try {
      if (await loadTokens()) {
        const me = await getMe();
        setMe(me);
        // App was closed in the middle of a job → reopen straight into that job.
        const job = me.user.status === 'approved' ? await getActiveJob().catch(() => null) : null;
        if (job) {
          beginJob(job);
          setInitialRoute(RESUME_ROUTE[job.status ?? 'accepted'] ?? 'NavigateToCustomer');
          return;
        }
        setInitialRoute(routeForMe(me));
        return;
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'network') {
        setBootError(e.message);
        return;
      }
      // Any other failure (e.g. session expired) → start signed out.
    }
    setInitialRoute('GetStarted');
  }, [setMe, beginJob]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // If the server rejects our refresh token mid-session, send the user back to Login.
  useEffect(() => {
    setOnSessionExpired(() => {
      setMe(null);
      if (navigationRef.isReady()) navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
    });
    return () => setOnSessionExpired(null);
  }, [setMe]);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
        {bootError ? (
          <>
            <Text style={{ textAlign: 'center', color: colors.textSecondary, marginBottom: 16 }}>{bootError}</Text>
            <TouchableOpacity
              onPress={restoreSession}
              style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10 }}
            >
              <Text style={{ color: colors.textOnDark, fontWeight: '700' }}>Try again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} size="large" />
        )}
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="GetStarted" component={GetStartedScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUpRole" component={SignUpRoleScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="VerifyDocuments" component={VerifyDocumentsScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Search" component={PlaceholderScreen} />
        <Stack.Screen name="Messages" component={PlaceholderScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="HomeMechanic" component={HomeMechanicScreen} />
        <Stack.Screen name="OTP" component={OTPScreen} />
        <Stack.Screen name="BasicDetails" component={BasicDetailsScreen} />
        <Stack.Screen name="SpecialtiesPricing" component={SpecialtiesPricingScreen} />
        <Stack.Screen name="UnderReview" component={UnderReviewScreen} />
        <Stack.Screen name="MyServices" component={SpecialtiesPricingScreen} initialParams={{ mode: 'edit' }} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="JobHistory" component={EarningsScreen} />
        <Stack.Screen name="Earnings" component={EarningsScreen} options={{ animation: 'none' }} />

        {/* Active job flow — swipe-back disabled where going back would break the job state */}
        <Stack.Screen
          name="IncomingRequest"
          component={IncomingRequestScreen}
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen name="NavigateToCustomer" component={NavigateToCustomerScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Diagnose" component={DiagnoseScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="SelectServices" component={SelectServicesScreen} />
        <Stack.Screen name="PartsFees" component={PartsFeesScreen} />
        <Stack.Screen name="BillSummary" component={BillSummaryScreen} />
        <Stack.Screen name="AwaitingPayment" component={AwaitingPaymentScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="JobComplete" component={JobCompleteScreen} options={{ gestureEnabled: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}