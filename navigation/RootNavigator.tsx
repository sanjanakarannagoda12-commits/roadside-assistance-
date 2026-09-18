// navigation/RootNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text } from 'react-native';

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
import UnderReviewScreen from '../screens/UnderReviewScreen';

const Stack = createNativeStackNavigator();

// Temporary placeholders until Search and Messages screens are built
function PlaceholderScreen({ route }: any) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{route.name} — coming soon</Text>
    </View>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="GetStarted" screenOptions={{ headerShown: false }}>
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
        <Stack.Screen name="MyServices" component={PlaceholderScreen} />
        <Stack.Screen name="JobHistory" component={PlaceholderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}