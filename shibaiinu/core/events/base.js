// 全イベントの基底クラス
// 派生クラスは process() と reset() を実装する
export class BaseEvent {

    constructor({ beforeHandler = null, afterHandler = null } = {}) {
        this.beforeHandler = beforeHandler
        this.afterHandler = afterHandler
    }

    handleBefore() {
        if (this.beforeHandler) this.beforeHandler()
    }

    // 派生クラスで実装
    process(_input) {
        throw new Error(`${this.constructor.name}.process() is not implemented`)
    }

    // jumpTo 時にイベント状態を初期化する
    reset() {
        throw new Error(`${this.constructor.name}.reset() is not implemented`)
    }
}
