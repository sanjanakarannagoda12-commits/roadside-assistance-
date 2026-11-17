// screens/GetStartedScreen.tsx
// 4-slide onboarding. Slides 1–3 show "Next", slide 4 shows "Join Ridzo".
// To change a photo, replace the file at assets/onboarding/slide-N.jpg (keep the same name).
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ImageBackground,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

type Slide = {
  key: string;
  image: any;
  eyebrow: string;
  title: string;
  subtitle: string;
};

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    image: require('../assets/onboarding/slide-1.jpg'),
    eyebrow: 'Welcome to Ridzo',
    title: 'Your Skills.\nYour Service.\nYour Opportunity.',
    subtitle:
      'Connect with vehicle owners who need your expertise and bring your skills wherever help is needed.',
  },
  {
    key: 'jobs',
    image: require('../assets/onboarding/slide-2.jpg'),
    eyebrow: 'Get More Jobs',
    title: 'More Requests.\nMore Opportunities.',
    subtitle:
      'Receive repair requests near you and choose the jobs that match your skills and availability.',
  },
  {
    key: 'anywhere',
    image: require('../assets/onboarding/slide-3.jpg'),
    eyebrow: 'Work Beyond Your Garage',
    title: 'Take Your Expertise\nAnywhere.',
    subtitle:
      'Reach drivers wherever their vehicles break down. Deliver on-site help and get the job done.',
  },
  {
    key: 'grow',
    image: require('../assets/onboarding/slide-4.jpg'),
    eyebrow: 'Grow With Ridzo',
    title: 'Your Work.\nYour Earnings.\nYour Growth.',
    subtitle:
      'Turn every job into a loyal customer. Build your network and grow your business with Ridzo.',
  },
];

export default function GetStartedScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  const goToLogin = () => navigation.replace('Login');

  const handleNext = () => {
    if (isLast) {
      goToLogin();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <ImageBackground source={item.image} style={{ width, flex: 1 }} resizeMode="cover">
            {/* Light at the top, dark at the bottom so the text stays readable on bright photos */}
            <LinearGradient
              colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.95)']}
              locations={[0, 0.3, 0.6, 1]}
              style={StyleSheet.absoluteFill}
            />
          </ImageBackground>
        )}
      />

      {/* Skip (hidden on last slide) */}
      {!isLast && (
        <TouchableOpacity
          style={[styles.skip, { top: insets.top + 12 }]}
          onPress={goToLogin}
          hitSlop={12}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Bottom content */}
      <View style={[styles.content, { paddingBottom: insets.bottom + 32 }]} pointerEvents="box-none">
        <Text style={styles.eyebrow}>{SLIDES[index].eyebrow}</Text>
        <Text style={styles.title}>{SLIDES[index].title}</Text>
        <Text style={styles.subtitle}>{SLIDES[index].subtitle}</Text>

        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, isLast && styles.buttonPrimary]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>{isLast ? 'Join Ridzo' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  skip: {
    position: 'absolute',
    right: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  skipText: { color: colors.textOnDark, fontSize: 14, fontWeight: '600' },
  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
  },
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
    marginBottom: 24,
  },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: { width: 24, backgroundColor: colors.primary },
  button: {
    backgroundColor: colors.dark,
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonText: {
    color: colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
});
