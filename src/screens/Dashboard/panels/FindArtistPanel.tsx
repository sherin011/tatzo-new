import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import type { DummyArtist } from '../../../data/dummyArtists';
import { brand } from '../../../theme/brand';
import GradientButton from '../../../components/ui/GradientButton';
import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../../config/firebaseConfig';

type FindArtistPanelProps = {
  header?: React.ReactNode;
  onBook: (artist: DummyArtist) => void;
};

type PublicArtistProfile = {
  uid: string;
  displayName?: string;
  artistName?: string;
  studioName?: string;
  locationCity?: string;
  locationArea?: string;
  location?: string;
  startingPrice?: number;
  startingFrom?: number;
  experience?: string;
  styles?: string[];
  tags?: string[];
  verificationStatus?: string;
  isVisible?: boolean;
  verifiedPro?: boolean;
};

const formatMoney = (value?: number) => {
  if (!value) return '0';
  return new Intl.NumberFormat('en-IN').format(value);
};

const REGION_FILTERS = [
  'All',
  'Chennai',
  'Around Chennai',
  'Anna Nagar',
  'T Nagar',
  'Velachery',
  'Tambaram',
  'Porur',
  'Avadi',
  'Ambattur',
  'Adyar',
  'OMR',
  'ECR',
] as const;

type RegionFilter = (typeof REGION_FILTERS)[number];

const FindArtistPanel = ({ header, onBook }: FindArtistPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();

  const [searchText, setSearchText] = useState('');
  const [liveArtists, setLiveArtists] = useState<DummyArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<RegionFilter>('Chennai');

  useEffect(() => {
    const q = query(collection(db, 'artists'), limit(120));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((row) => {
            const data = row.data() as PublicArtistProfile;
            if (data.isVisible === false) return null;
            const approved = data.verificationStatus === 'approved' || data.verifiedPro === true;
            if (!approved) return null;

            const name = String(data.artistName ?? data.displayName ?? data.studioName ?? '').trim();
            if (!name) return null;

            const city = String(data.locationCity ?? '').trim() || 'Chennai';
            const area = String(data.locationArea ?? '').trim() || 'Around Chennai';
            const locationText = `${area}, ${city}, Tamil Nadu`;
            const startingFrom = Number(data.startingPrice ?? data.startingFrom ?? 0);
            const tags = Array.isArray(data.styles)
              ? data.styles.map((tag) => String(tag))
              : Array.isArray(data.tags)
                ? data.tags.map((tag) => String(tag))
                : [];

            const handleBase = name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_+|_+$/g, '');

            return {
              id: row.id,
              name,
              handle: `@${handleBase || 'tatzo_artist'}`,
              specialty: tags.length ? tags.slice(0, 2).join(' | ') : 'Tattoo Artist',
              location: locationText || city || area || 'Chennai',
              status: data.experience ? `${data.experience} experience` : 'Open for consultation',
              category: tags[0] || 'Artist',
              rating: 4.8,
              startingFrom: Number.isFinite(startingFrom) ? startingFrom : 0,
              verified: true,
              tags: tags.length ? tags : ['tattoo'],
            } as DummyArtist;
          })
          .filter(Boolean) as DummyArtist[];

        setLiveArtists(rows);
        setLoading(false);
      },
      () => {
        setLiveArtists([]);
        setLoading(false);
      },
    );

    return () => unsub();
  }, []);

  const data = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const exactAreas = new Set(
      REGION_FILTERS.filter((value) => !['All', 'Chennai', 'Around Chennai'].includes(value)).map((value) => value.toLowerCase()),
    );
    const base = liveArtists.filter((a) => {
      const locationText = String(a.location ?? '').toLowerCase();
      const pieces = String(a.location ?? '')
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
      const area = pieces[0] ?? '';
      const city = pieces[1] ?? 'chennai';

      if (region === 'All') return true;
      if (region === 'Chennai') return city.includes('chennai');
      if (region === 'Around Chennai') {
        if (!city.includes('chennai')) return false;
        if (!area) return true;
        return !exactAreas.has(area);
      }

      return area.includes(region.toLowerCase()) || locationText.includes(region.toLowerCase());
    });

    if (!q) return base;
    return base.filter((artist) => {
      const haystack = `${artist.name} ${artist.handle} ${artist.specialty} ${artist.tags.join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [liveArtists, searchText, region]);

  const cardWidth = useMemo(() => {
    const padding = 18;
    const gap = 12;
    const usable = Math.max(320, width) - padding * 2;
    return Math.floor((usable - gap) / 2);
  }, [width]);

  const renderCard = ({ item }: { item: DummyArtist }) => {
    const verified = Boolean(item.verified);
    const rating = item.rating ?? 0;
    const starting = item.startingFrom ?? 0;
    const category = (item.category ?? 'TATZO').toUpperCase();

    return (
      <TouchableOpacity style={[styles.artistCard, { width: cardWidth }]} activeOpacity={0.9} onPress={() => onBook(item)}>
        <LinearGradient
          colors={[theme.colors.backgroundAlt, 'rgba(0, 229, 255, 0.16)', 'rgba(122, 92, 255, 0.22)']}
          style={styles.media}
        >
          {verified ? (
            <View style={styles.verifiedPill}>
              <Ionicons name="checkmark-circle" size={14} color={brand.electricNeonBlue} />
              <Text style={styles.verifiedText}>VERIFIED</Text>
            </View>
          ) : null}
          <Text style={styles.category}>{category}</Text>
        </LinearGradient>

        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {item.name}
            </Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={brand.electricNeonBlue} />
              <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
            </View>
          </View>

          <Text style={styles.priceText}>Starting from Rs. {formatMoney(starting)}+</Text>
          <Text style={styles.locationText} numberOfLines={1}>
            {item.location}
          </Text>

          <GradientButton title="Book Now" onPress={() => onBook(item)} size="md" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 110, gap: 12 }}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        !loading ? <Text style={styles.emptyText}>No approved artists found for this location.</Text> : null
      }
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}

          <View style={styles.searchShell}>
            <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search artists or styles..."
              placeholderTextColor={theme.colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              nativeID="findArtistSearch"
              style={styles.searchInput}
            />
            {searchText.length ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setSearchText('')} style={styles.clearBtn}>
                <Text style={styles.clearText}>X</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.regionRow}>
            <View style={styles.regionLeft}>
              <Ionicons name="location-outline" size={16} color={brand.electricNeonBlue} />
              <Text style={styles.regionTitle}>SELECT REGION</Text>
            </View>
            <Text style={styles.regionValue}>{region}</Text>
          </View>

          <FlatList
            horizontal
            data={REGION_FILTERS}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.regionChips}
            renderItem={({ item }) => {
              const active = region === item;
              return (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.regionPill, active && styles.regionPillActive]}
                  onPress={() => setRegion(item)}
                >
                  <Text style={[styles.regionPillText, active && styles.regionPillTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            }}
          />

          <View style={styles.topRow}>
            <Text style={styles.topTitle}>Top Artists</Text>
            <Text style={styles.countPill}>{data.length} Found</Text>
          </View>
          {loading ? <Text style={styles.loadingText}>Loading approved artists...</Text> : null}
        </View>
      }
      renderItem={renderCard}
    />
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    headerWrap: {
      gap: 14,
      paddingBottom: 4,
    },
    externalHeader: {
      gap: 18,
    },
    searchShell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    searchInput: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '600',
      paddingVertical: 0,
    },
    clearBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.3)',
    },
    clearText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    regionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 2,
    },
    regionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    regionTitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.6,
    },
    regionValue: {
      color: brand.electricNeonBlue,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
    },
    regionChips: {
      gap: 8,
      paddingTop: 2,
      paddingBottom: 4,
    },
    regionPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 7,
      minHeight: 34,
      justifyContent: 'center',
    },
    regionPillActive: {
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.35)' : 'rgba(122, 92, 255, 0.4)',
      backgroundColor: theme.colors.accentSoft,
    },
    regionPillText: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.25,
    },
    regionPillTextActive: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    topTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontFamily: theme.fonts.display,
    },
    countPill: {
      color: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      fontSize: 11,
      fontWeight: '700',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.3)',
    },
    artistCard: {
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    media: {
      height: 170,
      justifyContent: 'flex-end',
      padding: 12,
    },
    verifiedPill: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(11, 11, 15, 0.6)',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: 'rgba(0, 229, 255, 0.3)',
    },
    verifiedText: {
      color: theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    category: {
      color: brand.electricNeonBlue,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    cardBody: {
      padding: 12,
      gap: 10,
    },
    nameRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    name: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '800',
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    ratingText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    priceText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    locationText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
      marginTop: -2,
    },
    loadingText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      paddingHorizontal: 2,
    },
    emptyText: {
      color: theme.colors.textMuted,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      paddingTop: 10,
      paddingHorizontal: 18,
    },
    // Book button is now GradientButton for consistent neon+purple CTA.
  });

export default FindArtistPanel;
