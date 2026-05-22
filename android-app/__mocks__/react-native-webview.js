const React = require('react');
const {View} = require('react-native');

const WebView = React.forwardRef((props, _ref) => React.createElement(View, props));
WebView.displayName = 'WebView';

module.exports = {WebView, default: WebView};
