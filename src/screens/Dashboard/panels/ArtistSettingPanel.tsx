import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import type { DealerRequestStatus, UserProfile } from '../../../types/app';
import { getUserProfile } from '../../../services/profile';
import { syncUserProfile } from '../../../services/userProfile';
import { submitDealerRequest } from '../../../services/dealerRequests';
import { signOutAndCleanup } from '../../../services/signout';
import GradientButton from '../../../components/ui/GradientButton';
import { db } from '../../../config/firebaseConfig';
import { syncArtistPostVisibilityForUid } from '../../../services/posts';
import { ARTIST_SUBSCRIPTION_AMOUNT_RUPEES, openRazorpayCheckoutForSubscription } from '../../../services/subscription';
import { pickSingleImageFromDevice, uploadPickedImage } from '../../../services/mediaUpload';

type ArtistSettingPanelProps = {
  header?: React.ReactNode;
};

type DealerDraft = {
  shopName: string;
  businessEmail: string;
  idProof: string;
  portfolioLink: string;
  upiId: string;
  bankDetails: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const csvToTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const casted = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof casted?.toMillis === 'function') return casted.toMillis();
  if (typeof casted?.seconds === 'number') return casted.seconds * 1000 + Math.floor((casted.nanoseconds ?? 0) / 1_000_000);
  return 0;
};

const statusCopy = (status: DealerRequestStatus | undefined, rejectReason?: string) => {
  if (status === 'approved') {
    return { title: 'Dealer request approved', message: 'You are now listed as an authorized seller profile.', tone: 'good' as const };
  }
  if (status === 'pending') {
    return { title: 'Dealer request pending', message: 'Admin review is in progress. We will notify you once completed.', tone: 'warn' as const };
  }
  if (status === 'rejected') {
    return {
      title: 'Dealer request rejected',
      message: rejectReason?.trim() ? `Reason: ${rejectReason.trim()}` : 'Please update details and re-apply.',
      tone: 'danger' as const,
    };
  }
  return { title: 'Not applied yet', message: 'Submit your request to become a dealer while staying an artist.', tone: 'muted' as const };
};

const ArtistSettingPanel = ({ header }: ArtistSettingPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const uid = auth.currentUser?.uid ?? '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingDealer, setSubmittingDealer] = useState(false);
  const [subscriptionOpening, setSubscriptionOpening] = useState(false);
  const [subscriptionRefreshing, setSubscriptionRefreshing] = useState(false);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(auth.currentUser?.email ?? '');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationArea, setLocationArea] = useState('');
  const [artistName, setArtistName] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [experience, setExperience] = useState('');
  const [stylesText, setStylesText] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [role, setRole] = useState<'user' | 'artist' | 'dealer'>('artist');
  const [verificationStatus, setVerificationStatus] = useState<'unsubmitted' | 'pending' | 'approved' | 'rejected'>('unsubmitted');

  const [subscriptionStatus, setSubscriptionStatus] = useState<'inactive' | 'active'>('inactive');
  const [subscriptionPaymentStatus, setSubscriptionPaymentStatus] = useState<'idle' | 'processing' | 'failed' | 'cancelled' | 'paid'>('idle');
  const [subscriptionVerificationStatus, setSubscriptionVerificationStatus] = useState<'pending' | 'verified' | 'failed'>('failed');
  const [subscriptionVerificationRequestedAt, setSubscriptionVerificationRequestedAt] = useState<unknown>(null);
  const [subscriptionPaidAt, setSubscriptionPaidAt] = useState<unknown>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState('tatzo_pro');
  const [payoutStatus, setPayoutStatus] = useState<'unconfigured' | 'pending' | 'ready'>('unconfigured');

  const [dealerStatus, setDealerStatus] = useState<DealerRequestStatus>('unsubmitted');
  const [dealerRejectReason, setDealerRejectReason] = useState('');
  const [dealerFormOpen, setDealerFormOpen] = useState(false);

  const [dealerDraft, setDealerDraft] = useState<DealerDraft>({
    shopName: '',
    businessEmail: '',
    idProof: '',
    portfolioLink: '',
    upiId: '',
    bankDetails: '',
  });

  useEffect(() => {
    if (!uid) return;

    let active = true;
    (async () => {
      setLoading(true);
      try {
        const profile = await getUserProfile(uid);
        if (!active) return;

        const p = (profile ?? {}) as UserProfile;
        setDisplayName(p.displayName ?? auth.currentUser?.displayName ?? '');
        setArtistName(String(p.artistName ?? p.displayName ?? auth.currentUser?.displayName ?? ''));
        setEmail(p.email ?? auth.currentUser?.email ?? '');
        setPhone(p.phone ?? '');
        setBio(p.bio ?? '');
        setLocationCity(p.locationCity ?? '');
        setLocationArea(p.locationArea ?? '');
        setStartingPrice(String(p.startingPrice ?? ''));
        setExperience(String(p.experience ?? ''));
        setStylesText(Array.isArray(p.styles) ? p.styles.join(', ') : '');
        setProfileImageUrl(String(p.profileImageUrl ?? ''));
        setRole((p.role ?? 'artist') as 'user' | 'artist' | 'dealer');
        setVerificationStatus((p.verificationStatus ?? 'unsubmitted') as 'unsubmitted' | 'pending' | 'approved' | 'rejected');
        setSubscriptionStatus((p.subscriptionStatus ?? 'inactive') as 'inactive' | 'active');
        setSubscriptionPaymentStatus((p.subscriptionPaymentStatus ?? 'idle') as 'idle' | 'processing' | 'failed' | 'cancelled' | 'paid');
        setSubscriptionVerificationStatus((p.subscriptionVerificationStatus ?? 'failed') as 'pending' | 'verified' | 'failed');
        setSubscriptionVerificationRequestedAt(p.subscriptionVerificationRequestedAt ?? null);
        setSubscriptionPaidAt(p.subscriptionPaidAt ?? null);
        setSubscriptionPlan(String(p.subscriptionPlan ?? 'tatzo_pro'));
        setPayoutStatus((p.payoutStatus ?? 'unconfigured') as 'unconfigured' | 'pending' | 'ready');
        setDealerStatus((p.dealerRequestStatus ?? 'unsubmitted') as DealerRequestStatus);
        setDealerRejectReason(String(p.dealerRejectReason ?? ''));
        setDealerDraft((prev) => ({
          ...prev,
          businessEmail: prev.businessEmail || String(p.email ?? auth.currentUser?.email ?? ''),
        }));
      } catch (e: any) {
        Alert.alert('Tatzo', e?.message ?? 'Could not load settings.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [uid]);

  const onSaveProfile = async () => {
    if (!uid || !auth.currentUser) return;
    if (uploadingProfileImage) {
      Alert.alert('Tatzo', 'Please wait. Profile image upload is still in progress.');
      return;
    }

    const name = displayName.trim();
    if (!name) {
      Alert.alert('Tatzo', 'Name is required.');
      return;
    }

    if (!locationCity.trim() || !locationArea.trim()) {
      Alert.alert('Tatzo', 'Location city and area are required.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name });
      const cleanArtistName = artistName.trim() || name;
      const cleanExperience = experience.trim();
      const cleanProfileImageUrl = profileImageUrl.trim();
      const parsedStyles = csvToTags(stylesText);
      const parsedStartingPrice = Number(startingPrice);
      const safeStartingPrice = Number.isFinite(parsedStartingPrice) && parsedStartingPrice > 0 ? Math.floor(parsedStartingPrice) : 0;

      await syncUserProfile(auth.currentUser, {
        displayName: name,
        artistName: cleanArtistName,
        phone: phone.trim(),
        bio: bio.trim(),
        locationCity: locationCity.trim(),
        locationArea: locationArea.trim(),
        location: `${locationArea.trim()}, ${locationCity.trim()}`,
        startingPrice: safeStartingPrice,
        experience: cleanExperience,
        styles: parsedStyles,
        profileImageUrl: cleanProfileImageUrl,
      });

      if (role === 'artist' && verificationStatus === 'approved') {
        await setDoc(
          doc(db, 'artists', uid),
          {
            uid,
            role: 'artist',
            artistName: cleanArtistName,
            displayName: name,
            locationCity: locationCity.trim(),
            locationArea: locationArea.trim(),
            location: `${locationArea.trim()}, ${locationCity.trim()}`,
            bio: bio.trim(),
            startingPrice: safeStartingPrice,
            startingFrom: safeStartingPrice,
            experience: cleanExperience,
            styles: parsedStyles,
            tags: parsedStyles,
            profileImageUrl: cleanProfileImageUrl,
            verificationStatus: 'approved',
            verifiedPro: true,
            isVisible: true,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
        await syncArtistPostVisibilityForUid(uid, 200);
      }
      Alert.alert('Tatzo', 'Profile updated.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const onSubmitDealer = async () => {
    if (!uid) return;

    const shopName = dealerDraft.shopName.trim();
    const businessEmail = dealerDraft.businessEmail.trim();
    const idProof = dealerDraft.idProof.trim();

    if (!locationCity.trim() || !locationArea.trim()) {
      Alert.alert('Tatzo', 'Set your location before dealer request.');
      return;
    }

    if (!shopName) {
      Alert.alert('Tatzo', 'Shop / Studio name is required.');
      return;
    }

    if (!businessEmail || !emailPattern.test(businessEmail)) {
      Alert.alert('Tatzo', 'Enter a valid email.');
      return;
    }

    if (!idProof) {
      Alert.alert('Tatzo', 'Aadhar / PAN is required.');
      return;
    }

    setSubmittingDealer(true);
    try {
      await submitDealerRequest({
        uid,
        shopName,
        businessEmail,
        idProof,
        portfolioLink: dealerDraft.portfolioLink.trim(),
        upiId: dealerDraft.upiId.trim(),
        bankDetails: dealerDraft.bankDetails.trim(),
        locationCity: locationCity.trim(),
        locationArea: locationArea.trim(),
        actorName: displayName.trim() || auth.currentUser?.displayName || 'Artist',
      });

      setDealerStatus('pending');
      setDealerRejectReason('');
      setDealerFormOpen(false);
      Alert.alert('Tatzo', 'Dealer request submitted.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not submit dealer request.');
    } finally {
      setSubmittingDealer(false);
    }
  };

  const dealer = statusCopy(dealerStatus, dealerRejectReason);
  const paidAtLabel = useMemo(() => {
    const ms = toMillis(subscriptionPaidAt);
    return ms ? new Date(ms).toLocaleString() : '';
  }, [subscriptionPaidAt]);
  const pendingTooLong = useMemo(() => {
    if (subscriptionStatus === 'active') return false;
    if (!(subscriptionPaymentStatus === 'processing' || subscriptionVerificationStatus === 'pending')) return false;
    const ms = toMillis(subscriptionVerificationRequestedAt);
    return ms > 0 && Date.now() - ms > 2 * 60 * 1000;
  }, [subscriptionStatus, subscriptionPaymentStatus, subscriptionVerificationStatus, subscriptionVerificationRequestedAt]);

  const activateSubscription = async () => {
    if (!uid || subscriptionOpening || subscriptionRefreshing) return;
    setSubscriptionOpening(true);
    try {
      await openRazorpayCheckoutForSubscription();
      Alert.alert('Tatzo', 'Opening Razorpay checkout for Pro plan payment.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not open payment checkout.');
    } finally {
      setSubscriptionOpening(false);
    }
  };

  const refreshSubscriptionStatus = async () => {
    if (!uid || subscriptionRefreshing) return;
    setSubscriptionRefreshing(true);
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const latest = (snap.data() ?? {}) as any;
      setSubscriptionStatus((latest?.subscriptionStatus ?? 'inactive') as 'inactive' | 'active');
      setSubscriptionPaymentStatus((latest?.subscriptionPaymentStatus ?? 'idle') as 'idle' | 'processing' | 'failed' | 'cancelled' | 'paid');
      setSubscriptionVerificationStatus((latest?.subscriptionVerificationStatus ?? 'failed') as 'pending' | 'verified' | 'failed');
      setSubscriptionVerificationRequestedAt(latest?.subscriptionVerificationRequestedAt ?? null);
      setSubscriptionPaidAt(latest?.subscriptionPaidAt ?? null);

      if (latest?.subscriptionStatus === 'active') {
        Alert.alert('Tatzo', 'Pro Active confirmed.');
      } else if (latest?.subscriptionPaymentStatus === 'processing' || latest?.subscriptionVerificationStatus === 'pending') {
        Alert.alert('Tatzo', 'Payment is still verifying. Try refresh again in a moment.');
      } else if (latest?.subscriptionPaymentStatus === 'failed' || latest?.subscriptionPaymentStatus === 'cancelled') {
        Alert.alert('Tatzo', 'Payment was not completed. Use Retry Payment.');
      } else {
        Alert.alert('Tatzo', 'Subscription is inactive. Activate Pro to publish posts.');
      }
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not refresh subscription status.');
    } finally {
      setSubscriptionRefreshing(false);
    }
  };

  const subscriptionActionLabel = useMemo(() => {
    if (subscriptionStatus === 'active') return 'Pro Active';
    if (subscriptionOpening) return 'Opening Checkout...';
    if (subscriptionPaymentStatus === 'processing' || subscriptionVerificationStatus === 'pending') return 'Verifying Payment...';
    if (subscriptionPaymentStatus === 'failed' || subscriptionPaymentStatus === 'cancelled') return 'Retry Payment';
    return 'Activate Pro';
  }, [subscriptionStatus, subscriptionOpening, subscriptionPaymentStatus, subscriptionVerificationStatus]);

  const disableSubscriptionAction =
    subscriptionOpening ||
    subscriptionRefreshing ||
    subscriptionStatus === 'active' ||
    subscriptionPaymentStatus === 'processing' ||
    subscriptionVerificationStatus === 'pending';

  const onPickAndUploadProfileImage = async () => {
    if (!uid || uploadingProfileImage || saving) return;
    try {
      setUploadingProfileImage(true);
      const picked = await pickSingleImageFromDevice();
      if (!picked) return;

      const uploaded = await uploadPickedImage({
        uri: picked.uri,
        fileName: picked.name,
        mimeType: picked.mimeType,
        folderPath: `artists/${uid}/profile`,
      });
      setProfileImageUrl(uploaded.downloadUrl);
      Alert.alert('Tatzo', 'Profile image uploaded.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setUploadingProfileImage(false);
    }
  };

  return (
    <FlatList
      data={[{ key: 'content' }]}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.headWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Settings</Text>
            <Text style={styles.sectionBadge}>Artist</Text>
          </View>
        </View>
      }
      renderItem={() => (
        <View style={styles.stack}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Profile</Text>
            {loading ? <Text style={styles.hint}>Loading...</Text> : null}

            <Text style={styles.label}>Name</Text>
            <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} />

            <Text style={styles.label}>Email</Text>
            <TextInput value={email} editable={false} style={[styles.input, styles.inputDisabled]} />

            <Text style={styles.label}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" />

            <Text style={styles.label}>Bio</Text>
            <TextInput value={bio} onChangeText={setBio} style={[styles.input, styles.multiline]} multiline />

            <Text style={styles.label}>Artist Name</Text>
            <TextInput value={artistName} onChangeText={setArtistName} style={styles.input} />

            <Text style={styles.label}>Location City</Text>
            <TextInput value={locationCity} onChangeText={setLocationCity} style={styles.input} />

            <Text style={styles.label}>Location Area</Text>
            <TextInput value={locationArea} onChangeText={setLocationArea} style={styles.input} />

            <Text style={styles.label}>Starting Price</Text>
            <TextInput value={startingPrice} onChangeText={setStartingPrice} style={styles.input} keyboardType="numeric" />

            <Text style={styles.label}>Experience</Text>
            <TextInput
              value={experience}
              onChangeText={setExperience}
              style={styles.input}
              placeholder="ex: 4 years"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={styles.label}>Styles / Tags (optional)</Text>
            <TextInput
              value={stylesText}
              onChangeText={setStylesText}
              style={styles.input}
              placeholder="fineline, blackwork, realism"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={styles.label}>Profile Image URL (optional)</Text>
            <TextInput
              value={profileImageUrl}
              onChangeText={setProfileImageUrl}
              style={styles.input}
              autoCapitalize="none"
              placeholder="https://..."
              placeholderTextColor={theme.colors.textMuted}
            />
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.uploadBtn, uploadingProfileImage && styles.uploadBtnDisabled]}
              onPress={onPickAndUploadProfileImage}
              disabled={uploadingProfileImage || saving}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.accentStrong} />
              <Text style={styles.uploadBtnText}>{uploadingProfileImage ? 'Uploading image...' : 'Upload from device'}</Text>
            </TouchableOpacity>

            <GradientButton title={saving ? 'Saving...' : 'Save profile'} loading={saving} onPress={onSaveProfile} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pro & Subscription</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Plan</Text>
              <Text style={styles.infoValue}>TATZO PRO - Rs. {ARTIST_SUBSCRIPTION_AMOUNT_RUPEES} / month</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Subscription</Text>
              <Text style={styles.infoValue}>{subscriptionStatus.toUpperCase()}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Payment</Text>
              <Text style={styles.infoValue}>{subscriptionPaymentStatus.toUpperCase()}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Verification</Text>
              <Text style={styles.infoValue}>{subscriptionVerificationStatus.toUpperCase()}</Text>
            </View>
            {subscriptionStatus === 'active' && paidAtLabel ? <Text style={styles.goodLine}>Pro Active - Paid on {paidAtLabel}</Text> : null}
            {subscriptionStatus !== 'active' && (subscriptionPaymentStatus === 'processing' || subscriptionVerificationStatus === 'pending') ? (
              <Text style={pendingTooLong ? styles.warnLine : styles.infoLine}>
                {pendingTooLong ? 'Still verifying. Try refresh or contact support.' : 'Verifying payment...'}
              </Text>
            ) : null}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Payout status</Text>
              <Text style={styles.infoValue}>{payoutStatus.toUpperCase()}</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.refreshBtn, subscriptionRefreshing && styles.refreshBtnDisabled]}
              disabled={subscriptionRefreshing}
              onPress={refreshSubscriptionStatus}
            >
              <Text style={styles.refreshText}>{subscriptionRefreshing ? 'Refreshing...' : 'Refresh status'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.ctaBtn, disableSubscriptionAction && styles.ctaBtnDisabled]}
              disabled={disableSubscriptionAction}
              onPress={activateSubscription}
            >
              <Text style={styles.ctaText}>{subscriptionActionLabel}</Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.dealerCard,
              dealer.tone === 'good' ? styles.dealerGood : dealer.tone === 'warn' ? styles.dealerWarn : dealer.tone === 'danger' ? styles.dealerDanger : null,
            ]}
          >
            <View style={styles.dealerHead}>
              <Ionicons name="storefront-outline" size={18} color={theme.colors.accentStrong} />
              <Text style={styles.dealerTitle}>Become a Dealer</Text>
            </View>
            <Text style={styles.dealerState}>{dealer.title}</Text>
            <Text style={styles.dealerSub}>{dealer.message}</Text>

            {dealerStatus !== 'pending' ? (
              <TouchableOpacity style={styles.dealerCta} onPress={() => setDealerFormOpen((s) => !s)} activeOpacity={0.9}>
                <Text style={styles.dealerCtaText}>{dealerFormOpen ? 'Hide form' : 'Open dealer request form'}</Text>
              </TouchableOpacity>
            ) : null}

            {dealerFormOpen ? (
              <View style={styles.dealerForm}>
                <Text style={styles.label}>Shop / Studio Name</Text>
                <TextInput value={dealerDraft.shopName} onChangeText={(v) => setDealerDraft((d) => ({ ...d, shopName: v }))} style={styles.input} />

                <Text style={styles.label}>Business Email</Text>
                <TextInput
                  value={dealerDraft.businessEmail}
                  onChangeText={(v) => setDealerDraft((d) => ({ ...d, businessEmail: v }))}
                  style={styles.input}
                  autoCapitalize="none"
                />

                <Text style={styles.label}>Aadhar / PAN</Text>
                <TextInput value={dealerDraft.idProof} onChangeText={(v) => setDealerDraft((d) => ({ ...d, idProof: v }))} style={styles.input} />

                <Text style={styles.label}>Portfolio Link (optional)</Text>
                <TextInput
                  value={dealerDraft.portfolioLink}
                  onChangeText={(v) => setDealerDraft((d) => ({ ...d, portfolioLink: v }))}
                  style={styles.input}
                  autoCapitalize="none"
                />

                <Text style={styles.label}>UPI ID (optional)</Text>
                <TextInput value={dealerDraft.upiId} onChangeText={(v) => setDealerDraft((d) => ({ ...d, upiId: v }))} style={styles.input} />

                <Text style={styles.label}>Bank Details (optional)</Text>
                <TextInput
                  value={dealerDraft.bankDetails}
                  onChangeText={(v) => setDealerDraft((d) => ({ ...d, bankDetails: v }))}
                  style={[styles.input, styles.multiline]}
                  multiline
                />

                <GradientButton
                  title={submittingDealer ? 'Submitting...' : 'Submit dealer request'}
                  loading={submittingDealer}
                  onPress={onSubmitDealer}
                />
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.signOutBtn, styles.dealerDanger]}
            onPress={() => {
              Alert.alert('Tatzo', 'Sign out?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign out',
                  style: 'destructive',
                  onPress: () => {
                    void signOutAndCleanup({ deleteProfile: false });
                  },
                },
              ]);
            }}
          >
            <Ionicons name="log-out-outline" size={18} color={theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf'} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 120,
    },
    headWrap: {
      gap: 12,
      marginBottom: 12,
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
    stack: {
      gap: 12,
    },
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 8,
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
      marginBottom: 4,
    },
    label: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.06)',
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
    },
    inputDisabled: {
      opacity: 0.7,
    },
    multiline: {
      minHeight: 82,
      textAlignVertical: 'top',
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
    hint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.04)',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    infoLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    infoValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    infoLine: {
      color: theme.mode === 'light' ? '#2f4c7b' : '#b8d5ff',
      fontSize: 12,
      fontWeight: '700',
    },
    goodLine: {
      color: theme.mode === 'light' ? '#2f6a3b' : '#b3ffd2',
      fontSize: 12,
      fontWeight: '700',
    },
    warnLine: {
      color: theme.mode === 'light' ? '#7b2f2f' : '#ffc8c3',
      fontSize: 12,
      fontWeight: '700',
    },
    ctaBtn: {
      marginTop: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.35)' : 'rgba(122, 92, 255, 0.45)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.14)' : 'rgba(122, 92, 255, 0.2)',
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    ctaBtnDisabled: {
      opacity: 0.68,
    },
    ctaText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    refreshBtn: {
      marginTop: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.06)',
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    refreshBtnDisabled: {
      opacity: 0.7,
    },
    refreshText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.35,
      textTransform: 'uppercase',
    },
    dealerCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : theme.colors.surface,
      padding: 12,
      gap: 8,
    },
    dealerHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    dealerTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    dealerState: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    dealerSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    dealerCta: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.35)' : 'rgba(122, 92, 255, 0.4)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.14)' : theme.colors.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    dealerCtaText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    dealerForm: {
      gap: 8,
      marginTop: 2,
    },
    dealerGood: {
      borderColor: theme.mode === 'light' ? 'rgba(25, 135, 84, 0.45)' : 'rgba(25, 135, 84, 0.5)',
      backgroundColor: theme.mode === 'light' ? 'rgba(25, 135, 84, 0.1)' : 'rgba(25, 135, 84, 0.14)',
    },
    dealerWarn: {
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.45)' : 'rgba(122, 92, 255, 0.5)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.1)' : 'rgba(122, 92, 255, 0.14)',
    },
    dealerDanger: {
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.45)' : 'rgba(255, 211, 207, 0.4)',
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.12)' : 'rgba(142, 75, 69, 0.22)',
    },
    signOutBtn: {
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center',
    },
    signOutText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
      fontSize: 13,
      fontWeight: '900',
    },
  });

export default ArtistSettingPanel;





