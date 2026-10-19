# CiberHome — Web con pago por Stripe (Netlify)

Esta carpeta contiene la web de CiberHome lista para desplegar en Netlify,
con el botón "Confirmar y pagar → Tarjeta de crédito/débito" conectado a una
pasarela de pago **real** de Stripe (Stripe Checkout).

## ✅ Puesta en marcha en Netlify (resumen)

1. **Sube el proyecto con Git o con la CLI** (recomendado, porque las funciones necesitan instalar `stripe` y `@netlify/blobs`):
   - Git: sube la carpeta a GitHub → Netlify → *Add new site → Import an existing project*. Netlify lee `netlify.toml` solo.
   - CLI: `npm i -g netlify-cli && netlify deploy --build --prod` dentro de la carpeta.
   - Arrastrar la carpeta a https://app.netlify.com/drop publica la web, pero no te garantizo que instale las dependencias de las funciones: si el pago o el panel no responden, usa Git o la CLI.
2. **Variables de entorno** (Site configuration → Environment variables), después *Trigger deploy*:
   - `STRIPE_SECRET_KEY` → obligatoria para el pago con tarjeta.
   - `ADMIN_PASS` → **contraseña del panel de administración (obligatoria, mínimo 8 caracteres)**. Sin ella el panel queda desactivado.
   - `ADMIN_USER` (opcional, por defecto `admin`) y `ADMIN_SECRET` (opcional, texto aleatorio largo).
   - `SHEETS_URL` y `SHEETS_TOKEN` (opcionales): copia de cuentas y pedidos en Google Sheets (ver más abajo).
   - `ADMIN_DEMO_OFF=1`: desactiva el modo demo (usuario `admin` y contraseña `123` con acceso a los datos reales).
3. **Antes de cobrar de verdad** (esto no lo puedo rellenar yo, son tus datos):
   - PayPal: en `public/index.html` el SDK usa `client-id=sb` (**modo pruebas**). Cámbialo por tu Client ID *live* de PayPal.
   - Stripe: claves `live` (`sk_live_...` en Netlify).
   - EmailJS (`EMAILJS_DEFAULT`) y Google (`GOOGLE_CLIENT_ID`) siguen vacíos: rellénalos si quieres códigos por correo y «Continuar con Google».
   - La cuenta de prueba `juan` ya está eliminada.
4. Abre tu web, entra en `tu-web/#/admin` (o inicia sesión con el usuario `admin`) y comprueba que el panel carga.

## Código de descuento de primera compra

- Código: **`BIENVENIDO10`** → −10 % sobre los productos (no sobre la instalación), solo en la primera compra.
- Se anuncia en la barra superior, se regala al crear una cuenta y aparece como sugerencia en la cesta si la cuenta no tiene pedidos.
- Con tarjeta (Stripe) lo valida el servidor: comprueba en Stripe y en los pedidos guardados que ese correo/usuario no haya comprado antes, y aplica el descuento como cupón de un solo uso.
- Con PayPal la comprobación es solo del navegador (PayPal no pasa por tu servidor).
- Es un límite «blando»: alguien con otro correo podría volver a usarlo. Para cambiar el porcentaje o el nombre: `PROMO` en `public/index.html` y en `netlify/functions/create-checkout-session.mjs`.

## Base de datos en Google Sheets (opcional)

Cada cuenta y cada pedido se copia, además, en una hoja de Google Sheets con tres pestañas: **Pedidos**, **Lineas** (un producto por fila) y **Cuentas**. No se guardan contraseñas ni datos de pago.

1. Crea una hoja de Google nueva (o sube `CiberHome-base-de-datos.xlsx` a Drive y ábrela como hoja de Google).
2. *Extensiones → Apps Script*. Borra lo que haya, pega el contenido de `google-sheets/Code.gs` y cambia `TOKEN` por una clave larga inventada. Guarda.
3. Ejecuta una vez la función `setup` (acepta los permisos) para crear las pestañas con sus filtros.
4. *Implementar → Nueva implementación → Aplicación web*: Ejecutar como **Yo**, Quién tiene acceso **Cualquier usuario**. Copia la URL que termina en `/exec`.
5. En Netlify (*Environment variables*): `SHEETS_URL` = esa URL y `SHEETS_TOKEN` = la misma clave de `TOKEN`. Pulsa *Trigger deploy*.
6. Haz un pedido de prueba: aparecerá una fila en Pedidos y otra por producto en Lineas.

Para filtrar en Excel: en la hoja de Google, *Archivo → Descargar → Microsoft Excel (.xlsx)*.

## Panel de administración

- Acceso: `tu-web/#/admin` o iniciar sesión con el usuario `admin`.
- Muestra visitas, visitantes online, cuentas creadas, pedidos, ingresos, descuentos, embudo de compra, dispositivos, países, productos más vistos/vendidos, etc., con exportación a CSV.
- Los datos se guardan en Netlify Blobs (no hace falta base de datos). No se guardan IPs, solo país y ciudad.
- Modo demo: mientras no pongas `ADMIN_DEMO_OFF=1` en Netlify, el usuario `admin` con contraseña `123` también entra y ve los datos reales. Desactívalo antes de abrir la tienda al público.
- Define `ADMIN_PASS` antes de publicar: el panel enseña correos, teléfonos y direcciones de clientes.

---

## Estructura

```
ciberhome-netlify/
├── netlify.toml                          ← configuración de Netlify
├── package.json                          ← dependencias de las funciones (stripe, @netlify/blobs)
├── public/
│   ├── index.html                        ← la web (front-end) + panel de administración
│   └── robots.txt
└── netlify/
    └── functions/
        ├── create-checkout-session.mjs   ← habla con Stripe y valida el código BIENVENIDO10
        ├── track.mjs                     ← recibe visitas, cuentas y pedidos (Netlify Blobs)
        └── admin.mjs                     ← API del panel de administración
```

El front-end (`index.html`) **nunca** toca tu clave secreta de Stripe. Cuando
el cliente pulsa "Confirmar y pagar" con "Tarjeta de crédito/débito", el
navegador llama a `/api/create-checkout-session`, que Netlify redirige a la
función `create-checkout-session.mjs`. Esa función (que corre en el servidor)
crea una sesión de Stripe Checkout y devuelve la URL de pago; el navegador
redirige al cliente a la página de pago segura de Stripe.

Si el cliente elige "Contra reembolso", no se llama a Stripe: se muestra
directamente la confirmación de pedido, como hasta ahora.

## 1. Crea tu cuenta de Stripe

1. Ve a https://dashboard.stripe.com/register y crea una cuenta (o inicia
   sesión si ya tienes una).
2. En el panel, ve a **Desarrolladores → Claves de API**.
3. Copia:
   - La **clave publicable** (empieza por `pk_test_...` en modo prueba).
   - La **clave secreta** (empieza por `sk_test_...` en modo prueba).

Mientras pruebas, usa siempre las claves de **modo prueba** (test mode) y las
tarjetas de prueba de Stripe, por ejemplo `4242 4242 4242 4242`, cualquier
fecha futura y cualquier CVC.

## 2. Configura la clave publicable en el código

Abre `public/index.html`, busca esta línea (cerca del final del `<script>`):

```js
const STRIPE_PUBLISHABLE_KEY = 'pk_test_SUSTITUYE_ESTO';
```

y sustitúyela por tu clave publicable real.

## 3. Sube el proyecto a Netlify

Tienes dos formas igual de válidas:

### Opción A: arrastrar y soltar (la más rápida)
1. Ve a https://app.netlify.com/drop
2. Arrastra esta carpeta completa (`ciberhome-netlify`).
3. Netlify la publicará automáticamente.

### Opción B: conectando un repositorio Git (recomendada a largo plazo)
1. Sube esta carpeta a un repositorio de GitHub/GitLab.
2. En Netlify: **Add new site → Import an existing project** y selecciona el repo.
3. Netlify detectará `netlify.toml` automáticamente (publish: `public`,
   functions: `netlify/functions`).

## 4. Configura la clave secreta en Netlify (imprescindible)

La clave secreta **no va en el código**, va como variable de entorno:

1. En el panel de Netlify de tu sitio: **Site configuration → Environment variables**.
2. Añade una variable:
   - Key: `STRIPE_SECRET_KEY`
   - Value: tu clave secreta (`sk_test_...` o, en producción, `sk_live_...`)
3. Vuelve a desplegar el sitio (**Deploys → Trigger deploy**) para que la
   función tenga acceso a la variable.

## 5. Probar el pago

1. Abre tu sitio publicado (la URL que te da Netlify, tipo `tu-sitio.netlify.app`).
2. Añade un producto al carrito → Finalizar compra → rellena los datos →
   Guardar y continuar → elige "Tarjeta de crédito/débito" → Confirmar y pagar.
3. Se abrirá la página de pago de Stripe. Usa la tarjeta de prueba
   `4242 4242 4242 4242`, fecha futura y CVC cualquiera.
4. Tras pagar, Stripe te devuelve a tu web con un mensaje de confirmación.

## 6. Pasar a producción (cobrar de verdad)

Cuando quieras cobrar pagos reales:
1. Activa tu cuenta de Stripe (datos fiscales/bancarios) en el dashboard.
2. Cambia las claves de prueba por las claves **live** (`pk_live_...` y
   `sk_live_...`) tanto en `index.html` como en la variable de entorno de
   Netlify.

## Notas técnicas

- La función valida que exista `STRIPE_SECRET_KEY`; si falta, responde con un
  error claro en vez de fallar en silencio.
- **Precios blindados:** el navegador solo envía `id` y cantidad; el precio (incluido el +7 % progresivo y la instalación) lo calcula
  `create-checkout-session.mjs` con su propio catálogo `CATALOG`. **Si cambias un precio o añades un producto, actualiza `CATALOG` en esa función además de `PRODUCTS` en `index.html`.**
- **Pago verificado:** al volver de Stripe, la web llama a `/api/verify-session` y solo muestra el pedido como pagado si Stripe lo confirma.
- Si quieres recibir notificaciones automáticas de pago (webhooks) para,
  por ejemplo, marcar el pedido como pagado en tu propia base de datos,
  se añade con otra función (`netlify/functions/stripe-webhook.js`) usando
  `stripe.webhooks.constructEvent`. Dímelo si quieres que te la prepare.

## Login y recuperación de contraseña (EmailJS)

La web incluye un acceso de usuarios (icono de persona en la cabecera): entrar, crear cuenta y
recuperar la contraseña con un código de 6 dígitos enviado por correo con **EmailJS**.

1. Crea una cuenta en https://www.emailjs.com y conecta tu Gmail/Outlook en **Email Services** (copia el *Service ID*).
2. En **Email Templates** crea UNA plantilla que sirve para todos los correos (código de recuperación y código de recogida):
   - *To email*: `{{to_email}}` · *Subject*: `{{subject}}`
   - *Content* (modo código/HTML): `<div style="font-family:Arial,sans-serif;white-space:pre-line">Hola {{username}},\n\n{{message}}\n\nTu código: <b style="font-size:22px">{{code}}</b></div>`
   - Copia el *Template ID*.
3. En **Account** copia tu *Public Key*.
4. Pega los tres datos en `public/index.html`, en la constante `EMAILJS_DEFAULT` (busca `EMAILJS_DEFAULT`).
   Al estar en el código funcionan siempre y para todos los visitantes; lo guardado en el navegador nunca los pisa.
   Abre `tu-web/#/config-correo` (ruta oculta) para enviar un correo de prueba y comprobar que todo funciona.

El envío usa directamente la API de EmailJS (sin librería externa), reintenta una vez si falla la red y deja
45 s entre códigos para no gastar la cuota del plan (el plan gratuito de EmailJS tiene un límite mensual de correos).

Sin configurar, el código solo se muestra en pantalla en local (modo prueba); en producción se avisa de que el correo no está configurado.

> Las cuentas se guardan en el navegador de cada visitante (IndexedDB), con la contraseña cifrada. Sirve para
> una experiencia de cuenta ligera, pero no es una base de usuarios compartida entre dispositivos.

## Acceso con Google

Los botones «Continuar con Google» / «Registrarme con Google» del panel de acceso usan Google Identity Services.

1. Entra en https://console.cloud.google.com → crea un proyecto → **APIs y servicios → Pantalla de consentimiento de OAuth**
   (tipo *Externo*, rellena nombre de la app y tu correo).
2. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web.**
3. En **Orígenes autorizados de JavaScript** añade tu dominio (`https://ciberhome.es`), la URL de Netlify
   (`https://tu-sitio.netlify.app`) y, para pruebas, `http://localhost:8888` (o el puerto que uses).
4. Copia el **ID de cliente** (acaba en `.apps.googleusercontent.com`) y pégalo en `public/index.html`, en la constante `GOOGLE_CLIENT_ID`.
5. Mientras la app esté en modo *Pruebas*, solo podrán entrar las cuentas que añadas como usuarios de prueba;
   pulsa **Publicar aplicación** para abrirla a todo el mundo.

Si el correo de Google coincide con una cuenta ya creada con contraseña, se vincula a ella. Las cuentas creadas con Google
no tienen contraseña hasta que el usuario use «He olvidado mi contraseña».

## Localizador de pedido

Pantalla de seguimiento pensada para que el cliente vea de un vistazo dónde está su pedido.

- **Cómo se abre:** enlace «Seguir pedido» en la cabecera (y en el menú móvil y el pie de página), botón
  «Seguir mi pedido» tras la compra, o directamente con `tu-web/#/seguimiento` (también `#/seguimiento/CH-260929-AB12`).
- **Qué muestra:** una línea de fases con el estado de cada una (Recibido → Preparando → Enviado → En camino →
  En reparto → Entregado, y «Instalación» si la contrató; para recogida en tienda: Recibido → Preparando → Listo para recoger),
  un titular claro de la fase actual, qué está pasando ahora, cuál es el siguiente paso, la fecha estimada y un desplegable
  «Qué significa cada fase». En móvil la línea pasa a vertical.
- **Cómo se busca:** número de pedido + correo del pedido. Con la sesión iniciada aparecen directamente «Tus pedidos» y se
  abre el más reciente. El mismo componente se usa también en «Mi cuenta → Detalles del pedido».
- **Los tiempos:** están en la función `stagesFor` (campo `at` de cada fase, en el JS de `public/index.html`). Ahora mismo el
  estado se calcula por el tiempo transcurrido desde la compra (estimado), igual que el seguimiento que ya existía.

> Importante: los pedidos se guardan en el navegador (IndexedDB), no en un servidor. Por eso el localizador solo encuentra
> pedidos hechos desde ese navegador o desde la cuenta con la que se inició sesión. Para que un cliente pueda consultar su
> pedido desde cualquier dispositivo, y para que las fases reflejen el estado real del envío, hace falta guardar los pedidos
> en una base de datos (por ejemplo con una función de Netlify) y cambiar el estado desde un panel o con el transportista.
