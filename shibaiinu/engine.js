import { MessageEvent, InputEvent } from './core/events/index.js';
import { parseTextTags, extractWaits } from './core/util/textTags.js';
import { animClass, runAnim, clearAnimClasses } from './core/util/animation.js';
import { BackgroundController } from './core/background.js';
import { AudioController } from './core/audio.js';

// シナリオ作成用にre-export
export { Scenario } from './core/scenario.js';
export { BaseEvent, MessageEvent, SelectionEvent, InputEvent, WaitEvent } from './core/events/index.js';
export { parseTextTags } from './core/util/textTags.js';

const PREFIX = 'shibaiinu';
const DEFAULT_ASSETS_PATH = 'shibaiinu/assets/';

// パッケージ化されたElectronアプリかどうかを判定
const isPackaged = typeof process !== 'undefined' &&
  typeof process.resourcesPath === 'string' &&
  process.resourcesPath.includes('app.asar');

export class ShibaiinuEngine {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container element "${containerId}" not found`);
    }

    // デバッグモード（デフォルト: パッケージ化されていない時はtrue）
    this.debug = options.debug !== undefined ? options.debug : !isPackaged;

    this.scenarios = options.scenarios || [];
    this.currentScenario = null;
    this.currentScenarioIndex = -1;

    // セーブ設定
    this.saveSlots = 3;  // 手動セーブスロット数
    this.storageKey = options.storageKey || 'shibaiinu';
    this.copyFromSlot = null;  // コピーモード時のコピー元スロット

    // タイプライター状態
    this.typewriterTimer = null;
    this.isTyping = false;
    this.fullHtml = '';
    this.typewriterSpeed = options.typewriterSpeed || 30;

    // 選択肢状態
    this.isSelectionMode = false;
    this.selectedIndex = 0;
    this.currentChoicesCount = 0;

    // 入力状態
    this.isInputMode = false;
    this.currentInputFlagName = null;

    // 待機状態
    this.isWaiting = false;
    this.waitTimer = null;

    // システムSE設定（nullでSEなし）
    this.systemSE = {
      select: options.selectSE !== undefined ? options.selectSE : null,
      decide: options.decideSE !== undefined ? options.decideSE : null
    };

    // デフォルトフォント設定
    this.defaultPixelFont = options.pixelFont || false;

    // DOM要素（後で初期化）
    this.elements = {};

    // コントローラー（後で初期化）
    this.backgroundController = null;
    this.audioController = null;

    // 初期化
    this._injectStyles();
    this._injectHTML();
    this._initElements();
    this._initControllers();
    this._bindEvents();

    // コンテナに幅を設定
    this.container.style.width = '100%';
    this.container.style.maxWidth = '800px';

    // デバッグモード表示
    if (this.debug) {
      console.log('%c[shibaiinu] デバッグモード有効', 'color: #ffd700; font-weight: bold');
      console.log('%c  - イベント/フラグ/セーブの情報をログ出力します', 'color: #aaa');
      console.log('%c  - Electronビルド時は自動で無効化されます', 'color: #aaa');
      this._setupErrorHandler();
    }
  }

  // エラーハンドラーをセットアップ
  _setupErrorHandler() {
    // エラー表示用のオーバーレイを作成
    const errorOverlay = document.createElement('div');
    errorOverlay.id = `${PREFIX}-error-overlay`;
    errorOverlay.innerHTML = `
      <div class="${PREFIX}-error-header">
        <span>⚠️ JavaScript Error</span>
        <button class="${PREFIX}-error-close">×</button>
      </div>
      <div class="${PREFIX}-error-content"></div>
    `;
    document.body.appendChild(errorOverlay);

    const errorContent = errorOverlay.querySelector(`.${PREFIX}-error-content`);
    const closeBtn = errorOverlay.querySelector(`.${PREFIX}-error-close`);

    closeBtn.addEventListener('click', () => {
      errorOverlay.classList.remove(`${PREFIX}-visible`);
    });

    // エラー表示用の関数
    const showError = (type, message, location = '') => {
      const errorHtml = `
        <div class="${PREFIX}-error-item">
          <div class="${PREFIX}-error-message">[${type}] ${this._escapeHtml(message)}</div>
          ${location ? `<div class="${PREFIX}-error-location">${this._escapeHtml(location)}</div>` : ''}
        </div>
      `;
      errorContent.innerHTML += errorHtml;
      errorOverlay.classList.add(`${PREFIX}-visible`);
    };

    // グローバルエラーハンドラー（JSエラー）。destroy() で取り外せるよう参照を保持する。
    this._onWindowError = (e) => {
      // リソース読み込みエラー（img, audio, script など）
      if (e.target && e.target !== window) {
        const tag = e.target.tagName?.toLowerCase() || 'unknown';
        const src = e.target.src || e.target.href || 'unknown';
        showError('Load Error', `${tag} の読み込みに失敗: ${src}`);
        return;
      }
      // JSエラー
      showError('JS Error', e.message, `${e.filename}:${e.lineno}:${e.colno}`);
    };
    window.addEventListener('error', this._onWindowError, true); // capture phase でリソースエラーも拾う

    // Promise rejection ハンドラー
    this._onUnhandledRejection = (e) => {
      showError('Promise', String(e.reason));
    };
    window.addEventListener('unhandledrejection', this._onUnhandledRejection);
  }

  // エンジンを破棄してリスナーと DOM をクリーンアップする。
  // 同一ページで複数回 ShibaiinuEngine を作り直すホスト向け。
  destroy() {
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._onWindowError) {
      window.removeEventListener('error', this._onWindowError, true);
      this._onWindowError = null;
    }
    if (this._onUnhandledRejection) {
      window.removeEventListener('unhandledrejection', this._onUnhandledRejection);
      this._onUnhandledRejection = null;
    }
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    this.audioController?.stopBgm();
    if (this.container) {
      this.container.innerHTML = '';
    }
    document.getElementById(`${PREFIX}-styles`)?.remove();
    document.getElementById(`${PREFIX}-fonts`)?.remove();
    document.getElementById(`${PREFIX}-error-overlay`)?.remove();
  }

  // HTMLエスケープ
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // CSSを動的に挿入
  _injectStyles() {
    if (document.getElementById(`${PREFIX}-styles`)) return;

    // Google Fonts（ドットフォント）を読み込み
    if (!document.getElementById(`${PREFIX}-fonts`)) {
      const fontLink = document.createElement('link');
      fontLink.id = `${PREFIX}-fonts`;
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap';
      document.head.appendChild(fontLink);
    }

    const style = document.createElement('style');
    style.id = `${PREFIX}-styles`;
    style.textContent = `
      .${PREFIX}-game-container {
        width: 100%;
        max-width: 800px;
        min-height: 650px;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
        line-height: 1.6;
      }

      .${PREFIX}-game-container.${PREFIX}-pixel-font {
        font-family: 'DotGothic16', sans-serif;
      }

      .${PREFIX}-menu-buttons {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 100;
        display: flex;
        gap: 0.5rem;
      }

      .${PREFIX}-menu-button {
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        border: 1px solid #ffffff;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        font-family: inherit;
        transition: all 0.2s ease;
      }

      .${PREFIX}-menu-button:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .${PREFIX}-stage {
        width: 100%;
        height: 450px;
        position: relative;
        overflow: hidden;
        background: #2a2a3e;
        border-radius: 8px 8px 0 0;
      }

      @property --${PREFIX}-anim-x {
        syntax: '<length-percentage>';
        initial-value: 0%;
        inherits: false;
      }
      @property --${PREFIX}-anim-y {
        syntax: '<length-percentage>';
        initial-value: 0%;
        inherits: false;
      }

      .${PREFIX}-background-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        --${PREFIX}-anim-x: 0%;
        --${PREFIX}-anim-y: 0%;
        transform: translate(var(--${PREFIX}-anim-x), var(--${PREFIX}-anim-y));
        transition: opacity 0.5s ease;
      }

      .${PREFIX}-background-image.${PREFIX}-visible {
        opacity: 1;
      }

      .${PREFIX}-person-image {
        position: absolute;
        bottom: 0;
        max-height: 90%;
        opacity: 0;
        --${PREFIX}-base-x: 0%;
        --${PREFIX}-anim-x: 0%;
        --${PREFIX}-anim-y: 0%;
        transform: translate(calc(var(--${PREFIX}-base-x) + var(--${PREFIX}-anim-x)), var(--${PREFIX}-anim-y));
        transition: opacity 0.3s ease;
      }

      .${PREFIX}-person-image.${PREFIX}-visible {
        opacity: 1;
      }

      .${PREFIX}-person-left {
        left: 5%;
      }

      .${PREFIX}-person-center {
        left: 50%;
        --${PREFIX}-base-x: -50%;
      }

      .${PREFIX}-person-right {
        right: 5%;
      }

      /* アニメーション keyframes */
      @keyframes ${PREFIX}-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes ${PREFIX}-fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes ${PREFIX}-slide-in-left {
        from { --${PREFIX}-anim-x: -300%; opacity: 0; }
        to { --${PREFIX}-anim-x: 0%; opacity: 1; }
      }
      @keyframes ${PREFIX}-slide-out-left {
        from { --${PREFIX}-anim-x: 0%; opacity: 1; }
        to { --${PREFIX}-anim-x: -300%; opacity: 0; }
      }
      @keyframes ${PREFIX}-slide-in-right {
        from { --${PREFIX}-anim-x: 300%; opacity: 0; }
        to { --${PREFIX}-anim-x: 0%; opacity: 1; }
      }
      @keyframes ${PREFIX}-slide-out-right {
        from { --${PREFIX}-anim-x: 0%; opacity: 1; }
        to { --${PREFIX}-anim-x: 300%; opacity: 0; }
      }
      @keyframes ${PREFIX}-slide-in-top {
        from { --${PREFIX}-anim-y: -200%; opacity: 0; }
        to { --${PREFIX}-anim-y: 0%; opacity: 1; }
      }
      @keyframes ${PREFIX}-slide-out-top {
        from { --${PREFIX}-anim-y: 0%; opacity: 1; }
        to { --${PREFIX}-anim-y: -200%; opacity: 0; }
      }
      @keyframes ${PREFIX}-slide-in-bottom {
        from { --${PREFIX}-anim-y: 200%; opacity: 0; }
        to { --${PREFIX}-anim-y: 0%; opacity: 1; }
      }
      @keyframes ${PREFIX}-slide-out-bottom {
        from { --${PREFIX}-anim-y: 0%; opacity: 1; }
        to { --${PREFIX}-anim-y: 200%; opacity: 0; }
      }

      .${PREFIX}-anim-fade-in { animation: ${PREFIX}-fade-in 0.3s ease forwards; }
      .${PREFIX}-anim-fade-out { animation: ${PREFIX}-fade-out 0.3s ease forwards; }
      .${PREFIX}-anim-slide-in-left { animation: ${PREFIX}-slide-in-left 0.3s ease forwards; }
      .${PREFIX}-anim-slide-out-left { animation: ${PREFIX}-slide-out-left 0.3s ease forwards; }
      .${PREFIX}-anim-slide-in-right { animation: ${PREFIX}-slide-in-right 0.3s ease forwards; }
      .${PREFIX}-anim-slide-out-right { animation: ${PREFIX}-slide-out-right 0.3s ease forwards; }
      .${PREFIX}-anim-slide-in-top { animation: ${PREFIX}-slide-in-top 0.3s ease forwards; }
      .${PREFIX}-anim-slide-out-top { animation: ${PREFIX}-slide-out-top 0.3s ease forwards; }
      .${PREFIX}-anim-slide-in-bottom { animation: ${PREFIX}-slide-in-bottom 0.3s ease forwards; }
      .${PREFIX}-anim-slide-out-bottom { animation: ${PREFIX}-slide-out-bottom 0.3s ease forwards; }

      .${PREFIX}-background-image.${PREFIX}-anim-fade-in,
      .${PREFIX}-background-image.${PREFIX}-anim-fade-out,
      .${PREFIX}-background-image.${PREFIX}-anim-slide-in-left,
      .${PREFIX}-background-image.${PREFIX}-anim-slide-out-left,
      .${PREFIX}-background-image.${PREFIX}-anim-slide-in-right,
      .${PREFIX}-background-image.${PREFIX}-anim-slide-out-right,
      .${PREFIX}-background-image.${PREFIX}-anim-slide-in-top,
      .${PREFIX}-background-image.${PREFIX}-anim-slide-out-top,
      .${PREFIX}-background-image.${PREFIX}-anim-slide-in-bottom,
      .${PREFIX}-background-image.${PREFIX}-anim-slide-out-bottom {
        animation-duration: 0.5s;
      }

      .${PREFIX}-message-window {
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 1.5rem;
        min-height: 200px;
        border-radius: 0 0 8px 8px;
        cursor: pointer;
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
      }

      .${PREFIX}-message-window::after {
        content: "▼";
        position: absolute;
        bottom: 10px;
        right: 15px;
        font-size: 12px;
        animation: ${PREFIX}-blink 1s infinite;
      }

      @keyframes ${PREFIX}-blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }

      .${PREFIX}-speaker-name {
        color: #ffffff;
        font-weight: bold;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
      }

      .${PREFIX}-speaker-name:empty {
        display: none;
      }

      .${PREFIX}-message-text {
        font-size: 1.1rem;
        line-height: 1.8;
      }

      .${PREFIX}-message-window:has(.${PREFIX}-selection-window.${PREFIX}-visible)::after {
        display: none;
      }

      .${PREFIX}-selection-window {
        display: none;
        flex-direction: column;
        gap: 0.4rem;
      }

      .${PREFIX}-selection-window.${PREFIX}-visible {
        display: flex;
      }

      .${PREFIX}-selection-button {
        background: rgba(50, 50, 70, 0.9);
        color: #fff;
        border: 1px solid #ffffff;
        padding: 0.4rem 1rem;
        border-radius: 6px;
        font-size: 0.95rem;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
      }

      .${PREFIX}-selection-button:hover,
      .${PREFIX}-selection-button.${PREFIX}-selected {
        background: rgba(255, 255, 255, 0.2);
        border-color: #ffd700;
        box-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
      }

      .${PREFIX}-selection-button:empty {
        display: none;
      }

      /* 入力フォーム */
      .${PREFIX}-input-window {
        display: none;
        flex-direction: column;
        gap: 0.5rem;
      }

      .${PREFIX}-input-window.${PREFIX}-visible {
        display: flex;
      }

      .${PREFIX}-input-prompt {
        color: #fff;
        font-size: 1rem;
        margin-bottom: 0.25rem;
      }

      .${PREFIX}-input-field {
        background: rgba(255, 255, 255, 0.1);
        border: 2px solid #fff;
        border-radius: 6px;
        padding: 0.6rem 1rem;
        color: #fff;
        font-size: 1rem;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s;
      }

      .${PREFIX}-input-field:focus {
        border-color: #ffd700;
      }

      .${PREFIX}-input-field::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }

      .${PREFIX}-input-submit {
        background: rgba(70, 130, 180, 0.9);
        color: #fff;
        border: none;
        padding: 0.5rem 1.5rem;
        border-radius: 6px;
        font-size: 1rem;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.2s;
        align-self: flex-end;
      }

      .${PREFIX}-input-submit:hover {
        background: rgba(70, 130, 180, 1);
      }

      .${PREFIX}-panel {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        border-radius: 8px;
        display: none;
        flex-direction: column;
        z-index: 200;
        font-family: inherit;
      }

      .${PREFIX}-panel.${PREFIX}-visible {
        display: flex;
      }

      .${PREFIX}-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #333;
      }

      .${PREFIX}-panel-header h2 {
        color: #ffffff;
        font-size: 1.2rem;
        margin: 0;
      }

      .${PREFIX}-panel-close {
        background: none;
        border: none;
        color: #fff;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.5rem;
        line-height: 1;
      }

      .${PREFIX}-panel-close:hover {
        color: #ffffff;
      }

      .${PREFIX}-history-content {
        flex: 1;
        overflow-y: auto;
        padding: 1rem 1.5rem;
      }

      .${PREFIX}-history-item {
        margin-bottom: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #222;
      }

      .${PREFIX}-history-item:last-child {
        border-bottom: none;
      }

      .${PREFIX}-history-speaker {
        color: #ffffff;
        font-weight: bold;
        font-size: 0.85rem;
        margin-bottom: 0.25rem;
      }

      .${PREFIX}-history-text {
        color: #ccc;
        font-size: 0.95rem;
        line-height: 1.6;
      }

      .${PREFIX}-history-item.selection .${PREFIX}-history-text {
        color: #87ceeb;
        font-style: italic;
      }

      .${PREFIX}-settings-content {
        padding: 1.5rem;
      }

      .${PREFIX}-setting-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .${PREFIX}-setting-item label {
        width: 80px;
        color: #ccc;
        font-family: inherit;
      }

      .${PREFIX}-setting-item input[type="range"] {
        flex: 1;
        height: 6px;
        -webkit-appearance: none;
        appearance: none;
        background: #333;
        border-radius: 3px;
        outline: none;
      }

      .${PREFIX}-setting-item input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        background: #ffffff;
        border-radius: 50%;
        cursor: pointer;
      }

      .${PREFIX}-setting-item input[type="range"]::-moz-range-thumb {
        width: 18px;
        height: 18px;
        background: #ffffff;
        border-radius: 50%;
        cursor: pointer;
        border: none;
      }

      .${PREFIX}-setting-item span {
        width: 40px;
        text-align: right;
        color: #fff;
      }

      .${PREFIX}-setting-checkbox {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid #444;
      }

      .${PREFIX}-setting-checkbox label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        width: auto;
      }

      .${PREFIX}-setting-checkbox input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }

      /* エラーオーバーレイ */
      #${PREFIX}-error-overlay {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 400px;
        max-height: 300px;
        background: #1a1a2e;
        border: 2px solid #e74c3c;
        border-radius: 8px;
        display: none;
        flex-direction: column;
        z-index: 10000;
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        font-size: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }

      #${PREFIX}-error-overlay.${PREFIX}-visible {
        display: flex;
      }

      .${PREFIX}-error-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #e74c3c;
        color: #fff;
        font-weight: bold;
      }

      .${PREFIX}-error-close {
        background: none;
        border: none;
        color: #fff;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
      }

      .${PREFIX}-error-content {
        padding: 12px;
        overflow-y: auto;
        max-height: 240px;
      }

      .${PREFIX}-error-item {
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #333;
      }

      .${PREFIX}-error-item:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
      }

      .${PREFIX}-error-message {
        color: #ff6b6b;
        margin-bottom: 4px;
        word-break: break-word;
      }

      .${PREFIX}-error-location {
        color: #888;
        font-size: 11px;
      }

      .${PREFIX}-title-screen {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        border-radius: 8px;
        display: none;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 300;
      }

      .${PREFIX}-title-screen.${PREFIX}-visible {
        display: flex;
      }

      .${PREFIX}-title-content {
        text-align: center;
        padding: 2rem;
      }

      .${PREFIX}-game-title {
        color: #ffffff;
        font-size: 2.5rem;
        margin-bottom: 2rem;
        text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
      }

      .${PREFIX}-scenario-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 400px;
        margin: 0 auto;
      }

      .${PREFIX}-scenario-button {
        background: rgba(50, 50, 70, 0.9);
        color: #fff;
        border: 2px solid #ffffff;
        padding: 1rem 2rem;
        border-radius: 8px;
        font-size: 1.1rem;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.3s ease;
        text-align: left;
      }

      .${PREFIX}-scenario-button:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translateX(5px);
      }

      .${PREFIX}-scenario-button .${PREFIX}-scenario-title {
        font-weight: bold;
        margin-bottom: 0.25rem;
      }

      .${PREFIX}-scenario-button .${PREFIX}-scenario-description {
        font-size: 0.85rem;
        color: #aaa;
      }

      .${PREFIX}-hidden {
        display: none !important;
      }

      .${PREFIX}-text-shake {
        display: inline-block;
        animation: ${PREFIX}-shake 0.3s infinite;
      }

      @keyframes ${PREFIX}-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
      }

      .${PREFIX}-code-block {
        position: relative;
        background: #1e1e1e;
        border: 1px solid #444;
        border-radius: 6px;
        margin: 0.5rem 0;
        overflow: hidden;
      }

      .${PREFIX}-code-block pre {
        margin: 0;
        padding: 1rem;
        padding-top: 2.5rem;
        overflow-x: auto;
      }

      .${PREFIX}-code-block code {
        font-family: 'SF Mono', 'Monaco', 'Consolas', 'Courier New', monospace;
        font-size: 0.9rem;
        color: #d4d4d4;
        white-space: pre;
        line-height: 1.5;
      }

      .${PREFIX}-code-copy-btn {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        background: #444;
        color: #fff;
        border: none;
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 0.2s ease;
        z-index: 1;
      }

      .${PREFIX}-code-copy-btn:hover {
        background: #666;
      }

      .${PREFIX}-code-copy-btn.copied {
        background: #4caf50;
      }

      .${PREFIX}-inline-code {
        font-family: 'SF Mono', 'Monaco', 'Consolas', 'Courier New', monospace;
        font-size: 0.9em;
        background: rgba(100, 100, 120, 0.5);
        color: #ffd700;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        border: 1px solid #555;
      }

      .${PREFIX}-save-content {
        padding: 1rem 1.5rem;
      }

      .${PREFIX}-save-section {
        margin-bottom: 1.5rem;
      }

      .${PREFIX}-save-section-title {
        color: #888;
        font-size: 0.85rem;
        margin-bottom: 0.5rem;
        border-bottom: 1px solid #333;
        padding-bottom: 0.25rem;
      }

      .${PREFIX}-save-slot {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: rgba(50, 50, 70, 0.5);
        border: 1px solid #444;
        border-radius: 6px;
        padding: 0.75rem 1rem;
        margin-bottom: 0.5rem;
      }

      .${PREFIX}-save-slot-thumbnail {
        width: 80px;
        height: 45px;
        background: #222;
        border-radius: 4px;
        overflow: hidden;
        flex-shrink: 0;
        position: relative;
      }

      .${PREFIX}-save-slot-thumbnail img.${PREFIX}-thumb-bg {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .${PREFIX}-save-slot-thumbnail img.${PREFIX}-thumb-person {
        position: absolute;
        bottom: 0;
        height: 90%;
        width: auto;
      }

      .${PREFIX}-save-slot-thumbnail img.${PREFIX}-thumb-person-left {
        left: 5%;
      }

      .${PREFIX}-save-slot-thumbnail img.${PREFIX}-thumb-person-center {
        left: 50%;
        transform: translateX(-50%);
      }

      .${PREFIX}-save-slot-thumbnail img.${PREFIX}-thumb-person-right {
        right: 5%;
      }

      .${PREFIX}-save-slot-info {
        flex: 1;
        min-width: 0;
      }

      .${PREFIX}-save-slot-title {
        color: #fff;
        font-size: 0.95rem;
        margin-bottom: 0.25rem;
      }

      .${PREFIX}-save-slot-date {
        color: #888;
        font-size: 0.8rem;
      }

      .${PREFIX}-save-slot-empty {
        color: #666;
        font-style: italic;
      }

      .${PREFIX}-save-slot-buttons {
        display: flex;
        gap: 0.5rem;
      }

      .${PREFIX}-save-btn {
        background: rgba(70, 130, 180, 0.8);
        color: #fff;
        border: none;
        padding: 0.4rem 0.8rem;
        border-radius: 4px;
        font-size: 0.85rem;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .${PREFIX}-save-btn:hover {
        background: rgba(70, 130, 180, 1);
      }

      .${PREFIX}-save-btn.${PREFIX}-load-btn {
        background: rgba(60, 179, 113, 0.8);
      }

      .${PREFIX}-save-btn.${PREFIX}-load-btn:hover {
        background: rgba(60, 179, 113, 1);
      }

      .${PREFIX}-save-btn:disabled {
        background: rgba(100, 100, 100, 0.5);
        cursor: not-allowed;
      }

      .${PREFIX}-save-btn.${PREFIX}-copy-btn {
        background: rgba(155, 89, 182, 0.85);
      }
      .${PREFIX}-save-btn.${PREFIX}-copy-btn:hover {
        background: rgba(155, 89, 182, 1);
      }

      .${PREFIX}-copy-source-badge {
        background: rgba(155, 89, 182, 0.85);
        color: #fff;
        padding: 0.25rem 0.6rem;
        border-radius: 4px;
        font-size: 0.8rem;
        align-self: center;
      }

      .${PREFIX}-copy-mode-header {
        background: rgba(155, 89, 182, 0.15);
        border: 1px solid rgba(155, 89, 182, 0.5);
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
        margin-bottom: 0.75rem;
        color: #ddd;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.85rem;
      }

      /* 確認ダイアログ */
      .${PREFIX}-confirm-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 400;
        border-radius: 8px;
      }

      .${PREFIX}-confirm-overlay.${PREFIX}-visible {
        display: flex;
      }

      .${PREFIX}-confirm-dialog {
        background: #2a2a3e;
        border: 1px solid #555;
        border-radius: 8px;
        padding: 1.75rem 2rem;
        width: 80%;
        max-width: 520px;
        text-align: center;
        font-family: inherit;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      }

      .${PREFIX}-confirm-message {
        color: #fff;
        margin-bottom: 1.25rem;
        line-height: 1.6;
        white-space: pre-line;
      }

      .${PREFIX}-confirm-buttons {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
      }

      .${PREFIX}-confirm-btn {
        padding: 0.5rem 1.25rem;
        border: 1px solid #888;
        border-radius: 6px;
        background: rgba(80, 80, 100, 0.5);
        color: #fff;
        font-size: 0.95rem;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.2s;
      }
      .${PREFIX}-confirm-btn:hover {
        background: rgba(80, 80, 100, 0.9);
      }
      .${PREFIX}-confirm-btn.${PREFIX}-confirm-primary {
        background: rgba(70, 130, 180, 0.9);
        border-color: rgba(70, 130, 180, 1);
      }
      .${PREFIX}-confirm-btn.${PREFIX}-confirm-primary:hover {
        background: rgba(70, 130, 180, 1);
      }
    `;
    document.head.appendChild(style);
  }

  // HTMLを動的に挿入
  _injectHTML() {
    this.container.innerHTML = `
      <div class="${PREFIX}-game-container">
        <div class="${PREFIX}-menu-buttons">
          <button class="${PREFIX}-menu-button" id="${PREFIX}-save-button">セーブ</button>
          <button class="${PREFIX}-menu-button" id="${PREFIX}-history-button">履歴</button>
          <button class="${PREFIX}-menu-button" id="${PREFIX}-settings-button">設定</button>
        </div>

        <div class="${PREFIX}-stage" id="${PREFIX}-stage">
          <img class="${PREFIX}-background-image" id="${PREFIX}-background-image" alt="背景">
          <img class="${PREFIX}-person-image ${PREFIX}-person-left" id="${PREFIX}-person-left" alt="人物左">
          <img class="${PREFIX}-person-image ${PREFIX}-person-center" id="${PREFIX}-person-center" alt="人物中央">
          <img class="${PREFIX}-person-image ${PREFIX}-person-right" id="${PREFIX}-person-right" alt="人物右">
        </div>

        <div class="${PREFIX}-message-window" id="${PREFIX}-message-window">
          <p class="${PREFIX}-speaker-name" id="${PREFIX}-speaker-name"></p>
          <p class="${PREFIX}-message-text" id="${PREFIX}-message-text"></p>
          <div class="${PREFIX}-selection-window" id="${PREFIX}-selection-window">
            <button class="${PREFIX}-selection-button" data-index="0"></button>
            <button class="${PREFIX}-selection-button" data-index="1"></button>
            <button class="${PREFIX}-selection-button" data-index="2"></button>
            <button class="${PREFIX}-selection-button" data-index="3"></button>
          </div>
          <div class="${PREFIX}-input-window" id="${PREFIX}-input-window">
            <div class="${PREFIX}-input-prompt" id="${PREFIX}-input-prompt"></div>
            <input type="text" class="${PREFIX}-input-field" id="${PREFIX}-input-field" placeholder="">
            <button class="${PREFIX}-input-submit" id="${PREFIX}-input-submit">決定</button>
          </div>
        </div>

        <div class="${PREFIX}-panel" id="${PREFIX}-history-panel">
          <div class="${PREFIX}-panel-header">
            <h2>履歴</h2>
            <button class="${PREFIX}-panel-close" id="${PREFIX}-history-close">×</button>
          </div>
          <div class="${PREFIX}-history-content" id="${PREFIX}-history-content"></div>
        </div>

        <div class="${PREFIX}-panel" id="${PREFIX}-settings-panel">
          <div class="${PREFIX}-panel-header">
            <h2>設定</h2>
            <button class="${PREFIX}-panel-close" id="${PREFIX}-settings-close">×</button>
          </div>
          <div class="${PREFIX}-settings-content">
            <div class="${PREFIX}-setting-item">
              <label>BGM音量</label>
              <input type="range" id="${PREFIX}-bgm-volume" min="0" max="100" value="50">
              <span id="${PREFIX}-bgm-volume-value">50</span>
            </div>
            <div class="${PREFIX}-setting-item">
              <label>SE音量</label>
              <input type="range" id="${PREFIX}-se-volume" min="0" max="100" value="70">
              <span id="${PREFIX}-se-volume-value">70</span>
            </div>
            <div class="${PREFIX}-setting-item ${PREFIX}-setting-checkbox">
              <label>
                <input type="checkbox" id="${PREFIX}-pixel-font">
                ドット絵風フォント
              </label>
            </div>
          </div>
        </div>

        <div class="${PREFIX}-panel" id="${PREFIX}-save-panel">
          <div class="${PREFIX}-panel-header">
            <h2>セーブ/ロード</h2>
            <button class="${PREFIX}-panel-close" id="${PREFIX}-save-close">×</button>
          </div>
          <div class="${PREFIX}-save-content" id="${PREFIX}-save-content"></div>
        </div>

        <div class="${PREFIX}-title-screen" id="${PREFIX}-title-screen">
          <div class="${PREFIX}-title-content">
            <h1 class="${PREFIX}-game-title">Chapters</h1>
            <div class="${PREFIX}-scenario-list" id="${PREFIX}-scenario-list"></div>
          </div>
        </div>

        <div class="${PREFIX}-confirm-overlay" id="${PREFIX}-confirm-overlay">
          <div class="${PREFIX}-confirm-dialog">
            <div class="${PREFIX}-confirm-message" id="${PREFIX}-confirm-message"></div>
            <div class="${PREFIX}-confirm-buttons">
              <button class="${PREFIX}-confirm-btn" id="${PREFIX}-confirm-cancel">キャンセル</button>
              <button class="${PREFIX}-confirm-btn ${PREFIX}-confirm-primary" id="${PREFIX}-confirm-ok">OK</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // DOM要素を取得
  _initElements() {
    this.elements = {
      messageWindow: document.getElementById(`${PREFIX}-message-window`),
      messageText: document.getElementById(`${PREFIX}-message-text`),
      speakerName: document.getElementById(`${PREFIX}-speaker-name`),
      selectionWindow: document.getElementById(`${PREFIX}-selection-window`),
      selectionButtons: document.querySelectorAll(`.${PREFIX}-selection-button`),
      inputWindow: document.getElementById(`${PREFIX}-input-window`),
      inputPrompt: document.getElementById(`${PREFIX}-input-prompt`),
      inputField: document.getElementById(`${PREFIX}-input-field`),
      inputSubmit: document.getElementById(`${PREFIX}-input-submit`),
      historyButton: document.getElementById(`${PREFIX}-history-button`),
      historyPanel: document.getElementById(`${PREFIX}-history-panel`),
      historyClose: document.getElementById(`${PREFIX}-history-close`),
      historyContent: document.getElementById(`${PREFIX}-history-content`),
      settingsButton: document.getElementById(`${PREFIX}-settings-button`),
      settingsPanel: document.getElementById(`${PREFIX}-settings-panel`),
      settingsClose: document.getElementById(`${PREFIX}-settings-close`),
      saveButton: document.getElementById(`${PREFIX}-save-button`),
      savePanel: document.getElementById(`${PREFIX}-save-panel`),
      saveClose: document.getElementById(`${PREFIX}-save-close`),
      saveContent: document.getElementById(`${PREFIX}-save-content`),
      bgmVolumeSlider: document.getElementById(`${PREFIX}-bgm-volume`),
      bgmVolumeValue: document.getElementById(`${PREFIX}-bgm-volume-value`),
      seVolumeSlider: document.getElementById(`${PREFIX}-se-volume`),
      seVolumeValue: document.getElementById(`${PREFIX}-se-volume-value`),
      pixelFontCheckbox: document.getElementById(`${PREFIX}-pixel-font`),
      titleScreen: document.getElementById(`${PREFIX}-title-screen`),
      scenarioList: document.getElementById(`${PREFIX}-scenario-list`),
      confirmOverlay: document.getElementById(`${PREFIX}-confirm-overlay`),
      confirmMessage: document.getElementById(`${PREFIX}-confirm-message`),
      confirmOk: document.getElementById(`${PREFIX}-confirm-ok`),
      confirmCancel: document.getElementById(`${PREFIX}-confirm-cancel`),
      backgroundImage: document.getElementById(`${PREFIX}-background-image`),
      personLeft: document.getElementById(`${PREFIX}-person-left`),
      personCenter: document.getElementById(`${PREFIX}-person-center`),
      personRight: document.getElementById(`${PREFIX}-person-right`),
    };

    // キャラ状態を管理
    this.personState = {
      left: { image: null, visible: false },
      center: { image: null, visible: false },
      right: { image: null, visible: false }
    };
  }

  // コントローラーを初期化
  _initControllers() {
    this.backgroundController = new BackgroundController(`${PREFIX}-background-image`);
    this.audioController = new AudioController();
  }

  // デバッグログ出力
  _log(category, message, data = null) {
    if (!this.debug) return;
    const prefix = `%c[shibaiinu:${category}]`;
    const style = {
      event: 'color: #87ceeb',
      flag: 'color: #98fb98',
      save: 'color: #ffd700',
      selection: 'color: #ff69b4'
    }[category] || 'color: #aaa';
    if (data) {
      console.log(prefix, style, message, data);
    } else {
      console.log(prefix, style, message);
    }
  }

  // キャラ画像を表示
  _showPerson(position, image, anim) {
    const pos = position || 'center';
    const element = this.elements[`person${pos.charAt(0).toUpperCase() + pos.slice(1)}`];
    if (!element) return;

    // 同じ画像が別の位置にある場合は消す（位置移動）
    ['left', 'center', 'right'].forEach(p => {
      if (p !== pos && this.personState[p]?.image === image && this.personState[p]?.visible) {
        this._hidePerson(p);
      }
    });

    const basePath = this.scenarios[this.currentScenarioIndex]?.assetsPath || DEFAULT_ASSETS_PATH;
    element.src = basePath + 'images/person/' + image;
    this.personState[pos] = { image, visible: true };

    const cls = animClass(PREFIX, 'in', anim);
    runAnim(
      element,
      PREFIX,
      cls,
      () => {
        element.classList.remove(cls);
        element.classList.add(`${PREFIX}-visible`);
      },
      () => {
        clearAnimClasses(element, PREFIX);
        element.classList.add(`${PREFIX}-visible`);
      }
    );
  }

  // キャラ画像を非表示
  _hidePerson(position, anim) {
    if (position === 'all') {
      ['left', 'center', 'right'].forEach(pos => this._hidePerson(pos, anim));
      return;
    }
    const pos = position || 'center';
    const element = this.elements[`person${pos.charAt(0).toUpperCase() + pos.slice(1)}`];
    if (!element) return;

    this.personState[pos] = { image: null, visible: false };

    const cls = animClass(PREFIX, 'out', anim);
    runAnim(
      element,
      PREFIX,
      cls,
      () => {
        element.classList.remove(`${PREFIX}-visible`);
        element.classList.remove(cls);
      },
      () => {
        clearAnimClasses(element, PREFIX);
        element.classList.remove(`${PREFIX}-visible`);
      }
    );
  }

  // 全キャラをリセット
  _resetPersons() {
    this._hidePerson('all');
  }

  // イベントリスナーを設定
  _bindEvents() {
    const { elements } = this;

    // メッセージ進行
    elements.messageWindow.addEventListener('click', () => this._advanceMessage());

    // キーボード操作。destroy() で取り外せるよう参照を保持する。
    this._onKeyDown = (e) => {
      if (this._isPanelOpen()) return;

      if (this.isSelectionMode) {
        // 選択肢モード
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          this._moveSelection(-1);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          this._moveSelection(1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          // Enter押しっぱなしで選択肢に到達した瞬間に確定してしまうのを防ぐ
          if (e.repeat) return;
          this._confirmSelection();
        }
      } else {
        // 通常モード
        if (e.key === 'Enter') {
          this._advanceMessage();
        }
      }
    };
    document.addEventListener('keydown', this._onKeyDown);

    // 選択肢ボタン
    elements.selectionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(e.target.dataset.index);
        this._playSystemSE('decide');
        this.isSelectionMode = false;
        this._processScenario(index);
      });
      // ホバーでも選択を更新
      btn.addEventListener('mouseenter', () => {
        if (this.isSelectionMode && btn.textContent) {
          const index = parseInt(btn.dataset.index);
          if (index !== this.selectedIndex) {
            this.selectedIndex = index;
            this._updateSelectionHighlight();
            this._playSystemSE('select');
          }
        }
      });
    });

    // コードブロックのコピー
    elements.messageText.addEventListener('click', async (e) => {
      if (e.target.classList.contains(`${PREFIX}-code-copy-btn`)) {
        e.stopPropagation();
        const btn = e.target;
        const codeId = btn.dataset.codeId;
        const codeElement = document.getElementById(codeId);
        if (codeElement) {
          try {
            await navigator.clipboard.writeText(codeElement.textContent);
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = 'Copy';
              btn.classList.remove('copied');
            }, 2000);
          } catch (err) {
            btn.textContent = 'Failed';
            setTimeout(() => {
              btn.textContent = 'Copy';
            }, 2000);
          }
        }
      }
    });

    // 履歴パネル
    elements.historyButton.addEventListener('click', () => {
      this._updateHistoryPanel();
      elements.historyPanel.classList.add(`${PREFIX}-visible`);
    });
    elements.historyClose.addEventListener('click', () => {
      elements.historyPanel.classList.remove(`${PREFIX}-visible`);
    });

    // 設定パネル
    elements.settingsButton.addEventListener('click', () => {
      elements.settingsPanel.classList.add(`${PREFIX}-visible`);
    });
    elements.settingsClose.addEventListener('click', () => {
      elements.settingsPanel.classList.remove(`${PREFIX}-visible`);
    });

    // セーブパネル
    elements.saveButton.addEventListener('click', () => {
      this.copyFromSlot = null;
      this._updateSavePanel();
      elements.savePanel.classList.add(`${PREFIX}-visible`);
    });
    elements.saveClose.addEventListener('click', () => {
      elements.savePanel.classList.remove(`${PREFIX}-visible`);
      this.copyFromSlot = null;
    });

    // 音量スライダー
    elements.bgmVolumeSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      elements.bgmVolumeValue.textContent = value;
      this.audioController.setBgmVolume(value / 100);
    });
    elements.seVolumeSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      elements.seVolumeValue.textContent = value;
      this.audioController.setSeVolume(value / 100);
    });

    // ドットフォント切り替え
    elements.pixelFontCheckbox.addEventListener('change', (e) => {
      const gameContainer = this.container.querySelector(`.${PREFIX}-game-container`);
      if (e.target.checked) {
        gameContainer.classList.add(`${PREFIX}-pixel-font`);
      } else {
        gameContainer.classList.remove(`${PREFIX}-pixel-font`);
      }
      localStorage.setItem(`${this.storageKey}_pixelFont`, e.target.checked);
    });

    // 入力フォーム
    elements.inputSubmit.addEventListener('click', () => this._submitInput());
    elements.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._submitInput();
      }
    });

    // 保存された設定を復元
    this._loadSettings();
  }

  // 入力を確定
  _submitInput() {
    if (!this.isInputMode) return;

    const value = this.elements.inputField.value.trim();
    if (!value) return; // 空は許可しない

    // フラグに保存
    if (this.currentScenario && this.currentInputFlagName) {
      this.currentScenario.setFlag(this.currentInputFlagName, value);
      this._log('flag', `入力保存: ${this.currentInputFlagName} = "${value}"`);
    }

    // 入力モード終了
    this.isInputMode = false;
    this.elements.inputWindow.classList.remove(`${PREFIX}-visible`);
    this.elements.inputField.value = '';

    // SE
    this._playSystemSE('decide');

    // 次のイベントへ
    this._processScenario(value);
  }

  // 設定を読み込み
  _loadSettings() {
    const saved = localStorage.getItem(`${this.storageKey}_pixelFont`);
    // 保存された値があればそれを使用、なければデフォルト設定を使用
    const pixelFont = saved !== null ? saved === 'true' : this.defaultPixelFont;
    this.elements.pixelFontCheckbox.checked = pixelFont;
    if (pixelFont) {
      this.container.querySelector(`.${PREFIX}-game-container`).classList.add(`${PREFIX}-pixel-font`);
    }
  }

  // メッセージ進行処理
  _advanceMessage() {
    if (this._isPanelOpen() || this.elements.titleScreen.classList.contains(`${PREFIX}-visible`)) {
      return;
    }

    // 選択肢/入力/待機モード中はクリックでは進めない
    if (this.isSelectionMode || this.isInputMode || this.isWaiting) {
      return;
    }

    if (this.isTyping) {
      this._skipTypewriter();
    } else {
      this._processScenario();
    }
  }

  // パネルが開いているか
  _isPanelOpen() {
    return this.elements.historyPanel.classList.contains(`${PREFIX}-visible`) ||
           this.elements.settingsPanel.classList.contains(`${PREFIX}-visible`) ||
           this.elements.savePanel.classList.contains(`${PREFIX}-visible`);
  }

  // 動的に innerHTML へ流す文字列のエスケープ用
  _escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // タイプライター効果
  // waits: Map<textContentIndex, extraDelayMs>
  _typewrite(html, onComplete, waits) {
    // ロード中などで前のタイプライターが走っていた場合、ここで明示的に止めておく。
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const textContent = tempDiv.textContent || '';

    let charIndex = 0;
    this.fullHtml = html;
    this.isTyping = true;
    this.elements.messageText.innerHTML = '';

    const waitFor = (pos) => (waits && waits.get(pos)) || 0;

    const type = () => {
      if (charIndex < textContent.length) {
        this.elements.messageText.innerHTML = this._buildPartialHtml(html, charIndex + 1);
        charIndex++;
        const extra = waitFor(charIndex);
        this.typewriterTimer = setTimeout(type, this.typewriterSpeed + extra);
      } else {
        this.elements.messageText.innerHTML = html;
        this.isTyping = false;
        if (onComplete) onComplete();
      }
    };

    // 先頭での [wait:N] に対応
    const initial = waitFor(0);
    if (initial) {
      this.typewriterTimer = setTimeout(type, initial);
    } else {
      type();
    }
  }

  // 部分的なHTMLを構築
  _buildPartialHtml(html, maxChars) {
    const result = [];
    let charCount = 0;
    let inTag = false;
    let currentTag = '';
    let i = 0;

    while (i < html.length) {
      // コードブロックの検出
      if (html.substring(i, i + 30).includes(`class="${PREFIX}-code-block"`)) {
        const startMatch = html.substring(i).match(new RegExp(`<div class="${PREFIX}-code-block"`));
        if (startMatch && html.substring(i, i + startMatch[0].length) === startMatch[0]) {
          let depth = 0;
          let j = i;
          while (j < html.length) {
            if (html.substring(j, j + 4) === '<div') {
              depth++;
              j += 4;
            } else if (html.substring(j, j + 6) === '</div>') {
              depth--;
              if (depth === 0) {
                result.push(html.substring(i, j + 6));
                i = j + 6;
                break;
              }
              j += 6;
            } else {
              j++;
            }
          }
          continue;
        }
      }

      const char = html[i];

      if (char === '<') {
        inTag = true;
        currentTag = '<';
      } else if (char === '>') {
        inTag = false;
        currentTag += '>';
        result.push(currentTag);
        currentTag = '';
      } else if (inTag) {
        currentTag += char;
      } else {
        if (charCount < maxChars) {
          result.push(char);
          charCount++;
        }
      }
      i++;
    }

    return result.join('');
  }

  // タイプライターをスキップ
  _skipTypewriter() {
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
    this.elements.messageText.innerHTML = this.fullHtml;
    this.isTyping = false;
  }

  // メッセージを表示
  _showMessage(message) {
    const { elements } = this;

    elements.messageWindow.classList.remove(`${PREFIX}-hidden`);
    elements.messageText.classList.remove(`${PREFIX}-hidden`);
    elements.speakerName.classList.remove(`${PREFIX}-hidden`);
    elements.selectionWindow.classList.remove(`${PREFIX}-visible`);
    elements.inputWindow.classList.remove(`${PREFIX}-visible`);
    this.isSelectionMode = false;
    this.isInputMode = false;

    elements.speakerName.textContent = message.speaker || '';

    const { stripped, waits } = extractWaits(message.text || '');
    const html = this._parseTextTags(stripped);
    this._typewrite(html, undefined, waits);

    // キャラ画像（position: 'left' | 'center' | 'right' | 'all'）
    if (message.image) {
      this._showPerson(message.position || 'center', message.image, message.imageAnim);
    } else if (message.image === null) {
      this._hidePerson(message.position || 'center', message.imageAnim);
    }

    // 背景画像
    if (message.background) {
      this.backgroundController.setImages([message.background]);
      this.backgroundController.show(message.backgroundAnim);
    } else if (message.background === null) {
      this.backgroundController.hide(message.backgroundAnim);
    }

    // 背景表示モード
    if (message.backgroundFit) {
      this.backgroundController.setFit(message.backgroundFit);
    }

    // BGM
    if (message.bgm) {
      this.audioController.playBgm(message.bgm);
    } else if (message.bgm === null) {
      this.audioController.fadeOutBgm();
    }

    // SE
    if (message.se) {
      this.audioController.playSe(message.se);
    }
  }

  // テキストタグをパース（PREFIX/フラグを注入）
  _parseTextTags(text) {
    return parseTextTags(text, {
      classPrefix: PREFIX,
      flags: this.currentScenario ? this.currentScenario.flags : null
    });
  }

  // 選択肢を表示
  _showSelection(choices, prompt) {
    const { elements } = this;

    if (prompt) {
      elements.messageText.classList.remove(`${PREFIX}-hidden`);
      elements.messageText.innerHTML = this._parseTextTags(prompt);
    } else {
      elements.messageText.classList.add(`${PREFIX}-hidden`);
    }
    elements.speakerName.classList.add(`${PREFIX}-hidden`);
    elements.selectionWindow.classList.add(`${PREFIX}-visible`);
    elements.selectionButtons.forEach((btn, i) => {
      btn.textContent = choices[i] || '';
      btn.classList.remove(`${PREFIX}-selected`);
    });

    // 選択肢モード開始
    this.isSelectionMode = true;
    this.selectedIndex = 0;
    this.currentChoicesCount = choices.length;
    this._updateSelectionHighlight();
  }

  // 選択肢のハイライト更新
  _updateSelectionHighlight() {
    const { elements } = this;
    elements.selectionButtons.forEach((btn, i) => {
      if (i === this.selectedIndex) {
        btn.classList.add(`${PREFIX}-selected`);
      } else {
        btn.classList.remove(`${PREFIX}-selected`);
      }
    });
  }

  // 選択肢を移動
  _moveSelection(direction) {
    const newIndex = this.selectedIndex + direction;
    if (newIndex >= 0 && newIndex < this.currentChoicesCount) {
      this.selectedIndex = newIndex;
      this._updateSelectionHighlight();
      this._playSystemSE('select');
    }
  }

  // 選択を確定
  _confirmSelection() {
    this._playSystemSE('decide');
    this.isSelectionMode = false;
    this._processScenario(this.selectedIndex);
  }

  // システムSEを再生（シナリオとは別のシステムパスを使用）
  _playSystemSE(type) {
    const file = this.systemSE[type];
    if (file) {
      const systemSePath = 'shibaiinu/assets/system/audio/se/';
      const audio = new Audio(systemSePath + file);
      audio.volume = this.audioController.seVolume;
      audio.play().catch(() => {});
    }
  }

  // 履歴パネルを更新
  _updateHistoryPanel() {
    if (!this.currentScenario) return;

    const history = this.currentScenario.getHistory();
    this.elements.historyContent.innerHTML = history
      .filter(item => item.text)
      .map(item => {
        const speakerHtml = item.speaker
          ? `<div class="${PREFIX}-history-speaker">${this._escapeHtml(item.speaker)}</div>`
          : '';
        const itemClass = item.type === 'selection'
          ? `${PREFIX}-history-item selection`
          : `${PREFIX}-history-item`;
        const plainText = item.text.replace(/\[.*?\]/g, '');
        return `
          <div class="${itemClass}">
            ${speakerHtml}
            <div class="${PREFIX}-history-text">${this._escapeHtml(plainText)}</div>
          </div>
        `;
      }).join('');

    this.elements.historyContent.scrollTop = this.elements.historyContent.scrollHeight;
  }

  // シナリオ処理
  _processScenario(selectedIndex) {
    if (!this.currentScenario) return;

    if (this.currentScenario.isEnd()) {
      this._log('event', 'scenario end');
      if (this.scenarios.length > 1) {
        this._returnToTitle();
      } else {
        this.currentScenario.reset();
        this.currentScenario.start();
        this._resetPersons();
        this.backgroundController.reset();
        this.audioController.stopBgm();
        this._processScenario();
      }
      return;
    }

    const eventId = this.currentScenario.currentId;
    const result = this.currentScenario.process(selectedIndex);
    if (!result) return;

    if (result.type === 'message') {
      this._log('event', `[${eventId}] message`, {
        speaker: result.speaker,
        text: result.text?.substring(0, 30) + (result.text?.length > 30 ? '...' : ''),
        flags: { ...this.currentScenario.flags }
      });
      this._showMessage(result);
    } else if (result.type === 'selection') {
      this._log('selection', `[${eventId}] choices`, result.choices);
      this._showSelection(result.choices, result.prompt);
    } else if (result.type === 'selected') {
      this._log('selection', `selected: ${selectedIndex}`, { flags: { ...this.currentScenario.flags } });
      this._processScenario();
    } else if (result.type === 'input') {
      this._log('event', `[${eventId}] input`, { flagName: result.flagName, prompt: result.prompt });
      this._showInput(result);
    } else if (result.type === 'inputted') {
      this._log('flag', `input: ${result.flagName} = "${result.value}"`, { flags: { ...this.currentScenario.flags } });
      this._processScenario();
    } else if (result.type === 'wait') {
      this._log('event', `[${eventId}] wait ${result.duration}ms`);
      this.isWaiting = true;
      this.waitTimer = setTimeout(() => {
        this.waitTimer = null;
        this.isWaiting = false;
        this._processScenario();
      }, result.duration);
    } else if (result.type === 'waited') {
      this._processScenario();
    }
  }

  // 入力フォームを表示
  _showInput(inputData) {
    const { elements } = this;

    elements.messageText.classList.add(`${PREFIX}-hidden`);
    elements.speakerName.classList.add(`${PREFIX}-hidden`);
    elements.selectionWindow.classList.remove(`${PREFIX}-visible`);

    elements.inputPrompt.textContent = inputData.prompt;
    elements.inputField.placeholder = inputData.placeholder || '';
    elements.inputField.value = inputData.defaultValue || '';
    elements.inputField.maxLength = inputData.maxLength || 50;
    elements.inputWindow.classList.add(`${PREFIX}-visible`);

    this.isInputMode = true;
    this.currentInputFlagName = inputData.flagName;

    // フォーカス
    setTimeout(() => elements.inputField.focus(), 100);
  }

  // タイトル画面を表示
  _showTitleScreen() {
    const { elements } = this;

    elements.scenarioList.innerHTML = '';
    this.scenarios.forEach((item, index) => {
      const button = document.createElement('button');
      button.className = `${PREFIX}-scenario-button`;
      button.innerHTML = `
        <div class="${PREFIX}-scenario-title">${this._escapeHtml(item.title)}</div>
        <div class="${PREFIX}-scenario-description">${this._escapeHtml(item.description)}</div>
      `;
      button.addEventListener('click', () => this._startScenario(index));
      elements.scenarioList.appendChild(button);
    });
    elements.titleScreen.classList.add(`${PREFIX}-visible`);
  }

  // UI状態をリセット（タイプライター/選択肢/入力フォーム）
  _resetUIState() {
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
    this.isTyping = false;
    this.fullHtml = '';
    this.isSelectionMode = false;
    this.selectedIndex = 0;
    this.currentChoicesCount = 0;
    this.isInputMode = false;
    this.currentInputFlagName = null;
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    this.isWaiting = false;
    this.elements.selectionWindow.classList.remove(`${PREFIX}-visible`);
    this.elements.inputWindow.classList.remove(`${PREFIX}-visible`);
    this.elements.inputField.value = '';
  }

  // シナリオを開始（skipProcess: trueでメッセージ表示をスキップ）
  _startScenario(index, skipProcess = false) {
    const scenarioData = this.scenarios[index];
    const basePath = scenarioData.assetsPath || DEFAULT_ASSETS_PATH;

    this.backgroundController.setBasePath(basePath + 'images/backgrounds/');
    this.audioController.setBasePath(basePath + 'audio/');

    this.currentScenarioIndex = index;
    this.currentScenario = scenarioData.scenario;
    this.currentScenario.reset();
    this.currentScenario.start();
    this._resetPersons();
    this.backgroundController.reset();
    this.audioController.stopBgm();
    this._resetUIState();
    this.elements.titleScreen.classList.remove(`${PREFIX}-visible`);
    if (!skipProcess) {
      this._processScenario();
    }
  }

  // タイトル画面に戻る
  _returnToTitle() {
    if (this.currentScenario) {
      this.currentScenario.reset();
    }
    this._resetPersons();
    this.backgroundController.reset();
    this.audioController.stopBgm();
    this._showTitleScreen();
  }

  // 公開メソッド: エンジンを開始
  start() {
    if (this.scenarios.length === 1) {
      this._startScenario(0);
    } else {
      this._showTitleScreen();
    }
  }

  // 公開メソッド: シナリオを追加
  addScenario(scenarioData) {
    this.scenarios.push(scenarioData);
  }

  // === セーブ/ロード機能 ===

  // セーブデータを作成
  _createSaveData() {
    if (!this.currentScenario) return null;

    const currentEvent = this.currentScenario.getCurrentEvent();
    const messageIndex = currentEvent instanceof MessageEvent ? currentEvent.index : 0;

    return {
      scenarioIndex: this.currentScenarioIndex,
      scenarioId: this.scenarios[this.currentScenarioIndex]?.id,
      eventId: this.currentScenario.currentId,
      messageIndex,
      flags: { ...this.currentScenario.flags },
      history: [...this.currentScenario.history],
      timestamp: Date.now(),
      // 表示状態
      visual: {
        persons: { ...this.personState },
        backgroundImage: this.backgroundController.isVisible ? this.backgroundController.images[this.backgroundController.currentIndex] : null,
        backgroundFit: this.elements.backgroundImage.style.objectFit || 'cover',
        bgm: this.audioController.currentBgm
      }
    };
  }

  // セーブを実行
  _saveToSlot(slotKey) {
    const data = this._createSaveData();
    if (!data) return false;

    try {
      localStorage.setItem(`${this.storageKey}_${slotKey}`, JSON.stringify(data));
      this._log('save', `saved: ${slotKey}`, { eventId: data.eventId, flags: data.flags });
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }

  // ロードを実行
  _loadFromSlot(slotKey) {
    try {
      const json = localStorage.getItem(`${this.storageKey}_${slotKey}`);
      if (!json) return false;

      const data = JSON.parse(json);

      // 旧バージョン/破損データでタイトル画面に戻れなくならないよう、復元前に最低限の形を検証する。
      const validationError = this._validateSaveData(data);
      if (validationError) {
        console.warn(`Load aborted (${slotKey}): ${validationError}`);
        return false;
      }

      // シナリオを開始（メッセージ表示はスキップ）
      this._startScenario(data.scenarioIndex, true);

      // 状態を復元
      this.currentScenario.jumpTo(data.eventId);
      this.currentScenario.flags = { ...data.flags };
      this.currentScenario.history = data.history ? [...data.history] : [];

      // MessageEvent の途中だった場合、表示中だったメッセージから再開する
      // process() は index を進めて messages[index] を返すので、表示済みインデックスに戻す。
      // また beforeHandler は最初の遷移時に発火済みなので、復元時の再発火を抑止する。
      const restoredEvent = this.currentScenario.getCurrentEvent();
      if (restoredEvent instanceof MessageEvent && data.messageIndex > 0) {
        restoredEvent.index = data.messageIndex - 1;
        restoredEvent._skipBefore = true;
      }

      this._log('save', `loaded: ${slotKey}`, { eventId: data.eventId, messageIndex: data.messageIndex, flags: data.flags });

      // 表示状態を復元
      if (data.visual) {
        // キャラ画像（複数対応）
        if (data.visual.persons) {
          ['left', 'center', 'right'].forEach(pos => {
            const p = data.visual.persons[pos];
            if (p && p.visible && p.image) {
              this._showPerson(pos, p.image);
            }
          });
        } else if (data.visual.personImage) {
          // 旧形式との互換性
          this._showPerson('center', data.visual.personImage);
        }
        // 背景画像
        if (data.visual.backgroundImage) {
          this.backgroundController.setImages([data.visual.backgroundImage]);
          this.backgroundController.show();
          this.backgroundController.setFit(data.visual.backgroundFit || 'cover');
        }
        // BGM
        if (data.visual.bgm) {
          this.audioController.playBgm(data.visual.bgm);
        }
      }

      // UIを更新
      this._processScenario();

      return true;
    } catch (e) {
      console.error('Load failed:', e);
      return false;
    }
  }

  // スロットのセーブデータを取得
  _getSaveData(slotKey) {
    try {
      const json = localStorage.getItem(`${this.storageKey}_${slotKey}`);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      return null;
    }
  }

  // セーブデータの最低限のスキーマを検証する。問題があればエラーメッセージを返す。
  // 旧形式や手で壊した localStorage で起動不能にならないようガードする目的なので、
  // 寛容なチェックに留め、厳格なバージョニングまではしない。
  _validateSaveData(data) {
    if (!data || typeof data !== 'object') return 'data is not an object';
    if (!Number.isInteger(data.scenarioIndex) ||
        data.scenarioIndex < 0 ||
        data.scenarioIndex >= this.scenarios.length) {
      return `scenarioIndex out of range: ${data.scenarioIndex}`;
    }
    const scenarioData = this.scenarios[data.scenarioIndex];
    if (!scenarioData?.scenario?.eventMap) return 'scenario or eventMap missing';
    if (typeof data.eventId !== 'string' || !scenarioData.scenario.eventMap[data.eventId]) {
      return `eventId not found in scenario: ${data.eventId}`;
    }
    if (data.flags != null && (typeof data.flags !== 'object' || Array.isArray(data.flags))) {
      return 'flags must be a plain object';
    }
    if (data.history != null && !Array.isArray(data.history)) {
      return 'history must be an array';
    }
    return null;
  }

  // オートセーブ
  _autoSave() {
    this._saveToSlot('auto');
  }

  // セーブパネルを更新
  _updateSavePanel() {
    const { elements } = this;
    const inCopyMode = !!this.copyFromSlot;

    let html = '';

    if (inCopyMode) {
      html += `
        <div class="${PREFIX}-copy-mode-header">
          <span>${this._escapeHtml(this._slotLabel(this.copyFromSlot))} のコピー先を選択</span>
          <button class="${PREFIX}-save-btn" data-action="exitCopy">キャンセル</button>
        </div>
      `;
    }

    html += `<div class="${PREFIX}-save-section">`;

    for (let i = 1; i <= this.saveSlots; i++) {
      const slotKey = `slot${i}`;
      const data = this._getSaveData(slotKey);
      const basePath = data ? (this.scenarios[data.scenarioIndex]?.assetsPath || DEFAULT_ASSETS_PATH) : '';
      const thumbnailBg = data?.visual?.backgroundImage
        ? `<img class="${PREFIX}-thumb-bg" src="${this._escapeHtml(basePath + 'images/backgrounds/' + data.visual.backgroundImage)}" alt="">`
        : '';

      // キャラクターサムネイル
      let thumbnailPersons = '';
      if (data?.visual?.persons) {
        ['left', 'center', 'right'].forEach(pos => {
          const p = data.visual.persons[pos];
          if (p && p.visible && p.image) {
            thumbnailPersons += `<img class="${PREFIX}-thumb-person ${PREFIX}-thumb-person-${pos}" src="${this._escapeHtml(basePath + 'images/person/' + p.image)}" alt="">`;
          }
        });
      }

      const infoHtml = data
        ? `
          <div class="${PREFIX}-save-slot-title">スロット${i}: ${this._escapeHtml(this.scenarios[data.scenarioIndex]?.title || 'Unknown')}</div>
          <div class="${PREFIX}-save-slot-date">${this._escapeHtml(this._formatDate(data.timestamp))}</div>
        `
        : `<div class="${PREFIX}-save-slot-empty">スロット${i}: 空き</div>`;

      let buttonsHtml;
      if (inCopyMode) {
        if (slotKey === this.copyFromSlot) {
          buttonsHtml = `<span class="${PREFIX}-copy-source-badge">コピー元</span>`;
        } else {
          const label = data ? '上書きしてコピー' : 'ここにコピー';
          buttonsHtml = `
            <button class="${PREFIX}-save-btn ${PREFIX}-copy-btn"
                    data-action="copyTo" data-slot="${slotKey}">${label}</button>
          `;
        }
      } else {
        buttonsHtml = `
          <button class="${PREFIX}-save-btn"
                  data-action="save" data-slot="${slotKey}"
                  ${!this.currentScenario ? 'disabled' : ''}>セーブ</button>
          <button class="${PREFIX}-save-btn ${PREFIX}-load-btn"
                  data-action="load" data-slot="${slotKey}"
                  ${!data ? 'disabled' : ''}>ロード</button>
          <button class="${PREFIX}-save-btn ${PREFIX}-copy-btn"
                  data-action="enterCopy" data-slot="${slotKey}"
                  ${!data ? 'disabled' : ''}>コピー</button>
        `;
      }

      html += `
        <div class="${PREFIX}-save-slot">
          <div class="${PREFIX}-save-slot-thumbnail">
            ${thumbnailBg}${thumbnailPersons}
          </div>
          <div class="${PREFIX}-save-slot-info">
            ${infoHtml}
          </div>
          <div class="${PREFIX}-save-slot-buttons">
            ${buttonsHtml}
          </div>
        </div>
      `;
    }
    html += `</div>`;

    elements.saveContent.innerHTML = html;

    // inline onclick を廃止して data-action で配線する（CSP 対応 / グローバル露出回避）
    elements.saveContent.querySelectorAll('button[data-action]').forEach(btn => {
      const action = btn.dataset.action;
      const slot = btn.dataset.slot;
      btn.addEventListener('click', () => {
        switch (action) {
          case 'save':      this._saveSlot(slot);       break;
          case 'load':      this._loadSlot(slot);       break;
          case 'enterCopy': this._enterCopyMode(slot);  break;
          case 'exitCopy':  this._exitCopyMode();       break;
          case 'copyTo':    this._copyToSlot(slot);     break;
        }
      });
    });
  }

  // 確認ダイアログ。Promise<boolean> を返す
  _confirm(message, { confirmText = 'OK', cancelText = 'キャンセル' } = {}) {
    return new Promise(resolve => {
      const { confirmOverlay, confirmMessage, confirmOk, confirmCancel } = this.elements;
      confirmMessage.textContent = message;
      confirmOk.textContent = confirmText;
      confirmCancel.textContent = cancelText;
      confirmOverlay.classList.add(`${PREFIX}-visible`);

      const cleanup = (result) => {
        confirmOverlay.classList.remove(`${PREFIX}-visible`);
        confirmOk.removeEventListener('click', onOk);
        confirmCancel.removeEventListener('click', onCancel);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      confirmOk.addEventListener('click', onOk);
      confirmCancel.addEventListener('click', onCancel);
    });
  }

  // スロットにセーブ（UI用）
  async _saveSlot(slotKey) {
    const existing = this._getSaveData(slotKey);
    if (existing) {
      const ok = await this._confirm(`${this._slotLabel(slotKey)} には既にセーブデータがあります。\n上書きしますか？`, { confirmText: '上書き' });
      if (!ok) return;
    }
    if (this._saveToSlot(slotKey)) {
      this._updateSavePanel();
    }
  }

  // スロットからロード（UI用）
  _loadSlot(slotKey) {
    if (this._loadFromSlot(slotKey)) {
      this.elements.savePanel.classList.remove(`${PREFIX}-visible`);
    }
  }

  // スロット表示名（"slot1" → "スロット1"）
  _slotLabel(slotKey) {
    const m = slotKey.match(/^slot(\d+)$/);
    return m ? `スロット${m[1]}` : slotKey;
  }

  // コピーモードに入る
  _enterCopyMode(slotKey) {
    this.copyFromSlot = slotKey;
    this._updateSavePanel();
  }

  // コピーモード終了
  _exitCopyMode() {
    this.copyFromSlot = null;
    this._updateSavePanel();
  }

  // コピー実行
  async _copyToSlot(toSlot) {
    const fromSlot = this.copyFromSlot;
    if (!fromSlot || fromSlot === toSlot) return;
    const source = this._getSaveData(fromSlot);
    if (!source) {
      this._exitCopyMode();
      return;
    }
    const existing = this._getSaveData(toSlot);
    if (existing) {
      const ok = await this._confirm(`${this._slotLabel(toSlot)} には既にセーブデータがあります。\n${this._slotLabel(fromSlot)} の内容で上書きしますか？`, { confirmText: '上書きしてコピー' });
      if (!ok) return;
    }
    try {
      localStorage.setItem(`${this.storageKey}_${toSlot}`, JSON.stringify(source));
      this._log('save', `copied: ${fromSlot} → ${toSlot}`);
    } catch (e) {
      console.error('Copy failed:', e);
    }
    this._exitCopyMode();
  }

  // 日付フォーマット
  _formatDate(timestamp) {
    const date = new Date(timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${h}:${min}`;
  }
}
