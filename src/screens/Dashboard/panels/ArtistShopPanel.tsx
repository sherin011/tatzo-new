import React, { useMemo } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import { signOutAndCleanup } from '../../../services/signout';

type ArtistShopPanelProps = {
  header?: React.ReactNode;
  onOpenPost?: () => void;
};

const ArtistShopPanel = ({ header }: ArtistShopPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <FlatList
      data={[{ key: 'shop' }]}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.wrap}
      ListHeaderComponent={header ? <View style={styles.externalHeader}>{header}</View> : null}
      renderItem={() => (
        <View style={styles.stack}>
          <Text style={styles.title}>Shop</Text>
          <Text style={styles.sub}>B2B catalog and supplies for artists. Subscription controls are in Profile.</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dealer Catalog</Text>
            <Text style={styles.line}>Needles and cartridges</Text>
            <Text style={styles.line}>Studio inks and aftercare</Text>
            <Text style={styles.line}>Stencil and setup kits</Text>
            <Text style={styles.hint}>Product ordering flow can be wired next in this tab.</Text>
          </View>

          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => {
              Alert.alert('Tatzo', 'Sign out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => void signOutAndCleanup({ deleteProfile: false }) },
              ]);
            }}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      )}
      showsVerticalScrollIndicator={false}
    />
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    wrap: {
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 120,
    },
    externalHeader: {
      marginBottom: 12,
    },
    stack: {
      gap: 12,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontFamily: theme.fonts.display,
    },
    sub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
      marginTop: -2,
    },
    card: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 8,
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    line: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    hint: {
      color: theme.mode === 'light' ? '#2f4c7b' : '#b8d5ff',
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },
    signOutBtn: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.45)' : 'rgba(255, 211, 207, 0.4)',
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.12)' : 'rgba(142, 75, 69, 0.22)',
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    signOutText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
      fontSize: 13,
      fontWeight: '900',
    },
  });

export default ArtistShopPanel;
