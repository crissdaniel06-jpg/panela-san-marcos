# Auditoría técnica — Panela San Marcos

Fecha de revisión: 28 de octubre de 2026.

## Pedidos y causa de `orders.id` nulo

- La aplicación llama `create_order` por RPC con `p_items`, `p_request_id`, `p_city`, `p_payment_method` y `p_customer`. Los nombres y tipos coinciden con la única sobrecarga remota: `(jsonb, text, text, jsonb, uuid) returns uuid`.
- La definición remota inspeccionada antes del cambio asignaba `gen_random_uuid()` en la inserción explícita de `orders`; `orders.id` también tenía `DEFAULT gen_random_uuid()`. No hay triggers en `orders` y el código local no contiene otra inserción cliente a esa tabla.
- La función está como `SECURITY DEFINER`, pertenece a `postgres`, usa `search_path` vacío y referencia objetos con esquema. `EXECUTE` está habilitado para `authenticated`, no para `anon`. La función obtiene `auth.uid()`, bloquea pedidos concurrentes por usuario y solicitud, bloquea filas de productos por ID, calcula los precios y hace el pedido y sus partidas en una sola transacción.
- **No se pudo demostrar la causa original del error** con el esquema actual. El mensaje implicaría una inserción distinta o una definición antigua en el momento del fallo; eso es posible, pero no está comprobado. No se creó un pedido en producción para intentar reproducirlo. La función fue reemplazada de nuevo al aplicar la migración siguiente, pero no se afirma que el error quede reproducido o resuelto de extremo a extremo.
- `js/checkout.js` ahora conserva el mismo ID de idempotencia en `localStorage` para sobrevivir recargas y fallos de red; valida el UUID devuelto y muestra errores de negocio comprensibles. La fuente de precios, stock, partidas y total sigue siendo `create_order` en el servidor. La confirmación vuelve a consultar el pedido real y RLS lo limita al propietario.

## Perfil, catálogo y seguridad

- Registro envía `first_name` y `last_name` en `user_metadata`; el trigger remoto `handle_new_user` copia esos campos a `profiles.first_name` y `profiles.last_name`. La inspección remota encontró cero perfiles sin apellido y cero usuarios sin perfil. El checkout carga `profiles` por el UUID autenticado, sin depender de una propiedad de sesión que podía faltar.
- Perfil ahora valida datos de contacto y escribe en `profiles`; historial e información de confirmación se leen de Supabase. El almacenamiento local de la última confirmación conserva solo el UUID del pedido y el propietario, no teléfono, correo ni dirección.
- Catálogo, carrito, favoritos, detalle y checkout usan los productos disponibles y precios/stock leídos desde Supabase. Si no se pueden verificar, la interfaz no permite continuar con datos de catálogo en caché. La búsqueda incluye descripción y categoría; el catálogo ofrece orden por precio y nombre.
- Favoritos usan la PK compuesta y `upsert` idempotente. RLS limita lectura e inserción/eliminación al usuario propietario.
- Las seis tablas revisadas (`profiles`, `products`, `favorites`, `orders`, `order_items`, `transfer_receipts`) tienen RLS habilitado. Pedidos y partidas solo se leen por su propietario; no hay permiso de actualización directa del estado desde el navegador. `cancel_order` valida la sesión y el propietario.
- El bucket `transfer-receipts` existe y es privado (límite 5 MB; JPEG, PNG y PDF). Las políticas revisadas limitan carga y lectura a la carpeta del usuario; la eliminación solo se admite para archivos propios que todavía no estén asociados a un comprobante. El estado de pago solo cambia a verificado mediante `review_transfer_receipt`, que exige `app_metadata.role = admin`.
- La clave incluida en `js/supabase-config.js` es una clave publicable `sb_publishable_`; no se encontró `service_role`, `sb_secret` ni `localhost:3000` en los scripts revisados.

## Transferencias

No hay evidencia comprobable de que el número bancario previamente escrito en `checkout.html` haya sido autorizado por el titular. Se quitó de la interfaz y se deshabilitó la opción. Para evitar que una llamada manual al RPC la eluda, se aplicó `20261028235518_disable_unverified_transfer`: los pedidos nuevos por transferencia se rechazan con `TRANSFER_UNAVAILABLE`; pago contra entrega continúa aceptado. Un reintento con un ID de una orden de transferencia ya existente conserva su respuesta idempotente. No se modificaron filas de pedidos ni productos.

Para reactivar transferencias, el titular debe confirmar y configurar los datos bancarios. También se deben habilitar el flujo y el servidor de forma coordinada; actualmente los comprobantes existentes y las funciones de revisión permanecen disponibles para pedidos ya creados.

## Configuración y despliegue

- Los enlaces de confirmación de registro y recuperación se construyen desde la URL actual, de modo que conservan el prefijo `/panela-san-marcos/` de GitHub Pages. El registro ahora envía `emailRedirectTo` a `login.html` dentro de esa base.
- No fue posible leer la lista de URL permitidas de Supabase Auth desde las herramientas MCP. En el Dashboard se debe comprobar que la URL publicada de `login.html` y la ruta de `cuenta.html?recovery=1` estén permitidas antes de probar confirmación y recuperación.
- La URL de proyecto local coincide con `nrvqfuzragjsxuvqljpb`. Los enlaces internos y recursos locales de las 11 páginas HTML pasan el verificador estático.
- Se recorrió el sitio local en el navegador integrado: inicio, catálogo, filtro por categoría, búsqueda de producto, agregado al carrito, resumen del carrito y pantalla de inicio de sesión desde checkout. El filtro mostró dos productos de panela; la búsqueda «molida» mostró uno; el carrito conservó el producto y su subtotal de $2.50. La prueba se detuvo en el formulario de acceso para continuar con una cuenta de prueba.
- El sitio publicado y su consola no se verificaron en esta sesión; las pruebas de interfaz se hicieron sobre el servidor local.

## Verificaciones y límites

- **Probado:** `node --check` pasó para todos los scripts JavaScript; `python tests/check_site.py` encontró 11 páginas y cero rutas, fragmentos o IDs duplicados/inexistentes. La revisión manual en navegador verificó catálogo, filtro, búsqueda, carrito y acceso hasta el formulario de login.
- **Probado en la base remota:** lectura de columnas, restricciones, funciones, políticas y grants; verificación de `orders.id DEFAULT gen_random_uuid()`; listado de productos y coincidencia de IDs, precios, stock e imágenes con el catálogo local antes de hacer dinámica la lectura. Tras la migración, `create_order` conserva `returns uuid`, la inserción explícita de UUID y los grants correctos; `authenticated` puede ejecutar y `anon` no. `list_migrations` reportó `20261028235518 disable_unverified_transfer`.
- Antes de la migración remota, `list_migrations` devolvió una lista vacía, aunque el esquema ya contenía columnas/estados que aparecen en otra migración local (`20261028232157_fix_order_creation_and_payment_states.sql`). Por tanto, existe una discrepancia entre el esquema remoto y su historial de migraciones; esa migración previa no se reaplicó para evitar operaciones repetidas sobre un esquema ya modificado.
- Se comprobó después que el proyecto sigue con cero pedidos, cero partidas y cero comprobantes, y que las cantidades de stock permanecen en los mismos valores consultados antes. No se hicieron escrituras de datos de prueba.
- **Probado con sesión autenticada en navegador:** el encabezado reconoció la cuenta; el área de perfil cargó y favoritos mostró un elemento existente. Checkout conservó el producto del carrito de prueba, actualizó el costo al elegir Pacto y bloqueó el avance con teléfono y dirección vacíos, mostrando sus errores. No se envió el pedido y se restauró el carrito vacío. No se modificó el perfil ni el favorito existente.
- **Pendiente de extremo a extremo:** crear y consultar un pedido de prueba, reintento de red, comprobante privado y aislamiento entre dos cuentas. Requiere un entorno y datos de prueba seguros; no se realizaron compras ni transferencias.
- **Pendiente visual y accesibilidad:** revisar el diseño en móvil y completar una prueba manual de teclado/lector de pantalla.
