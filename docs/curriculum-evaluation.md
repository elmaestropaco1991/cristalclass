# Evaluación curricular a partir del registro cotidiano

## Alcance de este bloque

El módulo incluye contrato, cálculo, persistencia auditada, sesiones automáticas y una vista de evaluación. No convierte los movimientos legacy en evidencias, porque esos movimientos no conservan la asignatura ni la sesión en la que ocurrieron. Conectar retrospectivamente ese historial produciría asociaciones curriculares inventadas.

## Principios cerrados

- El registro habitual sigue siendo `alumno → acción`, sin preguntas curriculares.
- El seguimiento ordinario queda preparado por defecto.
- No existe un mínimo arbitrario de días o minutos para declarar evidencia suficiente.
- Con cero sesiones válidas se muestra `Sin datos`.
- Desde una sesión válida se ofrece siempre una nota provisional del observable.
- La nota no se presenta como calificación completa del criterio.
- El alumnado ausente no genera oportunidades.
- Varias incidencias de la misma conducta en una sesión se conservan en el historial, pero afectan una sola vez a la proporción de sesiones.
- Las observaciones positivas se muestran por separado y no elevan artificialmente la nota basada en ausencia de incidencias.
- Corregir una observación añade una reversión; nunca borra silenciosamente el registro original.

## Fórmula

```text
nota propuesta = sesiones sin incidencias registradas / sesiones válidas × 10
```

El resultado se redondea a una cifra decimal. Cada informe incluye número de sesiones, sesiones con y sin incidencias, cantidad total de registros contrarios, positivos, periodo, cobertura parcial y avisos metodológicos.

## Trazabilidad

Cada sesión conserva snapshots de las reglas aplicables, los criterios relacionados, el saber, la acción observable y las acciones contrarias. Editar posteriormente el nombre o las relaciones de una acción no reescribe el pasado. Si cambia el contenido de una regla, su huella cambia y el motor no mezcla automáticamente periodos semánticamente diferentes.

## Persistencia

La clave por clase es:

```text
cristalclass_curriculum_evaluation_v1:{classroomId codificado}
```

La envoltura contiene versión, clase, revisión optimista, estado, fecha de escritura y checksum determinista. Las lecturas no reparan ni reescriben valores. Una revisión obsoleta, un checksum divergente o un estado inválido bloquean la escritura. El límite actual es de 1.000.000 de unidades de código.

La sesión en curso se guarda por separado bajo `cristalclass_curriculum_open_session_v1:{classroomId}`. Incluye asignatura, alumnado presente, reglas, acciones y una huella de integridad. Esto permite recuperar una clase abierta tras recargar sin mezclarla con sesiones ya cerradas.

## Flujo diario conectado

- Seleccionar una asignatura con reglas ordinarias abre silenciosamente una sesión.
- Cambiar de asignatura o volver a `Aula` cierra la sesión anterior.
- Una acción cotidiana se aplica primero a cristales, monedas y movimientos. Si se confirma, su evidencia curricular se añade a la sesión sin preguntas adicionales.
- Las acciones no relacionadas no generan evidencia.
- Una pestaña abierta y cerrada en el mismo instante se descarta; no fabrica una oportunidad.
- Una sesión en curso no entra en el cálculo hasta cerrarse.
- `Menú → Evaluación` muestra las notas propuestas por alumno y asignatura.

La vista conserva siempre las expresiones `nota propuesta` y `cobertura parcial`, muestra el número real de sesiones e incidencias y reproduce los avisos metodológicos. Desde la primera sesión válida existe una cifra; no se oculta por un umbral temporal inventado.

## Reglas ordinarias ya preparadas

Al preparar el curso oficial, el perfil activa todas las áreas aplicables. Lengua guarda dos reglas ordinarias sin mínimo temporal inventado:

- respeto de turnos: positiva `Participa respetando los turnos de palabra`, contraria `Interrumpe mientras otra persona habla`;
- atención durante intervenciones: positiva `Participa demostrando escucha activa`, contraria `No atiende durante una intervención`.

Las relaciones curriculares se limitan al criterio `3.2` exacto del curso y mantienen cobertura parcial. La acción situacional de resolución dialogada se relaciona con `10.2`, pero no genera oportunidades por ausencia de conflictos.

También se prepara una regla ordinaria revisada en Matemáticas, otra en Educación Física y otra por cada Lengua Extranjera disponible. Todas aplican la misma protección: la nota describe únicamente perseverancia, respeto de reglas o turnos de interacción, según corresponda. No se transforma en nota completa del criterio.

Conocimiento del Medio, Educación Artística y Valores incluyen relaciones manuales para actividades o situaciones reales. No crean una nota por ausencia de pulsaciones, porque una sesión puede no haber ofrecido ninguna oportunidad de experimentar, colaborar, debatir o compartir una producción.

## Límites actuales

Las relaciones manuales de actividades contextuales todavía no calculan una nota propia: para ello será necesario definir de forma explícita cuándo hubo una oportunidad de experimento, producción artística, debate o proyecto. El registro ordinario ya conectado sigue sin alterar el resultado de cristales, monedas, cofres, movimientos ni asistencia si la persistencia curricular falla.
