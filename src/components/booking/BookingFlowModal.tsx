import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { DummyArtist } from '../../data/dummyArtists';
import { evaluateSkinChecker, skinCheckerQuestions, type SkinCheckerFlag } from '../../data/skinChecker';
import { createBooking } from '../../services/bookings';
import type { TimeSlotId } from '../../types/app';
import GradientButton from '../ui/GradientButton';
import CalendarPickerModal from './CalendarPickerModal';

type BookingFlowModalProps = {
  visible: boolean;
  artist: DummyArtist | null;
  onClose: () => void;
};

type Step = 'gate' | 'skin' | 'result' | 'slot' | 'done';

const pad2 = (n: number) => `${n}`.padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const SLOT_OPTIONS: Array<{ id: TimeSlotId; label: string }> = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

const BookingFlowModal = ({ visible, artist, onClose }: BookingFlowModalProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [step, setStep] = useState<Step>('gate');
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flag, setFlag] = useState<SkinCheckerFlag>('GREEN');
  const [score, setScore] = useState(0);
  const [riskStatus, setRiskStatus] = useState<'safe' | 'warning' | 'unsafe'>('safe');
  const [riskNotes, setRiskNotes] = useState('');

  const [dateISO, setDateISO] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return toISODate(d);
  });
  const [slotId, setSlotId] = useState<TimeSlotId>('morning');
  const [busy, setBusy] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const reset = () => {
    setStep('gate');
    setQIndex(0);
    setAnswers({});
    setFlag('GREEN');
    setScore(0);
    setRiskStatus('safe');
    setRiskNotes('');
    const d = new Date();
    d.setDate(d.getDate() + 2);
    setDateISO(toISODate(d));
    setSlotId('morning');
    setBusy(false);
    setCalendarOpen(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  if (!artist) return null;

  const q = skinCheckerQuestions[qIndex];
  const isLast = qIndex === skinCheckerQuestions.length - 1;

  const moveDate = (delta: number) => {
    const [y, m, d] = dateISO.split('-').map((v) => Number(v));
    const next = new Date(y, m - 1, d);
    next.setDate(next.getDate() + delta);
    setDateISO(toISODate(next));
  };

  const continueAfterRisk = () => {
    if (riskStatus === 'safe') {
      setStep('slot');
      return;
    }

    const title = riskStatus === 'unsafe' ? 'High Risk Warning' : 'Skin Warning';
    const message =
      riskStatus === 'unsafe'
        ? 'AI flagged unsafe skin condition. Proceed only if you understand the risk and will consult the artist carefully.'
        : 'AI flagged moderate risk. Proceed only if you understand the precautions.';

    Alert.alert('Tatzo', `${title}\n\n${message}`, [
      { text: 'Go Back', style: 'cancel' },
      { text: 'I Understand, Continue', onPress: () => setStep('slot') },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Book Artist</Text>
          <Pressable onPress={close} style={styles.iconBtn}>
            <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
          </Pressable>
        </View>

        {step === 'gate' ? (
          <View style={styles.body}>
            <Text style={styles.h1}>Before booking</Text>
            <Text style={styles.p}>
              Please complete AI Skin Checker first. This helps the artist review your skin condition safely before approval.
            </Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{artist.name}</Text>
              <Text style={styles.cardSub}>
                {artist.location} | Starting from Rs. {artist.startingFrom ?? 0}+
              </Text>
            </View>
            <GradientButton title="Start AI Skin Checker" onPress={() => setStep('skin')} />
          </View>
        ) : null}

        {step === 'skin' ? (
          <View style={styles.body}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                Question {qIndex + 1}/{skinCheckerQuestions.length}
              </Text>
              <Text style={styles.progressText}>AI Skin Checker</Text>
            </View>
            <Text style={styles.h1}>{q.title}</Text>
            {q.help ? <Text style={styles.p}>{q.help}</Text> : null}

            <View style={styles.options}>
              {q.options.map((opt) => {
                const active = answers[q.id] === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    activeOpacity={0.9}
                    onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.navRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={qIndex === 0}
                onPress={() => setQIndex((i) => Math.max(0, i - 1))}
                style={[styles.secondaryBtn, qIndex === 0 && styles.btnDisabled]}
              >
                <Ionicons name="chevron-back" size={18} color={theme.colors.accent} />
                <Text style={styles.secondaryText}>Back</Text>
              </TouchableOpacity>
              <View style={styles.navGrow}>
                <GradientButton
                  title={isLast ? 'Get Result' : 'Next'}
                  disabled={!answers[q.id]}
                  onPress={() => {
                    if (!answers[q.id]) return;
                    if (!isLast) {
                      setQIndex((i) => i + 1);
                      return;
                    }

                    const evald = evaluateSkinChecker(answers);
                    setFlag(evald.flag);
                    setScore(evald.score);
                    setRiskStatus(evald.status);
                    setRiskNotes(evald.notes);
                    setStep('result');
                  }}
                  size="md"
                />
              </View>
            </View>
          </View>
        ) : null}

        {step === 'result' ? (
          <View style={styles.body}>
            <Text style={styles.h1}>AI Result</Text>
            <View
              style={[
                styles.flagCard,
                riskStatus === 'safe' ? styles.flagGreen : riskStatus === 'warning' ? styles.flagWarn : styles.flagRed,
              ]}
            >
              <Text style={styles.flagText}>{flag}</Text>
              <Text style={styles.flagSub}>Risk Score: {score}</Text>
            </View>

            <Text style={styles.p}>{riskNotes}</Text>

            {riskStatus === 'unsafe' ? (
              <Text style={styles.warnText}>Strong warning: consider dermatologist review before tattoo booking.</Text>
            ) : null}

            <View style={styles.navRow}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setStep('skin')} style={styles.secondaryBtn}>
                <Ionicons name="create-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.secondaryText}>Review Answers</Text>
              </TouchableOpacity>
              <View style={styles.navGrow}>
                <GradientButton
                  title={riskStatus === 'safe' ? 'Continue to Slot' : 'Continue with Warning'}
                  onPress={continueAfterRisk}
                  size="md"
                />
              </View>
            </View>
          </View>
        ) : null}

        {step === 'slot' ? (
          <View style={styles.body}>
            <Text style={styles.h1}>Booking Request</Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{artist.name}</Text>
              <Text style={styles.cardSub}>
                {artist.location} | Starting from Rs. {artist.startingFrom ?? 0}+
              </Text>
            </View>

            <View style={styles.dateRow}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => moveDate(-1)} style={styles.dateBtn}>
                <Ionicons name="chevron-back" size={18} color={theme.colors.accent} />
              </TouchableOpacity>
              <View style={styles.datePill}>
                <Text style={styles.dateText}>{dateISO}</Text>
              </View>
              <TouchableOpacity activeOpacity={0.9} onPress={() => moveDate(1)} style={styles.dateBtn}>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity activeOpacity={0.9} onPress={() => setCalendarOpen(true)} style={styles.calendarBtn}>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.calendarText}>Open calendar</Text>
            </TouchableOpacity>

            <View style={styles.slotRow}>
              {SLOT_OPTIONS.map((slot) => {
                const active = slotId === slot.id;
                return (
                  <TouchableOpacity
                    key={slot.id}
                    activeOpacity={0.9}
                    onPress={() => setSlotId(slot.id)}
                    style={[styles.slotBtn, active && styles.slotBtnActive]}
                  >
                    <Text style={[styles.slotText, active && styles.slotTextActive]}>{slot.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.p}>Artist will review this request first. Payment opens only after artist approval.</Text>

            <GradientButton
              title={busy ? 'Submitting...' : 'Submit Booking Request'}
              loading={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await createBooking({
                    artistId: artist.id,
                    artistUid: artist.id,
                    artistName: artist.name,
                    artistHandle: artist.handle,
                    location: artist.location,
                    dateISO,
                    slotId,
                    startingFrom: artist.startingFrom ?? 0,
                    depositAmount: 249,
                    aiSkinCheckStatus: riskStatus,
                    aiRiskScore: score,
                    aiSkinCheckNotes: riskNotes,
                    aiFlagForArtist: riskStatus !== 'safe',
                    skinAnswers: answers,
                  });
                  setStep('done');
                } catch (e: any) {
                  Alert.alert('Tatzo', e?.message ?? 'Could not create booking request.');
                } finally {
                  setBusy(false);
                }
              }}
            />

            <CalendarPickerModal
              visible={calendarOpen}
              initialDateISO={dateISO}
              onSelect={(next) => setDateISO(next)}
              onClose={() => setCalendarOpen(false)}
            />
          </View>
        ) : null}

        {step === 'done' ? (
          <View style={styles.body}>
            <Text style={styles.h1}>Request Submitted</Text>
            <Text style={styles.p}>
              Booking request submitted successfully. Artist approval is required before payment becomes available.
            </Text>
            <GradientButton title="Done" onPress={close} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 72,
      bottom: 14,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
      maxWidth: 520,
      alignSelf: 'center',
    },
    header: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    body: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    h1: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontFamily: theme.fonts.display,
    },
    p: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    warnText: {
      color: theme.mode === 'light' ? '#8b2d2d' : '#ffd3cf',
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 18,
    },
    card: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 6,
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    cardSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    secondaryText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    btnDisabled: {
      opacity: 0.6,
    },
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    progressText: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    options: {
      gap: 10,
    },
    option: {
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    optionActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: 'rgba(122, 92, 255, 0.3)',
    },
    optionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    optionTextActive: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
    navRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 2,
    },
    navGrow: {
      flex: 1,
    },
    flagCard: {
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
    },
    flagGreen: {
      borderColor: 'rgba(46, 160, 67, 0.35)',
      backgroundColor: 'rgba(46, 160, 67, 0.12)',
    },
    flagWarn: {
      borderColor: 'rgba(223, 170, 33, 0.4)',
      backgroundColor: 'rgba(223, 170, 33, 0.14)',
    },
    flagRed: {
      borderColor: 'rgba(232, 71, 63, 0.35)',
      backgroundColor: 'rgba(232, 71, 63, 0.12)',
    },
    flagText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    flagSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    dateBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    datePill: {
      flex: 1,
      borderRadius: 18,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    dateText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    calendarBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 18,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    calendarText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    slotRow: {
      flexDirection: 'row',
      gap: 8,
    },
    slotBtn: {
      flex: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 10,
      alignItems: 'center',
    },
    slotBtnActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.34)' : 'rgba(122, 92, 255, 0.44)',
    },
    slotText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    slotTextActive: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
  });

export default BookingFlowModal;
