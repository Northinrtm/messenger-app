import {forwardRef, useImperativeHandle, useRef} from 'react';
import {StyleSheet} from 'react-native';
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
</script></head><body style="margin:0;padding:0;background:transparent"></body></html>`;

export type SoundPlayerHandle = {
  playIcq: () => void;
};

export const SoundPlayer = forwardRef<SoundPlayerHandle>(
  function SoundPlayer(_, ref) {
    const webRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      playIcq() {
        webRef.current?.injectJavaScript('play(); true;');
      },
    }));

    return (
      <WebView
        ref={webRef}
        source={{html: HTML}}
        style={styles.hidden}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
      />
    );
  },
);

const styles = StyleSheet.create({
  hidden: {position: 'absolute', width: 1, height: 1, opacity: 0},
});
