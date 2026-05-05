import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import { createArtistPost, listArtistPostsPage, syncArtistPostVisibilityForUid, type ArtistPostRow } from '../../../services/posts';
import GradientButton from '../../../components/ui/GradientButton';
import type { ArtistSubscriptionPaymentStatus } from '../../../types/app';
import { pickSingleImageFromDevice, uploadPickedImage } from '../../../services/mediaUpload';

type ArtistPostPanelProps = {
  header?: React.ReactNode;
  onRequireSubscription?: () => void;
};

const validHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const toHandle = (name: string) =>
  `@${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'tatzo_artist'}`;

const ArtistPostPanel = ({ header, onRequireSubscription }: ArtistPostPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const uid = auth.currentUser?.uid ?? '';

  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageStoragePath, setImageStoragePath] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [composerOpen, setComposerOpen] = useState(true);

  const [rows, setRows] = useState<ArtistPostRow[]>([]);
  const [cursor, setCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [artistName, setArtistName] = useState(auth.currentUser?.displayName ?? 'Artist');
  const [artistHandle, setArtistHandle] = useState(toHandle(auth.currentUser?.displayName ?? 'artist'));
  const [subscriptionStatus, setSubscriptionStatus] = useState<'inactive' | 'active'>('inactive');
  const [subscriptionPaymentStatus, setSubscriptionPaymentStatus] = useState<ArtistSubscriptionPaymentStatus>('idle');
  const [subscriptionVerificationStatus, setSubscriptionVerificationStatus] = useState<'pending' | 'verified' | 'failed'>('failed');

  const loadFirstPage = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setLoadError(null);
    try {
      const page = await listArtistPostsPage(uid, 10, null);
      setRows(page.rows);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (e: any) {
      const fallback = 'Something went wrong. Try again.';
      setLoadError(fallback);
      Alert.alert('Tatzo', e?.message ?? fallback);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  const loadMore = useCallback(async () => {
    if (!uid || !hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listArtistPostsPage(uid, 10, cursor);
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch {
      // no-op
    } finally {
      setLoadingMore(false);
    }
  }, [uid, hasMore, cursor, loadingMore]);

  const onRefresh = useCallback(async () => {
    if (!uid) return;
    setRefreshing(true);
    setLoadError(null);
    try {
      const page = await listArtistPostsPage(uid, 10, null);
      setRows(page.rows);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (e: any) {
      const fallback = 'Something went wrong. Try again.';
      setLoadError(fallback);
      Alert.alert('Tatzo', e?.message ?? fallback);
    } finally {
      setRefreshing(false);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const profile = snap.data() as any;
        const name = String(profile?.displayName ?? auth.currentUser?.displayName ?? 'Artist').trim() || 'Artist';
        setArtistName(name);
        setArtistHandle(toHandle(name));
        setSubscriptionStatus((profile?.subscriptionStatus as 'inactive' | 'active') ?? 'inactive');
        setSubscriptionPaymentStatus((profile?.subscriptionPaymentStatus as ArtistSubscriptionPaymentStatus) ?? 'idle');
        setSubscriptionVerificationStatus((profile?.subscriptionVerificationStatus as 'pending' | 'verified' | 'failed') ?? 'failed');
      },
      () => {
        const name = String(auth.currentUser?.displayName ?? 'Artist').trim() || 'Artist';
        setArtistName(name);
        setArtistHandle(toHandle(name));
        setSubscriptionStatus('inactive');
        setSubscriptionPaymentStatus('idle');
        setSubscriptionVerificationStatus('failed');
      },
    );

    void syncArtistPostVisibilityForUid(uid).catch(() => {
      // visibility sync is best-effort only
    });
    void loadFirstPage();

    return () => unsubUser();
  }, [uid, loadFirstPage]);

  const onCreatePost = async () => {
    if (!uid) return;
    if (uploadingImage) {
      Alert.alert('Tatzo', 'Please wait. Image upload is still in progress.');
      return;
    }

    if (subscriptionStatus !== 'active') {
      const retryMode = subscriptionPaymentStatus === 'failed' || subscriptionPaymentStatus === 'cancelled';
      const verifyingMode = subscriptionPaymentStatus === 'processing' || subscriptionVerificationStatus === 'pending';
      Alert.alert(
        'Tatzo Pro required',
        verifyingMode
          ? 'Payment is still verifying. Refresh from Profile in a moment.'
          : retryMode
            ? 'Subscription payment failed/cancelled. Retry payment from Profile.'
            : 'Activate TATZO Pro subscription from Profile to publish artist posts.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: verifyingMode ? 'Open Profile' : retryMode ? 'Retry Payment' : 'Go to Profile',
            onPress: () => {
              onRequireSubscription?.();
            },
          },
        ],
      );
      return;
    }

    const cleanCaption = caption.trim();
    const cleanImage = imageUrl.trim();
    if (!cleanCaption && !cleanImage) {
      Alert.alert('Tatzo', 'Add caption or image URL.');
      return;
    }

    if (cleanImage && !validHttpUrl(cleanImage)) {
      Alert.alert('Tatzo', 'Image URL must start with http:// or https://');
      return;
    }

    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      await createArtistPost({
        artistUid: uid,
        artistName,
        artistHandle,
        caption: cleanCaption,
        imageUrl: cleanImage,
        imageStoragePath: imageStoragePath.trim() || undefined,
        tags,
      });

      setCaption('');
      setImageUrl('');
      setImageStoragePath('');
      setTagsText('');
      setComposerOpen(false);
      setLoadError(null);
      await onRefresh();
      Alert.alert('Tatzo', 'Post published.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not publish post.');
    } finally {
      setSubmitting(false);
    }
  };

  const onPickAndUploadImage = async () => {
    if (!uid || uploadingImage || submitting) return;

    try {
      setUploadingImage(true);
      const picked = await pickSingleImageFromDevice();
      if (!picked) return;

      const uploaded = await uploadPickedImage({
        uri: picked.uri,
        fileName: picked.name,
        mimeType: picked.mimeType,
        folderPath: `artists/${uid}/posts`,
      });
      setImageUrl(uploaded.downloadUrl);
      setImageStoragePath(uploaded.storagePath);
      Alert.alert('Tatzo', 'Image uploaded successfully.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.55}
      onEndReached={loadMore}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accentStrong} />}
      ListHeaderComponent={
        <View style={styles.headWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Create Post</Text>
            <Text style={styles.sectionBadge}>Live</Text>
          </View>

          <TouchableOpacity style={styles.toggleComposerBtn} activeOpacity={0.9} onPress={() => setComposerOpen((prev) => !prev)}>
            <Ionicons name={composerOpen ? 'remove-circle-outline' : 'add-circle-outline'} size={16} color={theme.colors.accentStrong} />
            <Text style={styles.toggleComposerText}>{composerOpen ? 'Hide Composer' : 'Open Composer'}</Text>
          </TouchableOpacity>

          {composerOpen ? (
            <View style={styles.formCard}>
              <Text style={styles.label}>Caption</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                style={[styles.input, styles.multiline]}
                multiline
                placeholder="Share what this tattoo is about..."
                placeholderTextColor={theme.colors.textMuted}
              />

              <Text style={styles.label}>Image URL</Text>
              <TextInput
                value={imageUrl}
                onChangeText={(value) => {
                  setImageUrl(value);
                  setImageStoragePath('');
                }}
                style={styles.input}
                autoCapitalize="none"
                placeholder="https://..."
                placeholderTextColor={theme.colors.textMuted}
              />
              {imageUrl.trim() && !validHttpUrl(imageUrl) ? <Text style={styles.warn}>Invalid URL. It should start with http:// or https://</Text> : null}
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.uploadBtn, uploadingImage && styles.uploadBtnDisabled]}
                onPress={onPickAndUploadImage}
                disabled={uploadingImage || submitting}
              >
                <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.accentStrong} />
                <Text style={styles.uploadBtnText}>{uploadingImage ? 'Uploading image...' : 'Upload from device'}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Tags (optional)</Text>
              <TextInput
                value={tagsText}
                onChangeText={setTagsText}
                style={styles.input}
                placeholder="fineline, blackwork, sleeve"
                placeholderTextColor={theme.colors.textMuted}
              />

              <GradientButton title={submitting ? 'Publishing...' : 'Publish Post'} loading={submitting} onPress={onCreatePost} />
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Recent Posts</Text>
            <Text style={styles.sectionBadge}>{rows.length}</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <Text style={styles.empty}>Loading posts...</Text>
        ) : loadError ? (
          <Text style={styles.empty}>{loadError}</Text>
        ) : (
          <Text style={styles.empty}>No posts yet. Publish your first post.</Text>
        )
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.caption}>{item.caption}</Text>
            <Text style={styles.meta}>Active</Text>
          </View>

          <Text style={styles.url} numberOfLines={1}>
            {item.imageUrl?.trim() ? item.imageUrl : 'No image URL provided (placeholder preview will be used).'}
          </Text>

          {item.tags?.length ? (
            <View style={styles.tagsRow}>
              {item.tags.map((tag) => (
                <View key={`${item.id}_${tag}`} style={styles.tagPill}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
      ListFooterComponent={
        loadingMore ? (
          <Text style={styles.footer}>Loading more...</Text>
        ) : hasMore ? (
          <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore} activeOpacity={0.9}>
            <Ionicons name="chevron-down-outline" size={16} color={theme.colors.accentStrong} />
            <Text style={styles.loadMoreText}>Load more</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.footer}>You reached the end.</Text>
        )
      }
    />
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 120,
      gap: 12,
    },
    headWrap: {
      gap: 12,
      marginBottom: 2,
    },
    externalHeader: {
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.28)' : 'rgba(122, 92, 255, 0.3)',
    },
    formCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 9,
    },
    toggleComposerBtn: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    toggleComposerText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    label: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.06)',
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
    },
    multiline: {
      minHeight: 86,
      textAlignVertical: 'top',
    },
    warn: {
      color: theme.mode === 'light' ? '#7b2f2f' : '#ffc8c3',
      fontSize: 12,
      fontWeight: '700',
      marginTop: -2,
    },
    uploadBtn: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      minHeight: 42,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    uploadBtnDisabled: {
      opacity: 0.65,
    },
    uploadBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 8,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    caption: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 18,
    },
    meta: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
    },
    url: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    tagPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.28)' : 'rgba(122, 92, 255, 0.3)',
      backgroundColor: theme.colors.accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    tagText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '700',
    },
    empty: {
      color: theme.colors.textMuted,
      textAlign: 'center',
      paddingVertical: 18,
    },
    loadMoreBtn: {
      marginTop: 6,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    loadMoreText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    footer: {
      color: theme.colors.textMuted,
      textAlign: 'center',
      fontSize: 12,
      paddingVertical: 12,
    },
  });

export default ArtistPostPanel;

