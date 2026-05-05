import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import { brand } from '../../../theme/brand';
import { buildShareLink, sharePost, toggleFollow, toggleLike } from '../../../services/social';

type SocioFeedPanelProps = {
  header?: React.ReactNode;
};

type SocioPost = {
  id: string;
  artistUid?: string;
  artistKey: string;
  artistName: string;
  artistHandle: string;
  artistLocation?: string;
  caption: string;
  timeAgo: string;
  likesCount: number;
  tags: readonly string[];
  imageUrl?: string;
};

const relativeTime = (value: any) => {
  const toMs = (v: any) => {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    if (typeof v?.toMillis === 'function') return v.toMillis();
    if (typeof v?.seconds === 'number') return v.seconds * 1000;
    return 0;
  };

  const ms = toMs(value);
  if (!ms) return 'now';

  const diffMin = Math.max(1, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d`;
};

const SocioFeedPanel = ({ header }: SocioFeedPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const accent = useMemo(() => [brand.electricNeonBlue, brand.cyberPurple, brand.electricNeonBlue] as const, []);
  const actionIcon = theme.colors.accent;

  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({});
  const [livePosts, setLivePosts] = useState<SocioPost[]>([]);
  const [pendingLikeMap, setPendingLikeMap] = useState<Record<string, boolean>>({});
  const [pendingFollowMap, setPendingFollowMap] = useState<Record<string, boolean>>({});
  const [pendingShareMap, setPendingShareMap] = useState<Record<string, boolean>>({});
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const visibilityCache = new Map<string, boolean>();

    const toPostRow = (id: string, data: any): SocioPost => {
      const artistUid = String(data.artistUid ?? '').trim();
      const artistName = String(data.artistName ?? 'Artist').trim() || 'Artist';
      const artistHandle = String(data.artistHandle ?? '').trim() || `@${artistName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      const likesCount = Number(data.likesCount ?? 0);

      return {
        id,
        artistUid: artistUid || undefined,
        artistKey: artistUid || artistHandle,
        artistName,
        artistHandle,
        artistLocation: '',
        caption: String(data.caption ?? '').trim(),
        timeAgo: relativeTime(data.createdAt),
        likesCount: likesCount > 0 ? likesCount : 0,
        tags: Array.isArray(data.tags) ? data.tags.map((t: any) => String(t)) : [],
        imageUrl: String(data.imageUrl ?? '').trim(),
      };
    };

    const isArtistVisible = async (artistUid: string) => {
      const safeUid = String(artistUid ?? '').trim();
      if (!safeUid) return false;
      if (visibilityCache.has(safeUid)) return visibilityCache.get(safeUid) === true;
      try {
        const snap = await getDoc(doc(db, 'artists', safeUid));
        if (!snap.exists()) {
          visibilityCache.set(safeUid, false);
          return false;
        }
        const data = snap.data() as any;
        const approved = data?.verifiedPro === true || String(data?.verificationStatus ?? '') === 'approved';
        const visible = approved && data?.isVisible !== false;
        visibilityCache.set(safeUid, visible);
        return visible;
      } catch {
        visibilityCache.set(safeUid, false);
        return false;
      }
    };

    const loadFallbackRows = async () => {
      let fallbackSnap;
      try {
        fallbackSnap = await getDocs(
          query(collection(db, 'posts'), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(24)),
        );
      } catch {
        // Composite index might still be building; use broad fallback and filter locally.
        fallbackSnap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(48)));
      }
      const rows: SocioPost[] = [];

      for (const row of fallbackSnap.docs) {
        const data = row.data() as any;
        if (String(data.status ?? '') !== 'active') continue;
        const strictApproved = data.artistApproved === true && data.artistVisible === true;
        if (strictApproved) {
          rows.push(toPostRow(row.id, data));
          continue;
        }
        const safeArtistUid = String(data.artistUid ?? '').trim();
        if (!safeArtistUid) continue;
        const fallbackVisible = await isArtistVisible(safeArtistUid);
        if (!fallbackVisible) continue;
        rows.push(toPostRow(row.id, data));
      }

      if (!cancelled) {
        setFeedError(null);
        setLoadingFeed(false);
        setLivePosts(rows);
      }
    };

    const q = query(
      collection(db, 'posts'),
      where('status', '==', 'active'),
      where('artistApproved', '==', true),
      where('artistVisible', '==', true),
      orderBy('createdAt', 'desc'),
      limit(24),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => toPostRow(d.id, d.data() as any));
        if (rows.length > 0) {
          setFeedError(null);
          setLoadingFeed(false);
          setLivePosts(rows);
          return;
        }
        void loadFallbackRows().catch(() => {
          if (!cancelled) {
            setFeedError('Something went wrong. Try again.');
            setLoadingFeed(false);
            setLivePosts([]);
          }
        });
      },
      () => {
        void loadFallbackRows().catch(() => {
          setFeedError('Something went wrong. Try again.');
          setLoadingFeed(false);
          setLivePosts([]);
        });
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const posts = useMemo(() => livePosts, [livePosts]);

  useEffect(() => {
    const actor = auth.currentUser;
    if (!actor) return;
    let isActive = true;

    const nextLiked: Record<string, boolean> = {};
    const nextFollowing: Record<string, boolean> = {};
    const nextLikeCounts: Record<string, number> = {};
    posts.forEach((row) => {
      nextLiked[row.id] = false;
      nextFollowing[row.artistKey] = false;
      nextLikeCounts[row.id] = Number(row.likesCount ?? 0);
    });

    if (isActive) {
      setLikedMap(nextLiked);
      setFollowingMap(nextFollowing);
      setLikeCountMap(nextLikeCounts);
    }

    return () => {
      isActive = false;
    };
  }, [posts]);

  const ensureSignedIn = () => {
    if (!auth.currentUser) {
      Alert.alert('Tatzo', 'Please sign in to use this action.');
      return false;
    }
    return true;
  };

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 110 }}
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Feed</Text>
            <Text style={styles.sectionBadge}>Socio</Text>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.profileRow}>
              <LinearGradient colors={accent} style={styles.avatar}>
                <Text style={styles.avatarText}>{item.artistName.charAt(0)}</Text>
              </LinearGradient>
              <View style={styles.profileCopy}>
                <Text style={styles.artistName}>{item.artistName}</Text>
                <Text style={styles.artistMeta}>
                  {item.artistHandle}
                  {item.artistLocation ? ` | ${item.artistLocation}` : ''}
                  {` | ${item.timeAgo}`}
                </Text>
              </View>
            </View>
            <TouchableOpacity activeOpacity={0.85} onPress={() => Alert.alert('Tatzo', 'Post options soon.')}>
              <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <LinearGradient colors={[theme.colors.backgroundAlt, 'rgba(0, 229, 255, 0.16)', 'rgba(122, 92, 255, 0.22)']} style={styles.media}>
            <View style={styles.mediaOverlay}>
              <Text style={styles.mediaLabel}>{item.imageUrl ? item.imageUrl : 'Design preview placeholder'}</Text>
            </View>
          </LinearGradient>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={pendingLikeMap[item.id] === true}
              onPress={async () => {
                if (!ensureSignedIn()) return;
                if (pendingLikeMap[item.id]) return;
                const wasLiked = Boolean(likedMap[item.id]);
                const previousCount = Number(likeCountMap[item.id] ?? item.likesCount ?? 0);
                const optimisticLiked = !wasLiked;
                const optimisticCount = Math.max(0, previousCount + (optimisticLiked ? 1 : -1));

                setPendingLikeMap((prev) => ({ ...prev, [item.id]: true }));
                setLikedMap((prev) => ({ ...prev, [item.id]: optimisticLiked }));
                setLikeCountMap((prev) => ({ ...prev, [item.id]: optimisticCount }));
                try {
                  const result = await toggleLike({
                    postId: item.id,
                    artist: { uid: item.artistUid, displayName: item.artistName, handle: item.artistHandle },
                    postPreview: item.caption,
                  });
                  const finalCount = Math.max(0, previousCount + (result.liked ? 1 : -1));
                  setLikedMap((prev) => ({ ...prev, [item.id]: result.liked }));
                  setLikeCountMap((prev) => ({ ...prev, [item.id]: finalCount }));
                } catch (error: any) {
                  setLikedMap((prev) => ({ ...prev, [item.id]: wasLiked }));
                  setLikeCountMap((prev) => ({ ...prev, [item.id]: previousCount }));
                  Alert.alert('Tatzo', error?.message ?? 'Could not like right now.');
                } finally {
                  setPendingLikeMap((prev) => ({ ...prev, [item.id]: false }));
                }
              }}
              style={[styles.actionButton, pendingLikeMap[item.id] && styles.actionButtonDisabled]}
            >
              <Ionicons name={likedMap[item.id] ? 'heart' : 'heart-outline'} size={18} color={actionIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={pendingShareMap[item.id] === true}
              onPress={async () => {
                if (!ensureSignedIn()) return;
                if (pendingShareMap[item.id]) return;
                setPendingShareMap((prev) => ({ ...prev, [item.id]: true }));
                try {
                  const link = buildShareLink(item.id);
                  await sharePost({
                    postId: item.id,
                    artist: { uid: item.artistUid, displayName: item.artistName, handle: item.artistHandle },
                    postPreview: item.caption,
                    shareMessage: `Tatzo\n${link}\n\n${item.caption}`,
                  });
                } catch (error: any) {
                  Alert.alert('Tatzo', error?.message ?? 'Could not share right now.');
                } finally {
                  setPendingShareMap((prev) => ({ ...prev, [item.id]: false }));
                }
              }}
              style={[styles.actionButton, pendingShareMap[item.id] && styles.actionButtonDisabled]}
            >
              <Ionicons name="share-social-outline" size={18} color={actionIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={pendingFollowMap[item.artistKey] === true}
              onPress={async () => {
                if (!ensureSignedIn()) return;
                if (pendingFollowMap[item.artistKey]) return;
                const previous = Boolean(followingMap[item.artistKey]);
                const optimistic = !previous;
                setPendingFollowMap((prev) => ({ ...prev, [item.artistKey]: true }));
                setFollowingMap((prev) => ({ ...prev, [item.artistKey]: optimistic }));
                try {
                  const result = await toggleFollow({ artist: { uid: item.artistUid, displayName: item.artistName, handle: item.artistHandle } });
                  if (!result.targetUid) {
                    setFollowingMap((prev) => ({ ...prev, [item.artistKey]: previous }));
                    Alert.alert('Tatzo', 'Artist profile mapping not found yet.');
                  } else {
                    setFollowingMap((prev) => ({ ...prev, [item.artistKey]: result.following }));
                  }
                } catch (error: any) {
                  setFollowingMap((prev) => ({ ...prev, [item.artistKey]: previous }));
                  Alert.alert('Tatzo', error?.message ?? 'Could not follow right now.');
                } finally {
                  setPendingFollowMap((prev) => ({ ...prev, [item.artistKey]: false }));
                }
              }}
              style={[styles.actionButton, pendingFollowMap[item.artistKey] && styles.actionButtonDisabled]}
            >
              <Ionicons name={followingMap[item.artistKey] ? 'person' : 'person-add-outline'} size={18} color={actionIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => Alert.alert('Tatzo', 'Reported (placeholder).')}
              style={[styles.actionButton, styles.reportButton]}
            >
              <Ionicons name="flag-outline" size={18} color={theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf'} />
            </TouchableOpacity>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.likes}>{Number(likeCountMap[item.id] ?? item.likesCount ?? 0)} likes</Text>
          </View>
          <Text style={styles.caption}>{item.caption}</Text>
          <View style={styles.tagsRow}>
            {item.tags.map((tag) => (
              <View key={`${item.id}_${tag}`} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>
            {loadingFeed ? 'Loading feed...' : feedError ? 'Something went wrong' : 'No artist posts yet'}
          </Text>
          <Text style={styles.emptySub}>
            {loadingFeed
              ? 'Please wait a moment.'
              : feedError
                ? 'Try again.'
                : 'Approved artist posts will appear here.'}
          </Text>
        </View>
      }
    />
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    headerWrap: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 14,
      gap: 14,
    },
    externalHeader: {
      gap: 18,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontFamily: theme.fonts.display,
    },
    sectionBadge: {
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
    card: {
      marginHorizontal: 18,
      marginBottom: 14,
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: theme.colors.textInverse,
      fontWeight: '800',
      fontSize: 15,
    },
    profileCopy: {
      flex: 1,
      gap: 2,
    },
    artistName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '800',
    },
    artistMeta: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    media: {
      minHeight: 280,
      justifyContent: 'flex-end',
    },
    mediaOverlay: {
      padding: 14,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(5, 10, 20, 0.22)',
    },
    mediaLabel: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingTop: 12,
    },
    actionButton: {
      width: 44,
      height: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.18)' : theme.colors.border,
    },
    actionButtonDisabled: {
      opacity: 0.62,
    },
    reportButton: {
      marginLeft: 'auto',
      backgroundColor: 'rgba(142, 75, 69, 0.14)',
      borderColor: 'rgba(142, 75, 69, 0.38)',
    },
    metaRow: {
      paddingHorizontal: 14,
      paddingTop: 10,
    },
    likes: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    caption: {
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 10,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      lineHeight: 19,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 14,
      paddingBottom: 14,
    },
    tagPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.26)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(122, 92, 255, 0.1)',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    tagText: {
      color: theme.mode === 'light' ? 'rgba(58, 0, 132, 0.85)' : 'rgba(237, 229, 255, 0.95)',
      fontSize: 11,
      fontWeight: '700',
    },
    emptyWrap: {
      paddingHorizontal: 20,
      paddingVertical: 22,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    emptyTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    emptySub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
  });

export default SocioFeedPanel;
