import { MessageEvent, SelectionEvent, InputEvent, WaitEvent } from './events/index.js'

export class Scenario {

    constructor(eventMap) {
        this.eventMap = eventMap
        this.currentId = null
        this.flags = {}
        this.history = []
    }

    // フラグ管理
    setFlag(key, value = true) {
        this.flags[key] = value
    }

    getFlag(key) {
        return this.flags[key]
    }

    hasFlag(key) {
        return !!this.flags[key]
    }

    clearFlags() {
        this.flags = {}
    }

    // 履歴管理
    addHistory(entry) {
        this.history.push({
            ...entry,
            timestamp: Date.now()
        })
    }

    getHistory() {
        return this.history
    }

    clearHistory() {
        this.history = []
    }

    start(id = "start") {
        this.currentId = id
        this.resetCurrentEvent()
    }

    jumpTo(id) {
        if (!this.eventMap[id]) {
            throw new Error(`イベントID "${id}" が見つかりません`)
        }
        this.currentId = id
        this.resetCurrentEvent()
    }

    resetCurrentEvent() {
        const event = this.getCurrentEvent()
        if (event) event.reset()
    }

    getCurrentNode() {
        if (!this.currentId) return null
        return this.eventMap[this.currentId]
    }

    getCurrentEvent() {
        const node = this.getCurrentNode()
        return node ? node.event : null
    }

    isEnd() {
        return this.currentId === null
    }

    // nextを解決（関数の場合は実行、条件付きの場合は評価）
    resolveNext(next, selectedIndex = null) {
        // 関数の場合: フラグを渡して実行
        if (typeof next === 'function') {
            return next(this.flags, selectedIndex)
        }
        // SelectionEventの場合: インデックスでマップ
        if (selectedIndex !== null && typeof next === 'object' && !Array.isArray(next)) {
            return next[selectedIndex]
        }
        // そのまま返す
        return next
    }

    process(selectedIndex) {
        if (this.isEnd()) return null

        const node = this.getCurrentNode()
        const event = node.event

        if (event instanceof MessageEvent) {
            const message = event.process()

            // 履歴に追加（テキストがある場合のみ）
            if (message.text) {
                this.addHistory({
                    type: 'message',
                    speaker: message.speaker,
                    text: message.text
                })
            }

            if (event.isEndEvent()) {
                const nextId = this.resolveNext(node.next)
                this.advanceToNext(nextId)
            }
            return { type: "message", ...message }
        }

        if (event instanceof SelectionEvent) {
            if (!event.isSetUp) {
                const choices = event.process()
                return { type: "selection", choices, prompt: event.prompt }
            }
            event.process(selectedIndex)
            const choice = event.getSelectedChoice()

            // 履歴に追加
            this.addHistory({
                type: 'selection',
                speaker: null,
                text: `> ${choice}`
            })

            const nextId = this.resolveNext(node.next, selectedIndex)
            this.advanceToNext(nextId)
            return { type: "selected", choice }
        }

        if (event instanceof WaitEvent) {
            if (!event.isSetUp) {
                event.process()
                return { type: "wait", duration: event.duration }
            }
            event.process()
            const nextId = this.resolveNext(node.next)
            this.advanceToNext(nextId)
            return { type: "waited" }
        }

        if (event instanceof InputEvent) {
            if (!event.isSetUp) {
                const inputData = event.process()
                return { type: "input", ...inputData }
            }
            // selectedIndex には入力値が渡される
            const inputValue = selectedIndex
            event.process(inputValue)

            // フラグに保存
            this.setFlag(event.flagName, inputValue)

            // 履歴に追加
            this.addHistory({
                type: 'input',
                speaker: null,
                text: `> ${inputValue}`
            })

            const nextId = this.resolveNext(node.next)
            this.advanceToNext(nextId)
            return { type: "inputted", flagName: event.flagName, value: inputValue }
        }
    }

    advanceToNext(nextId) {
        if (nextId === null || nextId === undefined) {
            this.currentId = null
        } else {
            this.jumpTo(nextId)
        }
    }

    // リセット（最初からやり直し）
    reset() {
        this.currentId = null
        this.clearFlags()
        this.clearHistory()
    }
}
