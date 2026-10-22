# develop fixes finalPrice (round to whole cents, cap at 100%) while the branch extracts its
# discount math into discountCents and reuses it for cart savings. Both edit the same lines, so
# src/pricing.mjs conflicts; the fix belongs inside discountCents, where cartSavings gets it too.
start_repo
cat > src/pricing.mjs << 'JS'
// Prices are integer cents; discounts are whole percentages.
export function finalPrice(cents, discountPercent) {
  const discount = (cents * discountPercent) / 100
  return cents - discount
}
JS
cat > test/pricing.test.mjs << 'JS'
import assert from "node:assert/strict"
import { test } from "node:test"
import { finalPrice } from "../src/pricing.mjs"

test("finalPrice applies the discount", () => {
  assert.equal(finalPrice(1000, 10), 900)
})
JS
publish_base "Add finalPrice" feature/cart-savings

cat > src/pricing.mjs << 'JS'
// Prices are integer cents; discounts are whole percentages.
export function finalPrice(cents, discountPercent) {
  const percent = Math.min(discountPercent, 100)
  const discount = Math.round((cents * percent) / 100)
  return cents - discount
}
JS
cat >> test/pricing.test.mjs << 'JS'

test("finalPrice rounds to whole cents", () => {
  assert.equal(finalPrice(999, 15), 849)
})

test("finalPrice never goes below zero", () => {
  assert.equal(finalPrice(500, 150), 0)
})
JS
save "Fix discounted prices: round to whole cents and cap at 100%"

git switch -q feature/cart-savings
cat > src/pricing.mjs << 'JS'
// Prices are integer cents; discounts are whole percentages.
export const discountCents = (cents, discountPercent) => (cents * discountPercent) / 100

export const finalPrice = (cents, discountPercent) => cents - discountCents(cents, discountPercent)
JS
save "Extract discountCents from finalPrice"
cat > src/cart.mjs << 'JS'
import { discountCents } from "./pricing.mjs"

// Total saved across the cart, shown under the checkout button.
export const cartSavings = (lines) =>
  lines.reduce((sum, { cents, discountPercent }) => sum + discountCents(cents, discountPercent), 0)
JS
cat > test/cart.test.mjs << 'JS'
import assert from "node:assert/strict"
import { test } from "node:test"
import { cartSavings } from "../src/cart.mjs"

test("cartSavings sums each line's discount", () => {
  assert.equal(cartSavings([{ cents: 1000, discountPercent: 10 }, { cents: 2000, discountPercent: 25 }]), 600)
})
JS
save "Show cart savings"
