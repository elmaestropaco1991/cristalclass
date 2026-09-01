# Evaluación curricular a partir del registro cotidiano

## Alcance de este bloque

Este módulo añade el contrato, el cálculo y la persistencia auditada de la evaluación curricular. Todavía no abre ni cierra sesiones desde la interfaz y no convierte los movimientos legacy en evidencias, porque esos movimientos no conservan la asignatura ni la sesión en la que ocurrieron.

La integración posterior deberá crear explícitamente una sesión real de asignatura y entregarla al motor. Conectar directamente el historial antiguo produciría asociaciones curriculares inventadas.

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

## Reglas de Lengua ya preparadas

Al activar el catálogo oficial de Lengua, el perfil guarda dos reglas ordinarias sin mínimo temporal inventado:

- respeto de turnos: positiva `Participa respetando los turnos de palabra`, contraria `Interrumpe mientras otra persona habla`;
- atención durante intervenciones: positiva `Participa demostrando escucha activa`, contraria `No atiende durante una intervención`.

Las relaciones curriculares se limitan al criterio `3.2` exacto del curso y mantienen cobertura parcial. La acción situacional de resolución dialogada se relaciona con `10.2`, pero no genera oportunidades por ausencia de conflictos.

## Pendiente de integración

El siguiente bloque deberá definir con la interfaz cuándo comienza y termina una sesión real y registrar snapshots curriculares al aplicar una acción. Hasta entonces, las reglas quedan preparadas pero el motor permanece aislado y no altera cristales, monedas, cofres, movimientos ni asistencia.
