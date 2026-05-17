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
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit =
    username.trim().length > 0 &&
    password.trim().length > 0 &&
    (mode === 'login' ||
      (displayName.trim().length > 0 && email.trim().length > 0));

  const handleSubmit = async () => {
    if (!canSubmit || pending) {
      return;
    }

    if (mode === 'login') {
      await onLogin({
        username: username.trim(),
        password,
      });
      return;
    }

    await onRegister({
      username: username.trim(),
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
          <Text style={styles.title}>Android client</Text>
          <Text style={styles.copy}>
            Mobile auth is separate from the browser cookie flow. Sign in to
            bootstrap the workspace directly from Android.
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
              label="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
            />
            {mode === 'register' ? (
              <>
                <Field
                  label="Display name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
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
  autoCapitalize = 'sentences',
  autoCorrect = true,
  autoComplete = 'off',
  keyboardType = 'default',
  secureTextEntry = false,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        style={styles.input}
        placeholderTextColor="#8f7b68"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#f3efe7',
    gap: 20,
  },
  hero: {
    gap: 8,
    paddingTop: 24,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#8a5a2b',
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: '#201811',
  },
  copy: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4f463c',
  },
  panel: {
    backgroundColor: '#fffaf1',
    borderWidth: 1,
    borderColor: '#e0d3bf',
    borderRadius: 28,
    padding: 20,
    gap: 18,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 10,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#efe4d3',
    alignItems: 'center',
  },
  modeTabActive: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#8a5a2b',
    alignItems: 'center',
  },
  modeTabLabel: {
    color: '#5b4b3c',
    fontWeight: '700',
  },
  modeTabActiveLabel: {
    color: '#fffaf1',
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
    color: '#524738',
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d5c4ac',
    backgroundColor: '#fcf7ef',
    color: '#1f1a14',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  info: {
    color: '#3e6032',
    backgroundColor: '#e8f1df',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: '#8b221c',
    backgroundColor: '#f8dfdb',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#2c5c53',
    borderRadius: 20,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9aa8a3',
    borderRadius: 20,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitLabel: {
    color: '#fffaf1',
    fontSize: 16,
    fontWeight: '800',
  },
});
