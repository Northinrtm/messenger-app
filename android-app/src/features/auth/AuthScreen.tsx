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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              <ActivityIndicator color="#fffaf1" />
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
          placeholderTextColor="#5d7b95"
          selectionColor="#55c2ff"
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
    backgroundColor: '#081521',
  },
  content: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#081521',
    gap: 20,
  },
  hero: {
    gap: 8,
    paddingTop: 24,
    paddingHorizontal: 2,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#6ea8cf',
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: '#f4fbff',
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: '#9ab5cb',
  },
  panel: {
    backgroundColor: '#102131',
    borderWidth: 1,
    borderColor: '#1f3b53',
    borderRadius: 28,
    padding: 20,
    gap: 18,
    shadowColor: '#02070b',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
    elevation: 8,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 10,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#183044',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#24435e',
  },
  modeTabActive: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#3cb7ff',
    alignItems: 'center',
  },
  modeTabLabel: {
    color: '#a7c0d4',
    fontWeight: '700',
  },
  modeTabActiveLabel: {
    color: '#082033',
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
    color: '#b8cedf',
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#28506d',
    backgroundColor: '#0a1a29',
    color: '#f4fbff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputWithAction: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#28506d',
    backgroundColor: '#0a1a29',
    color: '#f4fbff',
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
    color: '#7fc8ff',
    fontSize: 13,
    fontWeight: '700',
  },
  info: {
    color: '#9fd3b6',
    backgroundColor: '#123126',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: '#ffb3aa',
    backgroundColor: '#3a1719',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#38b6ff',
    borderRadius: 20,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#35546d',
    borderRadius: 20,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitLabel: {
    color: '#081521',
    fontSize: 16,
    fontWeight: '800',
  },
});
