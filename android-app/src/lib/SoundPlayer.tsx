import {forwardRef, useImperativeHandle, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import WebView from 'react-native-webview';

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><script>
function play() {
  try {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    var ctx = new C();
    function note(f, s, d, v) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(v, s + 0.015);
      g.gain.setValueAtTime(v, s + d - 0.04);
      g.gain.linearRampToValueAtTime(0, s + d);
      o.start(s); o.stop(s + d);
    }
    var t = ctx.currentTime;
    note(880, t, 0.13, 0.4);
    note(620, t + 0.21, 0.20, 0.35);
    setTimeout(function(){ ctx.close(); }, 700);
  } catch(e) {}
}
function ring() {
  try {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    var ctx = new C();
    function note(f, s, d, v) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(v, s + 0.02);
      g.gain.setValueAtTime(v, s + d - 0.05);
      g.gain.linearRampToValueAtTime(0, s + d);
      o.start(s); o.stop(s + d);
    }
    var t = ctx.currentTime;
    note(480, t, 0.4, 0.3);
    note(620, t + 0.45, 0.4, 0.26);
    setTimeout(function(){ ctx.close(); }, 1100);
  } catch(e) {}
}
</script></head><body style="margin:0;padding:0;background:transparent"></body></html>`;

export type SoundPlayerHandle = {
  playIcq: () => void;
  playRing: () => void;
};

export const SoundPlayer = forwardRef<SoundPlayerHandle>(
  function SoundPlayer(_, ref) {
    const webRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      playIcq() {
        webRef.current?.injectJavaScript('play(); true;');
      },
      playRing() {
        webRef.current?.injectJavaScript('ring(); true;');
      },
    }));

    return (
      <View style={styles.container}>
        <WebView
          ref={webRef}
          source={{html: HTML}}
          style={styles.webview}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {width: 0, height: 0, overflow: 'hidden'},
  webview: {width: 1, height: 1},
});
