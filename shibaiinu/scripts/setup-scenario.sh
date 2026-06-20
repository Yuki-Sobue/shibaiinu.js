#!/usr/bin/env bash
#
# シナリオセットアップスクリプト
#
# シナリオ名を受け取り、以下を一括でセットアップする:
#   1. アセットディレクトリ      : shibaiinu/assets/users/<name>/{audio,images}/...
#   2. 空のシナリオファイル      : shibaiinu/scenario/<name>.js
#   3. index.html への登録        : import 文の追加と scenarios 配列へのエントリ追加
#
# 使い方:
#   ./setup-scenario.sh <シナリオ名> [タイトル]
#
# 例:
#   ./setup-scenario.sh myStory
#   ./setup-scenario.sh myStory "私の物語"

set -euo pipefail

if [ "$#" -lt 1 ]; then
  cat <<USAGE
使い方: $0 <シナリオ名> [タイトル]

  <シナリオ名>: JS 識別子として使える名前（英字始まり、英数字とアンダースコア）
  [タイトル]  : 省略時はシナリオ名と同じ

例:
  $0 myStory
  $0 myStory "私の物語"
USAGE
  exit 1
fi

NAME="$1"
TITLE="${2:-$NAME}"

# 名前検証
if ! [[ "$NAME" =~ ^[A-Za-z][A-Za-z0-9_]*$ ]]; then
  echo "エラー: シナリオ名は英字で始まり、英数字とアンダースコアのみを使えます (受領: $NAME)" >&2
  exit 1
fi

# パス解決
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SHIBAIINU_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
PROJECT_ROOT="$( cd "$SHIBAIINU_DIR/.." && pwd )"

ASSETS_DIR="$SHIBAIINU_DIR/assets/users/$NAME"
SCENARIO_FILE="$SHIBAIINU_DIR/scenario/$NAME.js"
INDEX_FILE="$PROJECT_ROOT/index.html"

# 既存チェック
if [ -e "$ASSETS_DIR" ]; then
  echo "エラー: アセットディレクトリが既に存在します: $ASSETS_DIR" >&2
  exit 1
fi
if [ -e "$SCENARIO_FILE" ]; then
  echo "エラー: シナリオファイルが既に存在します: $SCENARIO_FILE" >&2
  exit 1
fi
if [ ! -f "$INDEX_FILE" ]; then
  echo "エラー: index.html が見つかりません: $INDEX_FILE" >&2
  exit 1
fi

# 1. アセットディレクトリ作成
echo "→ アセットディレクトリを作成: $ASSETS_DIR"
mkdir -p "$ASSETS_DIR/audio/bgm"
mkdir -p "$ASSETS_DIR/audio/se"
mkdir -p "$ASSETS_DIR/images/backgrounds"
mkdir -p "$ASSETS_DIR/images/person"

# 2. シナリオファイル作成
echo "→ シナリオファイルを作成: $SCENARIO_FILE"
cat > "$SCENARIO_FILE" <<EOF
import { Scenario } from '../core/scenario.js';
import { MessageEvent, SelectionEvent, InputEvent, WaitEvent } from '../core/events/index.js';

export const $NAME = new Scenario({
  "start": {
    event: new MessageEvent([
      "ここに最初のメッセージを書いてください。",
    ]),
    next: null
  }
});
EOF

# 3. index.html 更新 (Node で安全に編集)
echo "→ index.html を更新"
node - "$INDEX_FILE" "$NAME" "$TITLE" <<'NODEEOF'
const fs = require('fs');
const [, , indexPath, name, title] = process.argv;

let src = fs.readFileSync(indexPath, 'utf8');

// 既に登録済みかチェック
const importMarker = `from './shibaiinu/scenario/${name}.js'`;
if (src.includes(importMarker)) {
  console.error(`エラー: index.html に既に ${name} の import があります`);
  process.exit(2);
}

// (a) import 行の挿入: 最後の scenario import の直後
const importRe = /([ \t]*)import \{ [^}]+ \} from '\.\/shibaiinu\/scenario\/[^']+\.js';\n/g;
let lastMatch = null;
let m;
while ((m = importRe.exec(src)) !== null) lastMatch = m;
if (!lastMatch) {
  console.error('エラー: scenario の import 行が index.html に見つかりません');
  process.exit(2);
}
const indent = lastMatch[1];
const importLine = `${indent}import { ${name} } from './shibaiinu/scenario/${name}.js';\n`;
const insertAt = lastMatch.index + lastMatch[0].length;
src = src.slice(0, insertAt) + importLine + src.slice(insertAt);

// (b) scenarios 配列にエントリ追加
const arrRe = /(const scenarios = \[)([\s\S]*?)(\n([ \t]*)\];)/;
const am = arrRe.exec(src);
if (!am) {
  console.error('エラー: const scenarios = [ ... ]; が index.html に見つかりません');
  process.exit(2);
}
const head = am[1];
const inner = am[2];
const tail = am[3];
const tailIndent = am[4];
const entryIndent = tailIndent + '  ';
const escapedTitle = title.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const entry =
  `${entryIndent}{\n` +
  `${entryIndent}  id: '${name}',\n` +
  `${entryIndent}  title: '${escapedTitle}',\n` +
  `${entryIndent}  description: '',\n` +
  `${entryIndent}  scenario: ${name},\n` +
  `${entryIndent}  assetsPath: 'shibaiinu/assets/users/${name}/'\n` +
  `${entryIndent}}`;

let newInner;
if (inner.trim() === '') {
  newInner = '\n' + entry + '\n' + tailIndent;
  // tail は "\n  ];" の形なので tailIndent を二重に入れないよう調整
  newInner = '\n' + entry;
} else {
  const trimmed = inner.replace(/\s+$/, '');
  newInner = trimmed + ',\n' + entry;
}

const before = src.slice(0, am.index);
const after = src.slice(am.index + am[0].length);
src = before + head + newInner + tail + after;

fs.writeFileSync(indexPath, src);
NODEEOF

echo ""
echo "✓ シナリオ \"$NAME\" を追加しました"
echo "  - アセット : $ASSETS_DIR/"
echo "  - シナリオ : $SCENARIO_FILE"
echo "  - index.html を更新"
