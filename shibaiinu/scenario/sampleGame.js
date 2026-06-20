import { Scenario } from '../core/scenario.js';
import { MessageEvent, SelectionEvent, InputEvent, WaitEvent } from '../core/events/index.js';

export const sampleGame = new Scenario({
  "start": {
    event: new MessageEvent([
      { bgm: "chakapoko.mp3"},
      { background: "shibaiinu_bg.png"},
      { image: "shibachan.png", imageAnim: "slide-bottom", speaker: "シバちゃん", text: "こんにちは！　[color:orange]Shibaiinu.js[/color]はシンプルなノベルゲームを作れるフレームワークだよ！" },
      { speaker: "シバちゃん", text: "[color:orange]HTML[/color]と[color:aqua]CSS[/color]と[color:yellow]JS[/color]で動いているよ！[br]難しいことはできないけれど、工夫次第でいろいろなことができるんだ！" },
      { speaker: "シバちゃん", text: "テキストは[b]太字[/b]、[shake]震え[/shake]、[color:#ff69b4]色変え[/color]、[br]ぜんぶ自由自在だよ！" },
      { speaker: "シバちゃん", text: "...[wait:600]こんな風に途中で間を作ることもできるんだ。" },
      { speaker: "シバちゃん", image: null, imageAnim: "slide-bottom", text: "キャラクターは一旦消えたり" },
      { image: "shibachan.png", imageAnim: "slide-top", speaker: "シバちゃん", text: "出てきたり" },
      { image: "shibachan2.png", position: "left", imageAnim: "slide-left", speaker: "シバちゃん", text: "分身の術〜！" },
      { image: "shibachan3.png", position: "right", imageAnim: "slide-right", speaker: "シバちゃん", text: "3人までキャラクターを出せるんだ！" },
      { image: null, position: "all", imageAnim: "slide-top" },
      { image: "shibachan.png", imageAnim: "fade", speaker: "シバちゃん", text: "フェードでふんわり登場することもできるよ。" },
      { bgm: null},
      { background: null, backgroundAnim: "fade", speaker: "シバちゃん", text: "暗転させて場面転換の演出もできちゃう！" },
      { image: null, imageAnim: "slide-bottom" },
      { background: "shibaiinu_bg.png", backgroundFit: "cover", backgroundAnim: "fade" },
      { bgm: "chakapoko.mp3"},
      { image: "shibachan.png", imageAnim: "fade", speaker: "シバちゃん", text: "[shake]戻ってきた〜！[/shake]" },
      { se: "horns.mp3", speaker: "シバちゃん", text: "[b]効果音（SE）[/b]も鳴らせるよ！" },
      { speaker: "シバちゃん", text: "決定音、ドアの音、通知音とか、[br]演出のアクセントに自由に使えるんだ！" },
      { speaker: "シバちゃん", text: "他にも[b]選択肢[/b]、[b]名前入力[/b]、[b]フラグ分岐[/b]、[b]セーブ/ロード[/b]とか、[br]ノベルゲームに必要なものは一通り揃ってるよ！" },
      { speaker: "シバちゃん", text: "ちなみに今までのシーン、こんな感じでシナリオを書いてるんだ。[code]new MessageEvent([[br]  { background: \"shibaiinu_bg.png\" },[br]  { image: \"shibachan.png\", speaker: \"シバちゃん\",[br]    text: \"こんにちは！\" },[br]  { background: \"turu1.png\", backgroundAnim: \"fade\" },[br]  { se: \"notify.mp3\", text: \"効果音も鳴らせるよ\" },[br]  { image: null, imageAnim: \"fade\",[br]    text: \"またね〜\" },[br]])[/code]" },
      { speaker: "シバちゃん", text: "オブジェクトを順番に並べるだけだから、[br]プログラム初心者でも直感的に書けるんだ！" },
      { speaker: "シバちゃん", text: "詳しい使い方は[color:orange]usage.html[/color]を見てみてね！" },
      { speaker: "シバちゃん", text: "どうどう？ここまでで驚いた！？" },
    ]),
    next: "question"
  },
  "question": {
    event: new SelectionEvent(["うん、驚いた！", "そうでもないかも..."]),
    next: { 0: "surprize", 1: "no_surprize" }
  },
  "surprize": {
    event: new MessageEvent([
      { speaker: "シバちゃん", text: "ほんとほんと？嬉しいな~!!!" },
    ]),
    next: "end"
  },
  "no_surprize": {
    event: new MessageEvent([
      { speaker: "シバちゃん", text: "え〜！ちょっとショック！" },
    ]),
    next: "end"
  },
  "end": {
    event: new MessageEvent([
      "王道のノベルゲーム、研修資料のゲーミフィケーション...などなど可能性は無限大！[br][color:orange]Shibaiinu.js[/color]をよろしくね！",
      "クリックでもう一度最初から"
    ]),
    next: null
  }
});
