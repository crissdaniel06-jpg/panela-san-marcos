# Implementación técnica — Panela San Marcos

## Estado

El catálogo, carrito y navegación siguen siendo HTML/CSS/JavaScript estáticos. Se añadieron la configuración opcional de Supabase, una migración inicial, perfil, favoritos y el flujo de creación de órdenes desde una función PostgreSQL. Sin URL y clave pública, catálogo y carrito siguen disponibles; cuentas, favoritos, pedidos y transferencias muestran que necesitan configuración. No se ha creado ni conectado un proyecto Supabase desde este entorno.

## Archivos principales

- `js/supabase-config.js`: crea el cliente con `window.PANELA_SUPABASE_CONFIG`; vacío por defecto.
- `js/store.js`: carrito local y operaciones Auth, perfiles y favoritos mediante Supabase. Ya no crea usuarios locales ni guarda contraseñas; elimina claves de autenticación heredadas y descarta el resumen de pedido local al cerrar sesión o cambiar de propietario.
- `js/perfil.js`, `cuenta.html`: lectura/edición del perfil, solicitud de cambio de email con confirmación y cambio/recuperación de contraseña por Auth.
- `js/favoritos.js`, `favoritos.html`: lista privada y eliminación de favoritos.
- `js/checkout.js`: exige sesión, solicita orden al RPC, y carga comprobantes al bucket privado.
- `supabase/migrations/001_initial_schema.sql`: esquema, carga inicial del catálogo, RLS, RPC y bucket.
- `.env.example`: nombres ilustrativos de configuración; GitHub Pages no lee variables de entorno del servidor.

## Configurar Supabase

1. Crea un proyecto Supabase y copia su URL y clave `anon`/publicable.
2. Edita `js/supabase-config.js` y completa `url` y `anonKey` con la URL y clave publicable. No uses `service_role`.
3. Ejecuta `supabase/migrations/001_initial_schema.sql` una sola vez en el SQL Editor o con Supabase CLI enlazado al proyecto.
4. En Authentication, configura URL del sitio y redirecciones para el dominio publicado en GitHub Pages y dominios locales; decide si la confirmación de correo permanece activa.
5. La migración crea el bucket privado `transfer-receipts` (máximo 5 MiB, JPEG/PNG/PDF) y las políticas de lectura/carga por carpeta UUID del usuario.
6. Prueba Auth, RLS y Storage en un proyecto de desarrollo antes de publicar la configuración pública.

El catálogo continúa definido en `js/productos.js`; los ocho productos se copian como semilla inicial a `public.products` con `ON CONFLICT DO NOTHING`. Si cambian productos/precios, sincroniza las dos fuentes o decide una migración de catálogo como siguiente tarea.

## Esquema y seguridad

- `profiles.id` referencia `auth.users`; guarda nombre, apellido, teléfono, dirección, ciudad y timestamps. Un trigger crea el perfil al registrar usuario.
- `products` conserva las ocho fichas, precios, categoría, stock y disponibilidad. La lectura de productos disponibles es pública; el rol normal no tiene permisos de escritura.
- `favorites` tiene PK compuesta `(user_id, product_id)` y cascadas a usuario/producto.
- `orders` guarda propietario, estado, importe, método/estado de pago y copia de entrega; índice por propietario y fecha.
- `order_items` conserva nombre y precio unitario históricos; tiene FK al pedido y al producto, índice por pedido, checks de cantidad y subtotal.
- `transfer_receipts` referencia orden, usuario y ruta en Storage; trigger cambia el estado a `COMPROBANTE_RECIBIDO` al registrar metadatos.
- RLS permite a cada usuario leer/editar su perfil y sus favoritos; pedidos, líneas y comprobantes solo se leen por su propietario. No hay políticas de escritura directa para órdenes ni de aprobación de pago.
- `create_order(...)` solo se ejecuta como usuario autenticado. Recalcula precios, envío y total en PostgreSQL, valida ciudad, método, cantidad y disponibilidad, bloquea productos, descuenta stock y usa `request_id` único por usuario para que los reintentos devuelvan la misma orden. `cancel_order(uuid)` cancela únicamente órdenes pendientes propias y restaura stock; el cliente no puede escribir total, estado o propietario.

La función no valida transferencias bancarias ni aprueba pagos. La aprobación simulada está desactivada. La pantalla identifica que los datos del Banco Pichincha son solo una simulación y no proporciona un número de cuenta real; no se debe transferir dinero.

## Pruebas y limitaciones observadas

Pruebas locales ejecutadas: `node --check` en todos los archivos JavaScript; revisión de diferencias con `git diff --check` (considerando CRLF del repositorio); búsqueda estática de claves privadas, contraseña de demostración, credenciales locales y número de cuenta; inspección del SQL y RLS. Las imágenes grandes se identificaron, pero no se convirtieron porque no hay codificador WebP/AVIF instalado; se añadieron carga diferida a tarjetas y dimensiones declaradas. No se ejecutaron consultas contra PostgreSQL (`psql` no está instalado) ni pruebas end-to-end porque no hay proyecto ni credenciales Supabase configurados. Tampoco se ha confirmado el comportamiento de las políticas Storage desplegadas, teclado, zoom ni responsive en navegador.

GitHub Pages sirve contenido estático: el código del navegador es inspeccionable y una URL poco conocida no restringe acceso. La clave publicable es visible por diseño; la protección depende de Auth/RLS/Storage y permisos SQL. Para contenido privado del sitio completo, se necesita un hosting con control de acceso de servidor. No se habilitó una ruta de aprobación de pago.

Falta conectar el proyecto Supabase y realizar QA visual/teclado/responsive y pruebas integradas reales; no se afirma conformidad WCAG total. Una integración bancaria futura exige proveedor/API autorizado, credenciales en servidor, verificación de transacciones y confirmación del pago solo desde servidor.
