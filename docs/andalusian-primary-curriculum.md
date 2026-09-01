# Currículo oficial de Educación Primaria de Andalucía

CristalClass incluye paquetes estáticos para 1.º a 6.º de Primaria. El uso de la
aplicación no descarga normativa ni depende de un servicio externo.

## Fuente única y verificación

- Norma: Orden de 30 de mayo de 2023.
- Publicación: BOJA núm. 104, de 2 de junio de 2023.
- Disposición: CVE `00284747`.
- PDF oficial autenticado: `BOJA23-104-00208-9731-01_00284747.pdf`.
- Páginas del PDF: `208`.
- SHA-256 exigido por ambos extractores:
  `3ace14f41e8ff7a8aa509049291afc506982fca41ce848e9e2daac08c1ce927e`.

Los scripts abortan antes de generar datos si cambia el hash o el número de
páginas. Los ficheros TypeScript generados se versionan con la aplicación.

## Cobertura extraída

| Área | Competencias | Criterios por curso | Saberes por ciclo | Relaciones |
|---|---:|---|---|---:|
| Conocimiento del Medio (`CMN`) | 9 | 22, 22, 22, 22, 23, 23 | 44, 48, 49 | 436 |
| Educación Artística (`EAR`) | 4 | 10, 10, 10, 10, 11, 11 | 27, 34, 36 | 466 |
| Educación Física (`EFI`) | 5 | 14 en cada curso | 26, 27, 29 | 240 |
| Lengua Castellana (`LCL`) | 10 | 22 en cada curso | 28, 30, 32 | 346 |
| Lengua Extranjera (`LEX`) | 6 | 13, 13, 15, 15, 15, 15 | 16, 22, 24 | 286 |
| Matemáticas (`MAT`) | 8 | 17, 17, 16, 17, 17, 17 | 56, 68, 69 | 410 |
| Valores Cívicos y Éticos (`VCE`) | 4 | 13 en 6.º | 25 en tercer ciclo | 31 |

Cada criterio conserva su competencia específica y cada saber conserva
exactamente las relaciones publicadas en la tabla del curso.

## Aplicabilidad por curso

- 1.º a 4.º: Lengua, Matemáticas, Conocimiento del Medio, Educación Física,
  Primera Lengua Extranjera y Educación Artística.
- 5.º: se añade Segunda Lengua Extranjera.
- 6.º: se añaden Segunda Lengua Extranjera y Valores Cívicos y Éticos.

La Orden dispone que, en un centro ordinario, Segunda Lengua Extranjera parte de
los elementos del primer ciclo de Primera Lengua Extranjera. Por ello 5.º usa la
columna `a` y 6.º la columna `b` de ese primer ciclo. El generador también admite
el modo `plurilingual`, que usa los elementos del ciclo correspondiente, sin
añadir una pregunta al recorrido inicial.

Educación Artística es una sola área oficial. CristalClass mantiene esa única
identidad curricular y permite relacionarla con los contextos diarios separados
de Música y Plástica.

Religión no se extrae de esta disposición porque posee un currículo aprobado en
otra fuente normativa. Atención Educativa no aparece en el Anexo II como un área
con una tabla equivalente de competencias, criterios y saberes. Ambos contextos
operativos existen en la aplicación, pero esta fuente no les asigna relaciones
curriculares inventadas.

## Anomalías oficiales tratadas

La transcripción no corrige textos pedagógicos. Solo se resuelven dos omisiones
de puntuación necesarias para unir identidades publicadas de Lengua Extranjera:

- `LEX.1.B1` se resuelve como `LEX.1.B.1`.
- `LEX.3.A10` se resuelve como `LEX.3.A.10`.

El origen y la identidad resuelta quedan incluidos en los datos generados y en
las comprobaciones deterministas.

El criterio `VCE 4.1` cruza un salto de página después de `emocio-`. El extractor
une literalmente la continuación de la misma celda oficial y una prueba fija su
final completo. De este modo la aplicación no publica como texto normativo una
frase truncada por la geometría del PDF.

La tabla de Matemáticas no publica `2.3.a` para 3.º, aunque sí publica `2.3.b`
para 4.º. CristalClass conserva esa asimetría. Tampoco inventa relaciones para
los cuatro saberes que aparecen en el catálogo pero no en ninguna relación de
las tablas:

- `MAT.2.A.2.6`.
- `MAT.2.F.2.7`.
- `MAT.3.A.4.4`.
- `MAT.3.C.2.2`.

Se guardan con cero relaciones y se muestran como aviso, no como error de
integridad ni como evidencia automática.

## Propuestas observables activadas por defecto

Al preparar un curso se seleccionan todas sus áreas oficiales. Las acciones son
propuestas editables de CristalClass: no se presentan como texto normativo y su
identidad estable no cambia cuando el docente modifica su nombre, icono o valor.

El seguimiento ordinario por ausencia de incidencias se limita a relaciones
directas que pueden observarse durante el uso habitual:

- Lengua: turnos de palabra y atención durante intervenciones.
- Matemáticas: perseverancia ante una dificultad.
- Educación Física: respeto de una regla de juego acordada.
- Primera Lengua Extranjera: turnos durante una interacción.
- Segunda Lengua Extranjera, cuando corresponde: turnos durante una interacción.

No se fija un número de días supuestamente científico. Desde la primera sesión
válida se ofrece una nota provisional con el número real de sesiones y avisos de
cobertura parcial. La ausencia de una incidencia informa únicamente del aspecto
observable indicado, nunca del criterio completo.

Las siguientes observaciones requieren que exista una actividad o situación y
por eso se registran manualmente: seguridad en experimentos, acuerdos dialogados
en Conocimiento del Medio, resolución de conflictos, trabajo cooperativo,
producciones artísticas y actuaciones de Valores. Una clase sin pulsaciones no
se convierte en una oportunidad inventada.

`Toca la flauta sin permiso` y `Usa los materiales artísticos sin permiso` se
incluyen como conductas de gestión diaria. No reciben relación curricular por el
mero hecho de ocurrir en Música o Plástica.

## Regeneración

```bash
python3 scripts/extractAndalusianLanguageCurriculum.py \
  /ruta/al/PDF-oficial.pdf \
  app/data/andalusianLanguageCurriculum.generated.ts

python3 scripts/extractAndalusianPrimaryCurriculum.py \
  /ruta/al/PDF-oficial.pdf \
  app/data/andalusianPrimaryCurriculum.generated.ts
```

Después se ejecutan `npm run check:deterministic`, `npm run typecheck` y la
compilación de producción. Las pruebas fijan el hash del PDF, las huellas de los
catálogos generados, los conteos, los códigos, las relaciones, la aplicabilidad
por curso y la validez del intercambio JSON.
