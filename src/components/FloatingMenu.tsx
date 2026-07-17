import { useEffect, useState } from 'react';
import { Keyboard, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

export type MenuTab = 'clubs' | 'activity' | 'account';

const tabs: Array<{ id: MenuTab; label: string; mark: string }> = [
  { id: 'clubs', label: 'Clubs', mark: '○' },
  { id: 'activity', label: 'Actividad', mark: '◇' },
  { id: 'account', label: 'Cuenta', mark: '□' },
];

export function FloatingMenu({ active, onSelect }: { active: MenuTab; onSelect: (tab: MenuTab) => void }) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (keyboardVisible) return null;

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.layer}>
      <View accessibilityRole="tablist" style={styles.menu}>
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onSelect(tab.id)}
              style={({ pressed }) => [styles.item, selected && styles.itemSelected, pressed && styles.pressed]}
            >
              <Text style={[styles.mark, selected && styles.markSelected]}>{tab.mark}</Text>
              <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 18, right: 18, bottom: 4 },
  menu: {
    height: 66,
    padding: 5,
    flexDirection: 'row',
    backgroundColor: '#FFFFFFF2',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 22,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  item: { flex: 1, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  itemSelected: { backgroundColor: colors.ink },
  pressed: { opacity: 0.65 },
  mark: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  markSelected: { color: colors.white },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  labelSelected: { color: colors.white },
});
