// screens/HomeMechanicScreen.tsx
import React from 'react';
import { View, Text, Image, ImageBackground, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAppContext } from '../context/AppContext';
import BottomNav from '../components/BottomNav';

const MENU_CARDS = [
  {
    key: 'ongoing',
    title: 'Ongoing\nRequest',
    image: require('../assets/ongoing-request.jpg'),
    route: 'OngoingRequest',
  },
  {
    key: 'calendar',
    title: 'Calendar',
    image: require('../assets/calendar-bg.jpg'),
    route: 'Calendar',
  },
  {
    key: 'services',
    title: 'Our\nServices',
    image: require('../assets/services-bg.jpg'),
    route: 'Services',
  },
];

export default function HomeMechanicScreen({ navigation }: any) {
  const { fullName } = useAppContext();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header - dark instead of the old blue block */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey, {fullName ? fullName.split(' ')[0] : 'Mechanic'}</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location-sharp" size={13} color={colors.primary} />
              <Text style={styles.locationText}>Sunil Fix</Text>
            </View>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={13} color={colors.star} />
              <Ionicons name="star" size={13} color={colors.star} />
              <Ionicons name="star" size={13} color={colors.star} />
              <Text style={styles.ratingText}>4.8</Text>
            </View>
          </View>
          <Image source={require('../assets/avatar.png')} style={styles.avatar} />
        </View>

        {/* Menu cards */}
        <View style={styles.cardsContainer}>
          {MENU_CARDS.map((card) => (
            <TouchableOpacity
              key={card.key}
              activeOpacity={0.85}
              onPress={() => navigation.navigate(card.route)}
            >
              <ImageBackground source={card.image} style={styles.card} imageStyle={styles.cardImage}>
                <View style={styles.cardOverlay} />
                <Text style={styles.cardTitle}>{card.title}</Text>
              </ImageBackground>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <BottomNav active="Home" navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 110 },
  header: {
    backgroundColor: colors.dark, // was blue in the Figma, now dark charcoal to match the rest of the app
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.textOnDark },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  locationText: { color: '#C9C9CC', fontSize: 13, marginLeft: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  ratingText: { color: '#C9C9CC', fontSize: 13, marginLeft: 4 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.primary },
  cardsContainer: { padding: 20 },
  card: {
    height: 130,
    borderRadius: 20,
    marginBottom: 18,
    justifyContent: 'flex-end',
    padding: 18,
    overflow: 'hidden',
  },
  cardImage: { borderRadius: 20 },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)', // darkens the photo so white text stays readable
    borderRadius: 20,
  },
  cardTitle: { color: colors.textOnDark, fontSize: 24, fontWeight: '700', lineHeight: 28 },
});