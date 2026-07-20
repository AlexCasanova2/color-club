import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

export type MenuTab = 'clubs' | 'activity' | 'friends' | 'account';

const tabs: Array<{ id: MenuTab; label: string; icon: keyof typeof Ionicons.glyphMap; selectedIcon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'clubs', label: 'Clubs', icon: 'home-outline', selectedIcon: 'home' },
  { id: 'activity', label: 'Actividad', icon: 'pulse-outline', selectedIcon: 'pulse' },
  { id: 'friends', label: 'Amigos', icon: 'people-outline', selectedIcon: 'people' },
  { id: 'account', label: 'Cuenta', icon: 'person-outline', selectedIcon: 'person' },
];

export function FloatingMenu({ active, onSelect }: { active: MenuTab; onSelect: (tab: MenuTab) => void }) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [menuWidth, setMenuWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const activeIndex = tabs.findIndex((tab) => tab.id === active);
  const itemWidth = menuWidth > 0 ? (menuWidth - 12) / tabs.length : 0;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (!itemWidth) return;
    Animated.spring(translateX, {
      toValue: activeIndex * itemWidth,
      damping: 18,
      mass: 0.75,
      stiffness: 170,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, itemWidth, translateX]);

  if (keyboardVisible) return null;

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.layer}>
      <View accessibilityRole="tablist" onLayout={(event) => setMenuWidth(event.nativeEvent.layout.width)} style={styles.menu}>
        {itemWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.selection,
              { width: itemWidth, transform: [{ translateX }] },
            ]}
          />
        )}
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onSelect(tab.id)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Ionicons color={selected ? colors.ink : colors.white} name={selected ? tab.selectedIcon : tab.icon} size={20} />
              <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 14, right: 14, bottom: 4 },
  menu: {
    height: 72,
    padding: 6,
    flexDirection: 'row',
    backgroundColor: colors.ink,
    borderRadius: 30,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  item: { flex: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 2 },
  selection: { position: 'absolute', left: 6, top: 6, bottom: 6, borderRadius: 24, backgroundColor: colors.white },
  pressed: { opacity: 0.65 },
  label: { color: colors.white, fontSize: 10, lineHeight: 13, fontWeight: '600' },
  labelSelected: { color: colors.ink },
});
