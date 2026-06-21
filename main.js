import { ShibaiinuEngine } from './shibaiinu/engine.js';
import { sampleGame } from './shibaiinu/scenario/sampleGame.js';

const scenarios = [
  {
    id: 'sampleGame',
    title: 'チュートリアル',
    description: 'チュートリアル',
    scenario: sampleGame,
    assetsPath: 'shibaiinu/assets/system/sample_game/'
  }
];

document.addEventListener('DOMContentLoaded', () => {
  const engine = new ShibaiinuEngine('game-container', {
    scenarios,
    selectSE: 'select.mp3',
    decideSE: 'decide.mp3'
  });
  engine.start();
});
