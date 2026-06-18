const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(DATA_DIR, "gastos.sqlite");

const STOCK_KEYS = ["choripanes", "bebidas", "vasos"];
const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Otro"];

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

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monto INTEGER NOT NULL CHECK (monto > 0),
    descripcion TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stock (
    clave TEXT PRIMARY KEY,
    cantidad INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total INTEGER NOT NULL,
    metodo_pago TEXT,
    observacion TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS detalle_venta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL,
    producto TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario INTEGER NOT NULL,
    subtotal INTEGER NOT NULL,
    observacion TEXT,
    FOREIGN KEY (venta_id) REFERENCES ventas(id)
  );
`);

const ensureStockRow = db.prepare("INSERT INTO stock (clave, cantidad) VALUES (?, 0) ON CONFLICT(clave) DO NOTHING");
STOCK_KEYS.forEach((key) => ensureStockRow.run(key));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new HttpError(413, "El cuerpo de la solicitud es demasiado grande."));
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const rawBody = await readBody(req);
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "El JSON enviado no es valido.");
  }
}

function parseMonto(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const cleaned = value.replace(/[^\d]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function parseInteger(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return 0;
    return Math.trunc(Number(normalized.replace(/[^\d-]/g, ""))) || 0;
  }

  return 0;
}

function cleanText(value, maxLength = 300) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function listGastos() {
  return db
    .prepare(
      "SELECT id, monto, descripcion, created_at AS createdAt FROM gastos ORDER BY datetime(created_at) DESC, id DESC"
    )
    .all();
}

function createGasto(monto, descripcion) {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare("INSERT INTO gastos (monto, descripcion, created_at) VALUES (?, ?, ?)")
    .run(monto, descripcion, createdAt);

  return db
    .prepare("SELECT id, monto, descripcion, created_at AS createdAt FROM gastos WHERE id = ?")
    .get(result.lastInsertRowid);
}

function deleteGasto(id) {
  return db.prepare("DELETE FROM gastos WHERE id = ?").run(id).changes > 0;
}

function getGastosSummary() {
  const summary = db.prepare("SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto), 0) AS total FROM gastos").get();
  return {
    cantidad: Number(summary.cantidad),
    total: Number(summary.total)
  };
}

function getStock() {
  const rows = db.prepare("SELECT clave, cantidad FROM stock").all();
  const stock = Object.fromEntries(STOCK_KEYS.map((key) => [key, 0]));

  rows.forEach((row) => {
    if (STOCK_KEYS.includes(row.clave)) {
      stock[row.clave] = Number(row.cantidad);
    }
  });

  return stock;
}

function updateStock(payload) {
  const stockPayload = payload && typeof payload.stock === "object" ? payload.stock : payload;
  const nextStock = {};

  STOCK_KEYS.forEach((key) => {
    const value = parseInteger(stockPayload?.[key]);
    if (value < 0) {
      throw new HttpError(400, "El stock no puede tener cantidades negativas.");
    }
    nextStock[key] = value;
  });

  db.exec("BEGIN IMMEDIATE");
  try {
    const update = db.prepare("UPDATE stock SET cantidad = ? WHERE clave = ?");
    STOCK_KEYS.forEach((key) => update.run(nextStock[key], key));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getStock();
}

function normalizeStockDelta(value, cantidad) {
  const source = value && typeof value === "object" ? value : {};
  const delta = Object.fromEntries(STOCK_KEYS.map((key) => [key, 0]));

  STOCK_KEYS.forEach((key) => {
    const perUnit = parseInteger(source[key]);
    if (perUnit < 0) {
      throw new HttpError(400, "El descuento de stock no puede ser negativo.");
    }
    delta[key] = perUnit * cantidad;
  });

  return delta;
}

function getItemStockDelta(item) {
  const quickProduct = QUICK_PRODUCTS[item.producto];
  if (quickProduct) {
    return normalizeStockDelta(quickProduct.stock, item.cantidad);
  }

  return normalizeStockDelta(item.stock || item.descuentos_stock || item.descuentoStock, item.cantidad);
}

function validateSaleItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "Agrega al menos un producto al carrito.");
  }

  return items.map((item) => {
    const producto = cleanText(item?.producto, 120);
    const cantidad = parseInteger(item?.cantidad);
    const precioUnitario = parseMonto(item?.precio_unitario ?? item?.precioUnitario);
    const observacion = cleanText(item?.observacion, 300);

    if (!producto) {
      throw new HttpError(400, "Cada producto debe tener un nombre.");
    }

    if (!cantidad || cantidad <= 0) {
      throw new HttpError(400, `La cantidad de "${producto}" debe ser mayor a cero.`);
    }

    if (!precioUnitario || precioUnitario <= 0) {
      throw new HttpError(400, `El precio de "${producto}" debe ser mayor a cero.`);
    }

    return {
      producto,
      cantidad,
      precio_unitario: precioUnitario,
      subtotal: cantidad * precioUnitario,
      observacion,
      stock: item?.stock || item?.descuentos_stock || item?.descuentoStock || {}
    };
  });
}

function getStockRequirements(items) {
  const requirements = Object.fromEntries(STOCK_KEYS.map((key) => [key, 0]));

  items.forEach((item) => {
    const delta = getItemStockDelta(item);
    STOCK_KEYS.forEach((key) => {
      requirements[key] += delta[key];
    });
  });

  return requirements;
}

function assertStockAvailable(requirements) {
  const stock = getStock();
  const errors = STOCK_KEYS.filter((key) => requirements[key] > stock[key]).map(
    (key) => `${key}: disponibles ${stock[key]}, necesarios ${requirements[key]}`
  );

  if (errors.length) {
    throw new HttpError(400, `Stock insuficiente (${errors.join("; ")}).`);
  }
}

function getVentaById(id) {
  const venta = db
    .prepare("SELECT id, total, metodo_pago AS metodoPago, observacion, created_at AS createdAt FROM ventas WHERE id = ?")
    .get(id);

  if (!venta) return null;

  venta.items = db
    .prepare(
      "SELECT producto, cantidad, precio_unitario AS precioUnitario, subtotal, observacion FROM detalle_venta WHERE venta_id = ? ORDER BY id"
    )
    .all(id);

  return venta;
}

function createVenta(payload) {
  const items = validateSaleItems(payload?.items);
  const metodoPago = PAYMENT_METHODS.includes(payload?.metodo_pago) ? payload.metodo_pago : "Otro";
  const observacion = cleanText(payload?.observacion, 500);
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const requirements = getStockRequirements(items);

  assertStockAvailable(requirements);

  const createdAt = new Date().toISOString();
  let ventaId;

  db.exec("BEGIN IMMEDIATE");
  try {
    const ventaResult = db
      .prepare("INSERT INTO ventas (total, metodo_pago, observacion, created_at) VALUES (?, ?, ?, ?)")
      .run(total, metodoPago, observacion, createdAt);

    ventaId = Number(ventaResult.lastInsertRowid);

    const insertDetail = db.prepare(
      "INSERT INTO detalle_venta (venta_id, producto, cantidad, precio_unitario, subtotal, observacion) VALUES (?, ?, ?, ?, ?, ?)"
    );
    items.forEach((item) => {
      insertDetail.run(ventaId, item.producto, item.cantidad, item.precio_unitario, item.subtotal, item.observacion);
    });

    const update = db.prepare("UPDATE stock SET cantidad = cantidad - ? WHERE clave = ?");
    STOCK_KEYS.forEach((key) => {
      if (requirements[key] > 0) {
        update.run(requirements[key], key);
      }
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getVentaById(ventaId);
}

function listVentas() {
  const ventas = db
    .prepare(
      "SELECT id, total, metodo_pago AS metodoPago, observacion, created_at AS createdAt FROM ventas ORDER BY datetime(created_at) DESC, id DESC LIMIT 50"
    )
    .all();

  const getItems = db.prepare(
    "SELECT producto, cantidad, precio_unitario AS precioUnitario, subtotal, observacion FROM detalle_venta WHERE venta_id = ? ORDER BY id"
  );

  return ventas.map((venta) => ({
    ...venta,
    items: getItems.all(venta.id)
  }));
}

function getVentasSummary() {
  const summary = db.prepare("SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total FROM ventas").get();
  return {
    cantidad: Number(summary.cantidad),
    total: Number(summary.total)
  };
}

function getProductBreakdown() {
  const rows = db
    .prepare(
      "SELECT producto, SUM(cantidad) AS cantidad, SUM(subtotal) AS total FROM detalle_venta GROUP BY producto ORDER BY producto COLLATE NOCASE"
    )
    .all();

  const breakdown = {
    choripanes: { cantidad: 0, total: 0 },
    bebidas: { cantidad: 0, total: 0 },
    promos: { cantidad: 0, total: 0 },
    te: { cantidad: 0, total: 0 },
    cafe: { cantidad: 0, total: 0 },
    manuales: []
  };

  rows.forEach((row) => {
    const producto = row.producto;
    const cantidad = Number(row.cantidad);
    const total = Number(row.total);

    if (producto === "Choripán") {
      breakdown.choripanes.cantidad += cantidad;
      breakdown.choripanes.total += total;
    } else if (producto === "Bebida") {
      breakdown.bebidas.cantidad += cantidad;
      breakdown.bebidas.total += total;
    } else if (producto === "Té") {
      breakdown.te.cantidad += cantidad;
      breakdown.te.total += total;
    } else if (producto === "Café") {
      breakdown.cafe.cantidad += cantidad;
      breakdown.cafe.total += total;
    } else if (producto.startsWith("Promo choripán +")) {
      breakdown.promos.cantidad += cantidad;
      breakdown.promos.total += total;
    } else {
      breakdown.manuales.push({ producto, cantidad, total });
    }
  });

  return breakdown;
}

function getResumen() {
  const gastos = getGastosSummary();
  const ventas = getVentasSummary();

  return {
    totalVendido: ventas.total,
    totalGastado: gastos.total,
    ganancia: ventas.total - gastos.total,
    cantidadVentas: ventas.cantidad,
    cantidadGastos: gastos.cantidad,
    stock: getStock(),
    productos: getProductBreakdown()
  };
}

function sendError(res, error) {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = statusCode === 500 ? "Ocurrio un error interno." : error.message;

  if (statusCode === 500) {
    console.error(error);
  }

  sendJson(res, statusCode, { error: message });
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/gastos") {
      sendJson(res, 200, {
        gastos: listGastos(),
        resumen: getGastosSummary()
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/gastos") {
      const data = await readJson(req);
      const monto = parseMonto(data.monto);
      const descripcion = cleanText(data.descripcion, 300);

      if (!monto || monto <= 0) {
        throw new HttpError(400, "Ingresa un monto mayor a cero.");
      }

      if (!descripcion) {
        throw new HttpError(400, "Ingresa una descripcion para justificar el gasto.");
      }

      sendJson(res, 201, {
        gasto: createGasto(monto, descripcion),
        resumen: getGastosSummary()
      });
      return;
    }

    const deleteMatch = pathname.match(/^\/api\/gastos\/(\d+)$/);
    if (req.method === "DELETE" && deleteMatch) {
      const deleted = deleteGasto(Number(deleteMatch[1]));
      if (!deleted) {
        throw new HttpError(404, "No se encontro el registro.");
      }

      sendJson(res, 200, {
        ok: true,
        resumen: getGastosSummary()
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/stock") {
      sendJson(res, 200, { stock: getStock() });
      return;
    }

    if (req.method === "PUT" && pathname === "/api/stock") {
      const data = await readJson(req);
      sendJson(res, 200, {
        stock: updateStock(data),
        resumen: getResumen()
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/ventas") {
      sendJson(res, 200, { ventas: listVentas() });
      return;
    }

    if (req.method === "POST" && pathname === "/api/ventas") {
      const data = await readJson(req);
      sendJson(res, 201, {
        venta: createVenta(data),
        stock: getStock(),
        resumen: getResumen()
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/resumen") {
      sendJson(res, 200, { resumen: getResumen() });
      return;
    }

    throw new HttpError(404, "Ruta no encontrada.");
  } catch (error) {
    sendError(res, error);
  }
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Acceso denegado");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Archivo no encontrado");
      return;
    }

    const extension = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url.pathname);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Registro CEAL listo en http://localhost:${PORT}`);
});
