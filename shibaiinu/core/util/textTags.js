// [wait:N] マーカーを抽出してテキストから取り除く。
// 返り値の waits は「textContent 上での位置 → 待機ミリ秒」のマップ。
// textContent 上の位置 = parseTextTags 後の HTML から見える文字数。
// （[color:red] などのタグマーカー文字はカウントしない）
export function extractWaits(text) {
    const waits = new Map()
    let stripped = ''
    let textPos = 0
    let inBracket = false
    let i = 0
    while (i < text.length) {
        const m = text.substring(i).match(/^\[wait:(\d+)\]/)
        if (m) {
            waits.set(textPos, (waits.get(textPos) || 0) + parseInt(m[1], 10))
            i += m[0].length
            continue
        }
        const c = text[i]
        stripped += c
        if (c === '[') inBracket = true
        else if (c === ']') inBracket = false
        else if (!inBracket) textPos++
        i++
    }
    return { stripped, waits }
}

// HTML 属性/テキスト用のエスケープ
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// テキスト装飾タグを HTML に変換する
// options:
//   classPrefix - shake/code/inline-code 系クラスのプリフィックス（空文字でプリフィックスなし）
//   flags       - {flagName} 展開用のフラグマップ（未指定なら展開しない）
//
// セキュリティ方針:
//   入力テキスト全体を最初に HTML エスケープし、その後 [tag] 構文だけを HTML に「戻す」。
//   これによりシナリオ作者が `<` を書いた場合も、{flag} 経由でユーザー入力が混ざった場合も、
//   意図しない HTML / スクリプト注入は発生しない。
export function parseTextTags(text, options = {}) {
    if (!text) return ''

    const { classPrefix = '', flags = null } = options
    const prefix = classPrefix ? `${classPrefix}-` : ''

    // 1. テキスト全体を先にエスケープ。タグ構文 `[..]` の文字はエスケープ対象外なので残る。
    let result = escapeHtml(text)

    // 2. {flagName} を展開。値も常にエスケープしてから埋め込む。
    if (flags) {
        result = result.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, flagName) => {
            const value = flags[flagName]
            return value !== undefined ? escapeHtml(String(value)) : match
        })
    }

    // 3. 既知タグだけを HTML に展開（中身はすでにエスケープ済みなので安全に補完できる）。

    // [color:色]...[/color]
    result = result.replace(
        /\[color:([^\]]+)\]([^\[]*)\[\/color\]/g,
        '<span style="color:$1">$2</span>'
    )

    // [b]...[/b]
    result = result.replace(/\[b\]([^\[]*)\[\/b\]/g, '<strong>$1</strong>')

    // [shake]...[/shake]
    result = result.replace(
        /\[shake\]([^\[]*)\[\/shake\]/g,
        `<span class="${prefix}text-shake">$1</span>`
    )

    // [code]...[/code] ※ [br] より先に処理。中身は事前エスケープ済みなのでそのまま埋める。
    let codeIndex = 0
    result = result.replace(
        /\[code\]([\s\S]*?)\[\/code\]/g,
        (match, code) => {
            const id = `${prefix}code-block-${Date.now()}-${codeIndex++}`
            const displayCode = code.replace(/\[br\]/g, '\n')
            return `<div class="${prefix}code-block">
                <button class="${prefix}code-copy-btn" data-code-id="${id}">Copy</button>
                <pre><code id="${id}">${displayCode}</code></pre>
            </div>`
        }
    )

    // [inline]...[/inline]
    result = result.replace(
        /\[inline\]([\s\S]*?)\[\/inline\]/g,
        (match, code) => `<code class="${prefix}inline-code">${code}</code>`
    )

    // [br] → <br>
    result = result.replace(/\[br\]/g, '<br>')

    return result
}
