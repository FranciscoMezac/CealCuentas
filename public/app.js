const form = document.querySelector("#expenseForm");
const amountInput = document.querySelector("#amountInput");
const descriptionInput = document.querySelector("#descriptionInput");
const rows = document.querySelector("#expenseRows");
const totalAmount = document.querySelector("#totalAmount");
const countText = document.querySelector("#countText");
const message = document.querySelector("#message");

const moneyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short"
});

function parseAmount(value) {
  const cleaned = String(value).replace(/[^\d]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function formatAmountInput(value) {
  const amount = parseAmount(value);
  return amount ? new Intl.NumberFormat("es-CL").format(amount) : "";
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function updateSummary(resumen) {
  totalAmount.textContent = moneyFormatter.format(resumen.total || 0);
  const cantidad = resumen.cantidad || 0;
  countText.textContent = cantidad === 1 ? "1 registro" : `${cantidad} registros`;
}

function renderRows(gastos) {
  rows.innerHTML = "";

  if (!gastos.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4" class="empty">Todavia no hay gastos registrados.</td>';
    rows.append(row);
    return;
  }

  const fragment = document.createDocumentFragment();

  gastos.forEach((gasto) => {
    const row = document.createElement("tr");
    const date = new Date(gasto.createdAt);

    row.innerHTML = `
      <td>${dateFormatter.format(date)}</td>
      <td></td>
      <td class="amount">${moneyFormatter.format(gasto.monto)}</td>
      <td>
        <button class="delete-button" type="button" data-id="${gasto.id}">Eliminar</button>
      </td>
    `;

    row.children[1].textContent = gasto.descripcion;
    fragment.append(row);
  });

  rows.append(fragment);
}

async function loadExpenses() {
  const response = await fetch("/api/gastos");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "No se pudieron cargar los gastos.");
  }

  renderRows(data.gastos);
  updateSummary(data.resumen);
}

async function saveExpense(event) {
  event.preventDefault();

  const monto = parseAmount(amountInput.value);
  const descripcion = descriptionInput.value.trim();

  if (!monto) {
    setMessage("Ingresa un monto mayor a cero.", true);
    amountInput.focus();
    return;
  }

  if (!descripcion) {
    setMessage("Ingresa una descripcion para justificar el gasto.", true);
    descriptionInput.focus();
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage("Guardando...");

  try {
    const response = await fetch("/api/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto, descripcion })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo guardar el gasto.");
    }

    form.reset();
    amountInput.focus();
    setMessage("Gasto registrado correctamente.");
    await loadExpenses();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteExpense(id) {
  setMessage("Eliminando registro...");

  try {
    const response = await fetch(`/api/gastos/${id}`, { method: "DELETE" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo eliminar el registro.");
    }

    setMessage("Registro eliminado.");
    await loadExpenses();
  } catch (error) {
    setMessage(error.message, true);
  }
}

amountInput.addEventListener("blur", () => {
  amountInput.value = formatAmountInput(amountInput.value);
});

amountInput.addEventListener("focus", () => {
  amountInput.value = parseAmount(amountInput.value) || "";
});

form.addEventListener("submit", saveExpense);

rows.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-button");
  if (!button) return;

  deleteExpense(button.dataset.id);
});

loadExpenses().catch((error) => {
  setMessage(error.message, true);
  renderRows([]);
  updateSummary({ total: 0, cantidad: 0 });
});
