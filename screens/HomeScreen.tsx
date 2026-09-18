// screens/HomeScreen.tsx
import React, { useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import ServiceCard from '../components/ServiceCard';
import BottomNav from '../components/BottomNav';

export default function HomeScreen({navigation}:any) {
  const [tab, setTab] = useState('Home');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey, Micheal</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location-sharp" size={14} color={colors.primary} />
              <Text style={styles.locationText}>Weralupa, Ratnapura</Text>
            </View>
          </View>
          <Image
            source={require('../assets/avatar.png')}
            style={styles.avatar}
          />
        </View>

        {/* Dark hero card, matches the "Analyze rough gemstones" hero block style */}
        <View style={styles.heroCard}>
          <Text style={styles.heroBadge}>Roadside Help</Text>
          <Text style={styles.heroTitle}>Get help for your car with confidence</Text>
          <Text style={styles.heroSubtitle}>
            Tell us your issue and we'll match you with a nearby mechanic, garage, or tow truck.
          </Text>
        </View>

        {/* Service cards */}
        <Text style={styles.sectionTitle}>Request a Service</Text>

        <ServiceCard
          icon="water-outline"
          title="Oil Change"
          subtitle="Quick top-up or full oil change"
        />
        <ServiceCard
          icon="disc-outline"
          title="Tire Care"
          subtitle="Puncture repair, replacement & pressure check"
        />
        <ServiceCard
          icon="pulse-outline"
          title="Diagnostics"
          subtitle="Full vehicle health check"
        />
        <ServiceCard
          icon="checkmark-circle-outline"
          title="Inspection"
          subtitle="Pre-trip or routine inspection"
        />
      </ScrollView>

      <BottomNav active="Home" navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 110 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { color: colors.textSecondary, fontSize: 13, marginLeft: 4 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  heroCard: {
    backgroundColor: colors.dark,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  heroBadge: {
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 12,
    overflow: 'hidden',
  },
  heroTitle: { color: colors.textOnDark, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  heroSubtitle: { color: '#C9C9CC', fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
});
