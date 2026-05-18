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
          <Text style={styles.eyebrow}>North Messenger</Text>
          <Text style={styles.title}>Android messenger</Text>
          <Text style={styles.copy}>
            Sign in with your email or username and open the workspace directly
            from Android.
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
                Login
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onModeChange('register')}
              style={
                mode === 'register' ? styles.modeTabActive : styles.modeTab
              }>
              <Text
                style={
                  mode === 'register'
                    ? styles.modeTabActiveLabel
                    : styles.modeTabLabel
                }>
                Register
              </Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            <Field
              label={mode === 'login' ? 'Email or username' : 'Username'}
              value={loginIdentifier}
              onChangeText={setLoginIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'login' ? 'off' : 'username'}
              keyboardType={mode === 'login' ? 'email-address' : 'default'}
              placeholder={
                mode === 'login'
                  ? 'name@example.com or username'
                  : 'Choose a username'
              }
            />
            {mode === 'register' ? (
              <>
                <Field
                  label="Display name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  autoComplete="name"
                  placeholder="How others will see you"
                />
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="name@example.com"
                />
              </>
            ) : null}
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              secureTextEntry
              placeholder={mode === 'login' ? 'Enter your password' : 'Create a password'}
            />
          </View>

          {info ? <Text style={styles.info}>{info}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            disabled={!canSubmit || pending}
            onPress={handleSubmit}
            style={
              !canSubmit || pending
                ? styles.submitButtonDisabled
                : styles.submitButton
            }>
          {pending ? (
              <ActivityIndicator color={androidTheme.colors.textInverse} />
            ) : (
              <Text style={styles.submitLabel}>
                {mode === 'login' ? 'Enter workspace' : 'Create account'}
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
              {passwordVisible ? 'Hide' : 'Show'}
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
    padding: 20,
    backgroundColor: androidTheme.colors.background,
    gap: 20,
  },
  hero: {
    gap: 8,
    paddingTop: 28,
    paddingHorizontal: 2,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: androidTheme.colors.warm,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: androidTheme.colors.textPrimary,
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
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
  },
  modeTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: androidTheme.colors.surfaceMuted,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: androidTheme.colors.border,
  },
  modeTabActive: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: androidTheme.colors.orangeStrong,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    elevation: 6,
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
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
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
  info: {
    color: androidTheme.colors.success,
    backgroundColor: androidTheme.colors.successSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: androidTheme.colors.danger,
    backgroundColor: androidTheme.colors.dangerSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    backgroundColor: 'rgba(95, 156, 255, 0.38)',
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
