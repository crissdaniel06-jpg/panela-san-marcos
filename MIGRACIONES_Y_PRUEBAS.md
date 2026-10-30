# Migraciones y pruebas — Panela San Marcos

**Fecha:** 29 de octubre de 2026  
**Estado:** migración y smoke checks guardados localmente; no aplicados en Supabase. La carga de los 32 productos no se realizó.

## Resumen de cambios locales

Se creó la migración incremental y transaccional **supabase/migrations/20261029191500_expand_catalog_combos_and_order_audit.sql**. No se editaron las tres migraciones previas.

La migración:

- Conserva las seis tablas existentes, sus IDs y relaciones, y crea las seis tablas aprobadas: **categories**, **product_images**, **combo_components**, **order_item_components**, **order_status_history** y **payments**. El total modelado es 12 tablas de negocio.
- Crea cuatro categorías y asigna los productos actuales a Panela, Sabores y bebidas, Derivados de caña y Merchandising. Conserva exactamente el valor legacy de **products.category** (por ejemplo, **saborizados** y **bebidas** permanecen distintos en esa columna).
- Añade **products.category_id** y **product_type**; los productos existentes quedan como individuales. Copia **products.image_path** a **product_images** como imagen principal sin mover archivos.
- Añade snapshots de tipo y presentación a **order_items**, y copia los valores disponibles para las líneas existentes.
- Crea una fila de compatibilidad en **payments** por pedido existente y enlaza comprobantes actuales. No procesa cobros.
- Crea historial inicial para pedidos existentes y registra altas/cambios posteriores de estado.
- Actualiza **create_order** sin cambiar su firma. Para combos valida componentes, descuenta su inventario y guarda snapshot de composición. Continúa rechazando transferencias nuevas con **TRANSFER_UNAVAILABLE**.
- Actualiza **cancel_order** para reponer componentes desde el snapshot de compra. Solo cancela pedidos propios pendientes.
- Activa RLS en las seis tablas nuevas. La política de productos públicos también exige que la categoría esté activa. Las tablas privadas siguen limitadas al propietario.
- No crea productos ni componentes de combo nuevos, no habilita transferencias y no crea un bucket público. Los comprobantes siguen privados.

La migración aborta si no puede mapear alguna categoría existente. Sus DDL y backfill están en una transacción. No se incluyó una migración down automática: una reversión posterior a uso podría eliminar historial o datos legítimos y necesita revisión y respaldo.

## Archivos creados

- **supabase/migrations/20261029191500_expand_catalog_combos_and_order_audit.sql**
- **supabase/tests/model_expansion_readonly_checks.sql**: checks SQL de solo lectura para tablas, RLS, grants sensibles, bucket privado, integridad referencial, los ocho productos originales, imágenes principales, backfill de pagos, firma/grants RPC y bloqueo de transferencias. Está preparado para ejecución local/staging después de aplicar la migración.
- **MIGRACIONES_Y_PRUEBAS.md**: este reporte.

## Comandos ejecutados y resultados reales

Ejecutados en la raíz del repositorio:

1. **python tests/check_site.py**  
   Resultado: pasó. “OK: 11 páginas revisadas; rutas locales, fragmentos e IDs sin errores.”

2. **Get-ChildItem .\js\*.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Error sintáctico en $($_.Name)" } }; Write-Output 'OK: sintaxis JavaScript'**  
   Resultado: pasó. Todos los archivos JavaScript existentes pasaron node --check.

3. Comprobación estática temporal con Node sobre la migración.  
   Resultado: pasó para los predicados de transacción BEGIN/COMMIT, seis CREATE TABLE, ausencia de carga de filas en products, firma compatible de create_order, bloqueo de transferencia, RLS en tablas nuevas, políticas propietarias para tablas privadas y ausencia de claves secretas en SQL. No es un parser SQL.

4. Comprobaciones de herramientas y entorno:
   - **Get-Command supabase, psql, docker -ErrorAction SilentlyContinue** no encontró Supabase CLI, PostgreSQL CLI ni Docker.
   - **Test-Path supabase\config.toml** devolvió **False**.
   - No hay variables de entorno con nombres que coincidan con **SUPABASE**, **DATABASE_URL** o **PGHOST**.
   - Python informó **pglast=False** y **sqlparse=False**.
   - Las llamadas de descubrimiento a herramientas MCP de Supabase devolvieron **not available to the model**.

Comandos exactos ejecutados para estas verificaciones:

~~~powershell
python tests/check_site.py
Get-ChildItem .\js\*.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Error sintáctico en $($_.Name)" } }; Write-Output 'OK: sintaxis JavaScript'
~~~

Comprobación estática temporal exacta (no crea archivos ni conecta a la base):

~~~powershell
@'
const fs=require('fs');
const s=fs.readFileSync('supabase/migrations/20261029191500_expand_catalog_combos_and_order_audit.sql','utf8');
const checks={transactional:/^begin;/m.test(s)&&/commit;\s*$/.test(s),approvedTables:(s.match(/create table public\./g)||[]).length===6,noProductSeed:!/^\s*insert into public\.products\s*\(/mi.test(s),rpcCompatible:/create or replace function public\.create_order\(\s*p_items jsonb, p_city text, p_payment_method text, p_customer jsonb, p_request_id uuid\s*\)/i.test(s),transferBlocked:/TRANSFER_UNAVAILABLE/.test(s),allNewTablesHaveRls:(s.match(/alter table public\.(categories|product_images|combo_components|order_item_components|order_status_history|payments) enable row level security/g)||[]).length===6,ownerPolicies:/order_item_components_owner_read/.test(s)&&/order_status_history_owner_read/.test(s)&&/payments_owner_read/.test(s),receiptPaymentOwnership:/transfer_receipts\.payment_id is null/.test(s)&&/p\.order_id = transfer_receipts\.order_id/.test(s),noSecrets:!/service_role|sb_secret/i.test(s)}; console.log(JSON.stringify(checks,null,2)); if(Object.values(checks).some(x=>!x))process.exit(1);
'@ | node
~~~

Inspección de herramientas/configuración ejecutada:

~~~powershell
Get-Command supabase, psql, docker -ErrorAction SilentlyContinue | Select-Object Name,Source; Test-Path supabase\config.toml; python -c "import importlib.util as u; print('pglast=', bool(u.find_spec('pglast'))); print('sqlparse=', bool(u.find_spec('sqlparse')))"; Get-ChildItem Env: | Where-Object { $_.Name -match 'SUPABASE|DATABASE_URL|PGHOST' } | Select-Object Name
~~~

**No se ejecutó SQL ni fue posible compilar/aplicar la migración en PostgreSQL.** Los checks SQL siguen sin resultado; todavía no se puede afirmar que el SQL sea ejecutable hasta validarlo contra una instancia Postgres/Supabase.

## Pruebas obligatorias: estado

| Comprobación | Resultado |
|---|---|
| Rutas, fragmentos e IDs del sitio | Pasó localmente (11 páginas). |
| Sintaxis JavaScript | Pasó con Node. |
| Estructura estática de la migración | Pasó los predicados enumerados; no sustituye un parser. |
| Sintaxis y ejecución SQL | No ejecutada: no hay servidor, CLI, parser local ni MCP utilizable. |
| Integridad referencial tras migrar | No verificada en DB; smoke check preparado, no ejecutado. |
| Datos originales tras migrar | No verificados después de migración; el smoke check compara identidad, nombre, descripción, precio, categoría legacy, presentación, imagen y disponibilidad. El stock exacto se debe comparar con una captura justo antes de aplicar, ya que cambia con las ventas. |
| RLS con usuarios distintos | No probada: no hay base ni cuentas de test. El smoke check verifica flags/grants, no reemplaza dos sesiones reales. |
| create_order, reintento/idempotencia y consumo de stock | No probados: requieren DB, sesión Auth y escrituras. El RPC solo se actualizó localmente. |
| Rollback al fallar | No probado contra PostgreSQL. La transacción debe hacer atómicos los cambios al ejecutar el archivo completo, pero esto requiere validación en staging. |
| Transferencias | Estáticamente siguen bloqueadas; no se llamó al RPC. |
| Storage privado | No se modificó bucket ni archivos. El check de privacidad está en el smoke SQL y falta ejecutarlo. |

## Comandos para validar en local/staging

Supabase recomienda generar migraciones con la CLI; aquí no está instalada, así que el archivo sigue el patrón timestamp/nombre de las migraciones locales. Para una futura base **local** configurada con Supabase CLI:

~~~powershell
supabase start
supabase db reset
supabase test db
~~~

El repositorio no tiene **supabase/config.toml**. Antes de ejecutar esos comandos hay que inicializar/configurar un stack local compatible y resolver cómo conciliar el historial remoto discrepante. **db reset** es solo para local; puede recrear esa base y no debe ejecutarse en un proyecto remoto.

Para checks SQL de solo lectura en SQL Editor de staging, ejecutar **supabase/tests/model_expansion_readonly_checks.sql** después de aplicar y revisar la migración. No ejecutar estos checks en producción sin autorización adicional.

Pruebas funcionales adicionales necesarias en staging con cuentas distintas:

- Usuario A crea pedido COD con producto individual; reintenta con el mismo **p_request_id** y recibe el mismo UUID, sin duplicar pedido, pago ni descuento.
- Compra de combo: stock de componentes se descuenta, la línea conserva precio del combo y snapshot, y sin stock suficiente falla.
- Usuario A cancela su pedido pendiente y se repone el stock; A no puede cancelar pedido de B ni pedido no pendiente.
- Dos usuarios intentan leer perfiles, favoritos, pedidos, pagos, comprobantes e historial ajenos: no pueden leer ni modificar datos de la otra cuenta.
- En entorno desechable se fuerza un fallo durante la migración y se comprueba que no quedan tablas, políticas ni backfills parciales.
- Nueva transferencia falla con **TRANSFER_UNAVAILABLE**. No subir comprobantes ni mover dinero como parte de esta prueba.

## Límites y siguiente paso seguro

No hay acceso confirmado al proyecto remoto. La auditoría anterior también señaló que el historial remoto podía diferir de las migraciones locales. Esta entrega es **solo código de migración local**, no aplicación en Supabase ni verificación del esquema desplegado.

La migración concede explícitamente los privilegios de Data API que necesita cada rol, pero los grants por sí solos no garantizan que la configuración del proyecto exponga el esquema public. La guía/changelog actual de Supabase documenta el cambio de exposición automática de tablas; comprobar el ajuste de Data API del proyecto antes del despliegue.

Antes de ejecutar SQL, validar en local/staging que el esquema de **orders**, **transfer_receipts**, **reviewed_by**, **review_note**, constraints y RPCs cumple la cadena local; en particular se presupone la forma final de la migración **20261028232157_fix_order_creation_and_payment_states.sql**. La migración nueva debe probarse primero donde pueda verificarse su rollback.

Después de compilar, correr el smoke SQL y las pruebas funcionales, revisar asesores de seguridad Supabase, comparar el catálogo original y recién entonces evaluar despliegue. **No cargar los 32 productos** hasta validar y aprobar esta etapa.

## Referencias técnicas

- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: funciones de base de datos y SECURITY DEFINER](https://supabase.com/docs/guides/database/functions)
- [Supabase: cambio de exposición automática de tablas a Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

**Conclusión:** la migración y el smoke check están preparados, pero la etapa no puede considerarse validada. No se aplicó ninguna migración remota y no se cargó producto nuevo.

## Preflight remoto del 29 de octubre de 2026

**Destino verificado:** Supabase project ref `nrvqfuzragjsxuvqljpb`, URL `https://nrvqfuzragjsxuvqljpb.supabase.co`; coincide con la URL de `js/supabase-config.js`. No se consultaron ni copiaron claves. PostgreSQL remoto: 17.11.

**Estado antes de aplicar:** el remoto tiene las seis tablas base (`profiles`, `products`, `favorites`, `orders`, `order_items`, `transfer_receipts`) con RLS habilitado; no existen todavía las seis tablas nuevas. `products` contiene 8 filas; `orders` 1, `order_items` 1 y `transfer_receipts` 0. El bucket `transfer-receipts` existe y es privado, límite 5 MiB y MIME JPEG/PNG/PDF. Las políticas observadas limitan perfiles, favoritos, pedidos, líneas, comprobantes y objetos de recibos al propietario; las funciones consultadas son `SECURITY DEFINER`, con `search_path` vacío. `create_order` conserva su firma, rechaza transferencia con `TRANSFER_UNAVAILABLE` y está otorgada a `authenticated` (no a `anon`). No se crearon pedidos ni se modificaron datos.

Los ocho productos mantienen IDs 1–8, nombres, descripciones, precios, categorías legacy, presentaciones, imágenes, disponibilidad y stocks; el producto 2 tiene stock remoto 22 (no el 25 de la propuesta/smoke check), consistente con venta previa. No se asumió que el stock actual debiera coincidir con su valor inicial. La inspección de esquema informa que no hay objetos de Storage en el bucket.

**Discrepancia que requiere conciliación:** `supabase_migrations.schema_migrations` solo contiene `20261028235518 / disable_unverified_transfer`; faltan la migración inicial y `20261028232157_fix_order_creation_and_payment_states.sql`. Este historial incompleto es motivo para no correr `supabase db push` a ciegas ni volver a aplicar las migraciones antiguas. Sin embargo, por sí solo no demuestra que la nueva migración aditiva sea incompatible.

- `order_items` carece de `product_type` y `presentation`. Estas columnas **no son un prerrequisito**: la migración de expansión las añade antes de rellenarlas y antes de reemplazar `cancel_order`.
- `transfer_receipts` carece de `payment_id`. Tampoco es un prerrequisito: la expansión añade esa FK antes de asociar los comprobantes existentes.
- La definición remota de `cancel_order(uuid)` es la anterior. Esto **no es por sí solo un bloqueo**: la expansión la reemplaza después de crear y rellenar los snapshots que necesita.

La verificación todavía debe confirmar la parte de `20261028232157` que la expansión sí presupone: columnas `transfer_receipts.reviewed_by` y `review_note`, los CHECKs finales de `orders.payment_status` y `transfer_receipts.review_status`, y compatibilidad de `review_transfer_receipt`/grants. Si cualquiera falta o difiere, la expansión debe incluir una compatibilidad aditiva explícita o una migración de conciliación previa. Si están presentes y la revisión completa de dependencias no encuentra más diferencias, el historial incompleto se debe tratar como drift a documentar/reconciliar, no como motivo para reaplicar SQL antiguo.

No se ejecutó la expansión ni se corrigió el historial remoto. Antes de cualquier DDL, confirmar las columnas/constraints/funciones anteriores en staging o con consultas de solo lectura y completar una revisión SQL. El resumen inicial del preflight reportó la ausencia de `order_items.product_type`, `order_items.presentation`, `transfer_receipts.payment_id` y una versión antigua de `cancel_order` como bloqueos; tras contrastarlo con el archivo de expansión, esos cuatro puntos solos no bloquean la secuencia local.

**Herramientas y comandos:** `supabase --version`, `supabase db push --help`, `supabase migration --help` y `supabase projects --help` se intentaron desde PowerShell; todos devolvieron `supabase : The term 'supabase' is not recognized`. El directorio local `supabase/.temp` existe, pero no se usó como prueba de versión o destino. Se utilizó la conexión MCP Supabase para `get_project_url`, `list_migrations`, `list_tables` y consultas SQL de solo lectura. No se aplicó migración, no se modificó `schema_migrations` y no se ejecutó el SQL smoke.

**Resultado de la etapa:** migración **no aplicada** por incompatibilidad concreta y drift de historial/esquema. No se tomó respaldo ni se confirmó un backup antes de DDL porque no se llegó a DDL. No hubo fallo de transacción ni objetos parciales. No se ejecutó `db reset`, SQL destructivo, carga de catálogo, ni escritura de datos.

| Comprobación | Resultado remoto de esta etapa |
|---|---|
| Ref y URL frente a configuración | Pasó; coinciden. |
| Historial y existencia de tablas | Inspeccionados; historial incompleto. No reaplicar migraciones antiguas a ciegas; requiere conciliación documentada. |
| Columnas nuevas de expansión | Aún no existen; la migración las añade antes de usarlas, por lo que su ausencia no es por sí sola un bloqueo. |
| Supuestos heredados de `20261028232157` | Falta dejar evidencia de `reviewed_by`, `review_note`, CHECKs finales de estados y compatibilidad de `review_transfer_receipt`; pendiente. |
| Integridad y conservación de productos | Ocho productos presentes; los valores actuales se leyeron. No hay comparación postmigración porque no se aplicó. |
| RLS y privacidad Storage | Flags RLS en tablas existentes, políticas visibles y bucket privado observados. Sin prueba de dos sesiones. |
| Ejecución `model_expansion_readonly_checks.sql` | Pendiente; no se ejecutó porque la migración no se aplicó. |
| Pruebas de escritura, idempotencia, stock, combos y cancelación | Pendientes; no hay branch/staging confirmado y no se escribieron datos en producción. |
| Bloqueo de transferencia | Verificado estáticamente en la definición remota de `create_order`; no se invocó el RPC. |
| Productos propuestos | Confirmado: no se cargó ninguno de los 32. |
| Backup | No confirmado; requisito previo antes de cualquier DDL futuro. |

**CLI/MCP y reproducibilidad:** no se pudo consultar la versión/ayuda de Supabase CLI por ausencia del ejecutable. La conexión MCP está disponible para lecturas remotas; en este turno no se usó para DDL. Antes de otra aplicación, instalar/disponer de CLI o acordar uso de MCP después del preflight conciliado, conservar el SQL en `supabase/migrations` y verificar el mecanismo de backup/branch.

**Diferencias pendientes para el siguiente paso/GitHub:** este informe local contiene el preflight y la revisión posterior de sus bloqueos; no se publicó ni hizo push. La migración aprobada permanece intacta y sin aplicar. Primero verificar en remoto los supuestos heredados reales de `20261028232157`; no reaplicarla por falta de registro únicamente. Si el esquema efectivo es compatible, validar/aplicar la expansión desde un entorno seguro con respaldo y pruebas; si no, preparar una migración puente explícita. Transferencia continúa deshabilitada y no se cargaron los 32 productos.

## Reanudación del preflight y bloqueo por backup — 29 de octubre de 2026

Se volvió a consultar en solo lectura el proyecto `nrvqfuzragjsxuvqljpb`: ref/URL coinciden con `js/supabase-config.js`; el proyecto está `ACTIVE_HEALTHY`, región `us-west-2`, PostgreSQL 17.11. No se consultaron claves. Las seis tablas base y las columnas fuente de backfill existen. El historial continúa registrando únicamente `20261028235518 / disable_unverified_transfer`; no se reaplicaron migraciones antiguas ni se tocó `schema_migrations`.

**Supuestos de la expansión confirmados:** `transfer_receipts.reviewed_by` (uuid nullable) y `review_note` (text nullable) existen. `orders.payment_status` permite `PENDIENTE`, `COMPROBANTE_RECIBIDO`, `PENDIENTE_VERIFICACION`, `VERIFICADO`, `RECHAZADO`, `REQUIERE_CORRECCION`; `transfer_receipts.review_status` permite `RECIBIDO`, `EN_REVISION`, `APROBADO`, `RECHAZADO`, `REQUIERE_CORRECCION`. `review_transfer_receipt(uuid,text,text) returns boolean` y `create_order(jsonb,text,text,jsonb,uuid) returns uuid` son `SECURITY DEFINER`, `search_path=''`; `authenticated` puede ejecutarlas y `anon` no. La primera usa `ADMIN_REQUIRED` y las decisiones finales contempladas por sus checks; `create_order` contiene `TRANSFER_UNAVAILABLE`. Existen `products_public_read`, `receipts_own_insert`, `receipts_own_select`; sus grants/definiciones fueron inspeccionados. Los backfills encuentran `products` (incluyendo name, description, price, category, presentation, image_path, stock, available), `orders` (id/status/user_id/payment_method/payment_status/total/created_at), `order_items` (id/order_id/product_id/product_name/unit_price/quantity/line_subtotal) y `transfer_receipts` (id/order_id/user_id/storage_path/review_status/uploaded_at/reviewed_at/reviewed_by/review_note). Las columnas que la expansión agrega antes de usarlas siguen sin existir hoy, como se espera.

**Hallazgo de grants y corrección local:** el chequeo efectivo (`has_table_privilege`) confirmó grants amplios a `anon` en `profiles` y `favorites` (incluyendo lectura/escritura y TRUNCATE); `products` también tenía INSERT/UPDATE/DELETE/TRUNCATE para `anon`. RLS estaba activa, pero grants excesivos no cumplen mínimo privilegio. Se actualizó aditivamente la migración nueva para revocar grants de `PUBLIC`/`anon` en tablas privadas, restringir `products` a lectura pública y escrituras autenticadas bajo política admin, y revocar grants heredados de `PUBLIC`/`anon`/`authenticated` en las seis nuevas antes de conceder solo su superficie prevista. Se amplió `model_expansion_readonly_checks.sql` para detectar grants de escritura no aprobados a `anon`. Las migraciones antiguas no se editaron. El SQL completo de ambos archivos se volvió a leer tras editar; hashes SHA-256: migración `5E90D000F3C76833ADD51178E6428B1052168E024D606C60750874653AB37A20`; smoke SQL `360F7ED2586D18CB9CE169F71358F8BAF6DEB30147206DF22D820AC6F7A753F2`.

**Captura no sensible previa a DDL** (consulta remota `select id,name,description,price,category,presentation,image_path,stock,available from public.products order by id`; 8 filas):

~~~json
[
 {"id":1,"name":"Panela molida granulada","description":"Panela natural de caña en presentación granulada, práctica para endulzar bebidas y preparar diferentes recetas.","price":"2.50","category":"panela","presentation":"500 g","image_path":"img/productos/panela-molida.png","stock":30,"available":true},
 {"id":2,"name":"Panela en bloque","description":"Panela tradicional elaborada a partir de caña de azúcar, presentada en bloques para conservar su forma y sabor característico.","price":"2.75","category":"panela","presentation":"500 g","image_path":"img/productos/panela-bloque.png","stock":22,"available":true},
 {"id":3,"name":"Panela con canela","description":"Panela granulada combinada con canela, con un aroma y sabor especiado que complementa bebidas calientes y preparaciones.","price":"3.50","category":"saborizados","presentation":"500 g","image_path":"img/productos/panela-canela.png","stock":20,"available":true},
 {"id":4,"name":"Panela con jengibre","description":"Panela combinada con jengibre, una alternativa con un sabor ligeramente picante y aromático.","price":"3.50","category":"saborizados","presentation":"500 g","image_path":"img/productos/panela-jengibre.png","stock":20,"available":true},
 {"id":5,"name":"Miel de caña","description":"Derivado líquido de la caña de azúcar, de textura espesa y sabor dulce, ideal para acompañar diferentes preparaciones.","price":"4.50","category":"derivados","presentation":"480 g","image_path":"img/productos/miel-cana.png","stock":18,"available":true},
 {"id":6,"name":"Melaza de caña","description":"Derivado concentrado de la caña de azúcar, de color oscuro, textura espesa y sabor intenso.","price":"3.75","category":"derivados","presentation":"300 g","image_path":"img/productos/melaza-cana.png","stock":18,"available":true},
 {"id":7,"name":"Dulce de panela","description":"Dulce tradicional de panela en presentación de 20 cubitos, ideal para disfrutar directamente o acompañar bebidas.","price":"3.00","category":"derivados","presentation":"20 cubitos","image_path":"img/productos/dulce-panela.png","stock":25,"available":true},
 {"id":8,"name":"Infusión de panela","description":"Infusión elaborada con panela y frutas, presentada en sobres individuales para preparar fácilmente una bebida caliente.","price":"4.50","category":"bebidas","presentation":"25 sobres","image_path":"img/infusion-panela.png","stock":15,"available":true}
]
~~~

**Backup y decisión:** no se pudo confirmar ni obtener un backup recuperable mediante las herramientas disponibles. La CLI `supabase` no está instalada (`supabase --version` y comandos `--help` no disponibles); MCP ofrece consulta/aplicación de migraciones, pero no una consulta/exportación de backup verificable para este proyecto. `get_project` solo reporta estado/versión, no respaldo restaurable. Por la instrucción previa a DDL, **se detuvo el proceso y no se aplicó la migración**. No se ejecutó el smoke SQL remoto ni hubo comparación posterior, transacción ni objetos parciales. Los datos de arriba son solo captura previa; no se afirma que la conservación postmigración pasó.

**Comandos/consultas reales de esta reanudación:** PowerShell leyó completos `MIGRACIONES_Y_PRUEBAS.md` (sección Preflight remoto), la migración y el smoke; `Get-FileHash ... -Algorithm SHA256` sobre ambos SQL. MCP: `supabase_get_project({id})`, `supabase.get_project_url`, `supabase.list_migrations`, `supabase.list_tables({schemas:["public"],verbose:true})`; SQL de solo lectura para columnas/constraints, `pg_get_functiondef`/grants, `pg_policies`, `information_schema.role_table_grants`, `has_table_privilege`, conteos y captura de productos. No se hicieron llamadas MCP de aplicación/DDL. No hubo export/backup, cambios remotos, reset, drop, truncate, escrituras de prueba, carga de productos, ni publicación GitHub.

| Verificación | Estado |
|---|---|
| Ref y proyecto activo | Confirmado y coincide con configuración. |
| Tablas/columnas/CHECKs/RPCs requeridos | Confirmados compatibles para la migración. |
| Policies/grants | Inspeccionados; se detectó exceso de grants anon y se ajustó localmente la migración y el smoke. |
| Captura de 8 productos (incluye stock) | Guardada arriba antes de cualquier DDL; producto 2 tiene stock 22. |
| Backup recuperable | No confirmado; bloquea DDL. |
| Migración remota | No aplicada. |
| Smoke SQL / comparación antes-después | Pendientes: expansión no aplicada. |
| Pruebas de escritura/RLS entre usuarios | Pendientes para staging/branch seguro. |
| Transferencia / 32 productos | Transferencia sigue bloqueada por la función observada; no se cargaron los 32. |

Para continuar se necesita un respaldo verificable/restaurable del proyecto antes del DDL. Después se deberá repetir el preflight de datos, aplicar esta versión ajustada y ejecutar el smoke y la comparación antes/después. No se publicó ni hizo push; los dos archivos SQL modificados quedan locales para revisión junto con este informe.

## Verificación posterior a la ejecución manual en Supabase — 29 de octubre de 2026

El usuario informó que ejecutó el script desde Supabase. Se consultó de forma remota y de solo lectura el proyecto `nrvqfuzragjsxuvqljpb`. El esquema refleja la expansión: existen `categories`, `product_images`, `combo_components`, `order_item_components`, `order_status_history` y `payments`; `products` tiene `category_id` y `product_type`; `order_items` tiene `product_type` y `presentation`; y `transfer_receipts` tiene `payment_id`, `reviewed_by` y `review_note`. Las tablas nuevas tienen RLS habilitada. Conteos observados: 4 categorías, 8 productos, 8 imágenes, 1 pago y 1 registro de estado; 1 pedido, 1 línea y 0 comprobantes. No se cargaron los 32 productos propuestos.

La captura posterior conserva los ocho productos y sus datos de catálogo; el stock de Panela en bloque continúa en 22, con los otros stocks observados previamente. No se invocó el flujo de compra ni se hicieron escrituras de prueba. `create_order` sigue rechazando transferencia (`TRANSFER_UNAVAILABLE`), y el bucket `transfer-receipts` permanece privado.

**Historial de migraciones:** `supabase_list_migrations` continúa mostrando únicamente `20261028235518 / disable_unverified_transfer`. Esto es consistente con una ejecución manual en SQL Editor, que no registra una entrada de migración. Por tanto, queda verificado el estado del esquema, pero no que el contenido ejecutado sea idéntico byte por byte a `20261029191500_expand_catalog_combos_and_order_audit.sql`, ni que el historial del proyecto esté reconciliado. No se debe volver a ejecutar la migración completa ni hacer `db push` a ciegas.

**Grants corregidos:** la consulta de privilegios encontró que `authenticated` tenía `TRUNCATE` y otros permisos no previstos en `profiles` y `favorites`. Se revocaron los grants de `PUBLIC`, `anon` y `authenticated` sobre esas dos tablas, y se volvieron a otorgar solo `SELECT, INSERT, UPDATE` en `profiles` y `SELECT, INSERT, DELETE` en `favorites`. La verificación efectiva confirmó los permisos esperados y confirmó `DELETE/TRUNCATE/TRIGGER/REFERENCES/MAINTAIN` ausentes en `profiles`, y `UPDATE/TRUNCATE/TRIGGER/REFERENCES/MAINTAIN` ausentes en `favorites`. RLS gobierna qué filas puede operar el usuario. Se incorporó la misma regla a la migración local y al smoke de solo lectura para reproducibilidad.

El smoke `supabase/tests/model_expansion_readonly_checks.sql` se ejecutó remotamente después de corregir grants y finalizó sin error SQL (el bloque `DO` devolvió `[]`). No equivale a pruebas con dos usuarios ni a pruebas funcionales de pedido/idempotencia/stock/cancelación. No se verificó backup recuperable, no se insertaron datos, no se habilitó transferencia y no se publicaron estos cambios locales a GitHub.

| Verificación posterior | Resultado |
|---|---|
| Esquema de expansión presente | Sí, observado en el proyecto remoto. |
| Ocho productos existentes y datos preservados | Sí, según lectura posterior; stock del producto 2 = 22. |
| Smoke SQL de solo lectura | Completó sin error SQL. |
| Grants excesivos en perfiles/favoritos | Corregidos y comprobados. |
| Historial remoto | Solo una migración; la ejecución manual no se registró allí. |
| Transferencia / carga de 32 productos | Transferencia bloqueada; catálogo continúa en 8 productos. |
| Pruebas de flujo y RLS con identidades distintas | Pendientes. |

## Validación remota y prueba del smoke — 30 de octubre de 2026

Al retomar la tarea, el esquema de expansión ya estaba aplicado manualmente en SQL Editor por una acción externa a esta ejecución. Por ello no se volvió a ejecutar DDL ni `apply_migration`: repetir el archivo no sería idempotente (crea tablas/columnas y policies sin `IF NOT EXISTS`). El esquema remoto está presente, pero `supabase_migrations.schema_migrations` sigue registrando solo `20261028235518 / disable_unverified_transfer`; no se modificó manualmente el historial.

**Comandos/consultas ejecutados ahora:**

- `Get-Content -Raw supabase/tests/model_expansion_readonly_checks.sql` se usó inicialmente para preparar el SQL. PowerShell decodificó mal caracteres UTF-8 y el smoke devolvió `EXISTING_PRODUCT_CHANGED_OR_MISSING: id 1`; la ejecución era de solo lectura y no dejó cambios.
- `Get-Content -Raw -Encoding utf8 supabase/tests/model_expansion_readonly_checks.sql` y ejecución del texto obtenido mediante MCP `supabase.execute_sql`: completó el bloque `DO` sin error, resultado `[]`.
- Consulta de comparación de solo lectura mediante CTE `expected` con la captura previa (todos los campos, incluido stock), `FULL JOIN public.products USING(id)` y conteo de discrepancias: `product_count=8`, `mismatch_count=0`, `mismatches=[]`.
- Consulta de conteos/integridad: `categories=4`, `products=8`, `product_images=8`, `combo_components=0`, `order_item_components=0`, `order_status_history=1`, `payments=1`, `orders=1`, `order_items=1`, `transfer_receipts=0`, `orphan_payments=0`, `orders_without_payment=0`, `primary_images=8`.
- Consultas de ACL efectiva: `anon` no tiene SELECT/INSERT/UPDATE/DELETE/TRUNCATE en `profiles`, `favorites`, `orders`, `order_items`, `transfer_receipts` ni `payments`; solo SELECT en `products`. `authenticated` no tiene escritura directa en `orders`, `order_items` o `payments`; conserva grants de propietario para `profiles`/`favorites`, lectura de pedidos/líneas/pagos y el acceso admin de catálogo bajo RLS.
- Verificación de Storage: `transfer-receipts` permanece `public=false`, 5 MiB, MIME JPEG/PNG/PDF. Historial remoto: solo la migración anterior. Proyecto/url continúan siendo `nrvqfuzragjsxuvqljpb` / `https://nrvqfuzragjsxuvqljpb.supabase.co`.

El smoke confirma la estructura/RLS, los datos de producto esperados (salvo que permite stock variable no negativo), las imágenes principales, las relaciones, el ledger, la firma/grants de `create_order`, idempotency index y `TRANSFER_UNAVAILABLE`. La comparación exacta de todos los campos —incluido stock— contra la captura previa encontró cero diferencias.

**Pruebas funcionales pendientes:** no se invocaron `create_order` ni `cancel_order`, no se alteró stock y no se intentó aislamiento entre usuarios con escrituras. La consulta de branches devuelve solo el branch `main` con `status=MIGRATIONS_FAILED`; no hay staging/branch utilizable confirmado. No se ejecutaron pruebas con dos usuarios ni pedidos reales de prueba. Security Advisor actual devuelve warnings existentes sobre `handle_new_user`/`mark_receipt_received` ejecutables por anon y funciones SECURITY DEFINER ejecutables por usuarios autenticados, además de leaked password protection deshabilitada; no se cambiaron esas configuraciones porque no pertenecen a esta expansión.

**Estado final:** la expansión está desplegada en el esquema remoto según introspección, pero su aplicación manual no tiene entrada propia en historial y no se puede certificar identidad exacta byte por byte con el archivo local. El SQL local incorpora la corrección de grants de mínimo privilegio y los checks correspondientes, pero no se reejecutó en remoto. El backup no se verificó en esta sesión. No se cargaron los 32 productos, transferencia sigue bloqueada, no se hicieron escrituras de prueba y no hubo push/publicación a GitHub.

## Carga de 32 productos propuestos en Supabase — 30 de octubre de 2026

A petición expresa del usuario se cargaron los IDs 9–40 en el proyecto de producción `nrvqfuzragjsxuvqljpb`. La migración local reproducible es `supabase/migrations/20261030011306_load_proposed_catalog_items.sql`; el contenido se leyó en UTF-8 y se aplicó mediante MCP `supabase.apply_migration({name:"load_proposed_catalog_items", query:<contenido del archivo>})`, resultado `success=true`. Supabase registró la versión `20261030011306 / load_proposed_catalog_items`; el nombre de archivo local se ajustó a esa versión para que coincida con el historial. Hash SHA-256 del archivo local: `A6818E9BE7B4BBE80F73888CF95093905950573713E482B65017F16C9F565DFE`.

La migración corre en una transacción con guardas: exige que los ocho productos originales sigan siendo los únicos antes de cargar, que las cuatro categorías aprobadas existan y que los IDs 9–40 estén libres. Inserta los 32 productos con los precios referenciales del documento, el mapeo a categorías aprobadas y los ocho combos con 20 componentes en total. No cambia productos 1–8 ni crea archivos de imagen.

**Disponibilidad y activos:** los 32 productos nuevos se insertaron con `available=false`, por lo que no se ofrecen ni se pueden comprar desde el catálogo público mientras continúe la validación comercial de los precios referenciales, recetas, proveedores e inventario. Los individuales/merchandising quedaron con stock 0; el stock de combos es derivado automáticamente de los componentes por los triggers de inventario, y sus filas también siguen `available=false`. La propuesta no contenía imágenes para esos 32; `image_path` usa provisionalmente el logo existente `img/logo-panela-san-marcos.png` y no se añadieron imágenes a `product_images`. Reemplazar esas rutas y decidir disponibilidad/stock real son pasos comerciales antes de activar productos.

**Resultados reales postcarga (consultas MCP de solo lectura):**

- Conteo total `products=40`; filas propuestas `id 9–40 = 32`.
- Distribución: `panela=10` (8 nuevos), `sabores-bebidas=10` (7), `derivados=10` (7), `merchandising=10` (10).
- Los 32 nuevos siguen `available=false`; cero stock no derivado en individuales/merchandising.
- Ocho combos: IDs 13, 14, 15, 16, 23, 28, 29 y 30; composiciones con 2–3 líneas cada una, 20 componentes totales; todos no disponibles.
- Comparación con snapshot previo de los productos originales: `product_count=40`, `proposed_count=32`, `original_mismatch_count=0` (comparó ID, nombre, descripción, precio, categoría legacy, presentación, imagen, stock y disponibilidad).
- `supabase/tests/model_expansion_readonly_checks.sql`, ejecutado con lectura explícita `-Encoding utf8`: bloque `DO` completó sin error y devolvió `[]`.
- El ledger existente continúa consistente: 1 pedido, 1 pago asociado, 0 pagos huérfanos; 8 imágenes principales originales. Storage `transfer-receipts` permanece privado con el límite y MIME previos. La definición de `create_order` conserva `TRANSFER_UNAVAILABLE`.
- La migración y sus postcondiciones no crean pedidos ni modifican pagos de órdenes existentes. No se ejecutaron pruebas de pedido/cancelación ni aislamiento entre dos usuarios sobre producción.

**Pruebas pendientes:** el único branch existente sigue en `MIGRATIONS_FAILED`. El usuario indicó que no quiere crear otro branch y que trabajemos directamente sobre Supabase; por seguridad no ejecuté pruebas de escritura de pedidos, cancelación, stock/idempotencia o dos usuarios en producción. Esas pruebas quedan pendientes hasta que exista un entorno de prueba utilizable. El smoke SQL y las consultas de integridad sí se completaron en el proyecto conectado.

**Backup e historial:** el backup recuperable no se verificó antes de esta carga. La operación fue la migración de datos solicitada, transaccional y con guardas; el resultado final y las comparaciones quedaron verificados. La expansión del modelo anterior sigue sin entrada propia de historial porque se ejecutó manualmente antes de esta sesión; esta carga sí quedó registrada. No se reaplicó ni alteró el historial de migraciones anterior.

**Cierre:** proyecto conectado y destino confirmados; 32 propuestas cargadas en estado no vendible, sin cambios a los productos originales, transferencia deshabilitada y sin push/publicación a GitHub. Los 32 productos están modelados en Supabase, pero la publicación comercial requiere sustituir imágenes provisionales y confirmar precios, disponibilidad e inventario.

## Corrección de permisos y rendimiento — 30 de octubre de 2026

Se aplicó a `nrvqfuzragjsxuvqljpb` la migración registrada `20261030015540 / harden_trigger_function_acl_and_index_foreign_keys`, correspondiente a `supabase/migrations/20261030015540_harden_trigger_function_acl_and_index_foreign_keys.sql`. Revoca ejecución directa por `PUBLIC`, `anon` y `authenticated` en las funciones invocadas solo por triggers (`handle_new_user`, `mark_receipt_received`) y crea seis índices para claves foráneas de favoritos, componentes de combos, líneas de pedido, historial de estados y comprobantes. No cambia filas de negocio ni habilita pagos.

**Comprobación remota posterior:** el historial incluye la migración; ambas funciones siguen ligadas a triggers y `has_function_privilege` devuelve `false` tanto para `anon` como para `authenticated`. El catálogo tiene 40 productos, 8 disponibles y los 32 productos propuestos continúan no disponibles con `image_path='PENDIENTE'`. Las cuatro categorías tienen 10 productos cada una. El proyecto conserva 1 pedido. El método de pago por transferencia sigue rechazado por `create_order` con `TRANSFER_UNAVAILABLE`.

**Asesores Supabase posteriores:** ya no aparecen alertas por funciones internas ejecutables por `anon`, ni por claves foráneas sin índice. Se mantienen los avisos de SECURITY DEFINER sobre `create_order`, `cancel_order` y `review_transfer_receipt`; la revisión de sus cuerpos confirma validación de sesión, comprobación de propiedad/estado para cancelar y rol `admin` para revisar comprobantes. Se mantienen también 16 avisos de optimización de expresiones RLS, cuatro de políticas permisivas superpuestas para lectura pública/autenticada y avisos informativos de índices aún no usados. Auth informa que la protección contra contraseñas filtradas está deshabilitada; es un ajuste del dashboard que necesita decisión del propietario.

**Prueba web en navegador integrado:** en la página temporal de catálogo, servida desde `127.0.0.1:8765`, se usó una copia local de `supabase-js` porque el navegador de pruebas no cargó jsDelivr. La consulta pública conectó a Supabase y el DOM mostró 8 productos con nombre, presentación y precio, concordantes con las filas disponibles. Las tarjetas y navegación inicial se renderizaron. La página local original con el CDN sin sustituir no cargó el catálogo en ese entorno de navegador.

**Comprobaciones locales:** `python tests/check_site.py` pasó (12 páginas, rutas, fragmentos e IDs); `node --check` pasó para `js/store.js`, `js/confirmacion.js`, `js/perfil.js`, `js/catalogo.js` y `js/checkout.js`. No se creó pedido, no se alteró el carrito ni se hizo escritura funcional sobre datos de cliente. La sesión de inicio está abierta en navegador para que el usuario escriba sus credenciales. La confirmación final de un pedido de pago contra entrega queda detenida para que el usuario revise importe/dirección y confirme la acción en pantalla.
