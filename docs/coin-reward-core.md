# Núcleo de monedas y recompensas

## Alcance y separación

Este módulo es preparatorio y no está conectado a `page.tsx`, componentes, hooks ni al flujo operativo de acciones. Su única fuente de verdad es `CoinClassState`, una por clase. No lee ni escribe cristales, progresión, guardianes, mascotas, cofres, currículo, evidencias, criterios, notas o asistencia.

El modelo legacy `app/types/student.ts` ya contiene un campo `monedas`, pero no forma parte de este núcleo y no se migra, sincroniza ni considera saldo. Los cristales siguen siendo progresión no canjeable y mantienen todas sus reglas actuales.

El historial legacy conserva `actionId`, que sirve como precedente para una referencia causal estable, pero sus movimientos no guardan la identidad durable del comando que aplicó la acción. Por eso no se usa como segunda fuente de verdad, no se reconstruye y no se importa retrospectivamente.

## Estado, activación e invariantes

`CoinClassState` contiene versión de esquema, `classroomId`, activación, saldos, catálogo, canjes, deshacer de canjes, movimientos, diario compacto, revisión y checksum. Cada resultado terminal aceptado —aplicado o rechazado por dominio— añade exactamente una entrada al diario e incrementa la revisión una vez; un retry idéntico no cambia el estado y devuelve el resultado original en el recibo.

Una clase nueva nace desactivada, sin saldos y sin concesión inicial. La primera activación crea a cero únicamente los alumnos indicados. No recibe cristales ni acciones históricas como entrada. Un alumno posterior se registra explícitamente a cero, incluso si la clase está desactivada. Desactivar conserva íntegros la fecha de primera activación, saldos, catálogo, canjes, compensaciones, movimientos e idempotencia. Reactivar continúa ese mismo estado.

Todo saldo se reconstruye desde cero recorriendo los movimientos de ese alumno. La validación exige continuidad entre `balanceBefore` y `balanceAfter`, igualdad `balanceAfter = balanceBefore + appliedAmount`, dirección y clamp compatibles con la causa, revisiones globalmente crecientes y coincidencia final con el saldo almacenado. Rechaza `-0`, decimales, valores inseguros, `NaN` e infinitos antes de persistir. No hay concesiones implícitas.

La validación también exige enlaces bidireccionales: todo canje conserva su recompensa y su movimiento exacto; todo deshacer conserva canje, débito original y compensación; toda referencia del diario resuelve al tipo e identidad adecuados. Los objetos deben ser JSON plano, sin propiedades extra, accessors, prototipos personalizados, arrays dispersos, claves `__proto__`/`constructor`/`prototype`, más de 24 niveles ni colecciones por encima de sus límites. El preflight ocurre antes de checksum y serialización profunda, y cualquier entrada hostil se convierte en un resultado discriminado, no en una excepción.

El límite superior reserva capacidad para todos los canjes aún reversibles: las operaciones positivas se rechazan si `saldo + devoluciones pendientes + incremento` superaría `maxBalance`. Así un deshacer válido siempre puede compensar exactamente el precio original sin violar el límite. Las pérdidas se limitan a cero.

## Acciones

Los contratos admiten:

- `same-as-crystals`: usa la cantidad firmada de la acción; es el valor predeterminado.
- `custom`: exige una magnitud estrictamente positiva y deriva el signo de `crystalAmount`.
- `no-coins`: no crea movimiento.

Una configuración ausente se interpreta como legacy `same-as-crystals` solo cuando se evalúa el comando; la acción original no se reescribe. El movimiento conserva si se usó ese valor legacy. Una magnitud negativa, cero, no entera, insegura o excesiva se rechaza. Una acción de cristales cero no puede usar cantidad personalizada. Una pérdida guarda cantidad solicitada y aplicada, por ejemplo `-3` y `-1` con saldo inicial uno.

Con monedas desactivadas, una acción que el núcleo **recibe explícitamente como comando** se registra como aplicada sin movimiento ni saldo. Esto es deliberado: un retry después de reactivar sigue siendo idempotente y nunca convierte el intento anterior en una concesión retroactiva. Este módulo todavía no está conectado al flujo operativo, por lo que una lectura o una acción de la aplicación no genera hoy esa entrada. La futura integración deberá decidir si despacha esos comandos y deberá persistir sus recibos; no puede inferirlos de una lectura.

Ese diario no crece sin control: comparte los límites de operaciones y tamaño. Al agotarlos se devuelve un error explícito; no se elimina ni compacta silenciosamente. Con monedas activadas, el alumno debe existir en el estado monetario.

Un movimiento de acción referencia `actionId` y el `operationId` que también lo identifica; no copia título ni texto visible. Esa referencia puede relacionarse en el futuro con el mismo comando causal utilizado por otros subsistemas.

## Recompensas, canjes y ajustes

Los IDs de recompensa los proporciona el llamador. Crear añade al final del orden docente; reordenar exige la lista completa y exacta, incluidos archivados. Editar, archivar, restaurar y reordenar actualizan de forma coherente revisión y operación de la recompensa. No existe eliminación física.

Un canje exige monedas activadas, alumno existente, recompensa activa y saldo suficiente. Descuenta exactamente el precio vigente y guarda un snapshot mínimo e inmutable de nombre y precio. Editar, archivar, restaurar o reordenar después la recompensa no altera el canje histórico. El canje referencia su movimiento de débito y la recompensa nunca se elimina físicamente.

Deshacer exige también monedas activadas. Crea un registro diferente y un movimiento compensatorio positivo. El canje y movimiento originales no se modifican ni se eliminan. La compensación referencia canje, movimiento original y operación de deshacer, y devuelve exactamente el precio histórico, no el precio actual. El mismo retry es idempotente; otra operación que intente deshacer el mismo canje se rechaza.

Los ajustes administrativos requieren monedas activadas, alumno, cantidad firmada no nula, motivo normalizado no vacío, `operationId` y fecha del llamador. Se distinguen mediante causa `administrative-adjustment`; no se presentan como concesión inicial ni como acción o canje.

## Idempotencia y fingerprints

Los fingerprints usan serialización canónica con claves ordenadas mediante comparación ordinal (`<`/`>`), conservan el orden de arrays y aplican un hash doble FNV-1a versionado. No se usa ordenación dependiente del idioma. El diario solo guarda `operationId`, tipo, fingerprint, revisión resultante, resultado terminal (`applied`/`rejected`), código de fallo cuando procede y, cuando existe, un ID de resultado corto. No copia comandos, catálogos, snapshots ni textos extensos.

Los campos materiales son:

| Operación | Campos del fingerprint, además del tipo |
| --- | --- |
| Activar/desactivar | `classroomId`, `enabled`, conjunto de `studentIds` ordenado ordinalmente |
| Registrar alumno | `classroomId`, `studentId` |
| Acción | `classroomId`, `studentId`, `actionId`, `crystalAmount`, configuración explícita; la ausencia legacy se distingue |
| Crear/editar recompensa | `classroomId`, `rewardId`, nombre y descripción normalizados, precio |
| Reordenar | `classroomId`, secuencia completa de IDs |
| Archivar/restaurar | `classroomId`, `rewardId` |
| Canjear | `classroomId`, `redemptionId`, `studentId`, `rewardId`, motivo normalizado |
| Deshacer | `classroomId`, `reversalId`, `redemptionId`, motivo normalizado |
| Ajuste | `classroomId`, `studentId`, cantidad solicitada, motivo normalizado |

`occurredAt` se valida como instante ISO canónico, pero queda fuera del fingerprint por ser informativo. El primer valor persistido se conserva en un retry. Cambiar cualquier campo material con el mismo `operationId` produce `operation-conflict`. El precio de un canje no es entrada del comando: se toma del estado vigente en la primera aplicación y queda fijado en el snapshot; el retry se resuelve desde el diario incluso después de editar el precio o de aplicar otros movimientos.

### Política de rechazos

Después de validar estado, clase, `operationId`, forma del comando y fingerprint, un rechazo por reglas de dominio es terminal: saldo insuficiente, recompensa archivada, monedas desactivadas, entidad ausente, duplicado o límite alcanzado se registra con su código. El resultado lleva `status: rejected`, `recorded: true`, el estado con una revisión nueva y un recibo. El llamador debe persistir ese estado igual que uno aplicado. Un retry idéntico, incluso restaurado desde JSON o después de cambiar el resto del estado, devuelve `status: idempotent`, `outcome: rejected` y el `failureCode` original; nunca ejecuta tardíamente la operación.

Las entradas que no llegaron a una decisión de dominio —estado inválido, clase u operación inválidas, forma/fecha/cantidad inválida, fingerprint no serializable o reutilización divergente— no contaminan el diario (`recorded: false`). Se pueden corregir y volver a enviar deliberadamente con el mismo ID. Si ni siquiera cabe la entrada compacta de rechazo por límite de diario o tamaño, el rechazo queda sin registrar y el mensaje lo declara; solo un cambio deliberado de capacidad permite reintentar. Esta excepción evita prometer durabilidad cuando no puede persistirse.

Los recibos aplicados conservan la referencia mínima necesaria: alumno registrado, movimiento, recompensa, canje o deshacer. Activación, reordenación y acciones sin efecto no necesitan entidad. Los recibos rechazados conservan solo el código. El validador comprueba que ninguna referencia apunte a una entidad ausente o de otra operación.

## Persistencia, integridad y concurrencia

La persistencia usa una única clave por clase: `cristalclass_coins_v1:${encodeURIComponent(classroomId)}`. Los IDs aceptan un subconjunto ASCII estable, tienen longitud limitada y rechazan vacío, `.`/`..`, espacios, controles, separadores de ruta y los nombres peligrosos `__proto__`, `constructor` y `prototype`. El adaptador de navegador devuelve `null` en SSR.

Las lecturas nunca escriben. No crean estado, migran, reparan, promocionan ni eliminan valores. JSON corrupto, versión incompatible, clase ajena, estructura inconsistente, tamaño excesivo o checksum incorrecto producen resultados discriminados.

Cada estado lleva checksum versionado sobre todo su contenido salvo el propio campo de integridad. El checksum detecta corrupción accidental y modificaciones que no lo actualicen; como no existe un secreto ni estado autoritativo externo, no autentica frente a un actor que pueda modificar contenido y recalcularlo. Aun recalculándolo, se detectan saldos, cadenas, cantidades, causalidad, canjes, compensaciones, revisiones y referencias internamente incoherentes. Una reescritura semántica completa y autoconsistente —por ejemplo cambiar solo el nombre histórico y recalcular el checksum— queda fuera de alcance. Impedirla requiere autenticación o una fuente de verdad protegida, no otro checksum local.

Toda escritura requiere un lock exclusivo inyectado, vuelve a leer dentro del lock, compara `expectedRevision`, avanza exactamente una revisión, escribe la única clave y la relee para verificar revisión y checksum. El lock debe coordinar **todos** los escritores de esa clase y almacenamiento, incluidos otros contextos. El adaptador Web Locks usa el nombre origin-scoped `cristalclass-coins-lock-v1:${encodeURIComponent(classroomId)}` y coordina pestañas cooperativas del mismo origen que usen ese contrato. Dos instancias que comparten ese lock quedan serializadas y la obsoleta recibe `revision-conflict`; clases distintas pueden avanzar en paralelo.

Dos locks en memoria distintos no se coordinan. El adaptador `Storage` no ofrece compare-and-swap atómico, por lo que con escritores que usan locks distintos existe una carrera real entre lectura y `setItem` y puede perderse una actualización. La relectura detecta una sobrescritura visible antes de verificar (`verification-failed`), pero no convierte el protocolo en CAS ni detecta necesariamente una sobrescritura posterior. No se promete exclusión entre pestañas salvo que la integración inyecte el Web Lock compartido, ni atomicidad con otras claves o fuentes de verdad.

Antes de `setItem`, un fallo informa `storageOutcome: not-written`. Si `setItem` lanza o la verificación posterior falla, informa `storageOutcome: unknown`: un adaptador puede haber escrito y luego lanzado, y no existe rollback fiable. El llamador debe releer antes de decidir un retry. Nunca se recupera, migra, promociona, borra o restaura silenciosamente el valor anterior.

## Límites y presupuesto medido

Los límites predeterminados son configurables y validados:

| Límite | Valor |
| --- | ---: |
| Alumnos | 120 |
| Recompensas | 250 |
| Movimientos | 12.000 |
| Canjes | 3.000 |
| Deshacer canjes | 3.000 |
| Operaciones idempotentes | 20.000 |
| ID | 128 code units |
| Nombre de recompensa | 120 code units |
| Descripción | 1.000 code units |
| Motivo | 500 code units |
| Cantidad por operación | 100.000 |
| Saldo | 1.000.000.000 |
| Estado persistido | 1.000.000 code units y 1.500.000 bytes UTF-8 |
| Pico JSON-equivalente de transición | 4.000.000 code units y 6.000.000 bytes UTF-8 |

Mediciones deterministas del runner:

| Escenario | Code units | Bytes UTF-8 |
| --- | ---: | ---: |
| Estado pequeño desactivado | 368 | 368 |
| Clase de 26 alumnos y 6 recompensas | 4.433 | 4.439 |
| Curso completo simulado | 642.557 | 642.615 |
| Curso intensivo (límite configurable) | 2.452.804 | 2.452.914 |
| Estado cercano al límite, 1.500 movimientos | 882.781 | 882.781 |
| Diario del curso, 1.073 operaciones | 206.637 | 206.637 |
| Muestra con nombre y descripción Unicode | 1.071 | 1.078 |

El curso simula 36 semanas, una acción positiva por alumno y semana, un ajuste explícito por alumno, cuatro canjes por alumno y seis recompensas: 26 alumnos, 1.066 movimientos, 104 canjes y 1.073 operaciones totales. El pico para leer la clase realista, producir el curso y serializarlo es 1.293.980 code units y 1.294.108 bytes UTF-8 equivalentes. El curso intensivo simula cuatro acciones semanales por alumno, dos ajustes y ocho canjes por alumno: 4.004 movimientos y 4.011 operaciones. Con 2,45 MB JSON no cabe en el valor predeterminado y se rechaza de forma predecible con `size-limit-exceeded`, antes de llegar a 12.000 movimientos o 20.000 operaciones. Por tanto, esos máximos numéricos son techos de seguridad configurables, no capacidad prometida en navegador.

La fórmula conservadora y comprobable del pico es `2 * estado actual + 2 * estado siguiente`: cadena leída y representación JSON-equivalente actual, más representación siguiente y cadena serializada. Es una aproximación determinista, no una medición del heap real. El tope de transición es exactamente cuatro veces el máximo persistido para cada métrica.

El antiguo máximo de 4 millones de code units permitía que una sola clase consumiera una fracción insegura de la cuota compartida del origen. El plan conservador reserva 1.000.000 para monedas, 1.250.000 para el presupuesto ya existente de currículo y 1.000.000 para clases, alumnado, asistencia, acciones, cristales, cofres y demás claves: 3.250.000 code units planeadas, dejando margen adicional. Es una asignación de ingeniería, no garantía del navegador. `localStorage` comparte cuota por origen, sus operaciones son síncronas y los límites/contabilidad exactos dependen del motor; además se mide UTF-8 por separado para no equiparar caracteres y bytes. Un adaptador puede imponer menos y otros entornos pueden elevar límites explícitamente. Al alcanzar cualquier límite se rechaza la operación: nunca se compacta ni elimina historial automáticamente.

## Runner determinista

`npm test` delega en `npm run check:deterministic`; `npm run typecheck` ejecuta `tsc --noEmit`. El runner usa el paquete `typescript` ya declarado en el repositorio y rutas construidas con `node:path`, por lo que no depende de una instalación global y funciona en Windows. La lista es un manifiesto explícito y ordenado de las 16 suites anteriores más las dos suites de monedas; no descubre ni ejecuta archivos por patrón. Después añade el grupo de aislamiento del repositorio: 19 grupos en total.

Una suite ausente, export incorrecto, excepción, array vacío, check sin nombre/booleano o nombre duplicado termina con código distinto de cero. Solo los `passed === true` cuentan. Los 463 checks originales se ejecutaron antes de las correcciones; la auditoría añade 48 pruebas adversariales y el total actual es 511/511.

## Atomicidad con cristales y evolución futura

Cristales y monedas permanecen en fuentes de verdad distintas. Una futura integración de una misma acción deberá usar el mismo `operationId`, aplicar ambos subsistemas idempotentemente, detectar resultados parciales y ofrecer reconciliación explícita. Este módulo no simula una transacción entre ellos.

La causa de movimiento es una unión discriminada y puede ampliarse con un bonus futuro sin disfrazarlo de ajuste administrativo. Los movimientos actuales identifican explícitamente las acciones positivas, lo que permitirá decidir qué obtención alimenta destellos. No se implementan bonus, multiplicadores, medidores, guardianes, mascotas, progresión, fusión, límites semanales, interfaz ni conexión con acciones reales.
