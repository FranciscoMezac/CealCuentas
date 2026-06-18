const moneyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

const numberFormatter = new Intl.NumberFormat("es-CL");

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short"
});

const STOCK_KEYS = ["choripanes", "bebidas", "vasos"];

const STOCK_LABELS = {
  choripanes: "choripanes",
  bebidas: "bebidas",
  vasos: "vasos"
};

const QUICK_PRODUCTS = {
  "Choripán": {
    precio: 1200,
    stock: { choripanes: 1 }
  },
  Bebida: {
    precio: 500,
    stock: { bebidas: 1 }
  },
  "Promo choripán + Bebida": {
    precio: 1500,
    stock: { choripanes: 1, bebidas: 1 }
  },
  "Promo choripán + Té": {
    precio: 1500,
    stock: { choripanes: 1, vasos: 1 }
  },
  "Promo choripán + Café": {
    precio: 1500,
    stock: { choripanes: 1, vasos: 1 }
  },
  Té: {
    precio: 500,
    stock: { vasos: 1 }
  },
  Café: {
    precio: 500,
    stock: { vasos: 1 }
  }
};

const state = {
  stock: { choripanes: 0, bebidas: 0, vasos: 0 },
  cart: [],
  ventas: [],
  resumen: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const dom = {
  navButtons: $$(".nav-button"),
  views: $$(".view"),
  quickProducts: $("#quickProducts"),
  cartRows: $("#cartRows"),
  cartTotal: $("#cartTotal"),
  saleTotal: $("#saleTotal"),
  salesMessage: $("#salesMessage"),
  saleForm: $("#saleForm"),
  paymentMethod: $("#paymentMethod"),
  saleObservation: $("#saleObservation"),
  clearCartButton: $("#clearCartButton"),
  toggleManualProduct: $("#toggleManualProduct"),
  manualProductForm: $("#manualProductForm"),
  manualProductName: $("#manualProductName"),
  manualQuantity: $("#manualQuantity"),
  manualPrice: $("#manualPrice"),
  salesRows: $("#salesRows"),
  salesCountText: $("#salesCountText"),

  expenseForm: $("#expenseForm"),
  amountInput: $("#amountInput"),
  descriptionInput: $("#descriptionInput"),
  expenseRows: $("#expenseRows"),
  totalSpent: $("#totalSpent"),
  expenseCountText: $("#expenseCountText"),
  expenseMessage: $("#expenseMessage"),

  stockForm: $("#stockForm"),
  stockInputChoripanes: $("#stockInputChoripanes"),
  stockInputBebidas: $("#stockInputBebidas"),
  stockInputVasos: $("#stockInputVasos"),
  stockMessage: $("#stockMessage"),

  stockChoripanes: $("#stockChoripanes"),
  stockBebidas: $("#stockBebidas"),
  stockVasos: $("#stockVasos"),
  summaryStockChoripanes: $("#summaryStockChoripanes"),
  summaryStockBebidas: $("#summaryStockBebidas"),
  summaryStockVasos: $("#summaryStockVasos"),

  summarySold: $("#summarySold"),
  summarySpent: $("#summarySpent"),
  summaryProfit: $("#summaryProfit"),
  summarySalesCount: $("#summarySalesCount"),
  summaryExpenseCount: $("#summaryExpenseCount"),
  productSummaryRows: $("#productSummaryRows")
};

function parseAmount(value) {
  const cleaned = String(value ?? "").replace(/[^\d]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function parseInteger(value) {
  const number = Number(String(value ?? "").replace(/[^\d-]/g, ""));
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function formatAmountInput(value) {
  const amount = parseAmount(value);
  return amount ? numberFormatter.format(amount) : "";
}

function setMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("error", isError);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar la operación.");
  }

  return data;
}

function createCartId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}

function cloneStock(stock = {}) {
  return Object.fromEntries(STOCK_KEYS.map((key) => [key, parseInteger(stock[key]) || 0]));
}

function stocksMatch(left = {}, right = {}) {
  return STOCK_KEYS.every((key) => (left[key] || 0) === (right[key] || 0));
}

function getItemSubtotal(item) {
  return item.cantidad * item.precio_unitario;
}

function getCartTotal() {
  return state.cart.reduce((total, item) => total + getItemSubtotal(item), 0);
}

function formatStockNote(stock = {}) {
  const parts = STOCK_KEYS.filter((key) => stock[key] > 0).map((key) => `${stock[key]} ${STOCK_LABELS[key]}`);
  return parts.length ? `Descuenta por unidad: ${parts.join(", ")}` : "Sin descuento de stock";
}

function updateCartTotals() {
  const total = getCartTotal();
  dom.cartTotal.textContent = moneyFormatter.format(total);
  dom.saleTotal.textContent = moneyFormatter.format(total);
}

function renderCart() {
  dom.cartRows.innerHTML = "";

  if (!state.cart.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5" class="empty">Carrito vacío.</td>';
    dom.cartRows.append(row);
    updateCartTotals();
    return;
  }

  const fragment = document.createDocumentFragment();

  state.cart.forEach((item) => {
    const row = document.createElement("tr");
    row.dataset.id = item.id;

    const productCell = document.createElement("td");
    const productName = document.createElement("strong");
    productName.textContent = item.producto;

    const stockNote = document.createElement("span");
    stockNote.className = "stock-note";
    stockNote.textContent = formatStockNote(item.stock);

    const observationInput = document.createElement("input");
    observationInput.className = "inline-input";
    observationInput.type = "text";
    observationInput.maxLength = 300;
    observationInput.placeholder = "Observación";
    observationInput.value = item.observacion || "";
    observationInput.dataset.id = item.id;
    observationInput.dataset.field = "observacion";

    productCell.append(productName, stockNote, observationInput);

    const quantityCell = document.createElement("td");
    const quantityControl = document.createElement("div");
    quantityControl.className = "quantity-control";

    const decreaseButton = document.createElement("button");
    decreaseButton.type = "button";
    decreaseButton.className = "mini-button";
    decreaseButton.textContent = "-";
    decreaseButton.dataset.id = item.id;
    decreaseButton.dataset.action = "decrease";

    const quantityInput = document.createElement("input");
    quantityInput.type = "number";
    quantityInput.min = "1";
    quantityInput.step = "1";
    quantityInput.value = item.cantidad;
    quantityInput.dataset.id = item.id;
    quantityInput.dataset.field = "cantidad";

    const increaseButton = document.createElement("button");
    increaseButton.type = "button";
    increaseButton.className = "mini-button";
    increaseButton.textContent = "+";
    increaseButton.dataset.id = item.id;
    increaseButton.dataset.action = "increase";

    quantityControl.append(decreaseButton, quantityInput, increaseButton);
    quantityCell.append(quantityControl);

    const priceCell = document.createElement("td");
    const priceInput = document.createElement("input");
    priceInput.className = "price-input";
    priceInput.type = "text";
    priceInput.inputMode = "numeric";
    priceInput.value = numberFormatter.format(item.precio_unitario);
    priceInput.dataset.id = item.id;
    priceInput.dataset.field = "precio_unitario";
    priceCell.append(priceInput);

    const subtotalCell = document.createElement("td");
    subtotalCell.className = "amount";
    subtotalCell.dataset.subtotal = item.id;
    subtotalCell.textContent = moneyFormatter.format(getItemSubtotal(item));

    const actionsCell = document.createElement("td");
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "delete-button";
    removeButton.textContent = "Eliminar";
    removeButton.dataset.id = item.id;
    removeButton.dataset.action = "remove";
    actionsCell.append(removeButton);

    row.append(productCell, quantityCell, priceCell, subtotalCell, actionsCell);
    fragment.append(row);
  });

  dom.cartRows.append(fragment);
  updateCartTotals();
}

function findCartItem(id) {
  return state.cart.find((item) => item.id === id);
}

function refreshCartRowSubtotal(item) {
  const subtotal = dom.cartRows.querySelector(`[data-subtotal="${item.id}"]`);
  if (subtotal) {
    subtotal.textContent = moneyFormatter.format(getItemSubtotal(item));
  }
  updateCartTotals();
}

function addCartItem({ producto, cantidad, precio_unitario: precioUnitario, stock }) {
  const normalizedStock = cloneStock(stock);
  const existing = state.cart.find(
    (item) =>
      item.producto === producto &&
      item.precio_unitario === precioUnitario &&
      !item.observacion &&
      stocksMatch(item.stock, normalizedStock)
  );

  if (existing) {
    existing.cantidad += cantidad;
  } else {
    state.cart.push({
      id: createCartId(),
      producto,
      cantidad,
      precio_unitario: precioUnitario,
      observacion: "",
      stock: normalizedStock
    });
  }

  renderCart();
}

function getCartStockRequirements() {
  const requirements = Object.fromEntries(STOCK_KEYS.map((key) => [key, 0]));

  state.cart.forEach((item) => {
    STOCK_KEYS.forEach((key) => {
      requirements[key] += (item.stock[key] || 0) * item.cantidad;
    });
  });

  return requirements;
}

function validateCartBeforeSubmit() {
  if (!state.cart.length) {
    return "Agrega al menos un producto al carrito.";
  }

  const invalidItem = state.cart.find((item) => item.cantidad <= 0 || item.precio_unitario <= 0);
  if (invalidItem) {
    return `Revisa cantidad y precio de "${invalidItem.producto}".`;
  }

  const requirements = getCartStockRequirements();
  const stockErrors = STOCK_KEYS.filter((key) => requirements[key] > state.stock[key]).map(
    (key) => `${key}: disponibles ${state.stock[key]}, necesarios ${requirements[key]}`
  );

  if (stockErrors.length) {
    return `Stock insuficiente (${stockErrors.join("; ")}).`;
  }

  return "";
}

function renderStock() {
  dom.stockChoripanes.textContent = state.stock.choripanes;
  dom.stockBebidas.textContent = state.stock.bebidas;
  dom.stockVasos.textContent = state.stock.vasos;
  dom.summaryStockChoripanes.textContent = state.stock.choripanes;
  dom.summaryStockBebidas.textContent = state.stock.bebidas;
  dom.summaryStockVasos.textContent = state.stock.vasos;

  const inputs = [
    [dom.stockInputChoripanes, state.stock.choripanes],
    [dom.stockInputBebidas, state.stock.bebidas],
    [dom.stockInputVasos, state.stock.vasos]
  ];

  inputs.forEach(([input, value]) => {
    if (document.activeElement !== input) {
      input.value = value;
    }
  });
}

async function loadStock() {
  const data = await requestJson("/api/stock");
  state.stock = data.stock;
  renderStock();
}

async function saveStock(event) {
  event.preventDefault();
  setMessage(dom.stockMessage, "Guardando stock...");

  try {
    const data = await requestJson("/api/stock", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stock: {
          choripanes: parseInteger(dom.stockInputChoripanes.value),
          bebidas: parseInteger(dom.stockInputBebidas.value),
          vasos: parseInteger(dom.stockInputVasos.value)
        }
      })
    });

    state.stock = data.stock;
    renderStock();
    renderSummary(data.resumen);
    setMessage(dom.stockMessage, "Stock actualizado correctamente.");
  } catch (error) {
    setMessage(dom.stockMessage, error.message, true);
  }
}

function renderExpenseRows(gastos) {
  dom.expenseRows.innerHTML = "";

  if (!gastos.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4" class="empty">Todavía no hay gastos registrados.</td>';
    dom.expenseRows.append(row);
    return;
  }

  const fragment = document.createDocumentFragment();

  gastos.forEach((gasto) => {
    const row = document.createElement("tr");
    const date = new Date(gasto.createdAt);

    const dateCell = document.createElement("td");
    dateCell.textContent = dateFormatter.format(date);

    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = gasto.descripcion;

    const amountCell = document.createElement("td");
    amountCell.className = "amount";
    amountCell.textContent = moneyFormatter.format(gasto.monto);

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar";
    deleteButton.dataset.id = gasto.id;
    actionCell.append(deleteButton);

    row.append(dateCell, descriptionCell, amountCell, actionCell);
    fragment.append(row);
  });

  dom.expenseRows.append(fragment);
}

function updateExpenseSummary(resumen) {
  dom.totalSpent.textContent = moneyFormatter.format(resumen.total || 0);
  const cantidad = resumen.cantidad || 0;
  dom.expenseCountText.textContent = cantidad === 1 ? "1 registro" : `${cantidad} registros`;
}

async function loadExpenses() {
  const data = await requestJson("/api/gastos");
  renderExpenseRows(data.gastos);
  updateExpenseSummary(data.resumen);
}

async function saveExpense(event) {
  event.preventDefault();

  const monto = parseAmount(dom.amountInput.value);
  const descripcion = dom.descriptionInput.value.trim();

  if (!monto) {
    setMessage(dom.expenseMessage, "Ingresa un monto mayor a cero.", true);
    dom.amountInput.focus();
    return;
  }

  if (!descripcion) {
    setMessage(dom.expenseMessage, "Ingresa una descripción para justificar el gasto.", true);
    dom.descriptionInput.focus();
    return;
  }

  const submitButton = dom.expenseForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage(dom.expenseMessage, "Guardando...");

  try {
    await requestJson("/api/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto, descripcion })
    });

    dom.expenseForm.reset();
    dom.amountInput.focus();
    setMessage(dom.expenseMessage, "Gasto registrado correctamente.");
    await Promise.all([loadExpenses(), loadSummary()]);
  } catch (error) {
    setMessage(dom.expenseMessage, error.message, true);
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteExpense(id) {
  setMessage(dom.expenseMessage, "Eliminando registro...");

  try {
    await requestJson(`/api/gastos/${id}`, { method: "DELETE" });
    setMessage(dom.expenseMessage, "Registro eliminado.");
    await Promise.all([loadExpenses(), loadSummary()]);
  } catch (error) {
    setMessage(dom.expenseMessage, error.message, true);
  }
}

function renderSalesRows(ventas) {
  dom.salesRows.innerHTML = "";
  dom.salesCountText.textContent = ventas.length === 1 ? "1 venta" : `${ventas.length} ventas`;

  if (!ventas.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4" class="empty">Todavía no hay ventas registradas.</td>';
    dom.salesRows.append(row);
    return;
  }

  const fragment = document.createDocumentFragment();

  ventas.forEach((venta) => {
    const row = document.createElement("tr");
    const date = new Date(venta.createdAt);

    const dateCell = document.createElement("td");
    dateCell.textContent = dateFormatter.format(date);

    const detailCell = document.createElement("td");
    detailCell.textContent = venta.items.map((item) => `${item.cantidad} x ${item.producto}`).join(", ");

    const paymentCell = document.createElement("td");
    paymentCell.textContent = venta.metodoPago || "Otro";

    const totalCell = document.createElement("td");
    totalCell.className = "amount";
    totalCell.textContent = moneyFormatter.format(venta.total);

    row.append(dateCell, detailCell, paymentCell, totalCell);
    fragment.append(row);
  });

  dom.salesRows.append(fragment);
}

async function loadSales() {
  const data = await requestJson("/api/ventas");
  state.ventas = data.ventas;
  renderSalesRows(state.ventas);
}

async function registerSale(event) {
  event.preventDefault();

  const validationMessage = validateCartBeforeSubmit();
  if (validationMessage) {
    setMessage(dom.salesMessage, validationMessage, true);
    return;
  }

  const submitButton = dom.saleForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage(dom.salesMessage, "Registrando venta...");

  try {
    const data = await requestJson("/api/ventas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metodo_pago: dom.paymentMethod.value,
        observacion: dom.saleObservation.value.trim(),
        items: state.cart.map((item) => ({
          producto: item.producto,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          observacion: item.observacion,
          stock: item.stock
        }))
      })
    });

    state.cart = [];
    state.stock = data.stock;
    dom.saleObservation.value = "";
    renderCart();
    renderStock();
    renderSummary(data.resumen);
    setMessage(dom.salesMessage, "Venta registrada correctamente.");
    await loadSales();
  } catch (error) {
    setMessage(dom.salesMessage, error.message, true);
  } finally {
    submitButton.disabled = false;
  }
}

function renderSummary(resumen) {
  if (!resumen) return;

  state.resumen = resumen;
  state.stock = resumen.stock || state.stock;

  dom.summarySold.textContent = moneyFormatter.format(resumen.totalVendido || 0);
  dom.summarySpent.textContent = moneyFormatter.format(resumen.totalGastado || 0);
  dom.summaryProfit.textContent = moneyFormatter.format(resumen.ganancia || 0);
  dom.summarySalesCount.textContent = resumen.cantidadVentas || 0;
  dom.summaryExpenseCount.textContent = resumen.cantidadGastos || 0;
  renderStock();
  renderProductSummary(resumen.productos);
}

function appendProductSummaryRow(fragment, producto, cantidad, total) {
  const row = document.createElement("tr");

  const productCell = document.createElement("td");
  productCell.textContent = producto;

  const quantityCell = document.createElement("td");
  quantityCell.textContent = cantidad;

  const totalCell = document.createElement("td");
  totalCell.className = "amount";
  totalCell.textContent = moneyFormatter.format(total || 0);

  row.append(productCell, quantityCell, totalCell);
  fragment.append(row);
}

function renderProductSummary(productos = {}) {
  dom.productSummaryRows.innerHTML = "";

  const rows = [
    ["Choripanes vendidos", productos.choripanes],
    ["Bebidas vendidas", productos.bebidas],
    ["Promos vendidas", productos.promos],
    ["Té vendidos", productos.te],
    ["Café vendidos", productos.cafe]
  ];

  const manuales = Array.isArray(productos.manuales) ? productos.manuales : [];
  const hasAnySale =
    rows.some(([, data]) => (data?.cantidad || 0) > 0) || manuales.some((item) => (item.cantidad || 0) > 0);

  if (!hasAnySale) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="3" class="empty">Sin ventas registradas.</td>';
    dom.productSummaryRows.append(row);
    return;
  }

  const fragment = document.createDocumentFragment();
  rows.forEach(([label, data]) => {
    appendProductSummaryRow(fragment, label, data?.cantidad || 0, data?.total || 0);
  });

  manuales.forEach((item) => {
    appendProductSummaryRow(fragment, item.producto, item.cantidad || 0, item.total || 0);
  });

  dom.productSummaryRows.append(fragment);
}

async function loadSummary() {
  const data = await requestJson("/api/resumen");
  renderSummary(data.resumen);
}

function showView(viewName) {
  dom.navButtons.forEach((button) => {
    const isActive = button.dataset.view === viewName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  dom.views.forEach((view) => {
    view.classList.toggle("active", view.id === `view-${viewName}`);
  });

  if (viewName === "gastos") {
    loadExpenses().catch((error) => setMessage(dom.expenseMessage, error.message, true));
  } else if (viewName === "stock") {
    loadStock().catch((error) => setMessage(dom.stockMessage, error.message, true));
  } else if (viewName === "resumen") {
    loadSummary().catch((error) => setMessage(dom.salesMessage, error.message, true));
  } else if (viewName === "ventas") {
    Promise.all([loadStock(), loadSales(), loadSummary()]).catch((error) =>
      setMessage(dom.salesMessage, error.message, true)
    );
  }
}

function handleCartAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = findCartItem(button.dataset.id);
  if (!item) return;

  if (button.dataset.action === "increase") {
    item.cantidad += 1;
  } else if (button.dataset.action === "decrease") {
    item.cantidad = Math.max(1, item.cantidad - 1);
  } else if (button.dataset.action === "remove") {
    state.cart = state.cart.filter((cartItem) => cartItem.id !== item.id);
  }

  renderCart();
}

function handleCartInput(event) {
  const field = event.target.dataset.field;
  const item = findCartItem(event.target.dataset.id);
  if (!field || !item) return;

  if (field === "observacion") {
    item.observacion = event.target.value.trim();
    return;
  }

  if (field === "cantidad") {
    item.cantidad = Math.max(1, parseInteger(event.target.value) || 1);
    refreshCartRowSubtotal(item);
  }

  if (field === "precio_unitario") {
    item.precio_unitario = parseAmount(event.target.value);
    refreshCartRowSubtotal(item);
  }
}

function handleCartFocusOut(event) {
  const field = event.target.dataset.field;
  const item = findCartItem(event.target.dataset.id);
  if (!field || !item) return;

  if (field === "precio_unitario") {
    event.target.value = item.precio_unitario ? numberFormatter.format(item.precio_unitario) : "";
  }

  if (field === "cantidad") {
    event.target.value = item.cantidad;
  }
}

function addManualProduct(event) {
  event.preventDefault();

  const producto = dom.manualProductName.value.trim();
  const cantidad = Math.max(1, parseInteger(dom.manualQuantity.value) || 1);
  const precioUnitario = parseAmount(dom.manualPrice.value);
  const stock = { choripanes: 0, bebidas: 0, vasos: 0 };

  if (!producto) {
    setMessage(dom.salesMessage, "Ingresa el nombre del producto manual.", true);
    dom.manualProductName.focus();
    return;
  }

  if (!precioUnitario) {
    setMessage(dom.salesMessage, "Ingresa un precio unitario mayor a cero.", true);
    dom.manualPrice.focus();
    return;
  }

  addCartItem({ producto, cantidad, precio_unitario: precioUnitario, stock });
  dom.manualProductForm.reset();
  dom.manualQuantity.value = "1";
  setMessage(dom.salesMessage, "Producto agregado al carrito.");
}

function bindEvents() {
  dom.navButtons.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  dom.quickProducts.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-product]");
    if (!button) return;

    const product = QUICK_PRODUCTS[button.dataset.product];
    if (!product) return;

    addCartItem({
      producto: button.dataset.product,
      cantidad: 1,
      precio_unitario: product.precio,
      stock: product.stock
    });
    setMessage(dom.salesMessage, "Producto agregado al carrito.");
  });

  dom.toggleManualProduct.addEventListener("click", () => {
    dom.manualProductForm.classList.toggle("hidden");
    if (!dom.manualProductForm.classList.contains("hidden")) {
      dom.manualProductName.focus();
    }
  });

  dom.manualProductForm.addEventListener("submit", addManualProduct);
  dom.manualPrice.addEventListener("blur", () => {
    dom.manualPrice.value = formatAmountInput(dom.manualPrice.value);
  });
  dom.manualPrice.addEventListener("focus", () => {
    dom.manualPrice.value = parseAmount(dom.manualPrice.value) || "";
  });

  dom.cartRows.addEventListener("click", handleCartAction);
  dom.cartRows.addEventListener("input", handleCartInput);
  dom.cartRows.addEventListener("focusout", handleCartFocusOut);

  dom.clearCartButton.addEventListener("click", () => {
    state.cart = [];
    renderCart();
    setMessage(dom.salesMessage, "Carrito vacío.");
  });

  dom.saleForm.addEventListener("submit", registerSale);
  dom.stockForm.addEventListener("submit", saveStock);
  dom.expenseForm.addEventListener("submit", saveExpense);

  dom.expenseRows.addEventListener("click", (event) => {
    const button = event.target.closest(".delete-button");
    if (!button) return;
    deleteExpense(button.dataset.id);
  });

  dom.amountInput.addEventListener("blur", () => {
    dom.amountInput.value = formatAmountInput(dom.amountInput.value);
  });
  dom.amountInput.addEventListener("focus", () => {
    dom.amountInput.value = parseAmount(dom.amountInput.value) || "";
  });
}

async function boot() {
  bindEvents();
  renderCart();

  try {
    await Promise.all([loadStock(), loadSales(), loadExpenses(), loadSummary()]);
  } catch (error) {
    setMessage(dom.salesMessage, error.message, true);
  }
}

boot();
