# develop adds invoice import and the branch adds CSV export. Each adds an import, a route and a
# menu entry at the same spot, so src/routes.mjs and src/menu.mjs conflict; both features stay,
# each fully wired.
start_repo
cat > src/invoices.mjs << 'JS'
export const listInvoices = () => []
JS
cat > src/routes.mjs << 'JS'
import { listInvoices } from "./invoices.mjs"

export const routes = {
  "GET /invoices": listInvoices,
}
JS
cat > src/menu.mjs << 'JS'
export const menu = [
  { label: "Invoices", path: "/invoices" },
]
JS
publish_base "Add invoice routes and menu" feature/invoice-export

cat > src/import.mjs << 'JS'
// Parses an uploaded CSV body into invoices.
export const importInvoices = (body) => body.trim().split("\n").slice(1).map((line) => ({ id: line.split(",")[0] }))
JS
cat > src/routes.mjs << 'JS'
import { listInvoices } from "./invoices.mjs"
import { importInvoices } from "./import.mjs"

export const routes = {
  "GET /invoices": listInvoices,
  "POST /invoices/import": importInvoices,
}
JS
cat > src/menu.mjs << 'JS'
export const menu = [
  { label: "Invoices", path: "/invoices" },
  { label: "Import", path: "/invoices/import" },
]
JS
save "Add invoice import"

git switch -q feature/invoice-export
cat > src/export.mjs << 'JS'
// Serializes invoices as CSV, one row per invoice.
export const exportCsv = (invoices) => ["id", ...invoices.map((invoice) => invoice.id)].join("\n")
JS
cat > src/routes.mjs << 'JS'
import { listInvoices } from "./invoices.mjs"
import { exportCsv } from "./export.mjs"

export const routes = {
  "GET /invoices": listInvoices,
  "GET /invoices.csv": exportCsv,
}
JS
cat > src/menu.mjs << 'JS'
export const menu = [
  { label: "Invoices", path: "/invoices" },
  { label: "Export CSV", path: "/invoices.csv" },
]
JS
save "Add invoice CSV export"
