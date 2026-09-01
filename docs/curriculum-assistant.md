# Asistente curricular visual

## Alcance

El asistente conecta la interfaz docente con el catálogo curricular v2, su editor, el validador, la importación JSON y el catálogo único de acciones. No crea evidencias, notas, rúbricas, informes, exportaciones, recompensas ni movimientos de cristales o monedas.

La jerarquía visible es `Asignatura → Competencia específica → Criterio → Saber → Acción observable`. Las competencias solo organizan criterios. Las relaciones se eligen de forma explícita y nunca se infieren desde nombres, códigos, posiciones o similitudes.

## Fuente de verdad y preparación

`CurriculumAssistantState` es el agregado persistente y la única fuente de verdad operativa de esta integración por clase, versionado con `schemaVersion: 1`. Su `CurriculumCatalogEditorState` conserva un único pack curricular; las modificaciones válidas se aplican mediante `curriculumCatalogEditorService`. No existe una segunda copia del pack dentro del auxiliar. El perfil no copia contenido curricular: `packId` es una referencia y `selectedSubjectIds` conserva exclusivamente las activaciones. `trackingEnabled` representa la pausa general y el `status` obligatorio del perfil se mantiene como estado derivado coherente. `ActionCurricularLink` es la única fuente de las relaciones con acciones.

El almacenamiento curricular auditado anterior continúa reservado para sus flujos de migración y no se modifica durante una operación del asistente. El asistente consulta el tamaño de su clave `current` únicamente para el presupuesto combinado. Por tanto, preparar, importar, relacionar o activar en el asistente escribe una sola envoltura, no dos catálogos ni una falsa transacción multiclave.

El contrato auxiliar solo guarda estados que el catálogo v2 estricto no puede representar durante una preparación incompleta:

- saberes todavía sin criterios;
- una selección de criterios temporalmente vacía;
- identidades retiradas de forma no destructiva;
- asignaturas archivadas de la preparación;
- un JSON v1 completo y checksummed pendiente de revisión.

No se copia el catálogo en diarios auxiliares. Al relacionar un saber pendiente con al menos un criterio, pasa al catálogo mediante el editor existente. Una relación no vacía actualiza también su procedencia manual mediante ese servicio.

## Importación

El archivo se limita y analiza antes de escribir. `parseCurriculumPackJson` comprueba estructura, claves duplicadas o peligrosas, versión, referencias, límites y checksum. La vista previa y la confirmación son operaciones separadas.

Un JSON v2 confirmado pasa por `previewCurriculumPackImport` y `applyCurriculumPackImport` con un mapeo `import-as-new` explícito, completo, exacto e inyectivo. Las identidades se producen de forma determinista a partir de clase, pack fuente, tipo de entidad e ID fuente; no dependen del idioma, del texto ni de la posición pedagógica. El resultado se presenta como un borrador manual editable; conserva orden pedagógico, relaciones saber–criterio y la identidad explícita de origen de cada asignatura para resolver sus acciones propias, sin inferirla por texto. Repetir el mismo archivo se reconoce como un no-op y conserva las ediciones actuales. Un archivo divergente se informa y nunca sustituye un borrador existente.

Un JSON v1 válido se conserva completo en su envoltorio original como legado pendiente. No se migra, repara ni completa automáticamente. Estados híbridos, corruptos o con checksum incorrecto se rechazan.

## Activación

Cada asignatura se valida en un agregado v2 aislado que contiene solo esa asignatura, su perfil y sus enlaces de acciones. Así, una asignatura incompleta no bloquea otra. Las advertencias permiten confirmar; los errores bloquean. La resolución de pestañas vuelve a validar el catálogo efectivo y el catálogo actual de acciones: una acción archivada, reasignada, duplicada o cuyo signo haya cambiado deja la asignatura en revisión y oculta su pestaña sin modificar silenciosamente la activación guardada. Activar añade solo esa asignatura a `selectedSubjectIds` y habilita el seguimiento general. Desactivar conserva catálogo, relaciones y selección del resto; si era la última, también apaga la opción general.

La opción general `trackingEnabled` controla la visibilidad de pestañas. Desactivarla no borra `selectedSubjectIds` ni enlaces. Reactivarla recupera las pestañas conservadas. No existe todavía creación operativa de evidencias.

Un cambio estructural que dejaría inválida una asignatura activa devuelve `requires-deactivation`. La interfaz exige la confirmación «Desactivar y continuar» antes de guardar el cambio. No se simula una versión activa paralela: el soporte actual conserva un único catálogo y exige esa desactivación explícita.

## Acciones

No hay un segundo catálogo. La elegibilidad usa el catálogo de acciones existente y únicamente identidades explícitas: el `subject.id` curricular, su `legacySubjectId` declarado o `availableInAllSubjects`. Al crear manualmente una asignatura, el docente puede vincular explícitamente uno de los contextos académicos existentes; una asignatura sin esa vinculación recibe solo acciones globales. No se comparan textos ni códigos.

Los enlaces indican elegibilidad futura. Guardan efecto positivo o contrario y los criterios ya elegidos, pero no aplican cristales, crean evidencias ni calculan notas.

## Persistencia, concurrencia y presupuesto

La clave es `cristalclass_curriculum_assistant_v1:${encodeURIComponent(classroomId)}`. Cada envoltorio contiene clase, revisión optimista, fecha informativa recibida del llamador y checksum determinista. Leer nunca crea, migra, repara ni escribe.

Una escritura del asistente afecta únicamente a su envoltura versionada:

1. relee el valor actual;
2. rechaza valores corruptos o incompatibles sin sobrescribirlos;
3. compara `expectedRevision`;
4. exige que la nueva revisión avance exactamente una unidad;
5. valida contrato, límites y checksum;
6. escribe una sola clave y la relee para verificarla.

Si `setItem` escribe y después lanza, la relectura reconoce el resultado exacto como confirmado. Si no existe escritura observable, informa un fallo sin escritura. Si se escribió pero la relectura no permite saber qué valor prevaleció, devuelve `write-outcome-unknown`; la interfaz relee, muestra el bloqueo y exige recargar o repetir deliberadamente. No se presenta un resultado ambiguo como transacción completada.

Cuando Web Locks está disponible se reutiliza exactamente el lock curricular por clase. Sin Web Locks queda la comparación optimista, que detecta escritores cooperativos pero no convierte `localStorage` en una transacción distribuida. La atomicidad real es solo la sustitución de un valor individual; no hay transacción atómica entre claves. Un cambio concurrente conserva en memoria el candidato local, adopta como estado operativo el último valor persistido y bloquea cualquier sobrescritura o reintento hasta que el docente recarga y revisa ambos estados. Los eventos `storage`, incluido `localStorage.clear()`, mantienen sincronizadas las pestañas cooperativas y un cambio de aula invalida la presentación y las confirmaciones de la clase anterior.

El montaje, la hidratación, la vista previa y React Strict Mode solo leen después de montar en cliente; nunca consultan `localStorage` durante el render. Los diálogos se desmontan al cerrarse y el foco vuelve al control que los abrió. Los controles se bloquean durante la escritura; un segundo comando inmediato se rechaza de forma visible. Los campos de alta no se limpian hasta que la persistencia y su verificación terminan correctamente.

Un fallo conocido sin escritura conserva el candidato solo en memoria y ofrece un reintento explícito; las pestañas y la configuración continúan usando exclusivamente el estado releído y verificado. Un resultado desconocido o un conflicto también conserva el candidato, pero bloquea su reintento para impedir que sustituya datos concurrentes. Cerrar o recargar en ese estado no puede prometer durabilidad: la interfaz lo comunica como error pendiente, nunca como guardado confirmado.

El borrador admite como máximo 750.000 code units. Antes de escribir también se suma el valor curricular preexistente y se aplica el presupuesto conjunto de 1.250.000 code units ya reservado para currículo. No se trunca, compacta o elimina contenido al superar el límite.

## Evaluación posterior

El motor de evaluación vive separado del asistente y se documenta en `docs/curriculum-evaluation.md`. El asistente prepara el seguimiento ordinario como activado por defecto y sin un mínimo temporal inventado, pero no crea sesiones ni notas por sí mismo. Una asignatura debe estar realmente activa y una sesión debe cerrarse explícitamente antes de que el motor pueda calcular un resultado.

## Límites deliberados

- El legado v1 queda pendiente; esta fase no incorpora una pantalla de migración de competencias.
- Un borrador existente no se reemplaza por una importación divergente; solo se reconoce de forma idempotente la misma importación fuente.
- El flujo de creación/edición de acciones actual vive dentro de la ficha operativa del alumno y no puede abrirse desde el asistente sin anidar modales y duplicar estado. El asistente relaciona el catálogo existente; la creación sigue en su flujo actual.
- No hay versión activa y borrador estructural simultáneos. Los cambios invalidantes exigen desactivar explícitamente la asignatura.
- Las pestañas activas seleccionan contexto visual; no registran todavía evidencias.
