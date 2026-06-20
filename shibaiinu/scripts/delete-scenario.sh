#!/usr/bin/env bash
#
# シナリオ削除スクリプト
#
# 指定したシナリオを以下の場所から取り除く:
#   1. shibaiinu/scenario/<name>.js                       (削除)
#   2. index.html の import 文                             (削除)
#   3. index.html の scenarios 配列のエントリ              (削除)
#   4. shibaiinu/assets/users/<name>/  (--with-assets 指定時のみ削除)
#
# デフォルトではアセットは残します。実作業で集めた素材を誤って消さないため。
#
# 使い方:
#   ./delete-scenario.sh <シナリオ名> [--with-assets] [-y]
#
# 例:
#   ./delete-scenario.sh myStory
#   ./delete-scenario.sh myStory --with-assets
#   ./delete-scenario.sh myStory --with-assets -y

set -euo pipefail

NAME=""
WITH_ASSETS=0
ASSUME_YES=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --with-assets)
      WITH_ASSETS=1
      shift
      ;;
    -y|--yes)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      cat <<USAGE
使い方: $0 <シナリオ名> [--with-assets] [-y]

  <シナリオ名>   : 削除するシナリオ名（setup-scenario.sh で作ったもの）
  --with-assets  : shibaiinu/assets/users/<名前>/ も削除する
  -y, --yes      : 確認プロンプトをスキップ

例:
  $0 myStory                       # シナリオファイルと index.html だけ更新
  $0 myStory --with-assets         # アセットも削除（確認あり）
  $0 myStory --with-assets -y      # 確認なしで全削除
USAGE
      exit 0
      ;;
    -*)
      echo "エラー: 不明なオプション: $1" >&2
      exit 1
      ;;
    *)
      if [ -z "$NAME" ]; then
        NAME="$1"
      else
        echo "エラー: 引数が多すぎます: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$NAME" ]; then
  echo "エラー: シナリオ名が指定されていません。'$0 --help' で使い方を確認できます。" >&2
  exit 1
fi

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

if [ ! -f "$INDEX_FILE" ]; then
  echo "エラー: index.html が見つかりません: $INDEX_FILE" >&2
  exit 1
fi

# 何が見つかっているかを集計
HAS_SCENARIO_FILE=0
HAS_INDEX_REF=0
HAS_ASSETS=0
[ -f "$SCENARIO_FILE" ] && HAS_SCENARIO_FILE=1
grep -q "from './shibaiinu/scenario/$NAME.js'" "$INDEX_FILE" && HAS_INDEX_REF=1
[ -d "$ASSETS_DIR" ] && HAS_ASSETS=1

if [ "$HAS_SCENARIO_FILE" -eq 0 ] && [ "$HAS_INDEX_REF" -eq 0 ] && [ "$HAS_ASSETS" -eq 0 ]; then
  echo "エラー: シナリオ \"$NAME\" は見つかりません（ファイル・index.html・アセットいずれも未検出）" >&2
  exit 1
fi

# 削除対象のサマリ表示
echo "シナリオ \"$NAME\" を削除します:"
if [ "$HAS_SCENARIO_FILE" -eq 1 ]; then
  echo "  - シナリオファイル : $SCENARIO_FILE"
else
  echo "  - シナリオファイル : (見つからない、スキップ)"
fi
if [ "$HAS_INDEX_REF" -eq 1 ]; then
  echo "  - index.html の登録: 削除"
else
  echo "  - index.html の登録: (見つからない、スキップ)"
fi
if [ "$WITH_ASSETS" -eq 1 ]; then
  if [ "$HAS_ASSETS" -eq 1 ]; then
    echo "  - アセット         : $ASSETS_DIR (--with-assets)"
  else
    echo "  - アセット         : (見つからない、スキップ)"
  fi
else
  if [ "$HAS_ASSETS" -eq 1 ]; then
    echo "  - アセット         : $ASSETS_DIR (残します。削除するなら --with-assets)"
  fi
fi

# 確認
if [ "$ASSUME_YES" -ne 1 ]; then
  printf "本当に削除しますか？ [y/N]: "
  read -r REPLY < /dev/tty || REPLY=""
  case "$REPLY" in
    y|Y|yes|YES) ;;
    *)
      echo "中止しました。"
      exit 0
      ;;
  esac
fi

# 1. シナリオファイル削除
if [ "$HAS_SCENARIO_FILE" -eq 1 ]; then
  echo "→ シナリオファイル削除: $SCENARIO_FILE"
  rm "$SCENARIO_FILE"
fi

# 2. index.html から import 文 と scenarios エントリを削除
if [ "$HAS_INDEX_REF" -eq 1 ]; then
  echo "→ index.html を更新"
  node - "$INDEX_FILE" "$NAME" <<'NODEEOF'
const fs = require('fs');
const [, , indexPath, name] = process.argv;

let src = fs.readFileSync(indexPath, 'utf8');

// (a) import 行を削除（行ごと、前後の空白も含めて）
const importRe = new RegExp(
  String.raw`[ \t]*import \{ ` + name + String.raw` \} from '\./shibaiinu/scenario/` + name + String.raw`\.js';\n`
);
if (!importRe.test(src)) {
  console.error(`警告: import 行が見つかりませんでした: ${name}`);
} else {
  src = src.replace(importRe, '');
}

// (b) scenarios 配列から該当エントリを削除
//     エントリは scenario: <name> を含むオブジェクト { ... } のブロック
const arrRe = /(const scenarios = \[)([\s\S]*?)(\n([ \t]*)\];)/;
const am = arrRe.exec(src);
if (!am) {
  console.error('エラー: const scenarios = [ ... ]; が index.html に見つかりません');
  process.exit(2);
}
const head = am[1];
let inner = am[2];
const tail = am[3];

// inner の中からネストしたオブジェクトを括弧マッチングで列挙
const entries = []; // { start, end } 文字位置（inner 内）
let i = 0;
while (i < inner.length) {
  if (inner[i] === '{') {
    const start = i;
    let depth = 1;
    let j = i + 1;
    while (j < inner.length && depth > 0) {
      if (inner[j] === '{') depth++;
      else if (inner[j] === '}') depth--;
      j++;
    }
    entries.push({ start, end: j }); // end は '}' の直後
    i = j;
  } else {
    i++;
  }
}

const scenarioPropRe = new RegExp(String.raw`scenario\s*:\s*` + name + String.raw`\b`);
const target = entries.find(e => scenarioPropRe.test(inner.slice(e.start, e.end)));
if (!target) {
  console.error(`警告: scenarios 配列に ${name} のエントリが見つかりませんでした`);
} else {
  // エントリの直前にある "," と先行空白、または直後の "," と後続空白を一緒に削除
  let removeStart = target.start;
  let removeEnd = target.end;

  // 後続: ',\n  ...' があれば削除（次のエントリへの区切り）
  // 先行: 改行と直前のインデント、'\n' を遡る
  // まず後ろに ',' があるか
  let k = removeEnd;
  while (k < inner.length && (inner[k] === ' ' || inner[k] === '\t')) k++;
  if (inner[k] === ',') {
    removeEnd = k + 1;
    // 次のエントリ前の改行 + インデントは残す（次のエントリのインデントとして機能）
  } else {
    // 末尾エントリだった: 先頭側の "," を削除
    let p = removeStart - 1;
    while (p >= 0 && (inner[p] === ' ' || inner[p] === '\t' || inner[p] === '\n')) p--;
    if (p >= 0 && inner[p] === ',') {
      removeStart = p;
    }
  }

  // 削除対象オブジェクトの行頭（インデント開始位置）まで戻して、孤立した空行を残さない
  let p = removeStart - 1;
  while (p >= 0 && (inner[p] === ' ' || inner[p] === '\t')) p--;
  if (p >= 0 && inner[p] === '\n') {
    removeStart = p + 1;
    // 後続が改行なら、その改行も丸ごと消す（空行防止）
    if (removeEnd < inner.length && inner[removeEnd] === '\n') {
      removeEnd += 1;
    }
  }

  inner = inner.slice(0, removeStart) + inner.slice(removeEnd);
}

const before = src.slice(0, am.index);
const after = src.slice(am.index + am[0].length);
src = before + head + inner + tail + after;

fs.writeFileSync(indexPath, src);
NODEEOF
fi

# 3. アセット削除（オプション）
if [ "$WITH_ASSETS" -eq 1 ] && [ "$HAS_ASSETS" -eq 1 ]; then
  echo "→ アセット削除: $ASSETS_DIR"
  rm -rf "$ASSETS_DIR"

  # users/ ディレクトリが空になったら一緒に消す
  USERS_DIR="$SHIBAIINU_DIR/assets/users"
  if [ -d "$USERS_DIR" ] && [ -z "$(ls -A "$USERS_DIR")" ]; then
    rmdir "$USERS_DIR"
  fi
fi

echo ""
echo "✓ シナリオ \"$NAME\" を削除しました"
