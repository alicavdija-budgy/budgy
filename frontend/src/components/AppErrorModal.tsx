/**
 * BUDGY — AppErrorModal
 *
 * Premium iOS-style error modal that REPLACES raw technical errors
 * ("JSON Parse error", "undefined is not a function", "Network request failed")
 * with humanized, i18n-aware messages.
 *
 * Usage:
 *   const [error, setError] = useState<ErrorPayload | null>(null);
 *   showError(setError, result); // result from safeFetch / safeFetchJson
 *   <AppErrorModal error={error} onClose={() => setError(null)} onRetry={() => doAgain()} />
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../hooks/useTranslation';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '../constants/theme';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ErrorPayload {
  /** i18n key, e.g. "errors.invalidResponse" or a literal message */
  messageKey?: string;
  /** Optional plain-text fallback if messageKey is not in dictionary */
  message?: string;
  /** Optional context (e.g. endpoint, action) shown small underneath */
  context?: string;
  severity?: ErrorSeverity;
  retryable?: boolean;
}

interface Props {
  error: ErrorPayload | null;
  onClose: () => void;
  onRetry?: () => void;
}

export function AppErrorModal({ error, onClose, onRetry }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (!error) return null;

  const severity: ErrorSeverity = error.severity || 'error';
  const tint =
    severity === 'warning' ? theme.warning
    : severity === 'info' ? theme.info
    : theme.error;

  const iconName: React.ComponentProps<typeof Ionicons>['name'] =
    severity === 'warning' ? 'alert-circle-outline'
    : severity === 'info' ? 'information-circle-outline'
    : 'close-circle-outline';

  // Resolve message via i18n; fallback to literal
  const resolved = (() => {
    if (error.messageKey) {
      const tr = t(error.messageKey);
      if (tr && tr !== error.messageKey) return tr;
    }
    if (error.message) return error.message;
    return t('errors.unknown');
  })();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.scrim, { backgroundColor: theme.modalScrim }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.modalBackground,
              borderColor: theme.cardBorder,
            },
            Platform.OS === 'ios' && {
              shadowColor: theme.premiumShadow,
              shadowOpacity: 0.25,
              shadowOffset: { width: 0, height: 12 },
              shadowRadius: 28,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${tint}1A` }]}>
            <Ionicons name={iconName} size={36} color={tint} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>
            {severity === 'warning' ? t('errors.titleWarning') : t('errors.titleError')}
          </Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            {resolved}
          </Text>
          {error.context ? (
            <Text style={[styles.context, { color: theme.textTertiary }]}>
              {error.context}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {onRetry && error.retryable !== false ? (
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onRetry();
                }}
                style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh" size={18} color="#FFFFFF" />
                <Text style={styles.btnPrimaryText}>{t('errors.retry')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.btnGhost,
                { borderColor: theme.cardBorder, backgroundColor: theme.card },
              ]}
              activeOpacity={0.85}
            >
              <Text style={[styles.btnGhostText, { color: theme.text }]}>
                {t('errors.close')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default AppErrorModal;

/**
 * Helper to map a fetch result → ErrorPayload.
 * Pass the result of safeFetch / safeFetchJson directly.
 */
export function buildErrorFromResult(
  result: {
    ok?: boolean;
    status?: number;
    error?: string | null;
    offline?: boolean;
  },
  context?: string,
  retryable: boolean = true
): ErrorPayload {
  if (result.offline) {
    return { messageKey: 'network.noInternet', context, severity: 'warning', retryable };
  }
  if (!result.error && result.status && result.status >= 200 && result.status < 300) {
    return { messageKey: 'errors.unknown', context, retryable };
  }
  const status = result.status ?? 0;
  if (status === 0) {
    return { messageKey: 'errors.timeout', context, retryable };
  }
  if (status === 404) {
    return { messageKey: 'errors.notFound', context, retryable: false };
  }
  if (status === 401 || status === 403) {
    return { messageKey: 'errors.unauthorized', context, retryable: false };
  }
  if (status >= 500) {
    return { messageKey: 'errors.serverError', context, retryable };
  }
  if (result.error === 'invalid_json' || (result.error || '').includes('JSON')) {
    return { messageKey: 'errors.invalidResponse', context, retryable };
  }
  if (result.error === 'iap_not_configured') {
    return { messageKey: 'errors.iapNotConfigured', context, severity: 'warning', retryable: false };
  }
  return { messageKey: 'errors.generic', context, retryable };
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSizes.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xs,
  },
  context: {
    fontSize: FontSizes.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
    fontWeight: FontWeights.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    width: '100%',
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  btnGhost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  btnGhostText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
});
