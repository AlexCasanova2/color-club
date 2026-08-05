import { Alert } from 'react-native';
import type { ReportReason } from '@/types/domain';

export const reportReasons: Array<{ label: string; value: ReportReason }> = [
  { label: 'Acoso o intimidación', value: 'harassment' },
  { label: 'Odio o discriminación', value: 'hate' },
  { label: 'Contenido sexual', value: 'sexual_content' },
  { label: 'Violencia o amenazas', value: 'violence' },
  { label: 'Privacidad', value: 'privacy' },
  { label: 'Spam', value: 'spam' },
  { label: 'Otro motivo', value: 'other' },
];

export function chooseReportReason(onSelect: (reason: ReportReason) => void) {
  Alert.alert('Motivo de la denuncia', 'Selecciona la opción que mejor describe el problema.', [
    ...reportReasons.map(({ label, value }) => ({ text: label, onPress: () => onSelect(value) })),
    { text: 'Cancelar', style: 'cancel' as const },
  ]);
}
