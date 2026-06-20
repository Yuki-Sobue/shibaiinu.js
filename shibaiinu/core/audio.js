export class AudioController {
  constructor() {
    this.bgm = null;
    this.bgmVolume = 0.5;
    this.seVolume = 0.7;
    this.currentBgmSrc = null;
    this.currentBgm = null;  // ファイル名を保持
    this.basePath = 'assets/system/audio/';
    this.fadeIntervalId = null;
  }

  // BGM再生
  playBgm(filename, loop = true) {
    const src = this.basePath + 'bgm/' + filename;

    // 同じBGMなら何もしない
    if (this.currentBgmSrc === src && this.bgm && !this.bgm.paused) {
      return;
    }

    this.stopBgm();
    this.bgm = new Audio(src);
    this.bgm.loop = loop;
    this.bgm.volume = this.bgmVolume;
    this.bgm.play().catch(e => console.log('BGM再生エラー:', e));
    this.currentBgmSrc = src;
    this.currentBgm = filename;
  }

  // BGM停止
  stopBgm() {
    if (this.fadeIntervalId !== null) {
      clearInterval(this.fadeIntervalId);
      this.fadeIntervalId = null;
    }
    if (this.bgm) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
      this.bgm = null;
      this.currentBgmSrc = null;
      this.currentBgm = null;
    }
  }

  // BGMフェードアウト
  fadeOutBgm(duration = 1000) {
    if (!this.bgm) return;

    // フェード中に対象 BGM が差し替わったら早期離脱できるよう参照を握っておく
    const target = this.bgm;
    const startVolume = target.volume;
    const steps = 20;
    const stepTime = duration / steps;
    const volumeStep = startVolume / steps;
    let currentStep = 0;

    if (this.fadeIntervalId !== null) {
      clearInterval(this.fadeIntervalId);
    }

    this.fadeIntervalId = setInterval(() => {
      if (this.bgm !== target) {
        clearInterval(this.fadeIntervalId);
        this.fadeIntervalId = null;
        return;
      }
      currentStep++;
      if (currentStep >= steps) {
        clearInterval(this.fadeIntervalId);
        this.fadeIntervalId = null;
        this.stopBgm();
      } else {
        target.volume = Math.max(0, startVolume - (volumeStep * currentStep));
      }
    }, stepTime);
  }

  // 効果音再生
  playSe(filename) {
    const src = this.basePath + 'se/' + filename;
    const se = new Audio(src);
    se.volume = this.seVolume;
    se.play().catch(e => console.log('SE再生エラー:', e));
  }

  // BGM音量設定
  setBgmVolume(volume) {
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this.bgm) {
      this.bgm.volume = this.bgmVolume;
    }
  }

  // SE音量設定
  setSeVolume(volume) {
    this.seVolume = Math.max(0, Math.min(1, volume));
  }

  // 音量取得
  getBgmVolume() {
    return this.bgmVolume;
  }

  getSeVolume() {
    return this.seVolume;
  }

  setBasePath(path) {
    this.basePath = path;
  }
}
