import { BaseEvent } from './base.js'

export class SelectionEvent extends BaseEvent {

    constructor(choices, options = {}) {
        if (choices.length > 4) {
            throw new Error("選択肢は最大4つまでです")
        }
        super({ beforeHandler: options.beforeHandler, afterHandler: options.afterHandler })
        this.choices = choices
        this.prompt = options.prompt || null
        this.selectedIndex = null
        this.isSetUp = false
    }

    getChoices() {
        return this.choices
    }

    select(index) {
        if (index < 0 || index >= this.choices.length) {
            throw new Error("無効な選択肢です")
        }
        this.selectedIndex = index
    }

    isSelected() {
        return this.selectedIndex !== null
    }

    getSelectedChoice() {
        if (!this.isSelected()) {
            return null
        }
        return this.choices[this.selectedIndex]
    }

    process(selectedIndex) {
        if (!this.isSetUp) {
            this.handleBefore()
            this.isSetUp = true
            return this.getChoices()
        }
        this.select(selectedIndex)
        if (this.afterHandler) {
            this.afterHandler(this.selectedIndex, this.getSelectedChoice())
        }
        return this.getSelectedChoice()
    }

    reset() {
        this.isSetUp = false
        this.selectedIndex = null
    }
}
