import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';
import { auth, db } from '../../config/firebaseConfig';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import TopBar from '../../components/navigation/TopBar';
import NotificationsModal from '../../components/notifications/NotificationsModal';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { NotificationDoc } from '../../types/app';
import ArtistBottomNavigation, { ArtistNavKey } from '../../components/navigation/ArtistBottomNavigation';
import ArtistBookingsPanel from './panels/ArtistBookingsPanel';
import ArtistAcademyPanel from './panels/ArtistAcademyPanel';
import ArtistPostPanel from './panels/ArtistPostPanel';
import ArtistShopPanel from './panels/ArtistShopPanel';
import SocioFeedPanel from './panels/SocioFeedPanel';
import ArtistSettingPanel from './panels/ArtistSettingPanel';
import { syncArtistPostVisibilityForUid } from '../../services/posts';
import { createTodayBookingReminders } from '../../services/bookings';

const ArtistDashboardScreen = () => {
  const { theme, toggleMode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeTab, setActiveTab] = useState<ArtistNavKey>('home');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    void syncArtistPostVisibilityForUid(uid).catch(() => {
      // best-effort sync only
    });
    void createTodayBookingReminders({ uid, role: 'artist' }).catch(() => {
      // best-effort reminder generation only
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const unreadQuery = query(collection(db, 'users', uid, 'notifications'), where('read', '==', false));
    const unsub = onSnapshot(
      unreadQuery,
      (snap) => {
        setUnreadCount(snap.size);
      },
      () => {
        setUnreadCount(0);
      },
    );

    return () => unsub();
  }, [uid]);
  const title = useMemo(() => {
    if (activeTab === 'home') return 'Socio Feed';
    if (activeTab === 'booking') return 'Booking Requests';
    if (activeTab === 'post') return 'Create Post';
    if (activeTab === 'academy') return 'Academy';
    return 'Shop';
  }, [activeTab]);

  const handleNotificationPress = (item: NotificationDoc) => {
    const type = String(item.type ?? '');
    if (
      type === 'booking_requested' ||
      type === 'booking_artist_approved_payment_pending' ||
      type === 'booking_confirmed' ||
      type === 'booking_rejected' ||
      type === 'booking_reminder' ||
      type === 'payment_success'
    ) {
      setActiveTab('booking');
      setNotificationsOpen(false);
      return;
    }

    if (type === 'like' || type === 'follow' || type === 'post_created') {
      setActiveTab('home');
      setNotificationsOpen(false);
      return;
    }

    setNotificationsOpen(false);
    Alert.alert('Tatzo', 'This notification route opens soon.');
  };
  const header = (
    <TopBar
      title={title}
      onToggleTheme={toggleMode}
      onPressAlerts={() => setNotificationsOpen(true)}
      onPressProfile={() => setProfileOpen(true)}
      showThemeToggle
      showProfile
      notificationCount={unreadCount}
    />
  );



  return (
    <SafeAreaContextView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
        <NotificationsModal visible={notificationsOpen} uid={uid} onClose={() => setNotificationsOpen(false)} onPressItem={handleNotificationPress} />
        <Modal visible={profileOpen} animationType="slide" onRequestClose={() => setProfileOpen(false)}>
          <SafeAreaView style={styles.profileSafeArea}>
            <LinearGradient colors={theme.gradients.canvas} style={styles.profileContainer}>
              <ArtistSettingPanel
                header={
                  <View style={styles.profileHeader}>
                    <Text style={styles.profileTitle}>Profile</Text>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => setProfileOpen(false)} style={styles.profileClose}>
                      <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                    </TouchableOpacity>
                  </View>
                }
              />
            </LinearGradient>
          </SafeAreaView>
        </Modal>

        {activeTab === 'home' ? <SocioFeedPanel header={header} /> : null}

        {activeTab === 'booking' ? <ArtistBookingsPanel header={header} /> : null}
        {activeTab === 'post' ? <ArtistPostPanel header={header} onRequireSubscription={() => setProfileOpen(true)} /> : null}
        {activeTab === 'academy' ? <ArtistAcademyPanel header={header} /> : null}
        {activeTab === 'shop' ? <ArtistShopPanel header={header} onOpenPost={() => setActiveTab('post')} /> : null}

        <ArtistBottomNavigation activeKey={activeTab} onChange={setActiveTab} />
      </LinearGradient>
    </SafeAreaContextView>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
    },
    profileSafeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    profileContainer: {
      flex: 1,
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 6,
    },
    profileTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    profileClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
    },
    heroCard: {
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginHorizontal: 18,
      marginTop: 2,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 6,
    },
    heroTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 24,
      lineHeight: 30,
      fontFamily: theme.fonts.display,
    },
    heroBody: {
      color: theme.mode === 'light' ? theme.colors.textMuted : 'rgba(245, 247, 250, 0.82)',
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
  });

export default ArtistDashboardScreen;

