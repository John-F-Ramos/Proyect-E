# Prueba Técnica MVP - Equivalencias

Esta guía te ayudará a probar todo lo que se ha construido en la Fase 1 (Módulo de Ingesta, Backend y Frontend Mock). Tienes dos formas de realizar pruebas: Automáticas (con Jest) y Manuales (Corriendo el servidor y probando End-to-End).

## Opción 1: Pruebas Automáticas (Unit Testing con Jest)

Dado que se ha configurado `jest`, puedes probar la lógica de procesamiento de Excel sin necesidad de inicializar Firebase ni levantar el servidor web.

**Pasos:**
1. Abre tu terminal y ubícate en `e:\Proyectos\Proyect-E`.
2. Asegúrate de tener dependencias instaladas: `npm install`
3. Ejecuta el comando de pruebas:
   ```bash
   npm run test
   ```
4. Verás en consola que se ejecuta el archivo `tests/excelProcessor.test.js`. Este archivo crea un Excel en memoria, lo envía al procesador y valida que el JSON resultante sea correcto.

---

## Opción 2: Pruebas Manuales (End-to-End)

Para probar la inserción real en Firebase y visualización frontend, debes seguir estos pasos:

<!-- ### 1. Configurar Firebase Admin (Backend)
1. Ve a la consola de Firebase (`console.firebase.google.com`), selecciona el proyecto.
2. Ve a la "Rueda dentada (Configuración) -> Configuración del proyecto -> Cuentas de servicio".
3. Da clic en **Generar nueva clave privada**. Esto descargará un archivo `.json` de credenciales.
4. Copia ese archivo `.json` a la raíz del proyecto (e.g., `e:\Proyectos\Proyect-E\firebase-credentials.json`). **No subas esto a Git, asegúrate de que esté en `.gitignore`**.
5. Crea un archivo `.env` en `e:\Proyectos\Proyect-E` y coloca la ruta hacia esa clave:
   ```env
   PORT=3000
   GOOGLE_APPLICATION_CREDENTIALS="./firebase-credentials.json"
   ```

### 2. Configurar Firebase Client (Frontend - Opcional para Login real)
1. En la consola de Firebase, ve a "Autenticación" y habilita **Correo electrónico y contraseña**.
2. Ve a "Configuración del proyecto -> General" y busca tu bloque de configuración web (firebaseConfig).
3. Abre el archivo `e:\Proyectos\Proyect-E\public\js\auth.js`.
4. Reemplaza el objeto `firebaseConfig` temporal que existe con el de tu proyecto.
5. Crea un usuario desde la consola de Firebase para probar el login, o comenta el bloque `loginContainer` en JS si sólo quieres ver el módulo de ingesta saltando el login.

### 3. Levantar Servidor y Cliente
1. Inicia el servidor backend desde la terminal:
   ```bash
   node server.js
   ```
   *(Debe decir: Server running on port 3000)* -->

2. Levanta el cliente (Frontend). Abre una nueva terminal en `e:\Proyectos\Proyect-E` y usa `npx serve public/` (o abre `public/index.html` con Live Server de VSCode).
3. Entra a `http://localhost:3000/localhost...` (la url que te de el serve).

### 4. Prueba Final (Endpoint)
1. Accede con el usuario creado (o salta el login si lo modificaste).
2. Verás el **Módulo de Ingesta (Excel-to-JSON)**.
3. Crea un archivo `.xlsx` (Excel) rápido con unas cuantas columnas (ej. *Codigo, Asignatura, UV*).
4. Dale a **Seleccionar archivo** -> escoge el excel -> **Procesar Archivo**.
5. Verás en la UI un mensaje verde indicando éxito.
6. Ve a tu consola de **Firestore Database** en Firebase y verifica la colección `planes_estudio`. Verás los documentos JSON importados.
