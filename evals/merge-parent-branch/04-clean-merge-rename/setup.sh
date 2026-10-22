# develop renames subtotal to cartSubtotal; the branch adds a receipt that imports subtotal. The two
# touch different files, so git merges cleanly, but the receipt test then fails on the missing export:
# the fix (import cartSubtotal) lands inside the merge. test/format.test.mjs fails on every tip
# (formatCents has never printed "$"), so it is pre-existing: reported, left unfixed.
start_repo
cat > src/pricing.mjs << 'JS'
// Prices are integer cents.
export function subtotal(lines) {
  return lines.reduce((sum, line) => sum + line.cents * line.qty, 0)
}
JS
cat > src/checkout.mjs << 'JS'
import { subtotal } from "./pricing.mjs"

export const checkoutTotal = (lines, shippingCents) => subtotal(lines) + shippingCents
JS
cat > src/format.mjs << 'JS'
export const formatCents = (cents) => (cents / 100).toFixed(2)
JS
cat > test/checkout.test.mjs << 'JS'
import assert from "node:assert/strict"
import { test } from "node:test"
import { checkoutTotal } from "../src/checkout.mjs"

test("checkoutTotal adds shipping to the subtotal", () => {
  assert.equal(checkoutTotal([{ cents: 500, qty: 2 }], 399), 1399)
})
JS
cat > test/format.test.mjs << 'JS'
import assert from "node:assert/strict"
import { test } from "node:test"
import { formatCents } from "../src/format.mjs"

test("formatCents shows dollars", () => {
  assert.equal(formatCents(1999), "$19.99")
})
JS
publish_base "Add pricing, checkout and formatting" feature/receipts

cat > src/pricing.mjs << 'JS'
// Prices are integer cents.
export function cartSubtotal(lines) {
  return lines.reduce((sum, line) => sum + line.cents * line.qty, 0)
}
JS
cat > src/checkout.mjs << 'JS'
import { cartSubtotal } from "./pricing.mjs"

export const checkoutTotal = (lines, shippingCents) => cartSubtotal(lines) + shippingCents
JS
save "Rename subtotal to cartSubtotal"

git switch -q feature/receipts
cat > src/receipt.mjs << 'JS'
import { formatCents } from "./format.mjs"
import { subtotal } from "./pricing.mjs"

// One line per item, then the subtotal.
export const receiptLines = (lines) => [
  ...lines.map((line) => `${line.qty} x ${line.name}`),
  `Subtotal ${formatCents(subtotal(lines))}`,
]
JS
cat > test/receipt.test.mjs << 'JS'
import assert from "node:assert/strict"
import { test } from "node:test"
import { receiptLines } from "../src/receipt.mjs"

test("receiptLines lists items and the subtotal", () => {
  assert.deepEqual(receiptLines([{ name: "Mug", cents: 1250, qty: 2 }]), ["2 x Mug", "Subtotal 25.00"])
})
JS
save "Add receipt lines"
