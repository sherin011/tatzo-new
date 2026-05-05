import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type TopBarProps = {
  title: string;
  onToggleTheme?: () => void;
  onPressAlerts: () => void;
  onPressProfile?: () => void;
  showThemeToggle?: boolean;
  showProfile?: boolean;
  notificationCount?: number;
};

const TopBar = ({
  title,
  onToggleTheme,
  onPressAlerts,
  onPressProfile,
  showThemeToggle = true,
  showProfile = true,
  notificationCount = 0,
}: TopBarProps) => {
  const { theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const iconColor = theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse;
  const safeCount = Math.max(0, Number(notificationCount || 0));

  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {showThemeToggle ? (
          <TouchableOpacity activeOpacity={0.85} onPress={onToggleTheme} style={styles.iconButton} hitSlop={10}>
            <Ionicons
              name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
              size={18}
              color={iconColor}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconSpacer} />
        )}
      </View>

      <View style={styles.center}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>

      <View style={[styles.side, styles.sideRight]}>
        <TouchableOpacity activeOpacity={0.85} onPress={onPressAlerts} style={styles.iconButton} hitSlop={10}>
          <Ionicons name="notifications-outline" size={18} color={iconColor} />
          {safeCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{safeCount > 99 ? '99+' : String(safeCount)}</Text></View> : null}
        </TouchableOpacity>
        {showProfile ? (
          <TouchableOpacity activeOpacity={0.85} onPress={onPressProfile} style={styles.iconButton} hitSlop={10}>
            <Ionicons name="person-outline" size={18} color={iconColor} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 18,
      paddingTop: Platform.OS === 'android' ? 12 : 12,
      paddingBottom: 8,
    },
    side: {
      width: 96,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    sideRight: {
      justifyContent: 'flex-end',
    },
    center: {
      flex: 1,
      alignItems: 'center',
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    iconSpacer: {
      width: 42,
      height: 42,
    },
    badge: {
      position: 'absolute',
      right: -2,
      top: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentStrong,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? '#ffffff' : 'rgba(11, 11, 15, 0.9)',
    },
    badgeText: {
      color: theme.mode === 'light' ? '#0b0b0f' : '#0b0b0f',
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
  });

export default TopBar;
