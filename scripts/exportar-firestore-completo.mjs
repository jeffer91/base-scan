/**
 * Exportación administrativa de Firestore, incluidos documentos y subcolecciones.
 * Solo se ejecuta en un entorno de confianza (GitHub Actions o equipo local).
 * No publicar credenciales de servicio ni el JSON generado en GitHub Pages.
 */
import fs from "node:fs/promises";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from "firebase-admin/firestore";

const destination = process.argv[2];
const expectedProject = process.env.FIREBASE_EXPECTED_PROJECT;
const credentialJSON = process.env.FIREBASE_ADMIN_JSON;
if (!destination || !expectedProject || !credentialJSON) {
  throw new Error("Faltan ruta de salida, FIREBASE_EXPECTED_PROJECT o FIREBASE_ADMIN_JSON.");
}

let credentials;
try {
  credentials = JSON.parse(credentialJSON);
} catch {
  throw new Error("El secreto de Firebase no contiene un JSON válido.");
}
if (credentials.project_id !== expectedProject || !credentials.client_email || !credentials.private_key) {
  throw new Error("La cuenta de servicio no coincide con el proyecto seleccionado o está incompleta.");
}

const app = initializeApp({ credential: cert(credentials), projectId: expectedProject });
const db = getFirestore(app);
const collections = Object.create(null);
let countDocs = 0;
let countMissing = 0;

function serialize(value) {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Timestamp) {
    return { __firestore_type__: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds, iso: value.toDate().toISOString() };
  }
  if (value instanceof GeoPoint) {
    return { __firestore_type__: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof DocumentReference) {
    return { __firestore_type__: "reference", path: value.path };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { __firestore_type__: "bytes", base64: Buffer.from(value).toString("base64") };
  }
  if (value instanceof Date) {
    return { __firestore_type__: "date", iso: value.toISOString() };
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const object = Object.create(null);
    for (const [key, item] of Object.entries(value)) object[key] = serialize(item);
    return object;
  }
  return value;
}

async function workPool(items, handler, parallel = 8) {
  let next = 0;
  const workers = Array.from({ length: Math.min(parallel, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await handler(items[index]);
    }
  });
  await Promise.all(workers);
}

async function visitCollection(col) {
  const docRefs = await col.listDocuments();
  const entries = [];

  // listDocuments también permite encontrar padres sin documento,
  // cuya única existencia se debe a sus subcolecciones.
  for (let offset = 0; offset < docRefs.length; offset += 80) {
    const refs = docRefs.slice(offset, offset + 80);
    const snapshots = await db.getAll(...refs);
    for (const snapshot of snapshots) {
      entries.push({
        id: snapshot.id,
        path: snapshot.ref.path,
        exists: snapshot.exists,
        data: snapshot.exists ? serialize(snapshot.data()) : null
      });
      if (snapshot.exists) countDocs++;
      else countMissing++;
    }
  }

  collections[col.path] = entries;
  console.log("Colección procesada:", col.path, "| documentos:", entries.filter(row => row.exists).length);

  await workPool(docRefs, async (ref) => {
    const children = await ref.listCollections();
    for (const child of children) await visitCollection(child);
  });
}

try {
  const roots = await db.listCollections();
  for (const root of roots) await visitCollection(root);
  const ordered = Object.fromEntries(Object.entries(collections).sort(([a], [b]) => a.localeCompare(b)));
  const output = {
    _respaldo: {
      proyecto: expectedProject,
      base: "(default)",
      fechaUTC: new Date().toISOString(),
      colecciones: Object.keys(ordered).length,
      documentosExistentes: countDocs,
      padresSinDocumento: countMissing,
      incluyeSubcolecciones: true,
      tipo: "Exportación de lectura; conserva rutas e identificadores"
    },
    colecciones: ordered
  };
  await fs.writeFile(destination, JSON.stringify(output, null, 2), { encoding: "utf8", mode: 0o600 });
  console.log("Respaldo generado:", Object.keys(ordered).length, "colecciones y", countDocs, "documentos.");
} finally {
  await deleteApp(app);
}
