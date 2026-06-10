import {useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {androidTheme} from '../../theme';
import {useI18n} from '../../i18n/I18nProvider';

type AuthMode = 'login' | 'register';

type Props = {
  mode: AuthMode;
  pending: boolean;
  error: string | null;
  info: string | null;
  onModeChange: (mode: AuthMode) => void;
  onLogin: (input: {username: string; password: string}) => Promise<void>;
  onRegister: (input: {
    username: string;
    email: string;
    displayName: string;
    password: string;
  }) => Promise<void>;
};

export function AuthScreen({
  mode,
  pending,
  error,
  info,
  onModeChange,
  onLogin,
  onRegister,
}: Props) {
  const {t} = useI18n();
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit =
    loginIdentifier.trim().length > 0 &&
    password.trim().length > 0 &&
    (mode === 'login' ||
      (displayName.trim().length > 0 && email.trim().length > 0));

  const handleSubmit = async () => {
    if (!canSubmit || pending) {
      return;
    }

    if (mode === 'login') {
      await onLogin({
        username: loginIdentifier.trim(),
        password,
      });
      return;
    }

    await onRegister({
      username: loginIdentifier.trim(),
      email: email.trim(),
      displayName: displayName.trim(),
      password,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ios: 'padding', android: 'height'})}
      style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Text style={styles.logoLabel}>NM</Text>
          </View>
          <Text style={styles.brand}>North Messenger</Text>
          <Text style={styles.title}>
            {mode === 'login' ? t('auth.signInTitle') : t('auth.createAccountTitle')}
          </Text>
          <Text style={styles.copy}>
            {mode === 'login' ? t('auth.signInCopy') : t('auth.registerCopy')}
          </Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.modeTabs}>
            <Pressable
              onPress={() => onModeChange('login')}
              style={mode === 'login' ? styles.modeTabActive : styles.modeTab}>
              <Text
                style={
                  mode === 'login'
                    ? styles.modeTabActiveLabel
                    : styles.modeTabLabel
                }>
                {t('auth.tabLogin')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onModeChange('register')}
              style={mode === 'register' ? styles.modeTabActive : styles.modeTab}>
              <Text
                style={
                  mode === 'register'
                    ? styles.modeTabActiveLabel
                    : styles.modeTabLabel
                }>
                {t('auth.tabRegister')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            <Field
              label={mode === 'login' ? t('auth.emailOrUsername') : t('auth.username')}
              value={loginIdentifier}
              onChangeText={setLoginIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'login' ? 'off' : 'username'}
              keyboardType={mode === 'login' ? 'email-address' : 'default'}
              placeholder={
                mode === 'login'
                  ? t('auth.loginPlaceholder')
                  : t('auth.usernamePlaceholder')
              }
            />
            {mode === 'register' ? (
              <>
                <Field
                  label={t('auth.displayName')}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  autoComplete="name"
                  placeholder={t('auth.displayNamePlaceholder')}
                />
                <Field
                  label={t('auth.email')}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder={t('auth.emailPlaceholder')}
                />
              </>
            ) : null}
            <Field
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              secureTextEntry
              placeholder={
                mode === 'login'
                  ? t('auth.passwordPlaceholderLogin')
                  : t('auth.passwordPlaceholderRegister')
              }
            />
          </View>

          {info ? (
            <View style={styles.infoBanner}>
              <Text style={styles.infoLabel}>{info}</Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorLabel}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={!canSubmit || pending}
            onPress={() => {
              handleSubmit().catch(() => undefined);
            }}
            style={
              !canSubmit || pending ? styles.submitButtonDisabled : styles.submitButton
            }>
            {pending ? (
              <ActivityIndicator color={androidTheme.colors.textInverse} />
            ) : (
              <Text style={styles.submitLabel}>
                {mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoComplete?:
    | 'email'
    | 'name'
    | 'username'
    | 'current-password'
    | 'new-password'
    | 'off';
  keyboardType?:
    | 'default'
    | 'email-address'
    | 'numeric'
    | 'phone-pad'
    | 'url';
  secureTextEntry?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  autoComplete = 'off',
  keyboardType = 'default',
  secureTextEntry = false,
}: FieldProps) {
  const {t} = useI18n();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const resolvedSecureTextEntry = secureTextEntry && !passwordVisible;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          keyboardType={keyboardType}
          secureTextEntry={resolvedSecureTextEntry}
          style={secureTextEntry ? styles.inputWithAction : styles.input}
          placeholder={placeholder}
          placeholderTextColor={androidTheme.colors.textMuted}
          selectionColor={androidTheme.colors.blue}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setPasswordVisible(current => !current)}
            style={styles.inputActionButton}
            hitSlop={8}>
            <Text style={styles.inputActionLabel}>
              {passwordVisible ? t('common.hide') : t('common.show')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: androidTheme.colors.background,
  },
  content: {
    flexGrow: 1,
    padding: 22,
    justifyContent: 'center',
    gap: 24,
    backgroundColor: androidTheme.colors.background,
  },
  hero: {
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueSoft,
    borderWidth: 1,
    borderColor: androidTheme.colors.borderStrong,
  },
  logoLabel: {
    fontSize: 26,
    fontWeight: '800',
    color: androidTheme.colors.blue,
  },
  brand: {
    fontSize: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: androidTheme.colors.warm,
    fontWeight: '700',
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  copy: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: androidTheme.colors.textSecondary,
  },
  panel: {
    backgroundColor: androidTheme.colors.surface,
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
    borderRadius: androidTheme.radius.cardLarge,
    padding: 20,
    gap: 18,
    ...androidTheme.shadow,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: androidTheme.colors.surfaceMuted,
    padding: 6,
    borderRadius: 20,
  },
  modeTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: androidTheme.colors.blueStrong,
  },
  modeTabLabel: {
    color: androidTheme.colors.textSecondary,
    fontWeight: '700',
  },
  modeTabActiveLabel: {
    color: androidTheme.colors.textInverse,
    fontWeight: '800',
  },
  form: {
    gap: 14,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: androidTheme.colors.textSecondary,
  },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    borderRadius: androidTheme.radius.control,
    borderWidth: 1,
    borderColor: androidTheme.colors.borderStrong,
    backgroundColor: androidTheme.colors.surfaceAlt,
    color: androidTheme.colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  inputWithAction: {
    borderRadius: androidTheme.radius.control,
    borderWidth: 1,
    borderColor: androidTheme.colors.borderStrong,
    backgroundColor: androidTheme.colors.surfaceAlt,
    color: androidTheme.colors.textPrimary,
    paddingLeft: 16,
    paddingRight: 72,
    paddingVertical: 14,
    fontSize: 16,
  },
  inputActionButton: {
    position: 'absolute',
    right: 14,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  inputActionLabel: {
    color: androidTheme.colors.blue,
    fontSize: 13,
    fontWeight: '700',
  },
  infoBanner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: androidTheme.colors.successSoft,
  },
  infoLabel: {
    color: androidTheme.colors.success,
    fontSize: 14,
    lineHeight: 20,
  },
  errorBanner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: androidTheme.colors.dangerSoft,
  },
  errorLabel: {
    color: androidTheme.colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: androidTheme.colors.blueStrong,
    borderRadius: 20,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: 'rgba(78, 161, 255, 0.32)',
    borderRadius: 20,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitLabel: {
    color: androidTheme.colors.textInverse,
    fontSize: 16,
    fontWeight: '800',
  },
});
