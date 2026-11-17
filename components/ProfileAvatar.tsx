// components/ProfileAvatar.tsx
// The signed-in mechanic's photo (GET /mechanic/avatar, needs the login token), or the default avatar.
import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import { useAppContext } from '../context/AppContext';
import { API_URL, getAccessToken } from '../services/apiClient';

const FALLBACK = require('../assets/avatar.png');

export default function ProfileAvatar({ style }: { style?: StyleProp<ImageStyle> }) {
  const { avatarVersion } = useAppContext();
  const [failed, setFailed] = useState(false);
  const token = getAccessToken();

  useEffect(() => setFailed(false), [avatarVersion]);

  if (failed || !token) return <Image source={FALLBACK} style={style} />;
  return (
    <Image
      source={{ uri: `${API_URL}/mechanic/avatar?v=${avatarVersion}`, headers: { Authorization: `Bearer ${token}` } }}
      style={style}
      onError={() => setFailed(true)} // 404 = no photo yet
    />
  );
}
