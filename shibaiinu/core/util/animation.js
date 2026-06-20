// アニメ指定 'fade' | 'slide-left|right|top|bottom' と方向 'in'|'out' からクラス名を生成
export function animClass(classPrefix, direction, anim) {
    if (!anim) return null
    if (anim === 'fade') return `${classPrefix}-anim-fade-${direction}`
    if (anim.startsWith('slide-')) {
        return `${classPrefix}-anim-slide-${direction}-${anim.slice('slide-'.length)}`
    }
    return null
}

export function clearAnimClasses(element, classPrefix) {
    const animPrefix = `${classPrefix}-anim-`
    Array.from(element.classList)
        .filter(c => c.startsWith(animPrefix))
        .forEach(c => element.classList.remove(c))
}

// アニメーションを実行する。animClassName が無ければ即 fallback を呼ぶ。
// onEnd は animationend で呼ばれる（element 自身のイベントのみ拾う）。
// 連続呼び出し時は古いリスナーを解除して上書きする。
export function runAnim(element, classPrefix, animClassName, onEnd, fallback) {
    if (element.__shibaiinuAnimHandler) {
        element.removeEventListener('animationend', element.__shibaiinuAnimHandler)
        element.__shibaiinuAnimHandler = null
    }

    if (!animClassName) {
        clearAnimClasses(element, classPrefix)
        fallback()
        return
    }
    clearAnimClasses(element, classPrefix)
    // 強制リフローして再生をリセット
    void element.offsetWidth
    element.classList.add(animClassName)
    const handler = (e) => {
        if (e.target !== element) return
        element.removeEventListener('animationend', handler)
        element.__shibaiinuAnimHandler = null
        onEnd()
    }
    element.__shibaiinuAnimHandler = handler
    element.addEventListener('animationend', handler)
}
