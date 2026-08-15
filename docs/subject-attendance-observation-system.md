# Sistema de asignaturas, asistencia y sesiones de observación

## Estado y alcance

Este documento define el próximo sistema de asignaturas, acciones contextualizadas, asistencia y observación actitudinal de CristalClass. Es una especificación funcional y técnica previa a la implementación.

No forma parte de este alcance evaluar contenidos, exámenes ni el dominio completo de criterios de evaluación. Tampoco se modifican las reglas actuales de cristales, progresión, cofres, recompensas, guardianes, equipamiento o colección.

Las decisiones marcadas como **cerradas** deben conservarse durante la implementación. Las cuestiones marcadas como **pendientes** necesitan una decisión explícita antes de cerrar la fase correspondiente.

## 1. Encaje con la arquitectura actual

### 1.1 Estado operativo real

La aplicación actual es un cliente Next.js sin backend operativo ni capa de repositorios conectada. El estado funcional se distribuye así:

| Área | Modelo o servicio actual | Persistencia actual |
| --- | --- | --- |
| Alumnos, cristales, máximo histórico, cofres, inventario y equipamiento | `app/types/student.ts`, `useStudents`, `studentService`, `storageService` | `localStorage`: `cristalclass_students` |
| Acciones configurables | `app/types/action.ts`, servicios `actionCatalog*`, `ActionEditor` | `localStorage`: `cristalclass_actions` |
| Historial de acciones aplicadas | `app/types/movement.ts`, `useMovements`, `movementService` | `localStorage`: `cristalclass_movements` |
| Preferencia de sonido | `useSoundPreference`, `soundPreferenceService` | `localStorage`: `cristalclass_sound_enabled` |
| Tamaño de guardianes por clase | `useClassroomGuardianScale`, `classroomAppearancePreferenceService` | `localStorage`, clave derivada de la clase |

El tipo operativo `app/types/student.ts` incluye `claseId`, pero los datos iniciales lo dejan vacío y la cabecera muestra de forma fija `4º Primaria A`. La función de la pantalla principal utiliza un identificador de respaldo cuando no encuentra una clase real.

El modelo de acciones actual contiene identificador estable, nombre, puntos con signo, icono, estado archivado y posición rápida. El tipo positivo o negativo se deriva del signo de `points`; el editor presenta tipo y magnitud por separado, pero guarda un único valor firmado. No existen campos de asignatura, criterio o seguimiento por ausencia de incidencias.

Cada aplicación manual de una acción:

1. crea un `ApplyStudentActionCommand`;
2. usa temporalmente `createLegacyApplyStudentAction`;
3. modifica los cristales y el progreso de cofres;
4. registra un `Movement` con `actionId`, título, cambio solicitado, cambio aplicado, fecha y tipo;
5. devuelve eventos descriptivos: `teacher-action-applied`, `economy-crystals-changed`, posibles `student-chest-obtained` y `student-movement-recorded`.

El comando ya contiene `teacherId`, destino, fecha, clave de idempotencia y metadatos. En la implementación actual, el docente es el marcador `legacy-local-teacher` y `classroomId` procede del alumno seleccionado.

### 1.2 Arquitectura futura ya esbozada

`domain/` y `application/` contienen contratos futuros que todavía no sustituyen al estado operativo:

- `domain/classroom/Classroom.ts` define clase, docentes y alumnado por identificadores.
- `domain/student/Student.ts` define un agregado canónico futuro y declara expresamente que aún no sustituye a `app/types/student.ts`.
- `TeacherCommand`, `DomainEvent`, `Transaction`, `DomainEventBus` y `ModuleRegistry` ofrecen límites adecuados para comandos idempotentes, eventos correlacionados y escrituras atómicas.
- `ApplyStudentAction` es el único punto de escritura previsto para acciones docentes, pero actualmente delega en un puente local.

Este sistema debe extender esos límites, no crear un segundo flujo paralelo de acciones.

### 1.3 Ausencias reales en el proyecto

No se han encontrado estructuras operativas de:

- catálogo de asignaturas;
- asignatura activa;
- asistencia diaria o intervalos de presencia;
- sesiones de observación;
- horario semanal;
- criterios actitudinales;
- evidencias separadas de los movimientos de cristales;
- repositorios de servidor, autenticación docente o transacciones persistentes reales.

Los archivos `.js` y `.ts` duplicados en parte de `domain/` son un residuo técnico que deberá vigilarse para evitar resoluciones ambiguas, pero su limpieza no forma parte de este sistema.

## 2. Finalidad y separación de responsabilidades

### Decisiones cerradas

- CristalClass registra comportamientos y actitudes observables.
- CristalClass no evalúa contenidos, pruebas, exámenes ni la adquisición completa de criterios.
- Los cristales pertenecen al sistema de motivación.
- Las evidencias actitudinales pertenecen al sistema de observación.
- Una misma acción docente puede originar ambos resultados, pero deben persistirse y consultarse por separado.
- La asistencia no es una acción, no altera cristales y no se vincula a criterios.
- El cumplimiento ordinario no concede cristales, no genera cofres y no se presenta como una acción positiva manual.

### Consecuencia técnica

El comando de aplicar una acción puede conservar una única intención del docente y una única correlación, pero sus efectos deben dividirse en módulos o eventos diferentes:

- efecto económico: cambio de cristales y progresión existente;
- registro histórico compatible: movimiento actual;
- evidencia actitudinal: observación contextualizada por asignatura, sesión y criterio opcional.

Una avería o reintento no puede confirmar uno de esos efectos y duplicar u omitir otro. En producción, la escritura requiere una transacción de servidor y una clave de idempotencia efectiva.

## 3. Asignaturas y contexto activo

### 3.1 Catálogo inicial

La navegación lateral incluirá:

- General;
- Lengua;
- Matemáticas;
- Conocimiento del Medio;
- Inglés;
- Música;
- Educación Artística;
- Asistencia, como pestaña fija separada;
- futuras asignaturas añadidas al catálogo.

Cada asignatura tendrá identificador estable, nombre e icono. La identificación nunca dependerá únicamente del color.

### 3.2 Presentación

La asignatura activa debe mostrarse siempre mediante nombre e icono. El contexto puede aplicar color de acento, degradado ambiental y motivos tenues, con una transición de 250 a 350 ms.

No cambiarán los significados visuales de cristales, cofres, guardianes ni controles positivos o negativos. La ambientación es contextual y ligera; no redefine el lenguaje visual global.

### 3.3 Comportamiento

- Seleccionar una asignatura académica inicia una sesión de observación.
- Cambiar a otra asignatura cierra la sesión anterior, calcula sus resultados, abre la nueva y ofrece temporalmente **Deshacer**.
- Abrir Asistencia no inicia una sesión académica.
- La cabecera muestra de forma discreta `Asignatura · sesión en curso · alumnado presente`.

**Pendiente:** decidir si entrar en Asistencia mantiene la sesión académica en curso, la pausa visualmente o solicita cerrarla. El requisito solo establece que Asistencia no inicia una sesión nueva.

## 4. Acciones por asignatura

### 4.1 Alcance de una acción

Cada acción tendrá exactamente uno de estos contextos:

1. `general`: acción general;
2. `subject`: acción de una asignatura concreta;
3. `all-subjects`: excepcionalmente disponible en todas las asignaturas.

Cuando Música esté activa, el modal mostrará acciones de Música, acciones generales que se decida incluir en ese contexto y acciones globales. Una acción exclusiva de Música, como `Toca la flauta sin permiso`, no aparecerá en Lengua.

**Pendiente:** confirmar si las acciones `general` deben aparecer dentro de todas las asignaturas académicas o solo cuando la pestaña General esté activa. No debe confundirse `general` con `all-subjects`.

### 4.2 Editor

El editor conservará sus campos actuales y añadirá:

- nombre;
- icono;
- valor en cristales;
- tipo positivo o negativo;
- asignatura o contexto;
- disponibilidad global, cuando proceda;
- relación curricular actitudinal opcional;
- seguimiento por ausencia de incidencias, solo cuando proceda.

El identificador de una acción seguirá siendo estable. Editar, archivar o migrar una acción no romperá movimientos históricos.

El modelo debe imponer estas invariantes:

- los puntos son un entero distinto de cero entre -99 y 99, mientras esa regla actual siga vigente;
- una acción archivada no se ofrece en consultas operativas;
- las posiciones rápidas continúan siendo únicas;
- `trackOrdinaryCompliance` solo puede activarse en acciones negativas elegibles;
- una acción de asignatura solo puede vincular criterios de esa misma asignatura y curso;
- la interfaz inicial permite seleccionar como máximo un criterio principal.

**Pendiente:** decidir si el tipo se almacena explícitamente o continúa derivándose del signo de los puntos. No deben existir dos fuentes de verdad que puedan contradecirse.

### 4.3 Compatibilidad

Toda acción almacenada sin contexto se hidratará como `general`. La migración será aditiva: no cambiará identificadores, puntos, iconos, archivo ni posición rápida. Las acciones existentes seguirán funcionando antes de que el docente las edite.

## 5. Criterios de evaluación actitudinales

### Decisiones cerradas

- El catálogo será cerrado y mantenido por CristalClass.
- Estará filtrado por curso y asignatura.
- Solo contendrá criterios con aspectos actitudinales observables relevantes.
- El docente no verá el currículo completo ni redactará criterios libres en la primera versión.
- La vinculación será opcional.
- Vincular un criterio no cambia los cristales ni calcula una nota.
- Una evidencia no afirma que el criterio esté superado.
- La interfaz inicial permitirá un criterio principal.
- El modelo podrá admitir varios criterios sin exponer todavía una interfaz compleja.

El evento de observación debe guardar una referencia estable al criterio y una instantánea mínima de su código o versión. Así, una actualización futura del catálogo no reescribe el significado histórico de una evidencia.

**Pendientes:** fuente oficial, versionado y proceso editorial del catálogo; cursos iniciales; tratamiento de criterios retirados; texto legal o curricular que deba conservarse como instantánea.

## 6. Cumplimiento ordinario sin registro manual

El seguimiento automático se limita a acciones negativas que expresan el incumplimiento de una norma ordinaria. En el editor se presentará:

> Contabilizar las sesiones sin esta incidencia

con la explicación:

> Si el alumno está presente y no se registra esta conducta durante una sesión válida, CristalClass contará la sesión como cumplimiento ordinario. No concede cristales.

Ejemplo:

- incidencia manual: `Toca la flauta sin permiso`;
- cumplimiento ordinario interno: `Respeta cuándo debe tocar`.

Al cerrar una sesión válida, el sistema calcula para cada acción elegible y alumno participante:

- número de incidencias manuales de esa acción;
- si existió una oportunidad válida de observación;
- resumen de cumplimiento ordinario cuando no hubo incidencia.

El resultado debe agregarse como resumen, no como una avalancha de movimientos positivos visibles. Debe permitir expresiones como `1 incidencia en 20 sesiones observadas`.

No se habilitará para positivos especiales, entre ellos ayuda espontánea, aportación excelente o creatividad.

**Pendientes:** duración o proporción mínima de presencia para considerar una oportunidad real; tratamiento de una llegada en los últimos minutos; si determinadas acciones necesitan una marca explícita del docente indicando que hubo oportunidad de observación.

## 7. Asistencia

### 7.1 Modelo funcional

Cada jornada comienza con todo el alumnado activo presente por defecto. El docente marca únicamente ausencias y puede seleccionar varios alumnos.

Cada alumno mantiene dos conceptos distintos:

- estado actual: `present` o `absent`;
- resultado diario: `present`, `absent` o `late`.

Cuando un alumno ausente llega, la acción **Ha llegado ahora**:

1. registra la hora real;
2. permite corregirla;
3. cierra el intervalo de ausencia;
4. cambia el estado actual a presente;
5. conserva el resultado diario como retraso.

Si no llega, termina el día como ausente. El historial conserva intervalos, no solo un resultado final.

La asistencia no entrega ni retira cristales, no crea cofres, no es un comportamiento y no se relaciona con criterios. Su única relación con observación es determinar cuándo un alumno pudo participar.

### 7.2 Casos necesarios

- ausencia desde el inicio y llegada posterior;
- ausencia durante toda la jornada;
- corrección de una hora de llegada;
- salida durante la jornada, con hora registrada;
- regreso posterior si el producto decide admitir varios intervalos;
- alumno incorporado o desactivado a mitad de curso;
- selección múltiple sin duplicar intervalos;
- cambio de fecha y zona horaria local.

**Pendientes:** flujo exacto para registrar salidas; admisión de varios intervalos de presencia en un mismo día; responsable y trazabilidad de correcciones; momento explícito de cierre de la jornada.

## 8. Sesiones de observación

### 8.1 Inicio, validez y cierre

Una sesión comienza al seleccionar una asignatura académica. General debe tratarse como contexto observable si se utiliza para aplicar acciones generales.

Una sesión es válida cuando cumple al menos una condición:

- dura 10 minutos o más;
- contiene al menos una acción registrada manualmente.

Una selección inferior a 10 minutos y sin acciones se descarta sin generar cumplimiento ordinario.

Al cambiar de asignatura:

1. se fija el final y la última actividad fiable;
2. se determina si la sesión es válida o descartada;
3. se calculan participantes e incidencias elegibles;
4. se guarda el resumen de cumplimiento ordinario;
5. se abre la nueva sesión;
6. se ofrece **Deshacer** durante un periodo breve.

### 8.2 Participación

La participación se calcula por intersección entre el intervalo de la sesión y los intervalos reales de presencia:

- presente desde el inicio: participa desde el comienzo;
- ausente durante toda la sesión: queda excluido;
- llegada tardía: participa desde la llegada;
- salida: deja de participar desde la hora registrada.

No se debe inferir presencia retroactiva a partir del resultado diario final.

### 8.3 Recuperación e interrupciones

La sesión activa y su última actividad fiable se guardan continuamente. Tras un cierre brusco, la aplicación ofrece:

- cerrar en la última actividad;
- continuar;
- descartar.

La opción recomendada será cerrar en la última actividad. Nunca se contará automáticamente todo el tiempo hasta la reapertura.

Tras 90 minutos, la sesión deja de extenderse automáticamente y pregunta si continúa. Sin respuesta, solo se conserva hasta la última actividad fiable.

Después de cerrar una sesión existe una opción temporal para deshacer. Deshacer debe ser idempotente y no duplicar evidencias, sesiones o resúmenes.

**Pendientes:** duración exacta de la ventana de deshacer; definición exhaustiva de `última actividad fiable`; comportamiento ante suspensión del dispositivo, cambio manual del reloj o dos pestañas abiertas; condiciones que convierten una sesión en `pending-review`.

## 9. Horario opcional

El horario semanal es una ayuda y nunca una fuente automática de observaciones.

No selecciona asignaturas, no inicia sesiones, no genera evidencias y no genera cumplimiento ordinario.

Diez minutos después de la hora prevista puede sugerir:

> Según tu horario, ahora corresponde Matemáticas

con las opciones:

- cambiar a Matemáticas;
- mantener la asignatura actual;
- omitir esta sesión.

Si se rechaza, no vuelve a preguntar en ese tramo. El modelo contemplará modificaciones puntuales y días especiales sin sobrescribir el horario semanal. El margen podrá configurarse posteriormente en 5, 10 o 15 minutos.

**Pendientes:** catálogo de tramos, zona horaria, calendario de días no lectivos, prioridad entre excepción y horario semanal y alcance por docente o por clase.

## 10. Flujos principales

### 10.1 Aplicar una acción durante una sesión

1. El docente selecciona una asignatura y existe una sesión activa.
2. Abre `StudentModal` desde la tarjeta del alumno.
3. El modal consulta acciones activas compatibles con el contexto.
4. El docente aplica una acción una sola vez.
5. El comando incluye `classroomId`, `subjectId`, `sessionId`, `teacherId` y clave de idempotencia.
6. El módulo económico aplica el cambio actual de cristales y cofres.
7. El módulo de observación registra evidencia actitudinal si corresponde.
8. El historial conserva instantáneas suficientes aunque la acción se edite después.
9. Ambos resultados comparten correlación, pero no una misma entidad ni una misma consulta.

### 10.2 Pasar lista y registrar una llegada

1. Se abre Asistencia sin iniciar una sesión académica.
2. Todo alumno activo parte como presente.
3. El docente marca ausencias, individualmente o en lote.
4. Una llegada cierra el intervalo de ausencia con hora real editable.
5. Las sesiones posteriores calculan participación desde esa hora.

### 10.3 Cambiar de asignatura

1. Se solicita el cambio.
2. Se cierra atómicamente la sesión anterior.
3. Se descarta si es breve y no contiene acciones; en caso contrario se resume.
4. Se abre la nueva sesión.
5. La interfaz actualiza nombre, icono y ambientación.
6. Se ofrece deshacer sin duplicar resultados.

### 10.4 Recuperar una sesión interrumpida

1. Al arrancar se detecta una sesión `active` sin cierre fiable.
2. Se muestra la última actividad fiable y las tres opciones.
3. Cerrar usa esa marca temporal; continuar reanuda desde el momento actual sin rellenar el hueco; descartar no genera cumplimiento.

### 10.5 Casos límite

- Una selección de asignatura inferior a 10 minutos y sin acciones se descarta sin generar cumplimiento ordinario.
- Una sesión inferior a 10 minutos que sí contiene una acción manual es válida y conserva esa observación.
- Un alumno ausente durante toda la sesión no participa ni suma una oportunidad de cumplimiento ordinario.
- Un alumno que llega tarde solo participa desde la hora de llegada corregida; el intervalo anterior permanece ausente.
- Una salida durante la jornada debe cerrar su intervalo de presencia. El flujo exacto para salidas y múltiples intervalos sigue pendiente.
- Cambiar de asignatura cierra una sesión antes de abrir la siguiente; deshacer no puede duplicar acciones, evidencias ni resúmenes.
- Un cierre brusco nunca rellena como observación el tiempo hasta la reapertura. Se usa la última actividad fiable o se solicita revisión.
- Al alcanzar 90 minutos, la sesión deja de extenderse automáticamente; sin confirmación se conserva solo hasta la última actividad fiable.
- Rechazar una sugerencia del horario impide repetirla durante ese tramo, sin cambiar la asignatura ni crear sesión.
- Una acción heredada sin asignatura se interpreta como `general`; no se le atribuyen retrospectivamente asignatura, sesión o criterio.
- Editar, archivar o eliminar una acción no altera el significado histórico: los registros conservan su instantánea.
- Dos pestañas o dispositivos no deben cerrar o resumir dos veces la misma sesión. La resolución concreta exige versión, idempotencia y persistencia de servidor.

## 11. Modelo de datos propuesto

Los nombres son orientativos y no fijan tecnología de base de datos. Los identificadores deben ser estables y las fechas deben persistirse en UTC, conservando la zona horaria necesaria para jornadas y horarios.

### 11.1 Entidades de referencia

`Subject`

- `id`
- `key`
- `name`
- `iconId`
- `themeToken`
- `active`

`AttitudinalCriterion`

- `id`
- `courseId`
- `subjectId`
- `code`
- `wording`
- `catalogVersion`
- `active`

### 11.2 Acción ampliada

`ActionDefinition`

- campos actuales: `id`, `title`, `points`, icono, archivo y posición rápida;
- `scopeKind`: `general`, `subject` o `all-subjects`;
- `subjectId`, obligatorio solo para `subject`;
- `criterionIds`, colección preparada para varios elementos;
- `trackOrdinaryCompliance`;
- `ordinaryComplianceLabel`, si el producto decide mostrar una formulación legible.

La UI inicial limita `criterionIds` a cero o un elemento.

### 11.3 Asistencia

`AttendanceDay`

- `id`, `classroomId`, `localDate`, `timezone`;
- estado de la jornada;
- versión y marcas de creación/actualización.

`AttendanceEntry`

- `attendanceDayId`, `studentId`;
- `currentStatus`: presente o ausente;
- `dailyResult`: presente, ausente o retraso;
- intervalos de presencia y ausencia;
- historial mínimo de correcciones y autor.

### 11.4 Sesión y participación

`ObservationSession`

- `id`, `classroomId`, `subjectId`, `teacherId`;
- `startedAt`, `endedAt`, `lastReliableActivityAt`;
- `status`: activa, válida, descartada o pendiente de revisión;
- motivo de descarte o revisión;
- versión e identificador de operación de cierre.

`SessionParticipation`

- `sessionId`, `studentId`;
- intervalos efectivos dentro de la sesión;
- duración observada derivada;
- elegibilidad para cumplimiento ordinario según una regla aún pendiente.

### 11.5 Eventos y resúmenes

`ManualActionObservation`

- `id`, `sessionId`, `studentId`, `actionId`;
- `occurredAt`, `teacherId`, `subjectId`;
- instantánea de título y tipo;
- referencias e instantánea curricular opcional;
- `correlationId` compartido con el comando y el movimiento económico.

`OrdinaryComplianceSummary`

- `sessionId`, `studentId`, `actionId`;
- elegibilidad;
- número de incidencias;
- resultado resumido;
- versión de la regla aplicada.

Este resumen no es un `Movement` y no entra en la economía del alumno.

`WeeklySchedule` y `ScheduleException`

- propietario docente o clase, según decisión pendiente;
- zona horaria;
- tramos con día, hora y `subjectId`;
- excepciones fechadas sin mutar la plantilla semanal.

## 12. Servicios y componentes afectados

### Extensiones directas previstas

- `app/types/action.ts`: contexto, criterio y seguimiento automático.
- `app/services/actionCatalogStorageService.ts`: hidratación compatible con `general`.
- `app/services/actionCatalogService.ts` y `actionCatalogConfigurationService.ts`: validaciones y consultas por contexto.
- `app/components/ActionEditor.tsx`: nuevos campos sin romper identificadores ni archivo.
- `app/components/ActionOrbit.tsx`, `AdditionalActionsPanel.tsx` y `StudentModal.tsx`: catálogo filtrado por contexto activo.
- `app/page.tsx`: estado de navegación, cabecera contextual y coordinación de sesión.
- `app/components/Header.tsx`: asignatura, icono, sesión y presentes.
- `application/commands/ApplyStudentActionCommand.ts`: contexto de sesión, preferiblemente en un payload o metadatos tipados.
- `application/use-cases/ApplyStudentAction.ts`: coordinación de módulos económico y de observación.
- `domain/modules/ActionModule.ts`, `Transaction` y `DomainEventBus`: puntos naturales de extensión, todavía sin implementación productiva.

### Nuevas áreas previstas

- catálogo de asignaturas;
- catálogo versionado de criterios actitudinales;
- dominio y repositorio de asistencia;
- dominio y repositorio de sesiones;
- cálculo puro de participación y cumplimiento ordinario;
- navegación lateral de asignaturas y vista de Asistencia;
- recuperación y deshacer de sesiones;
- horario y excepciones.

Los nombres exactos de archivos nuevos se decidirán por fase; esta especificación no impone una estructura ficticia antes de implementar.

## 13. Estrategia de migración compatible

1. Introducir contratos y validadores sin activar UI nueva.
2. Hidratar acciones sin contexto como `general`; conservar todos los demás campos.
3. Mantener movimientos históricos sin `subjectId` ni `sessionId` como registros heredados. No inferirles contexto retroactivamente.
4. Añadir campos opcionales de contexto a nuevos movimientos solo si algún consumidor actual los necesita; la evidencia completa vivirá separada.
5. Mantener el puente `createLegacyApplyStudentAction` hasta disponer de repositorios y transacción reales.
6. Implementar adaptadores de persistencia versionados. La lectura debe aceptar la versión anterior y la escritura no debe destruir datos desconocidos.
7. Migrar a servidor con identificadores estables y operaciones idempotentes; no copiar ciegamente el `teacherId` de legado como identidad real.
8. Conservar intactas las reglas de progresión, máximo histórico, cofres e inventario.
9. No eliminar claves de `localStorage` hasta verificar la migración y disponer de recuperación.

## 14. Persistencia de servidor y preferencias locales

### Debe persistirse en servidor en una versión multiusuario o productiva

- clases, docentes, alumnado e identidad real;
- catálogo de asignaturas habilitadas por clase;
- acciones configuradas y su contexto;
- catálogo/versiones de criterios y vinculaciones;
- asistencia, intervalos y correcciones;
- sesiones activas, cerradas, descartadas y pendientes;
- acciones manuales y evidencias actitudinales;
- resúmenes de cumplimiento ordinario;
- horario semanal y excepciones, si deben acompañar al docente entre dispositivos;
- claves de idempotencia, versiones y auditoría;
- cristales, movimientos, cofres e inventario, aunque su migración a servidor sea otro proyecto.

Estos datos tienen valor educativo, histórico o de coordinación y no pueden depender de un navegador concreto.

### Puede permanecer como preferencia local

- sonido de interfaz;
- tamaño de guardianes por clase mientras no exista perfil sincronizado;
- preferencias puramente visuales y reducción de movimiento;
- última pestaña visual cuando no exista una sesión activa;
- descarte temporal de una sugerencia de horario durante el tramo actual, si no se requiere sincronización entre dispositivos.

La asignatura activa deja de ser una preferencia local en cuanto representa una sesión activa; entonces forma parte del estado persistente y recuperable de sesión.

## 15. Pruebas deterministas necesarias

### Acciones y migración

- una acción heredada sin contexto se convierte en `general` sin cambiar ID, puntos o posición;
- filtros de Música excluyen acciones exclusivas de Lengua y viceversa;
- `all-subjects` aparece en los contextos permitidos;
- archivar y restaurar preservan contexto y asociaciones históricas;
- criterios incompatibles por curso o asignatura se rechazan;
- el seguimiento ordinario se rechaza para positivos y negativos no elegibles;
- una pulsación aceptada genera una única aplicación pese a dobles clics.

### Separación económica y observacional

- una acción correlaciona movimiento económico y evidencia sin fusionarlos;
- la evidencia no altera por sí misma cristales, cofres o progresión;
- cumplimiento ordinario y asistencia nunca solicitan sonido de acción ni cambio económico;
- un reintento idempotente no duplica ningún efecto.

### Asistencia y participación

- presente por defecto;
- ausencia individual y múltiple;
- llegada crea retraso y cierra el intervalo correcto;
- corrección horaria recalcula participación de forma determinista;
- alumno ausente queda excluido;
- salida corta participación en la hora registrada;
- cambios de fecha y zona horaria no desplazan la jornada.

### Sesiones

- 9:59 sin acciones se descarta;
- 10:00 sin acciones es válida;
- una sesión breve con una acción es válida;
- cambiar de asignatura cierra una y abre exactamente una;
- Asistencia no crea sesión académica;
- cierre abrupto nunca suma el hueco hasta la reapertura;
- el límite de 90 minutos congela la extensión automática;
- deshacer restaura el estado anterior sin duplicar resúmenes;
- dos cierres concurrentes producen un único resultado.

### Cumplimiento ordinario

- solo se calcula en sesiones válidas;
- solo para alumnos elegibles y presentes;
- una incidencia impide contar ausencia de esa incidencia en la misma oportunidad;
- no crea movimientos positivos visibles;
- el agregado `1 incidencia en 20 sesiones` es reproducible desde datos persistidos.

### Horario

- una sugerencia no cambia asignatura sin confirmación;
- no inicia sesiones ni genera evidencias;
- rechazar silencia el resto del tramo;
- una excepción puntual no modifica la plantilla semanal.

Las comprobaciones deberían seguir el patrón actual de funciones puras `run*DeterministicChecks`, pero integrarse posteriormente en un comando de pruebas automatizado: hoy existen archivos de comprobación, pero `package.json` no ofrece un script de test que los ejecute todos.

## 16. Fases de implementación pequeñas y verificables

### Fase 1. Contratos y catálogos

Definir asignaturas, alcance de acciones y criterios actitudinales versionados. Añadir validadores y comprobaciones puras sin cambiar el flujo visible.

### Fase 2. Acciones contextualizadas

Migrar acciones heredadas a General, ampliar el editor y filtrar catálogos en el modal. Verificar que cristales, movimientos y acciones rápidas siguen funcionando igual.

### Fase 3. Asistencia independiente

Crear jornada, estados, intervalos, selección múltiple y llegada tardía. Sin conectar todavía cumplimiento automático.

### Fase 4. Sesión activa y cambio de asignatura

Añadir navegación, cabecera contextual, persistencia continua, validez de 10 minutos y descarte accidental. Incluir idempotencia de inicio y cierre.

### Fase 5. Participación y cumplimiento ordinario

Intersectar presencia y sesión, validar acciones elegibles y generar resúmenes separados, sin tocar la economía.

### Fase 6. Evidencias curriculares

Conectar el catálogo cerrado, registrar instantáneas y ofrecer consultas actitudinales que no produzcan calificaciones.

### Fase 7. Recuperación y deshacer

Implementar última actividad fiable, recuperación tras cierre, límite de 90 minutos y reversión temporal auditada.

### Fase 8. Horario y ambientación

Añadir sugerencias no automáticas, excepciones y temas ligeros por asignatura. Mantener accesibilidad y significados visuales globales.

### Fase 9. Persistencia de servidor

Sustituir adaptadores locales por repositorios transaccionales, identidad docente real, sincronización y auditoría. La secuencia exacta puede adelantarse si el backend se convierte antes en requisito de despliegue.

Cada fase debe cerrar con TypeScript, lint, build, comprobaciones deterministas propias y pruebas de migración sobre copias de datos heredados.

## 17. Riesgos e incompatibilidades

1. **Persistencia local fragmentada.** Alumnos, movimientos y acciones se guardan por separado; hoy una interrupción puede dejar efectos parciales. Las sesiones y evidencias requieren atomicidad real.
2. **Doble modelo de alumno.** `app/types/student.ts` es operativo y `domain/student/Student.ts` es futuro. Debe definirse una transición, no añadir un tercer modelo.
3. **Clase e identidad incompletas.** La cabecera está fija, `claseId` puede estar vacío y el docente es un marcador local. No son suficientes para registros educativos de servidor.
4. **Eventos descriptivos, no persistidos.** `ApplyStudentAction` crea eventos, pero no existe bus ni almacén operativo que los confirme.
5. **Sin transacción implementada.** El contrato existe, pero el puente actual muta dos almacenes locales diferentes.
6. **Acciones tipadas por signo.** Añadir un campo de tipo sin una fuente canónica puede producir inconsistencias.
7. **Movimientos heredados sin contexto.** No se debe inventar asignatura, sesión o criterio retroactivo.
8. **Ausencia de definición de oportunidad real.** Sin esa regla, el cumplimiento ordinario puede producir conclusiones engañosas.
9. **Tiempo y concurrencia.** Suspensión del navegador, cambio de reloj y varias pestañas pueden inflar o duplicar sesiones.
10. **Privacidad y conservación.** Asistencia y observaciones educativas requieren política de acceso, auditoría, exportación, rectificación y retención antes de producción.
11. **Pruebas no orquestadas.** Hay comprobaciones deterministas útiles, pero no un ejecutor único en los scripts del proyecto.

## 18. Decisiones pendientes antes de producción

- visibilidad exacta de acciones `general` dentro de asignaturas;
- fuente canónica del tipo positivo/negativo;
- regla de oportunidad real y presencia mínima;
- comportamiento de una sesión al abrir Asistencia;
- flujo de salidas y múltiples intervalos diarios;
- definición de última actividad fiable y `pending-review`;
- duración de la ventana de deshacer;
- propiedad y zona horaria del horario;
- catálogo curricular inicial y su gobierno;
- backend, autenticación, roles, auditoría y retención;
- política de sincronización y resolución de conflictos entre dispositivos.

Estas decisiones no deben resolverse implícitamente dentro de componentes React ni mediante valores dispersos. Deben formalizarse como reglas de dominio o configuración versionada antes de habilitar cada fase.
