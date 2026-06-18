const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "gastos.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monto INTEGER NOT NULL CHECK (monto > 0),
    descripcion TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

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
        reject(new Error("El cuerpo de la solicitud es demasiado grande."));
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
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

function getSummary() {
  const summary = db.prepare("SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto), 0) AS total FROM gastos").get();
  return {
    cantidad: summary.cantidad,
    total: summary.total
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/gastos") {
    sendJson(res, 200, {
      gastos: listGastos(),
      resumen: getSummary()
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/gastos") {
    try {
      const rawBody = await readBody(req);
      const data = rawBody ? JSON.parse(rawBody) : {};
      const monto = parseMonto(data.monto);
      const descripcion = typeof data.descripcion === "string" ? data.descripcion.trim() : "";

      if (!monto || monto <= 0) {
        sendJson(res, 400, { error: "Ingresa un monto mayor a cero." });
        return;
      }

      if (!descripcion) {
        sendJson(res, 400, { error: "Ingresa una descripcion para justificar el gasto." });
        return;
      }

      sendJson(res, 201, {
        gasto: createGasto(monto, descripcion),
        resumen: getSummary()
      });
    } catch (error) {
      const message = error instanceof SyntaxError ? "El JSON enviado no es valido." : error.message;
      sendJson(res, 400, { error: message });
    }
    return;
  }

  const deleteMatch = pathname.match(/^\/api\/gastos\/(\d+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const deleted = deleteGasto(Number(deleteMatch[1]));
    if (!deleted) {
      sendJson(res, 404, { error: "No se encontro el registro." });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      resumen: getSummary()
    });
    return;
  }

  sendJson(res, 404, { error: "Ruta no encontrada." });
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
  console.log(`Base de datos: ${DB_PATH}`);
});
