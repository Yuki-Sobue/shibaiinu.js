import { BaseEvent } from './base.js'

// 指定ミリ秒だけ間を開けるイベント。クリックでスキップされず、自動で next へ進む。
export class WaitEvent extends BaseEvent {

    constructor(durationMs, options = {}) {
        super({ beforeHandler: options.beforeHandler, afterHandler: options.afterHandler })
        this.duration = durationMs
        this.isSetUp = false
    }

    process() {
        if (!this.isSetUp) {
            this.handleBefore()
            this.isSetUp = true
            return { duration: this.duration }
        }
        if (this.afterHandler) this.afterHandler()
        return null
    }

    reset() {
        this.isSetUp = false
    }
}
