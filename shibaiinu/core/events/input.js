import { BaseEvent } from './base.js'

export class InputEvent extends BaseEvent {

    constructor(prompt, flagName, options = {}) {
        super({ beforeHandler: options.beforeHandler, afterHandler: options.afterHandler })
        this.prompt = prompt
        this.flagName = flagName
        this.placeholder = options.placeholder || ''
        this.defaultValue = options.defaultValue || ''
        this.maxLength = options.maxLength || 50
        this.isSetUp = false
        this.inputValue = null
    }

    process(inputValue) {
        if (!this.isSetUp) {
            this.handleBefore()
            this.isSetUp = true
            return {
                prompt: this.prompt,
                placeholder: this.placeholder,
                defaultValue: this.defaultValue,
                maxLength: this.maxLength,
                flagName: this.flagName
            }
        }
        this.inputValue = inputValue
        if (this.afterHandler) {
            this.afterHandler(inputValue)
        }
        return inputValue
    }

    reset() {
        this.isSetUp = false
        this.inputValue = null
    }
}
