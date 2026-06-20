import { BaseEvent } from './base.js'

export class MessageEvent extends BaseEvent {

    // messages: 文字列またはオブジェクトの配列
    // オブジェクトの場合: { speaker, image, position, imageAnim, background, backgroundFit, backgroundAnim, bgm, se, text }
    constructor(messages, beforeHandler, afterHandler) {
        super({ beforeHandler, afterHandler })
        this.messages = messages.map(m => {
            if (typeof m === 'string') {
                return { speaker: null, image: undefined, background: undefined, backgroundFit: undefined, bgm: undefined, se: undefined, text: m }
            }
            return {
                speaker: m.speaker || null,
                image: m.image,
                position: m.position,
                imageAnim: m.imageAnim,         // 'fade' | 'slide-left|right|top|bottom'
                background: m.background,
                backgroundFit: m.backgroundFit,
                backgroundAnim: m.backgroundAnim, // 'fade' | 'slide-left|right|top|bottom'
                bgm: m.bgm,
                se: m.se,
                text: m.text
            }
        })
        this.index = 0
        // セーブからの復元時、beforeHandler を再発火させないためのワンショットフラグ。
        this._skipBefore = false
    }

    getMessage() {
        return this.messages[this.index]
    }

    getText() {
        return this.getMessage().text
    }

    updateIndex() {
        this.index++
    }

    isBeforeSetUp() {
        return this.index == 0
    }

    isEndEvent() {
        return this.index >= this.messages.length
    }

    process() {
        if (this.isBeforeSetUp() && !this._skipBefore) {
            this.handleBefore()
        }
        this._skipBefore = false
        const message = this.getMessage()
        this.updateIndex()
        if (this.isEndEvent() && this.afterHandler) {
            this.afterHandler()
        }
        return message
    }

    reset() {
        this.index = 0
        this._skipBefore = false
    }
}
