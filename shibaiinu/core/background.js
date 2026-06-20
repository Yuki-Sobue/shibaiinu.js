import { animClass, runAnim, clearAnimClasses } from './util/animation.js';

const PREFIX = 'shibaiinu';

export class BackgroundController {
  constructor(elementId, basePath = 'assets/system/images/backgrounds/') {
    this.element = document.getElementById(elementId);
    this.basePath = basePath;
    this.images = [];
    this.currentIndex = -1;
    this.isVisible = false;
  }

  show(anim) {
    if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }
    this.element.src = this.basePath + this.images[this.currentIndex];
    this.isVisible = true;
    const cls = animClass(PREFIX, 'in', anim);
    runAnim(
      this.element,
      PREFIX,
      cls,
      () => {
        this.element.classList.remove(cls);
        this.element.classList.add(`${PREFIX}-visible`);
      },
      () => {
        clearAnimClasses(this.element, PREFIX);
        this.element.classList.add(`${PREFIX}-visible`);
      }
    );
  }

  hide(anim) {
    this.isVisible = false;
    const cls = animClass(PREFIX, 'out', anim);
    runAnim(
      this.element,
      PREFIX,
      cls,
      () => {
        this.element.classList.remove(`${PREFIX}-visible`);
        this.element.classList.remove(cls);
      },
      () => {
        clearAnimClasses(this.element, PREFIX);
        this.element.classList.remove(`${PREFIX}-visible`);
      }
    );
  }

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.images.length;
    this.element.src = this.basePath + this.images[this.currentIndex];
    this.element.classList.add(`${PREFIX}-visible`);
    this.isVisible = true;
  }

  set(index) {
    if (index >= 0 && index < this.images.length) {
      this.currentIndex = index;
      this.element.src = this.basePath + this.images[this.currentIndex];
      this.element.classList.add(`${PREFIX}-visible`);
      this.isVisible = true;
    }
  }

  setImages(imageList) {
    this.images = imageList;
    this.currentIndex = -1;
  }

  reset() {
    clearAnimClasses(this.element, PREFIX);
    this.element.classList.remove(`${PREFIX}-visible`);
    this.currentIndex = -1;
    this.isVisible = false;
    this.setFit('cover'); // デフォルトに戻す
  }

  setBasePath(path) {
    this.basePath = path;
  }

  // 表示モード: 'cover'(画面を埋める) / 'contain'(全体を表示)
  setFit(mode) {
    this.element.style.objectFit = mode;
  }
}
