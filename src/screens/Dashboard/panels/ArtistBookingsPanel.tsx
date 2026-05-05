import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import type { AiSkinCheckStatus, BookingModel, BookingStatus } from '../../../types/app';
import GradientButton from '../../../components/ui/GradientButton';
import { artistApproveBooking, artistCompleteBooking, artistRejectBooking } from '../../../services/bookings';

type ArtistBookingsPanelProps = {
  header?: React.ReactNode;
};

type FilterKey = 'all' | BookingStatus;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending_artist_approval', label: 'Pending' },
  { key: 'artist_approved_payment_pending', label: 'Pay Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'payment_failed', label: 'Pay Failed' },
  { key: 'payment_timeout', label: 'Pay Timeout' },
];

const statusTone = (status: BookingStatus | string) => {
  if (status === 'pending_artist_approval') return 'warn';
  if (status === 'artist_approved_payment_pending') return 'accent';
  if (status === 'confirmed') return 'good';
  if (status === 'completed') return 'good';
  if (status === 'payment_failed' || status === 'payment_timeout') return 'warn';
  if (status === 'rejected' || status === 'cancelled') return 'danger';
  return 'muted';
};

const aiTone = (ai: AiSkinCheckStatus | string) => {
  if (ai === 'unsafe') return 'danger';
  if (ai === 'warning') return 'warn';
  if (ai === 'safe') return 'good';
  return 'muted';
};

const slotLabel = (slotId?: string) => {
  if (slotId === 'morning') return 'Morning';
  if (slotId === 'afternoon') return 'Afternoon';
  if (slotId === 'evening') return 'Evening';
  return 'Slot N/A';
};

const bookingStatusLabel = (status?: string) => String(status ?? '').replace(/_/g, ' ').toUpperCase();

const ArtistBookingsPanel = ({ header }: ArtistBookingsPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const useStackedActions = width < 390;

  const uid = auth.currentUser?.uid ?? '';

  const [rows, setRows] = useState<BookingModel[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [detail, setDetail] = useState<BookingModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;

    const byUid = query(collection(db, 'bookings'), where('artistUid', '==', uid));
    const unsub = onSnapshot(
      byUid,
      (snap) => {
        setLoadError(null);
        setLoading(false);
        setRows((prev) => {
          const map = new Map<string, BookingModel>();
          prev.forEach((r) => map.set(r.id, r));
          snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...(d.data() as any) } as BookingModel));
          return Array.from(map.values()).sort((a, b) => String(b.dateISO ?? '').localeCompare(String(a.dateISO ?? '')));
        });
      },
      () => {
        setLoadError('Something went wrong. Try again.');
        setLoading(false);
        setRows([]);
      },
    );

    return () => unsub();
  }, [uid]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const onAccept = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await artistApproveBooking(detail.id);
      setDetail((prev) => (prev ? { ...prev, status: 'artist_approved_payment_pending' } : prev));
      Alert.alert('Tatzo', 'Booking approved. User can now pay deposit.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not approve booking.');
    } finally {
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!detail) return;
    const reason = detail.aiSkinCheckStatus === 'unsafe' ? 'AI unsafe flag. Please consult dermatologist first.' : '';
    setBusy(true);
    try {
      await artistRejectBooking(detail.id, reason);
      setDetail((prev) => (prev ? { ...prev, status: 'rejected' } : prev));
      Alert.alert('Tatzo', 'Booking rejected and slot released.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not reject booking.');
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await artistCompleteBooking(detail.id);
      setDetail((prev) => (prev ? { ...prev, status: 'completed' } : prev));
      Alert.alert('Tatzo', 'Session marked as completed.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not complete booking.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {header ? <View style={styles.headerWrap}>{header}</View> : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Booking Requests</Text>
        <Text style={styles.sectionBadge}>{filtered.length}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow} style={styles.filtersList}>
        {FILTERS.map((item) => {
          const active = item.key === filter;
          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.9}
              onPress={() => setFilter(item.key)}
              style={[styles.filterPill, active && styles.filterPillActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? 'Loading bookings...' : loadError ? loadError : 'No bookings for this filter.'}
          </Text>
        }
        renderItem={({ item }) => {
          const sTone = statusTone(item.status);
          const aTone = aiTone(item.aiSkinCheckStatus);
          return (
            <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => setDetail(item)}>
              <View style={styles.cardTop}>
                <Text style={styles.name}>{item.userName ?? item.userEmail ?? 'Client'}</Text>
                <View
                  style={[
                    styles.statusPill,
                    sTone === 'good'
                      ? styles.statusGood
                      : sTone === 'warn'
                        ? styles.statusWarn
                        : sTone === 'danger'
                          ? styles.statusDanger
                          : sTone === 'accent'
                            ? styles.statusAccent
                            : styles.statusMuted,
                  ]}
                >
                  <Text style={styles.statusText}>{bookingStatusLabel(item.status)}</Text>
                </View>
              </View>

              <Text style={styles.meta}>{item.dateISO ?? '-'} | {slotLabel(item.slotId)} | Rs. {item.depositAmount ?? 249}</Text>

              <View
                style={[
                  styles.aiPill,
                  aTone === 'good' ? styles.statusGood : aTone === 'warn' ? styles.statusWarn : aTone === 'danger' ? styles.statusDanger : styles.statusMuted,
                ]}
              >
                <Ionicons name="medkit-outline" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                <Text style={styles.aiText}>AI: {String(item.aiSkinCheckStatus ?? 'not_checked').toUpperCase()}</Text>
                <Text style={styles.aiText}>Score: {Number(item.aiRiskScore ?? 0)}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={Boolean(detail)} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDetail(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Booking Detail</Text>
            <Pressable onPress={() => setDetail(null)} style={styles.iconBtn}>
              <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </Pressable>
          </View>

          {detail ? (
            <View style={styles.sheetBody}>
              <Text style={styles.detailName}>{detail.userName ?? detail.userEmail ?? 'Client'}</Text>
              <Text style={styles.detailLine}>Date: {detail.dateISO ?? '-'} | {slotLabel(detail.slotId)}</Text>
              <Text style={styles.detailLine}>Status: {bookingStatusLabel(detail.status)}</Text>
              <Text style={styles.detailLine}>Location: {detail.location ?? '-'}</Text>

              <View style={styles.aiCard}>
                <Text style={styles.aiCardTitle}>AI Skin Check</Text>
                <Text style={styles.detailLine}>Status: {String(detail.aiSkinCheckStatus ?? 'not_checked').toUpperCase()}</Text>
                <Text style={styles.detailLine}>Risk score: {Number(detail.aiRiskScore ?? 0)}</Text>
                <Text style={styles.detailLine}>Notes: {detail.aiSkinCheckNotes ?? '-'}</Text>
                <Text style={styles.detailLine}>Flag for artist: {detail.aiFlagForArtist ? 'YES' : 'NO'}</Text>
              </View>

              <View style={[styles.actionsRow, useStackedActions && styles.actionsRowStacked]}>
                {detail.status === 'pending_artist_approval' ? (
                  <>
                    <TouchableOpacity
                      style={[styles.secondaryBtn, useStackedActions && styles.secondaryBtnStacked]}
                      onPress={onReject}
                      disabled={busy}
                    >
                      <Text style={styles.secondaryText}>{busy ? '...' : 'Reject'}</Text>
                    </TouchableOpacity>
                    <View style={[styles.primaryGrow, useStackedActions && styles.primaryGrowStacked]}>
                      <GradientButton title={busy ? 'Approving...' : 'Accept'} loading={busy} onPress={onAccept} />
                    </View>
                  </>
                ) : null}

                {detail.status === 'confirmed' ? (
                  <View style={[styles.primaryGrow, useStackedActions && styles.primaryGrowStacked]}>
                    <GradientButton title={busy ? 'Updating...' : 'Mark Completed'} loading={busy} onPress={onComplete} />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    headerWrap: {
      gap: 12,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 8,
      paddingTop: 4,
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
    filtersRow: {
      paddingHorizontal: 16,
      gap: 8,
      paddingBottom: 8,
      alignItems: 'center',
      minHeight: 40,
    },
    filtersList: {
      maxHeight: 44,
      minHeight: 44,
      marginBottom: 2,
    },
    filterPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      height: 34,
      justifyContent: 'center',
      alignSelf: 'center',
    },
    filterPillActive: {
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.32)' : 'rgba(122, 92, 255, 0.35)',
      backgroundColor: theme.colors.accentSoft,
    },
    filterText: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    filterTextActive: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 120,
      gap: 10,
    },
    empty: {
      color: theme.colors.textMuted,
      textAlign: 'center',
      paddingVertical: 18,
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
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    name: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    meta: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      flexWrap: 'wrap',
    },
    statusPill: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 5,
      maxWidth: '56%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusMuted: {
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
    },
    statusWarn: {
      borderColor: theme.mode === 'light' ? 'rgba(216, 157, 32, 0.45)' : 'rgba(216, 157, 32, 0.5)',
      backgroundColor: theme.mode === 'light' ? 'rgba(216, 157, 32, 0.12)' : 'rgba(216, 157, 32, 0.18)',
    },
    statusGood: {
      borderColor: theme.mode === 'light' ? 'rgba(22, 153, 90, 0.45)' : 'rgba(22, 153, 90, 0.5)',
      backgroundColor: theme.mode === 'light' ? 'rgba(22, 153, 90, 0.1)' : 'rgba(22, 153, 90, 0.16)',
    },
    statusDanger: {
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.45)' : 'rgba(255, 211, 207, 0.4)',
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.1)' : 'rgba(142, 75, 69, 0.22)',
    },
    statusAccent: {
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.42)' : 'rgba(122, 92, 255, 0.48)',
      backgroundColor: theme.colors.accentSoft,
    },
    statusText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.6,
      textAlign: 'center',
    },
    aiPill: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      flexWrap: 'wrap',
    },
    aiText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 96,
      bottom: 14,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
      maxWidth: 560,
      alignSelf: 'center',
    },
    sheetHeader: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    sheetTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
    },
    sheetBody: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 10,
    },
    detailName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '900',
    },
    detailLine: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    aiCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 10,
      gap: 6,
      marginTop: 2,
    },
    aiCardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    actionsRowStacked: {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    secondaryBtn: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 13,
      minWidth: 96,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnStacked: {
      width: '100%',
    },
    secondaryText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    primaryGrow: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
    },
    primaryGrowStacked: {
      width: '100%',
      flex: 0,
    },
  });

export default ArtistBookingsPanel;
