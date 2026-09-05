#!/usr/bin/env bash
# Claude Code PostToolUse hook — auto-commit ไฟล์ใน wayfinder-vault ทุกครั้งที่ agent
# เขียน/แก้ ticket (เช่นเปลี่ยน status: open -> claimed -> resolved)
#
# ผูกไว้กับสอง matcher:
#   Write|Edit -> payload มี file_path ⇒ stage เฉพาะไฟล์นั้นไฟล์เดียว
#   Bash       -> payload ไม่มี file_path ⇒ ไม่รู้ว่าแตะอะไร ต้องถาม git เอา
#                 (จำเป็น เพราะ agent แก้ vault ด้วย sed/python3 บ่อย แล้ว hook ไม่ยิงเลย)
#
# 🔑 ข้อล็อก: **ห้าม `git add -A` ทั้ง vault**
# หลาย session รันพร้อมกันคนละ effort ⇒ การ stage ทั้ง vault จะดูดงานของ effort อื่น
# เข้ามาใน commit ของเรา พร้อมข้อความที่บรรยายผิด
# ⇒ เส้น Bash จึง **แยก commit ต่อ effort** (`<repo>/<effort>/`) แต่ละอันสเตจเฉพาะ path ตัวเอง
#
# 🔑 ข้อล็อกที่สอง: **commit อย่างเดียวไม่พอ ต้องหยดลง `main` ด้วย**
# Obsidian เปิดที่ *vault หลัก* ซึ่งอยู่บน `main` เสมอ ⇒ commit ที่ลง branch ของ worktree
# (`claude/…`) **มองไม่เห็นจาก Obsidian** จนกว่าจะมีคน merge เอง — ซึ่งคนลืม และแมปก็หายไป
# จากสายตาทั้งที่ commit อยู่ครบ ⇒ `sync_worktree_to_main()` ทำให้อัตโนมัติ **แบบขี้ขลาด**
# (ดูเงื่อนไขความปลอดภัยในตัวฟังก์ชัน — ผิดข้อใดข้อหนึ่ง = ไม่ทำอะไรเลย)
#
# 🔑 ข้อล็อกที่สาม: **repo กลางคัน merge = ไม่แตะเลย**
# hook ยิงหลัง *ทุก* tool call ⇒ ถ้า `git merge` ชน แล้วมีคำสั่ง Bash อะไรก็ได้ตามมา
# hook จะเห็นไฟล์ที่ชนเป็น "ไฟล์ที่ขยับ" แล้ว `git add -A` — ซึ่งในสายตา git **คือการ resolve**
# ⇒ commit ออกมาเป็น merge commit ที่มี `<<<<<<<` อยู่ในเนื้อไฟล์ แล้ว `sync_worktree_to_main()`
# หยดต่อลง `main` ให้ Obsidian อ่านไฟล์ที่พังนั้น · **เกิดขึ้นจริงกับ
# `wayfinder-vault/wayfinder-effort-tickets/map.md` มาแล้ว และซ้อนสองชั้น** (marker ของ merge
# รอบก่อนยังค้างอยู่ตอน merge รอบใหม่ทับลงไป) ⇒ `runs:` มีสองค่าใน frontmatter
#
# **ชั้นที่สอง — ตรวจ marker ก่อน stage**: กันสถานะกลางคันอย่างเดียวไม่พอ เพราะ marker ที่
# *ถูก commit ไปแล้ว* (จากอดีต หรือจาก hook รุ่นก่อนหน้า) จะติดกลับมาทุกครั้งที่มีคนแก้ไฟล์นั้นอีก
# ⇒ ไฟล์ไหนยังมี marker ครบคู่ `<<<<<<< ` + `>>>>>>> ` **ไฟล์นั้นไม่ถูก stage** ไฟล์อื่นใน
# ชุดเดียวกันยัง commit ตามปกติ (กรองเป็นราย *ไฟล์* ไม่ใช่ทั้งชุด — ไม่ให้ไฟล์อื่นโดนหางเลข)
#
# ทำไมต้องครบ **คู่** ไม่ใช่จับ `=======` เฉย ๆ: `=====` ใต้บรรทัดคือ **setext heading ของ
# Markdown** ที่ถูกต้องตามไวยากรณ์ ⇒ จับตัวเดียวจะหยุด commit โน้ตธรรมดาไปทั้งใบ · git เขียน
# marker ครบทั้งคู่เสมอ ⇒ เงื่อนไขคู่จับ conflict จริงได้ครบโดยไม่กิน Markdown ปกติ
#
# ทดสอบมือ:
#   echo '{"tool_input":{"file_path":"<ไฟล์ใน vault>"}}' | _tools/autocommit.sh
#   echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | _tools/autocommit.sh

set -u

# ── path ของ vault นี้ ──────────────────────────────────────────────────────
# `__VAULT__` เป็น placeholder ที่ **installer เรนเดอร์ตอนติดตั้ง** โดยแทน**ทั้งบรรทัด**
# (`sed 's|^VAULT=.*|VAULT="<path ของ vault>"|'`) ไม่ใช่แทนเฉพาะโทเคน — บรรทัด fallback
# ข้างล่างต้องรอด ไม่ถูกเขียนทับไปด้วย
#
# ⚠️ **ห้ามเปลี่ยนเป็น self-derive จาก `BASH_SOURCE`** ถึงมันจะดูสะอาดกว่ามากก็ตาม — สำเนาที่อยู่ใน
# `.claude/worktrees/<x>/_tools/autocommit.sh` จะคิดว่า *ตัวเอง* คือ vault หลัก ⇒ `WT_PREFIX`
# ไม่ match ⇒ ขั้น "หยดลง `main`" ไม่ทำงาน ⇒ Obsidian ไม่เห็นแมปที่ session ใน worktree เขียน
# ซึ่งคือบั๊กที่ไฟล์นี้ทั้งไฟล์ถูกเขียนขึ้นมาเพื่อแก้พอดี
VAULT="__VAULT__"

# ยังไม่ถูกเรนเดอร์ (หรือเรนเดอร์ไปผิดที่) ⇒ ถอยไปตำแหน่งติดตั้งมาตรฐานตาม `SETUP.md`
# **จำเป็น เพราะโหมดพังของบรรทัดบนคือ "ตายเงียบสนิท"**: `[ -e "$REPO/.git" ]` ไม่ผ่าน ⇒ `exit 0`
# ไม่มี error ไม่มี output — `2>/dev/null || true` ใน settings.json ไม่มีอะไรให้กลืนด้วยซ้ำ
# ⇒ ทุกอย่างที่เขียนลง vault หลังจากนั้น **ไม่ถูก commit โดยไม่มีอะไรเตือนเลย**
# ตัดสินด้วย `-d .git` ไม่ใช่เทียบสตริงกับตัว placeholder — sed ของ installer จะได้ไม่ทำลายเงื่อนไขนี้
[ -d "$VAULT/.git" ] || VAULT="$HOME/Documents/Git/wayfinder-vault"

# Claude Code ตัด worktree ของ session ไว้ **ใต้ vault เอง** (`.claude/worktrees/<ชื่อ>/`) และ
# path นั้นถูก ignore ไว้ ⇒ hook รุ่นแรกที่ commit เข้า vault หลักเสมอ จะสั่ง
# `git add .claude/worktrees/…` แล้วโดนปฏิเสธด้วย "paths are ignored" ซึ่ง `2>/dev/null || true`
# ใน settings.json กลืนหายไปเงียบ ๆ ⇒ **แมปที่ session เขียนใน worktree ไม่เคยถูก commit เลย**
# (README เล่าไว้ว่า `wayfinder-vercel-ci` หายไปแบบนี้ — ครั้งนั้นตายพร้อม worktree ที่ถูกลบ)
# ⇒ หน่วยของการ commit คือ **working tree ที่ไฟล์นั้นอยู่จริง** ไม่ใช่ vault หลักเสมอไป
WT_PREFIX="$VAULT/.claude/worktrees/"
REPO="$VAULT"

FOOTER="Committed automatically by the wayfinder-vault PostToolUse hook."

# ตั้งเป็น 1 เมื่อมี commit เกิดขึ้นจริง — ใช้ตัดสินว่าจะเรียก sync_worktree_to_main ไหม
# (ประกาศไว้ก่อนเพราะ `set -u`)
did_commit=0

# ---------------------------------------------------------------- helpers

# working tree ที่ควร commit สำหรับ path ที่ให้มา — worktree ของ session ชนะ vault หลัก
# (ว่าง = path นี้ไม่ใช่ของ vault) · string ops ล้วน ไม่ spawn process เหมือนกัน
repo_root_for() {
  local p="$1" rest
  case "$p" in
    "$WT_PREFIX"*)          rest=${p#"$WT_PREFIX"}; printf '%s%s' "$WT_PREFIX" "${rest%%/*}" ;;
    "$VAULT"/*|"$VAULT")    printf '%s' "$VAULT" ;;
    *)                      ;;
  esac
}

# หน่วยของการ commit = โฟลเดอร์ effort (`<repo>/<effort>`)
# ไฟล์ที่ตื้นกว่านั้นจับเป็นกลุ่มของตัวเอง (`_tools`, `.` = ไฟล์ที่ราก)
# ทำด้วย string ops ล้วน ไม่ spawn process — hook นี้ยิงทุกคำสั่ง Bash
scope_of_path() {
  local p="$1" a rest b
  case "$p" in
    */*/*) a=${p%%/*}; rest=${p#*/}; b=${rest%%/*}; printf '%s/%s' "$a" "$b" ;;
    */*)   printf '%s' "${p%%/*}" ;;
    *)     printf '.' ;;
  esac
}

# ticket มี status ใน frontmatter -> เอามาใส่ commit message ให้ log อ่านรู้เรื่อง
#
# อ่านเฉพาะไฟล์ที่เป็น ticket จริง (อยู่ใน issues/) และเฉพาะ frontmatter ที่เริ่มบรรทัดแรก
# ไม่งั้นจะไปคว้า `status:` จาก *ตัวอย่าง* frontmatter ใน README มาแทน
status_of_ticket() {
  local rel="$1" abs="$REPO/$1" status=""
  case "$rel" in
    */issues/*.md)
      if [ -f "$abs" ] && [ "$(head -1 "$abs" 2>/dev/null)" = "---" ]; then
        status=$(sed -n '2,/^---$/p' "$abs" | sed -n 's/^status:[[:space:]]*//p' | head -1)
        status=${status%%#*}                       # ตัด inline comment
        status=$(printf '%s' "$status" | tr -d '[:space:]')
      fi
      ;;
  esac
  printf '%s' "$status"
}

# commit สิ่งที่ stage ไว้แล้ว โดยตั้งชื่อจากไฟล์ที่อยู่ในกลุ่มนั้น
#   $1 = ชื่อกลุ่ม (ใช้ตอนมีหลายไฟล์) · $2.. = path (relative กับ vault)
commit_staged() {
  local scope="$1"; shift
  local n=$# name status subject

  if [ "$n" -eq 1 ]; then
    name=$(basename "$1")
    status=$(status_of_ticket "$1")
    if [ -n "$status" ]; then
      subject="chore(vault): ${name%.md} -> ${status}"
    else
      subject="chore(vault): update ${name}"
    fi
  elif [ "$scope" = "." ]; then
    subject="chore(vault): update ${n} files"
  else
    subject="chore(vault): update ${n} files in ${scope}"
  fi

  git -C "$REPO" commit -q -m "$subject" -m "$FOOTER" && did_commit=1
}

# repo อยู่กลางคัน merge / rebase / cherry-pick / revert หรือเปล่า
#
# **ไม่ใช่การทิ้งงาน** — เส้น Bash กวาด `git status` ใหม่ทุกครั้งที่ยิง ⇒ พอ resolve เสร็จ
# tool call ถัดไป commit ให้ครบเองตามปกติ · ระหว่างนั้นเงียบ เหมือนกฎของ sync_worktree_to_main
# (`--absolute-git-dir` สำคัญ: worktree มี `.git` เป็น *ไฟล์* และ gitdir จริงอยู่ที่
#  `<vault>/.git/worktrees/<ชื่อ>` ⇒ เช็ค `$REPO/.git/MERGE_HEAD` ตรง ๆ จะไม่เจออะไรเลย)
repo_mid_operation() {
  local gd
  gd=$(git -C "$1" rev-parse --absolute-git-dir 2>/dev/null) || return 1
  [ -e "$gd/MERGE_HEAD" ] || [ -e "$gd/CHERRY_PICK_HEAD" ] || [ -e "$gd/REVERT_HEAD" ] \
    || [ -d "$gd/rebase-merge" ] || [ -d "$gd/rebase-apply" ]
}

# ไฟล์นี้ยังมี conflict marker ค้างอยู่ไหม (ต้องครบ **คู่** — ดูเหตุผลที่หัวไฟล์)
#
# ไฟล์ที่ถูกลบไม่มีอะไรให้ตรวจ ⇒ ต้อง stage ได้ตามปกติ ไม่งั้นการลบไฟล์จะค้างตลอดกาล
# grep ตัวแรกคัดออกเกือบทุกไฟล์ในรอบเดียว ⇒ ตัวที่สองแทบไม่เคยได้ทำงาน (hook นี้ยิงทุก tool call)
has_conflict_markers() {
  [ -f "$1" ] || return 1
  LC_ALL=C grep -q '^<<<<<<< ' "$1" 2>/dev/null || return 1
  LC_ALL=C grep -q '^>>>>>>> ' "$1" 2>/dev/null
}

# หยด commit ของ worktree ลง `main` ของ vault หลัก
#
# ทำไมต้องมี: hook รุ่นก่อนหน้าแก้ปัญหา "commit ไม่ลงเลย" ได้แล้ว แต่เหลืออีกครึ่ง —
# commit ลง `claude/<ชื่อ>` ของ worktree ซึ่ง **Obsidian ไม่ได้เปิดอยู่** ⇒ แมปที่เพิ่งชาร์ต
# ไม่โผล่บน Dashboard/Efforts จนกว่าจะมีคน `git merge` เอง
#
# 🔑 ข้อล็อก: **ห้ามแก้ conflict · ห้าม force · ห้ามแตะ working tree ที่ไม่สะอาด**
# hook ที่ตัดสินใจแทนคนตอน repo อยู่ในสภาพกลางคัน แพงกว่าการที่คนต้อง merge เอง
# ⇒ ผิดเงื่อนไขข้อใดข้อหนึ่ง = **ไม่ทำอะไรเลยและเงียบ** (คน merge เองได้เสมอ)
sync_worktree_to_main() {
  [ "$REPO" != "$VAULT" ] || return 0            # commit ลง main อยู่แล้ว
  [ -d "$VAULT/.git" ] || return 0

  local branch
  branch=$(git -C "$REPO" symbolic-ref --quiet --short HEAD 2>/dev/null) || return 0
  [ -n "$branch" ] || return 0                   # detached HEAD ⇒ ไม่มีอะไรให้ merge

  # vault หลักต้องอยู่บน `main` · สะอาด · ไม่ค้างกลาง merge/rebase
  [ "$(git -C "$VAULT" symbolic-ref --quiet --short HEAD 2>/dev/null)" = "main" ] || return 0
  [ -z "$(git -C "$VAULT" status --porcelain -uall 2>/dev/null)" ] || return 0
  ! repo_mid_operation "$VAULT" || return 0

  # ปกติเป็น fast-forward · จะไม่ ff ก็ต่อเมื่ออีก session merge ตัดหน้าไปแล้ว
  # ⇒ ลอง merge ปกติต่อ — คนละ session = คนละ effort = คนละไฟล์ ⇒ ไม่ชนกันโดยธรรมชาติ
  git -C "$VAULT" merge --ff-only -q "$branch" 2>/dev/null && return 0
  git -C "$VAULT" merge --no-edit -q "$branch" 2>/dev/null && return 0

  # ชนกันจริง (คนละ session แก้ไฟล์เดียวกัน) — ถอยให้สุด แล้วปล่อยให้คนตัดสิน
  git -C "$VAULT" merge --abort 2>/dev/null
  return 0
}

# ---------------------------------------------------------------- main

file=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty' 2>/dev/null)

# ---- เส้น Write|Edit : รู้ไฟล์แน่นอน ⇒ stage แค่ไฟล์นั้น -------------------
if [ -n "$file" ]; then
  REPO=$(repo_root_for "$file")
  [ -n "$REPO" ] || exit 0
  # worktree มี `.git` เป็น *ไฟล์* (gitdir: …) ไม่ใช่ไดเรกทอรี ⇒ ต้อง -e ไม่ใช่ -d
  [ -e "$REPO/.git" ] || exit 0
  repo_mid_operation "$REPO" && exit 0   # กลางคัน merge ⇒ ปล่อยให้คน resolve เอง
  has_conflict_markers "$file" && exit 0 # marker ค้าง ⇒ ไม่ commit จนกว่าจะเคลียร์

  rel=${file#"$REPO"/}
  git -C "$REPO" add -A -- "$rel" || exit 0
  git -C "$REPO" diff --cached --quiet -- "$rel" && exit 0
  commit_staged "$(scope_of_path "$rel")" "$rel"
  [ "$did_commit" -eq 1 ] && sync_worktree_to_main
  exit 0
fi

# ---- เส้น Bash : ไม่รู้ไฟล์ ⇒ เดาจาก cwd แล้วถาม git แยก commit ต่อ effort ---
#   session ที่รันใน worktree ของ vault ⇒ commit ลง worktree นั้น
#   session ที่รันใน repo งาน (repo ไหนก็ได้) แล้วแก้ vault ด้วย sed/python3 ⇒ กลับไป vault หลัก
REPO=$(repo_root_for "$PWD")
[ -n "$REPO" ] || REPO="$VAULT"
[ -e "$REPO/.git" ] || exit 0
repo_mid_operation "$REPO" && exit 0     # กลางคัน merge ⇒ ปล่อยให้คน resolve เอง

# ⚠️ ต้องอ่านผ่าน process substitution — `$(git … -z)` **ตัด NUL ทิ้ง**
# (command substitution ของ bash เก็บ NUL ไม่ได้) ⇒ พาธจะเละเป็นก้อนเดียว
# while อยู่ใน shell ปัจจุบัน (มีแต่ git ที่เป็น subshell) ⇒ ตัวแปร paths รอดออกมา
paths=()
while IFS= read -r -d '' entry; do
  [ -n "$entry" ] || continue
  xy=${entry:0:2}
  paths+=("${entry:3}")
  # rename/copy มี path เก่าตามมาอีกหนึ่งช่อง ต้องอ่านมา stage ด้วย ไม่งั้นเหลือไฟล์ค้าง
  case "$xy" in
    R*|*R|C*|*C)
      if IFS= read -r -d '' old; then
        [ -n "$old" ] && paths+=("$old")
      fi
      ;;
  esac
# `-uall` สำคัญ: ค่าปริยาย git ยุบไดเรกทอรี untracked ทั้งอันเป็นรายการเดียว (`?? <repo>/`)
# ⇒ effort ที่เพิ่งสร้างใหม่ทั้งโฟลเดอร์จะได้ scope เป็น `<repo>` แล้วเหมารวมทุก effort กลับมาอีก
done < <(git -C "$REPO" -c core.quotepath=false status --porcelain -z -uall 2>/dev/null)

# vault สะอาดก็จบตรงนี้ — กรณีส่วนใหญ่ของทุกคำสั่ง Bash
[ "${#paths[@]}" -gt 0 ] || exit 0

# ชั้นที่สอง: คัดไฟล์ที่ marker ยังค้างออกก่อน แล้วค่อยจัดกลุ่ม scope
# (นับก่อนขยายอาเรย์ — bash 3.2 ของ macOS + `set -u` พังถ้าขยายอาเรย์ว่าง)
clean=()
for p in "${paths[@]}"; do
  has_conflict_markers "$REPO/$p" || clean+=("$p")
done
[ "${#clean[@]}" -gt 0 ] || exit 0
paths=("${clean[@]}")

# รวมเป็นรายชื่อ scope ที่ไม่ซ้ำ (ไม่ใช้ associative array — bash 3.2 ของ macOS ไม่มี)
scopes=""
for p in "${paths[@]}"; do
  s=$(scope_of_path "$p")
  case "$scopes" in
    *"|$s|"*) ;;
    *) scopes="$scopes|$s|" ;;
  esac
done

# commit ทีละ scope — แต่ละรอบ stage เฉพาะ path ของ scope นั้น
IFS='|' read -ra scope_list <<< "$scopes"
for scope in "${scope_list[@]}"; do
  [ -n "$scope" ] || continue

  sel=()
  for p in "${paths[@]}"; do
    [ "$(scope_of_path "$p")" = "$scope" ] && sel+=("$p")
  done
  [ "${#sel[@]}" -gt 0 ] || continue

  git -C "$REPO" add -A -- "${sel[@]}" || continue
  git -C "$REPO" diff --cached --quiet -- "${sel[@]}" && continue
  commit_staged "$scope" "${sel[@]}"
done

# หยดลง main ครั้งเดียวตอนจบ ไม่ใช่ต่อ scope — หลาย effort ใน commit ชุดเดียวกันควรถึง main พร้อมกัน
[ "$did_commit" -eq 1 ] && sync_worktree_to_main
exit 0
