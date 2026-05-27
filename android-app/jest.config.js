module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@stomp/stompjs$':
      '<rootDir>/node_modules/@stomp/stompjs/bundles/stomp.umd.js',
    '^@react-native-firebase/messaging$':
      '<rootDir>/__mocks__/@react-native-firebase/messaging.js',
  },
};
