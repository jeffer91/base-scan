# Centro de respaldos — base-scan

Sitio: https://jeffer91.github.io/base-scan/

## 1. Descarga directa desde el navegador (TXT o Excel)

Selecciona la plataforma y base de datos. Firestore Web permite consultar las **colecciones cuyos nombres conoce la aplicación**, siempre que las reglas de seguridad permitan leerlas.

En `Currículo` se han cargado las 21 colecciones que declara `jeffer91/curriculo/firebase/firebase.exportar.js`. Los nombres se actualizarán manualmente si la aplicación agrega otras colecciones. La exportación del navegador **no descubre automáticamente colecciones desconocidas o subcolecciones**. Si falta algún permiso, el archivo incluirá `_errores` y la interfaz avisará de que el respaldo es parcial.

El estado «Configurado» solo significa que está cargada la configuración web; **no confirma acceso a los datos**.

## 2. Respaldo administrativo completo de Firestore

Para descubrir **todas las colecciones raíz y las subcolecciones**, incluso las contenidas en documentos padre inexistentes, se agregó:

- Workflow: [Respaldo completo Firestore cifrado](https://github.com/jeffer91/base-scan/actions/workflows/firestore-backup.yml)
- Exportador: `scripts/exportar-firestore-completo.mjs`.

El script usa Firebase Admin SDK y exporta los documentos con sus IDs, rutas completas, campos y subcolecciones. No modifica Firestore. Conserva tipos especiales (marcas de tiempo, referencias, geopuntos y bytes) como objetos tipados dentro del JSON.

**Configuración necesaria una sola vez**

1. En la consola de Google Cloud del proyecto, crea una **cuenta de servicio dedicada de solo lectura** con los permisos necesarios para consultar documentos y enumerar colecciones de Firestore (por ejemplo, el rol `Cloud Datastore Viewer`). Crea una clave **JSON** para esa cuenta. Evita usar cuentas administrativas más amplias de lo necesario.
2. Abre [Settings → Secrets and variables → Actions](https://github.com/jeffer91/base-scan/settings/secrets/actions) del repositorio y agrega el JSON **completo** en el secreto del proyecto:
   - `FIREBASE_ADMIN_CURRICULO` para `curriculo-ddfcd`;
   - `FIREBASE_ADMIN_TITULOS` para `titulos-ec2fa`;
   - `FIREBASE_ADMIN_UTET` para `utet-4387a`.
3. Crea el secreto `RESPALDO_CLAVE` con una contraseña **única, larga y aleatoria**. Guárdala fuera de GitHub: es necesaria para descifrar el respaldo. No pegues credenciales, claves privadas ni contraseñas en archivos públicos ni en el formulario de la web.
4. En la página de Actions del workflow, pulsa **Run workflow**, elige el proyecto y espera a que termine.
5. Abre la ejecución, descarga el **artifact** `firestore-<proyecto>-cifrado`. Incluye un archivo `.json.gpg` cifrado con AES-256. Solo se publica ese archivo cifrado, nunca el JSON en claro.

**Cómo descifrar en tu equipo**

Instala GnuPG (en Windows, por ejemplo, mediante Gpg4win). Extrae el archivo `.gpg` del ZIP descargado y ejecuta:

```bash
gpg --output firestore-completo.json --decrypt curriculo.json.gpg
```

Te pedirá la contraseña `RESPALDO_CLAVE`. El archivo `firestore-completo.json` tendrá la estructura:

```json
{
  "_respaldo": {
    "proyecto": "curriculo-ddfcd",
    "incluyeSubcolecciones": true
  },
  "colecciones": {
    "carreras": [
      {"id": "ejemplo", "path": "carreras/ejemplo", "exists": true, "data": {}}
    ],
    "carreras/ejemplo/subcoleccion": []
  }
}
```

El JSON es un respaldo de datos, **no un archivo de importación automática**. Para restaurarlo, se necesita un procedimiento específico. Los artifacts expiran a los **3 días**; guarda la copia descifrada en un lugar seguro, preferiblemente cifrado.

**Alcance y límites:** este flujo respalda la base Firestore **`(default)`** del proyecto escogido. No exporta Firebase Authentication, Storage, reglas de seguridad, índices, Realtime Database ni otras bases Firestore identificadas por nombre. Puede incurrir en lecturas facturables. Los respaldos muy grandes pueden sobrepasar el tiempo o la memoria del ejecutor; en ese caso es preferible la exportación administrada de Firestore a Cloud Storage.

## Seguridad

El sitio web y el repositorio son públicos: nunca se deben colocar credenciales de cuentas de servicio en HTML o JavaScript del navegador. Las claves `apiKey` del SDK web **no son credenciales de administración**, y el navegador sigue sujeto a las reglas de acceso de Firestore. El workflow guarda el respaldo cifrado porque los archivos y registros de Actions pueden ser accesibles según la visibilidad del repositorio.
