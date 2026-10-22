# No argument names the parent. main, develop and release/1.0 sit at the same distance from
# the branch (one own commit each), so topology alone ties; the reflog records that the branch was
# cut from develop, which breaks the tie. The run stops at the confirmation, before any merge.
start_repo
cat > src/cards.mjs << 'JS'
export const cardBalance = (card) => card.cents
JS
publish_base "Add gift card balance" feature/gift-card-expiry

git switch -q -c release/1.0 main
git push -q -u origin release/1.0
git switch -q develop
cat > src/format.mjs << 'JS'
export const formatCents = (cents) => (cents / 100).toFixed(2)
JS
save "Add formatCents"

git switch -q feature/gift-card-expiry
cat > src/cards.mjs << 'JS'
export const cardBalance = (card, now = Date.now()) => (card.expiresAt < now ? 0 : card.cents)
JS
save "Expired gift cards have no balance"
