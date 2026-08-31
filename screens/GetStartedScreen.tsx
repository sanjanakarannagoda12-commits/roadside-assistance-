// screens/GetStartedScreen.tsx
import React from 'react';
import { View, Text, ImageBackground, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function GetStartedScreen({ navigation }: any) {
  return (
    <ImageBackground
      source={require('../assets/mechanic-hero.jpg')} // drop your Figma hero photo here
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <View style={styles.content}>
        <Text style={styles.title}>Your Car.{'\n'}Our Expertise.{'\n'}Anywhere.</Text>
        <Text style={styles.subtitle}>
          Get reliable automotive assistance wherever you need it, whenever you need it.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, justifyContent: 'flex-end' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  content: { padding: 24, paddingBottom: 48 },
  title: {
    color: colors.textOnDark,
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: colors.textOnDark,
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 28,
  },
  button: {
    backgroundColor: colors.dark, // changed from old navy/blue to charcoal, matches new dark accent
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
});
