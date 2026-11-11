# Game audio / 遊戲音效

`dou.wav` is a short Traditional Chinese “豆” (dòu) cue, bundled so playback does not depend on a device having a Chinese voice or a runtime speech service.

It was generated locally using Windows `System.Speech.Synthesis.SpeechSynthesizer`, Microsoft Hanhan Desktop (`zh-TW`), rate 4, mono 16-bit PCM at 22,050 Hz. Silence was trimmed with a small margin; a 3 ms attack, 12 ms release, 0.78 peak normalization, and 1.12× playback speed were applied. The final WAV is about 0.13 seconds and 6.3 KB.

Drag and bubble sounds are original generated waveforms in [`src/audio/sound-effects.js`](../../src/audio/sound-effects.js), rather than downloaded sound packs. The drag is a soft low-pass noise/low-pitch loop, faded at its boundary. The bubble pop has a quick falling pitch and a short decaying envelope. Playback gain, short fades, and a six-pop cap keep effects restrained.

「豆」短語音隨網站提供，拖曳與泡泡音效則由程式本機產生；沒有使用外部付費 API 或第三方音效包。

Required Notice: Copyright (c) 2026 M80ta

Project license: [PolyForm Noncommercial License 1.0.0](../../LICENSE.md).
