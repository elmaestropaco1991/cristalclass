# Sistema opcional de asignaturas, asistencia y seguimiento curricular

## Estado, alcance y principio de producto

Este documento define la evolución de CristalClass desde su funcionamiento actual como gestor general de aula hacia un módulo **opcional** de asignaturas y seguimiento curricular. La asistencia forma parte del gestor general y no depende de ese módulo.

CristalClass funciona por defecto con:

- acciones;
- cristales;
- cofres;
- guardianes, equipamiento y colección;
- historial de movimientos;
- asistencia diaria.

Sin activar el módulo curricular:

- no aparecen pestañas de asignaturas;
- no existen sesiones por asignatura;
- no se generan evidencias curriculares;
- no aparecen horario ni ambientaciones por asignatura;
- no se muestra ningún aviso de evaluación pendiente.

La única opción de producto será:

> Activar asignaturas y seguimiento curricular

La activación engloba asignaturas, navegación por pestañas, sesiones, horario, ambientación, saberes, criterios y evidencias curriculares. No es posible completarla hasta configurar al menos una asignatura. Desactivar posteriormente el módulo lo oculta y pausa, pero no elimina configuraciones, relaciones ni evidencias.

CristalClass registra observaciones actitudinales que el docente puede combinar con otros instrumentos. No evalúa contenidos, exámenes ni el dominio completo de un criterio. Tampoco modifica por esta vía las reglas de cristales, máximo histórico, progresión, cofres, recompensas, guardianes, equipamiento o colección.

La calificación descrita en este documento es una arquitectura futura y no está implementada. Cuando exista, CristalClass calculará automáticamente resultados estrictamente a partir de las evidencias observadas por la aplicación; no afirmará evaluar componentes de un criterio que no haya observado.

Las decisiones indicadas como **definitivas** son reglas de producto y arquitectura. Las funciones descritas como **futuras** no deben presentarse en la interfaz ni en la documentación de usuario como ya disponibles.

## 1. Estado real de la arquitectura

### 1.1 Estado operativo

La aplicación actual es un cliente Next.js sin backend operativo. Sus principales almacenes locales son:

| Área | Modelo o servicio actual | Persistencia actual |
| --- | --- | --- |
| Alumnos, cristales, máximo histórico, cofres, inventario y equipamiento | `app/types/student.ts`, `useStudents`, `studentService`, `storageService` | `localStorage`: `cristalclass_students` |
| Acciones configurables | `app/types/action.ts`, servicios `actionCatalog*`, `ActionEditor` | `localStorage`: `cristalclass_actions` |
| Historial de acciones | `app/types/movement.ts`, `useMovements`, `movementService` | `localStorage`: `cristalclass_movements` |
| Asistencia diaria | `app/types/attendance.ts`, `useAttendance`, servicios `attendance*` | `localStorage`, clave versionada por clase y fecha local |
| Preferencia de sonido | `useSoundPreference`, `soundPreferenceService` | `localStorage`: `cristalclass_sound_enabled` |
| Tamaño de guardianes | `useClassroomGuardianScale`, `classroomAppearancePreferenceService` | `localStorage`, clave derivada de la clase |

El tipo operativo de alumno contiene `claseId`, pero los datos heredados pueden dejarlo vacío. Mientras no exista una entidad de clase fiable, `classroomIdentityService` usa un respaldo explícito y determinista. Ese respaldo es suficiente para la persistencia local actual, pero no constituye identidad multiusuario ni sustituye una futura clase de servidor.

`domain/` y `application/` esbozan límites futuros —agregados, comandos, eventos, transacciones y módulos— que todavía no sustituyen el flujo local. `createLegacyApplyStudentAction` continúa coordinando el efecto económico y el movimiento histórico. Una futura integración curricular debe extender esos límites, no crear un segundo mecanismo de aplicación de acciones.

### 1.2 Fases implementadas

Las tres primeras fases ya existen y deben conservar su compatibilidad:

1. **Contratos y catálogo provisional de asignaturas.** Existen `SubjectDefinition`, identificadores estables, un catálogo inicial de siete contextos y normalizadores de acciones heredadas.
2. **Acciones contextualizadas.** El editor y los servicios admiten `subjectId`, `availableInAllSubjects`, `attitudinalCriterionLinks` y `trackOrdinaryCompliance`. Estos campos preparan compatibilidad, pero parte de ellos son provisionales respecto al modelo definitivo descrito aquí.
3. **Asistencia independiente.** Todo alumno se interpreta presente por defecto; se persisten excepciones por clase y fecha local; se admiten ausencia, llegada, corrección a presente y corrección de hora. La asistencia bloquea funcionalmente acciones económicas mientras el alumno está ausente, sin convertirse en una acción ni modificar cristales.

### 1.3 Funciones aún no implementadas

Todavía no existen como funciones completas:

- activación o desactivación del módulo curricular;
- perfiles o paquetes curriculares importables;
- editor de criterios y saberes;
- asistente de activación;
- pestañas académicas visibles y asignatura activa;
- sesiones de observación;
- cálculo de oportunidades reales de observación;
- evidencias curriculares;
- cumplimiento ordinario;
- cálculo de Nota general CristalClass y notas por criterio;
- snapshots reproducibles de periodos cerrados;
- horario académico y ambientaciones por asignatura;
- importadores y exportadores curriculares;
- persistencia de servidor, autenticación docente o transacciones persistentes reales.

La pestaña fija de Asistencia sí está implementada y permanece disponible aunque el módulo curricular esté desactivado.

## 2. Decisiones anteriores sustituidas

Las siguientes decisiones del diseño anterior quedan sustituidas de forma explícita:

| Decisión anterior | Decisión definitiva |
| --- | --- |
| Mostrar siempre General, siete asignaturas y Asistencia en el lateral. | Sin módulo curricular solo aparece Asistencia. Las pestañas académicas aparecen únicamente después de una activación válida y nunca vacías. |
| Seleccionar cualquier asignatura inicia siempre una sesión. | Solo puede iniciarse una sesión cuando el módulo está activo, la asignatura está configurada y el docente entra en su contexto. |
| Mantener un catálogo curricular cerrado dentro de CristalClass. | El núcleo usa un modelo neutral. Los catálogos son manuales, importados, externos o compartidos y se distribuyen como paquetes versionados independientes. |
| Limitar el catálogo a criterios actitudinales mantenidos por CristalClass. | El docente controla el currículo activo; CristalClass conserva relaciones y evidencias actitudinales sin afirmar dominio completo. |
| Guardar las relaciones curriculares directamente dentro de `Action`. | Los campos actuales son provisionales. El modelo definitivo separa las relaciones en `ActionCurricularLink`. |
| Relacionar una acción directamente con un criterio como flujo principal. | El flujo conceptual definitivo es `Acción → Saber → uno o varios criterios`. |
| Tratar el catálogo fijo de siete asignaturas como definitivo. | Es un catálogo provisional y migrable. Sus identificadores deben conservarse mediante migración compatible, nunca mediante eliminación destructiva. |
| Continuar tras la Fase 3 directamente con sesión activa y cumplimiento. | Antes se construyen los contratos del módulo opcional, el importador/editor y el asistente de activación. |
| Que la conducta ordinaria no aportase peso positivo curricular. | Una oportunidad ordinaria válida aporta un peso positivo interno fijo de `+1`, sin movimiento económico. |
| Niveles cualitativos como único resultado curricular. | CristalClass calcula una nota numérica exacta por criterio, con trazabilidad y alcance actitudinal explícito. |
| Permitir que cada docente configure fórmulas, normalizaciones o equivalencias curriculares. | La fórmula es única; el valor de cristales de cada acción determina su peso y no existe un configurador adicional. |
| Normalizar automáticamente respecto al mejor alumno de la clase. | No existe normalización respecto al grupo: cada resultado depende solo de sus pesos positivos y contrarios. |
| Generar una nota actitudinal media de asignatura. | No se genera media actitudinal de asignatura: se calcula una nota independiente por cada criterio vinculado. |
| Usar el saldo actual de cristales como base de una calificación. | Solo cuentan movimientos explícitos de comportamiento o evidencias curriculares; el saldo actual nunca es la base de la nota. |

Permanecen vigentes la separación entre economía, asistencia y observación; la estabilidad de identificadores; la idempotencia; la fecha local de asistencia; y la prohibición de inferir contexto curricular retroactivo.

## 3. Módulo curricular opcional

### 3.1 Estados conceptuales

El módulo debe distinguir al menos:

- `disabled`: experiencia general de aula, sin superficies curriculares;
- `configuring`: configuración incompleta y todavía no activable;
- `enabled`: currículo válido, asignaturas seleccionadas y funciones curriculares disponibles;
- `paused`: equivalente visualmente a desactivado, pero con toda la configuración y evidencias conservadas.

Los nombres son conceptuales y no fijan todavía el contrato TypeScript. La interfaz puede representar `paused` mediante la misma opción de activación, siempre que no confunda pausa con borrado.

### 3.2 Invariantes definitivas

- La opción visible es **Activar asignaturas y seguimiento curricular**.
- La activación no se confirma sin al menos una asignatura configurada.
- No se muestran pestañas vacías ni contextos sin configuración útil.
- Desactivar oculta pestañas, sesiones, horario, ambientación y avisos curriculares.
- Desactivar no elimina currículos, relaciones, sesiones cerradas ni evidencias.
- Mientras está desactivado no se generan nuevas evidencias ni sesiones curriculares.
- La asistencia sigue visible, operativa e independiente en todos los estados.
- Las acciones generales, cristales, cofres, guardianes e historial siguen funcionando sin módulo curricular.
- No aparece ningún aviso de evaluación pendiente cuando el módulo está desactivado.
- Reanudar utiliza la misma configuración, salvo que una migración versionada requiera revisión explícita.

## 4. Modelo curricular neutral futuro

Este apartado define conceptos, no una implementación ya existente.

### 4.1 `CurriculumPack` y `CurriculumProfile`

`CurriculumPack` representa un paquete portable y versionado:

- identificador interno estable;
- versión de esquema y versión del contenido;
- nombre, descripción y autor o procedencia;
- metadatos opcionales de territorio, etapa, curso e idioma;
- asignaturas curriculares;
- criterios y saberes;
- información de licencia o atribución cuando proceda;
- huella o identidad de importación para detectar duplicados.

`CurriculumProfile` representa la configuración activa o preparada para una clase:

- identificador estable del perfil;
- clase destinataria;
- paquete de origen opcional;
- asignaturas seleccionadas;
- adaptaciones y elementos creados manualmente;
- estado de activación;
- versión de esquema;
- marcas de revisión y actualización.

Un perfil puede originarse manualmente, por importación, por un catálogo externo disponible o por reutilización de una configuración compartida. El núcleo no debe exigir comunidad autónoma ni proveedor concreto.

### 4.2 `CurriculumSubject`

Representa una asignatura dentro de un perfil o paquete:

- identificador interno estable;
- identificador del perfil o paquete;
- nombre e icono;
- código externo opcional;
- orden y estado activo;
- metadatos opcionales de curso, etapa o territorio;
- referencia compatible al `SubjectDefinition` provisional cuando exista correspondencia.

Dos paquetes pueden describir asignaturas semejantes sin compartir necesariamente el mismo identificador externo. Las equivalencias deben resolverse mediante una migración o una decisión explícita, no por comparar solo el nombre.

### 4.3 `SpecificCompetence`

Una competencia específica pertenece a una única asignatura curricular y conserva:

- identificador interno estable;
- código externo opcional;
- texto oficial;
- versión de procedencia del último cambio de código o texto;
- posición pedagógica mediante el orden de la colección de la asignatura.

El orden no se deduce del código ni del texto y reordenar no cambia `sourceVersion`. Los
catálogos completos siguen la jerarquía `Asignatura → Competencia específica → Criterios`.
Un criterio pertenece exactamente a una competencia de su propia asignatura. La ausencia
de competencias o de esa relación solo representa un catálogo heredado incompleto:
requiere revisión y migración explícitas, nunca inferencia automática, y no está preparado
para activación.

El núcleo curricular completo usa `schemaVersion: 2`. El envelope nativo JSON también
evoluciona de forma independiente a versión 2. Un envelope JSON v1 se puede comprobar y
reconocer como `legacy-incomplete`, conservando su checksum v1, pero no se convierte ni se
importa automáticamente. La exportación nueva siempre incluye la colección ordenada de
competencias y la referencia única de cada criterio.

### 4.4 `Criterion`

Un criterio contiene:

- identificador interno estable;
- identificador de asignatura curricular;
- código externo opcional;
- título;
- texto;
- identificador de su única competencia específica;
- versión o procedencia;
- estado activo o retirado sin pérdida histórica.

El identificador interno es la referencia persistente. El código oficial o externo puede cambiar, faltar o repetirse entre paquetes y por ello no puede ser la única clave.

### 4.5 `BasicKnowledge` o `Saber`

Un saber contiene:

- identificador interno estable;
- identificador de asignatura curricular;
- código externo opcional;
- texto;
- varios `criterionIds` de la misma asignatura curricular;
- versión o procedencia;
- estado activo o retirado.

El modelo admite varios criterios por saber desde el inicio aunque la interfaz pueda ofrecer una edición progresiva.

### 4.6 `ActionCurricularLink`

La relación curricular se almacena separada de `Action` y contiene conceptualmente:

- identificador estable de la relación;
- `actionId` global;
- identificador del perfil y de la asignatura curricular;
- uno o varios `basicKnowledgeIds`;
- `evidenceEffect`;
- `recordingMode`;
- configuración opcional de seguimiento ordinario;
- configuración opcional de acciones contrarias;
- versión de esquema y procedencia.

Una acción global puede tener relaciones distintas según asignatura y perfil activo. La acción conserva nombre, icono, puntos, archivo y posición rápida; no posee ni duplica los textos oficiales.

### 4.7 `EvidenceEffect` y `RecordingMode`

`EvidenceEffect` expresa cómo contribuye una observación actitudinal:

- `positive`: evidencia favorable;
- `contrary`: incidencia contraria al comportamiento esperado.

`RecordingMode` expresa cómo puede originarse:

- `manual`: solo mediante una acción explícita del docente;
- `ordinary`: resumen de una oportunidad real sin la incidencia contraria configurada.

La configuración ordinaria debe identificar la regla, las acciones contrarias relevantes y las condiciones de oportunidad. No se deduce automáticamente de que una acción tenga puntos negativos. Debe habilitarse expresamente por el docente.

### 4.8 Flujo curricular

El flujo definitivo es:

> Acción → Saber → uno o varios criterios → competencia específica de cada criterio

La jerarquía normativa se lee en sentido inverso desde la asignatura:
`Competencia específica → criterios`, con los saberes relacionados con uno o varios de
ellos. Una acción no demuestra por sí sola el dominio de un saber, criterio o competencia,
ni genera una nota por competencia. Una evidencia conserva referencias estables, versión y
una instantánea mínima suficiente para interpretar el historial aunque el catálogo evolucione.

### 4.9 Evidencia curricular y snapshot histórico

Cada evidencia futura será un acontecimiento independiente, no una modificación retrospectiva de la acción ni del movimiento económico. Debe conservar, como mínimo:

- identificador estable de evidencia;
- `actionId` cuando procede de una acción explícita;
- identificador de movimiento cuando existe efecto económico asociado;
- `studentId` y `classroomId`;
- `subjectId` y `sessionId` cuando proceden;
- fecha, hora y zona temporal inequívocas;
- `criterionIds` ya resueltos y deduplicados;
- efecto positivo o contrario;
- peso positivo o contrario aplicado;
- valor de cristales de la acción en el instante de registro;
- origen `manual` u `ordinary`;
- versión de relación curricular, catálogo y esquema necesarias para auditoría.

El snapshot de cristales es obligatorio para evidencias explícitas. Si una acción cambia posteriormente de `−1` a `−2`, las evidencias anteriores conservan peso contrario `1` y las posteriores usan `2`. Los cambios de catálogo o de acción nunca recalculan silenciosamente notas ya registradas ni periodos cerrados.

Una evidencia ordinaria conserva el mismo nivel de trazabilidad, pero su peso interno es siempre positivo `+1`, no contiene movimiento económico y referencia la oportunidad o sesión que la produjo.

## 5. Evidencias y seguimiento ordinario

### 5.1 Separación estricta

- Los cristales pertenecen al sistema motivacional.
- Los movimientos registran el efecto económico actual.
- La asistencia registra presencia y retrasos.
- Las evidencias pertenecen al seguimiento curricular opcional.
- Una misma intención manual puede correlacionar efectos, pero nunca fusionarlos en una sola entidad.
- La asistencia, el cumplimiento ordinario y una evidencia por sí sola nunca conceden cristales, generan cofres ni alteran progresión.

En una futura versión de servidor, una aplicación manual que produzca efecto económico y evidencia necesitará transacción e idempotencia reales. Mientras esa infraestructura no exista, no debe presentarse una garantía distribuida ficticia.

### 5.2 Reglas de evidencia ordinaria

La observabilidad ordinaria se configura una sola vez por conducta y asignatura dentro de la relación curricular. No se confirma alumno por alumno durante la sesión.

Una sesión puede generar evidencia ordinaria únicamente si concurren todas estas condiciones:

- el docente inició realmente la sesión;
- la sesión es válida y supera una duración mínima razonable, definida y versionada antes de su implementación;
- el alumno estaba presente durante la oportunidad aplicable;
- la conducta está configurada como habitualmente observable en esa asignatura;
- el docente no marcó el control discreto **No evaluar esta sesión**;
- existió una oportunidad real de observación;
- no existe ya en esa sesión una acción explícita vinculada al mismo criterio para ese alumno.

La evidencia ordinaria:

- aporta un peso positivo interno fijo de `+1`;
- no concede cristales ni crea movimientos económicos;
- se genera como máximo una vez por alumno, criterio y sesión;
- no se genera para alumnado ausente, sesiones no evaluables o sesiones sin oportunidad real;
- no demuestra el dominio completo del criterio;
- se agrega como resumen para evitar una avalancha de eventos positivos visibles.

La ausencia de una acción contraria solo puede interpretarse cuando la sesión, la presencia y la configuración prueban que existió una oportunidad real. La duración mínima y la definición operativa de oportunidad siguen siendo decisiones de dominio pendientes, pero deben quedar fijadas y versionadas antes de generar evidencia.

### 5.3 Acciones explícitas y deduplicación curricular

Una acción explícita registrada conserva su efecto económico actual y, cuando el módulo curricular está activo y la relación lo permite, genera una evidencia manual separada. Su peso curricular es el valor absoluto de sus cristales en el momento de registrarse:

- `+1` aporta peso positivo `1`;
- `+2` aporta peso positivo `2`;
- `−1` aporta peso contrario `1`;
- `−3` aporta peso contrario `3`.

El signo determina si la evidencia es positiva o contraria. Dos acciones de `+1` pesan igual y una de `+2` pesa el doble. No existen escalas configurables, equivalencias docentes, pesos independientes de los cristales ni normalización contra el mejor resultado del grupo.

Una acción puede llegar a varios criterios mediante varios saberes. Para cada criterio resuelto cuenta como máximo una vez: las rutas técnicas se deduplican antes de persistir la evidencia. Por ejemplo, una acción `−2` vinculada a tres criterios aporta peso contrario `2` a cada uno; no aporta `−6` dentro de un único criterio.

Una única acción se conserva como un acontecimiento con varias relaciones curriculares, no como copias económicas ni como varias acciones independientes. Varias acciones explícitas legítimas registradas durante una sesión sí permanecen como evidencias distintas para el mismo criterio. Se impiden el doble clic, los reintentos técnicos, las rutas curriculares repetidas y la evidencia ordinaria adicional de esa sesión para ese criterio.

### 5.4 Dos formas futuras de calificación

#### Sin módulo curricular: Nota general CristalClass

Mientras el módulo curricular esté desactivado, CristalClass funciona como gestor general de aula y podrá entregar una única **Nota general CristalClass** por alumno y periodo seleccionado:

> Nota general CristalClass = `P / (P + N) × 10`

Donde `P` es la suma de valores positivos y `N` la suma de valores absolutos negativos de movimientos explícitos cuyo origen sea una acción de comportamiento. No se utiliza el saldo actual del alumno.

Se excluyen cofres, compras, equipamiento, compañeros, recompensas no conductuales, ajustes técnicos o administrativos de saldo y cualquier movimiento económico sin origen en una acción de comportamiento. Si `P + N = 0`, no existe nota calculable y se muestra **Sin evidencias**, nunca `0`.

#### Con módulo curricular: nota exacta por criterio

Con el módulo activo no existe una media actitudinal por asignatura. CristalClass podrá calcular una nota independiente para cada criterio vinculado y periodo seleccionado:

> Nota del criterio = `P / (P + N) × 10`

Aquí `P` y `N` proceden exclusivamente de evidencias deduplicadas del criterio: acciones explícitas con su snapshot histórico y, cuando corresponda, evidencia ordinaria válida de peso `+1`. Cada resultado debe explicar peso positivo, peso contrario, oportunidades observadas, evidencias utilizadas, periodo y trazabilidad del cálculo.

Dentro de CristalClass puede presentarse como nota del criterio. En informes y exportaciones se identifica como **`[Código del criterio] · Nota CristalClass`**. Esa etiqueta comunica su origen automático y actitudinal, sin presentarla como evaluación completa de todos los componentes del criterio.

### 5.5 Periodos, provisionalidad y cierre

- Si `P + N = 0`, el resultado es **Sin evidencias**.
- Con menos de tres oportunidades válidas, la nota es visible pero se marca como provisional.
- A partir de tres oportunidades válidas, la nota se muestra sin marca de provisionalidad.
- Ausencias y sesiones no evaluables no alteran numerador ni denominador.
- Todas las notas se calculan por el periodo seleccionado, no sobre el saldo ni toda la vida del alumno por defecto.
- Cerrar un periodo conserva un snapshot reproducible de entradas, pesos, oportunidades, fórmula, catálogo y resultado.
- Reabrir o corregir un periodo exige una operación explícita y trazable.
- Cambiar después una acción, relación o catálogo nunca recalcula silenciosamente un periodo cerrado.

CristalClass calcula y explica estos resultados de forma automática. El docente no elige fórmulas, normalizaciones, porcentajes ni equivalencias numéricas. La responsabilidad docente sigue siendo combinar esta información con instrumentos que observen aspectos fuera del alcance de la aplicación.

## 6. Catálogos curriculares desacoplados

### 6.1 Decisión definitiva

CristalClass no incorporará rígidamente y de forma obligatoria los currículos de todas las comunidades autónomas. El docente podrá:

- crear un currículo manualmente;
- importar un catálogo;
- utilizar un catálogo externo disponible;
- compartir y reutilizar configuraciones.

Los catálogos por comunidad, etapa, curso o asignatura son paquetes versionados independientes del núcleo. Pueden distribuirse y actualizarse sin exigir una versión nueva de toda la aplicación, siempre con compatibilidad de esquema y procedencia visible.

### 6.2 Catálogo provisional actual

El catálogo operativo contiene General, Lengua, Matemáticas, Conocimiento del Medio, Educación Física, Inglés, Segunda Lengua Extranjera, Música, Plástica, Valores Cívicos y Éticos, Religión y Atención Educativa. Música y Plástica son contextos diarios distintos, aunque ambos deberán resolver el área oficial Educación Artística. Religión y Atención Educativa son opcionales y no se activan como currículo del Anexo II por simple presencia en el catálogo.

- sus identificadores existentes se conservan;
- las acciones ya asignadas continúan funcionando;
- puede servir como origen para crear un perfil inicial;
- no obliga a mostrar pestañas mientras el módulo esté desactivado;
- se migra de forma aditiva hacia `CurriculumSubject`;
- nunca se elimina destructivamente para imponer el modelo nuevo.

## 7. Asistente de activación futuro

El asistente sigue este orden:

1. El docente elige **Activar asignaturas y seguimiento curricular**.
2. Crea un currículo manual o importa un paquete.
3. Selecciona al menos una asignatura.
4. Introduce o revisa sus criterios.
5. Introduce saberes y relaciona cada saber con uno o varios criterios.
6. Vincula acciones globales a los saberes pertinentes y decide efecto y modo de registro.
7. Revisa un resumen de asignaturas, relaciones, advertencias y conflictos.
8. Activa el módulo.

Reglas del asistente:

- no crea sesiones ni evidencias durante la configuración;
- no permite activar con cero asignaturas;
- no muestra pestañas vacías;
- valida identificadores, relaciones cruzadas y duplicados antes de confirmar;
- permite guardar un borrador sin activar;
- diferencia errores bloqueantes de advertencias revisables;
- una importación siempre presenta previsualización y resumen de cambios;
- cancelar no altera la configuración activa.

## 8. Importación, exportación y portabilidad

### 8.1 Modelo interno independiente

CristalClass mantiene su propio esquema versionado y adaptadores específicos para aplicaciones externas. Ningún formato de iDoceo, Additio o Excel se convierte en el modelo interno canónico.

Se distinguen dos productos exportables:

1. **Configuración curricular:** asignaturas, criterios, saberes, relaciones y metadatos.
2. **Resultados, evidencias y snapshots:** cálculos reproducibles, observaciones agregadas o detalladas y su trazabilidad.

Sin módulo curricular se exporta por alumno y periodo la **Nota general CristalClass**, `P`, `N` y el número de acciones consideradas. Con módulo curricular se exporta una columna o resultado por criterio con su código, descripción, **Nota CristalClass**, `P`, `N`, oportunidades observadas y periodo.

Las notas exportadas son resultados calculados automáticamente a partir de la parte observada por CristalClass. Ninguna exportación las presenta como una calificación completa del criterio ni sustituye pruebas, producciones, rúbricas u otros instrumentos.

### 8.2 Exportadores iniciales

#### iDoceo

- XLSX de criterios con códigos únicos dentro del archivo y descripciones comprensibles;
- XLSX de resultados con una fila por alumno;
- sin módulo: columnas `Nota general CristalClass`, `P`, `N`, acciones consideradas y periodo;
- con módulo: columnas por criterio rotuladas como `[Código del criterio] · Nota CristalClass`, junto a `P`, `N`, oportunidades observadas y periodo;
- exportación combinada o separada por asignatura;
- nombres de hojas y códigos validados para evitar colisiones;
- previsualización del alcance antes de descargar.

#### Additio

- Excel de criterios;
- Excel de alumnos, columnas y resultados;
- distinción entre la nota general sin módulo y las notas por criterio con módulo;
- adaptación configurable del formato del nombre para facilitar coincidencias;
- estructura compatible con la importación curricular disponible en su versión web;
- informe de alumnos no emparejados sin sobrescritura automática.

#### Excel universal

- libros legibles sin depender de una aplicación concreta;
- hojas separadas para metadatos, criterios, alumnado y resultados cuando proceda;
- códigos estables y encabezados explícitos;
- fechas y zonas horarias inequívocas;
- resultados generales con `P`, `N`, acciones y periodo; o resultados por criterio con `P`, `N`, oportunidades y periodo;
- sin fórmulas ocultas que cambien el significado exportado.

#### JSON de CristalClass

- esquema y versión de contenido explícitos;
- identificadores internos estables;
- procedencia y metadatos del paquete;
- importación idempotente;
- detección de duplicados y conflictos;
- previsualización antes de aplicar;
- nunca sobrescritura silenciosa;
- posibilidad de exportar configuración sin datos personales;
- separación inequívoca entre configuración y resultados;
- evidencias y snapshots de periodo suficientes para reproducir cada cálculo exportado.

### 8.3 Importación segura

Una importación debe clasificar cada elemento como nuevo, idéntico, actualizable o conflictivo. Repetir el mismo archivo no duplica asignaturas, criterios, saberes ni relaciones. Ante un conflicto, el docente elige conservar, importar como copia o resolver una correspondencia; ninguna lectura o previsualización escribe por sí sola.

### 8.4 Referencias documentales

- [iDoceo: importación general](https://idoceo.net/es/index.php/en/instructions/howto/idoceoimport)
- [iDoceo: importar estándares](https://idoceo.net/es/index.php/en/instructions/gradebook/import-standards)
- [iDoceo: competencias clave](https://idoceo.net/es/index.php/en/instructions/uncategorised/key-skills)
- [Additio: importar alumnos y calificaciones](https://help.additioapp.com/en/import-students-grades)
- [Additio: evaluación competencial y criterios](https://help.additioapp.com/evaluaci%C3%B3n-competencial-los-criterios-de-evaluaci%C3%B3n)

Estas referencias orientan adaptadores de intercambio; no convierten sus formatos en contratos internos.

## 9. Asistencia independiente

### 9.1 Comportamiento implementado

Todo alumno activo se interpreta presente si no existe registro explícito. La jornada usa fecha local y zona horaria del usuario. Las operaciones implementadas son:

- presente implícito o explícito;
- marcar ausente individualmente o en lote;
- **Ha llegado ahora**, con instante real y resultado de retraso;
- corregir hora de llegada sin duplicar el registro;
- corregir a presente eliminando una ausencia o retraso falso;
- normalización tolerante y persistencia versionada por clase y fecha;
- bloqueo visual y funcional de acciones económicas mientras el estado actual es ausente.

La asistencia no usa `ApplyStudentAction`, no crea movimientos y no modifica cristales, cofres, máximo histórico, progresión ni relaciones curriculares.

### 9.2 Relación futura con sesiones

Cuando existan sesiones, la asistencia solo determinará elegibilidad y oportunidad:

- un alumno ausente no genera evidencia ordinaria;
- una llegada permite participar desde su hora efectiva;
- no se infiere presencia retroactiva a partir del resultado final del día;
- una corrección horaria obliga a recalcular de forma determinista cualquier participación derivada.

Las salidas anticipadas y múltiples intervalos diarios no están implementados ni forman parte del contrato actual. Si se incorporan, requerirán una fase y transiciones explícitas; no deben inferirse del modelo existente.

## 10. Sesiones, navegación y horario futuros

Una sesión solo podrá comenzar si:

- el módulo curricular está activo;
- la asignatura pertenece al perfil activo;
- el docente entra explícitamente en ese contexto;
- no existe un conflicto de sesión que requiera cierre o recuperación.

Abrir Asistencia no inicia una sesión académica. El comportamiento de una sesión ya activa al abrir Asistencia —mantener, pausar visualmente o solicitar cierre— debe resolverse antes de implementar navegación académica.

La propuesta anterior de considerar válida una sesión de 10 minutos o con al menos una acción queda sustituida para la evidencia ordinaria: una acción explícita por sí sola no acredita oportunidad real y una sesión debe superar una duración mínima razonable previamente definida y versionada. Diez minutos puede evaluarse como posible valor inicial, pero no está implementado ni fijado. También siguen pendientes la última actividad fiable, recuperación tras cierre brusco, límite de sesión, deshacer y concurrencia entre pestañas.

El horario es opcional y solo sugiere contextos. Nunca selecciona una asignatura, inicia una sesión, genera evidencias o registra cumplimiento sin confirmación. Al desactivar el módulo curricular, horario, sugerencias y ambientaciones desaparecen sin borrar su configuración.

## 11. Migración aditiva y reversible

### 11.1 Campos provisionales actuales

Los campos actuales de `Action`:

- `subjectId`;
- `availableInAllSubjects`;
- `attitudinalCriterionLinks`;
- `trackOrdinaryCompliance`;

son una base provisional de las fases 1 y 2. Mantienen compatibilidad y permiten experimentar con contexto, pero no representan el modelo curricular neutral definitivo. En particular, una acción no debe conservar textos oficiales ni convertirse en propietaria de criterios.

### 11.2 Estrategia

La migración será aditiva, reversible e iniciada mediante una operación explícita:

1. Conservar todas las acciones, identificadores, iconos, puntos, archivo, posición rápida y estado archivado.
2. Mantener el gestor general completamente funcional y el módulo curricular desactivado por defecto.
3. Crear un perfil curricular solo durante configuración o activación explícita.
4. Convertir el catálogo provisional en asignaturas del perfil mediante correspondencias estables.
5. Trasladar relaciones provisionales válidas a `ActionCurricularLink` sin borrar inmediatamente los campos heredados.
6. Marcar conflictos o referencias incompletas para revisión, sin inventar criterios ni saberes.
7. No reescribir `localStorage` durante una simple lectura, hidratación o previsualización.
8. Persistir la nueva versión únicamente tras confirmación o guardado explícito.
9. Conservar evidencias y configuraciones al pausar o desactivar el módulo.
10. Permitir rollback de la activación sin borrar datos ni revertir acciones económicas.
11. No inferir asignatura, sesión, saber o criterio para movimientos históricos.
12. Mantener adaptadores capaces de leer la versión anterior durante una ventana de compatibilidad documentada.

Una migración repetida con la misma versión y origen produce el mismo perfil y las mismas relaciones, sin duplicados.

## 12. Persistencia y límites de servidor

Mientras la aplicación sea local, cada nuevo almacén debe tener versión, normalización tolerante, claves deterministas y escritura explícita. Los datos desconocidos no deben destruirse al leer una versión anterior.

En una versión multiusuario deben persistirse en servidor:

- identidad real de clases, docentes y alumnado;
- perfiles y paquetes curriculares;
- asignaturas, criterios, saberes y relaciones;
- estado de activación del módulo;
- asistencia y correcciones;
- sesiones, participaciones y evidencias;
- configuraciones ordinarias y acciones contrarias;
- horario y excepciones si deben sincronizarse;
- claves de idempotencia, versiones y auditoría;
- economía e inventario, aunque su migración sea un proyecto separado.

Son preferencias locales razonables el sonido, reducción de movimiento y apariencia del aula. Una asignatura activa deja de ser una preferencia visual cuando representa una sesión recuperable.

## 13. Fases de implementación

### Fases completadas

1. **Contratos y catálogos provisionales de asignaturas.** Implementada y validada.
2. **Acciones contextualizadas.** Implementada y validada sobre el contrato provisional.
3. **Asistencia independiente.** Implementada y validada; no genera evidencias.

### Fases futuras reordenadas

4. **Contratos y migración del módulo curricular opcional.** Definir estados, perfiles, paquetes, modelo neutral, relaciones separadas y migración reversible, sin activar UI curricular.
5. **Importador y editor de catálogos.** Crear, importar, previsualizar, resolver conflictos, versionar y compartir configuraciones.
6. **Asistente de activación.** Guiar selección, relaciones, validación y activación; impedir pestañas vacías.
7. **Navegación y sesiones por asignatura.** Añadir contextos activos, validez, participación, recuperación y deshacer sin alterar Asistencia.
8. **Registro, cálculo y cierre de evidencias curriculares.** Registrar observaciones manuales y ordinarias separadas de la economía, con snapshot histórico de cristales, oportunidad real, exclusión de ausentes, deduplicación, notas exactas y cierre reproducible por periodo.
9. **Exportación iDoceo, Additio, Excel y JSON.** Separar configuración y resultados; exportar nota general o notas por criterio con pesos, oportunidades, periodo y snapshots, y advertir el alcance actitudinal.
10. **Horario y sugerencias.** Incorporar ayuda no automática, excepciones y ambientaciones únicamente con el módulo activo.
11. **Persistencia de servidor posterior.** Añadir identidad, repositorios, transacciones, sincronización, auditoría y resolución de conflictos.

Cada fase termina con TypeScript, lint, build, comprobaciones deterministas propias, pruebas de migración sobre copias y verificación de que el gestor general sigue funcionando con el módulo desactivado.

## 14. Criterios de aceptación y comprobaciones deterministas

### 14.1 Activación y desactivación

- la instalación o clase nueva empieza con el módulo desactivado;
- Asistencia permanece disponible;
- no aparecen pestañas, sesiones, horario, ambientación, evidencias ni avisos curriculares;
- cero asignaturas impide activar;
- una asignatura configurada permite completar el asistente;
- solo aparecen asignaturas seleccionadas y no vacías;
- desactivar pausa la generación y oculta superficies sin borrar datos;
- reactivar recupera exactamente el perfil y las evidencias existentes;
- desactivar nunca cambia cristales, cofres, guardianes o historial.

### 14.2 Importación y duplicados

- importar un paquete válido conserva identificadores internos o crea correspondencias explícitas;
- repetir el mismo paquete es idempotente;
- códigos iguales de paquetes distintos no se fusionan silenciosamente;
- elementos idénticos se reconocen sin duplicarse;
- conflictos se muestran en la previsualización y requieren decisión;
- cancelar la previsualización no escribe datos;
- una referencia a criterio de otra asignatura se rechaza;
- un saber conserva varios `criterionIds` válidos;
- un paquete incompleto no rompe el perfil activo.

### 14.3 Migración

- una acción heredada conserva ID, nombre, icono, puntos, archivo, orden y posición rápida;
- una acción sin contexto continúa operativa como general;
- los siete identificadores provisionales se migran sin eliminación destructiva;
- las relaciones válidas generan `ActionCurricularLink` una sola vez;
- relaciones ambiguas quedan pendientes de revisión, no inventadas;
- leer o previsualizar no reescribe `localStorage`;
- repetir la migración no duplica perfiles ni relaciones;
- rollback oculta o pausa el módulo sin borrar configuraciones ni evidencias;
- movimientos históricos no reciben contexto curricular retroactivo.

### 14.4 Asistencia y alumnado ausente

- presente implícito y explícito son elegibles para acciones generales;
- ausente bloquea acciones económicas sin crear movimiento;
- llegada o corrección a presente desbloquea inmediatamente;
- alumno ausente queda excluido de participación y evidencia ordinaria;
- una llegada solo habilita oportunidades posteriores a la hora efectiva;
- corregir la hora recalcula derivados sin duplicar evidencias;
- ninguna operación de asistencia modifica economía o currículo.

### 14.5 Registro manual y ordinario

- una observación manual usa la relación del perfil activo, no campos oficiales embebidos en `Action`;
- una acción puede resolver relaciones diferentes en dos asignaturas o perfiles;
- el flujo válido conserva `Acción → Saber → criterios`;
- una evidencia no modifica cristales ni afirma dominio completo;
- el registro ordinario está desactivado por defecto;
- solo una configuración expresa puede habilitarlo;
- una sesión inválida no genera evidencia ordinaria;
- una oportunidad real genera como máximo una evidencia ordinaria por alumno, criterio y sesión;
- **No evaluar esta sesión** excluye toda evidencia ordinaria de esa sesión;
- una acción contraria configurada impide el resultado ordinario favorable correspondiente;
- una acción explícita para el mismo criterio y sesión sustituye la evidencia ordinaria;
- un reintento o cierre concurrente no duplica evidencias;
- los resúmenes ordinarios tienen peso positivo fijo `+1`, procedencia visible y ningún movimiento económico.

### 14.6 Cálculo, snapshots y periodos

- `P=12` y `N=3` producen nota `8` tanto para la nota general como para un criterio, si las evidencias pertenecen al periodo;
- `P=0` y `N=0` producen **Sin evidencias**, nunca una nota `0`;
- pesos `+1`, `+2`, `−1` y `−3` contribuyen respectivamente `1`, `2`, `1` y `3` según su signo;
- cambiar posteriormente una acción no altera el snapshot ni la nota de evidencias ya registradas;
- una evidencia ordinaria aporta solo `+1` interno y no crea movimiento económico;
- alumnado ausente y sesiones no evaluables quedan excluidos de numerador, denominador y oportunidades;
- una acción explícita impide añadir además la evidencia ordinaria de esa sesión para el mismo criterio;
- varias rutas de saberes hacia el mismo criterio no duplican peso;
- una acción `−2` vinculada a tres criterios aporta peso contrario `2` a cada criterio;
- cofres, compras, equipamiento, compañeros, recompensas no conductuales y ajustes técnicos quedan excluidos de la nota general;
- un periodo cerrado puede reproducir exactamente entradas, pesos, oportunidades y resultado;
- reabrir o corregir un periodo deja trazabilidad y no reescribe silenciosamente el snapshot anterior.

### 14.7 Exportaciones

- configuración y resultados se exportan por separado;
- el JSON incluye versión e identificadores estables;
- exportar e importar la misma configuración conserva relaciones sin duplicados;
- iDoceo recibe códigos únicos en el archivo y una fila de resultados por alumno;
- Additio informa coincidencias y alumnos no emparejados;
- Excel universal mantiene encabezados, fechas y zonas horarias explícitas;
- las columnas curriculares se identifican como `[Código del criterio] · Nota CristalClass` y declaran su alcance actitudinal;
- ninguna exportación etiqueta una evidencia como calificación completa del criterio;
- la exportación por asignatura no mezcla resultados de otra;
- la exportación general contiene Nota general CristalClass, `P`, `N`, acciones consideradas y periodo;
- la exportación curricular contiene por criterio código, descripción, Nota CristalClass, `P`, `N`, oportunidades y periodo;
- el JSON contiene las evidencias y snapshots necesarios para reproducir los cálculos;
- exportar no modifica el estado interno.

## 15. Riesgos y contradicciones abiertas

1. **Campos provisionales frente al modelo neutral.** `Action.subjectId`, `availableInAllSubjects`, `attitudinalCriterionLinks` y `trackOrdinaryCompliance` ya están persistidos. Deben convivir temporalmente con `ActionCurricularLink` sin crear dos fuentes activas de verdad.
2. **Catálogo fijo frente a configuración libre.** Los siete identificadores actuales están en datos y servicios. Ocultarlos o migrarlos es distinto de eliminarlos; una sustitución destructiva rompería acciones locales.
3. **Identidad de clase incompleta.** El respaldo actual es determinista, pero insuficiente para importar, compartir o sincronizar perfiles entre usuarios.
4. **Persistencia local fragmentada.** Acciones, movimientos, asistencia y futuros perfiles usan almacenes distintos. La atomicidad real requiere servidor.
5. **Definición de oportunidad real.** Sin una regla explícita y versionada, el seguimiento ordinario puede convertir falta de observación en evidencia favorable.
6. **Clasificación fiable de orígenes.** La nota general exige distinguir movimientos explícitos de comportamiento de cofres, compras, recompensas y ajustes técnicos; esa procedencia debe ser estable antes de calcular resultados históricos.
7. **Correspondencias externas.** Nombres, códigos y estructuras de iDoceo, Additio o paquetes regionales pueden colisionar; los adaptadores necesitan previsualización y resolución de conflictos.
8. **Datos personales en exportaciones.** Los resultados requieren controles de alcance, privacidad, acceso, rectificación y retención antes de un uso productivo.
9. **Versionado legal y curricular.** Un catálogo retirado no puede reescribir evidencias históricas; deben conservarse versión, procedencia e instantáneas mínimas.
10. **Sesiones aún no definidas por completo.** Validez, duración mínima razonable, oportunidad, interrupciones, concurrencia, deshacer y comportamiento al abrir Asistencia deben cerrarse antes de registrar evidencias ordinarias.
11. **Cierre de periodos.** Deben concretarse identidad de periodo, permisos locales de reapertura, formato de snapshot y trazabilidad de correcciones antes de presentar calificaciones como resultados estables.
12. **Pruebas no orquestadas.** Existen comprobaciones deterministas por servicio, pero falta un comando único que ejecute todas las suites en integración continua.

## 16. Decisiones pendientes antes de cada fase

Aunque la opcionalidad, neutralidad y portabilidad quedan cerradas, todavía deben formalizarse:

- contrato exacto y versiones de `CurriculumPack` y `CurriculumProfile`;
- política de equivalencias entre asignaturas provisionales y externas;
- formato de licencia, autoría y actualización de paquetes compartidos;
- duración mínima razonable y regla exacta de oportunidad real;
- semántica de varias acciones contrarias para un mismo saber;
- identidad, cierre, reapertura y corrección trazable de periodos;
- comportamiento de una sesión activa al abrir Asistencia;
- validez, recuperación, última actividad fiable, límite y deshacer de sesiones;
- formato exacto de cada adaptador iDoceo y Additio tras pruebas con archivos reales;
- política de identidad, privacidad, auditoría y retención en servidor;
- resolución de conflictos entre dispositivos.

Estas decisiones no deben ocultarse en componentes React, valores dispersos ni migraciones automáticas de lectura. Deben convertirse en contratos, reglas puras y configuraciones versionadas antes de habilitar la fase correspondiente.
