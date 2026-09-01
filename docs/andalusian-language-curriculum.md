# Currículo oficial de Lengua de Andalucía

## Alcance

CristalClass incluye localmente los seis paquetes de Lengua Castellana y Literatura de Educación Primaria para Andalucía. Cada curso conserva:

- las diez competencias específicas, en orden pedagógico;
- sus veintidós criterios de evaluación;
- todos los saberes básicos del ciclo correspondiente;
- las relaciones criterio-saber de la columna oficial de ese curso.

Los paquetes se incluyen en la aplicación y no necesitan red durante el uso. El asistente permite cargarlos mediante `Andalucía · Lengua oficial → curso → Cargar Lengua completa`. Un borrador existente nunca se sobrescribe con esta operación.

## Fuente única y autenticidad

- Orden de 30 de mayo de 2023.
- BOJA número 104, de 2 de junio de 2023.
- Anexo II, PDF páginas 93-118 para Lengua.
- Código de Verificación Electrónico: `00284747`.
- PDF oficial: `https://www.juntadeandalucia.es/eboja/2023/104/BOJA23-104-00208-9731-01_00284747.pdf`.
- Verificación: `https://www.juntadeandalucia.es/eboja/2023/104/39-verificacion`.
- SHA-256 completo: `3ace14f41e8ff7a8aa509049291afc506982fca41ce848e9e2daac08c1ce927e`.

No se utilizaron blogs, editoriales, programaciones de centros ni resúmenes como fuente de datos.

## Extracción reproducible

El script `scripts/extractAndalusianLanguageCurriculum.py` exige el checksum y las 208 páginas exactas antes de leer el documento. Extrae las tablas por sus líneas y columnas con `pdfplumber`, recompone las continuaciones de página y bloquea la generación si no obtiene exactamente:

- 10 competencias;
- 22 criterios por curso, 132 en total;
- 28 saberes de primer ciclo, 30 de segundo y 32 de tercero;
- 346 relaciones criterio-saber al contar las seis columnas de curso;
- 90 códigos de saber distintos, todos relacionados al menos una vez.

Regeneración de desarrollo:

```bash
python scripts/extractAndalusianLanguageCurriculum.py \
  /ruta/BOJA23-104-00208-9731-01_00284747.pdf \
  app/data/andalusianLanguageCurriculum.generated.ts
```

El archivo generado no se edita manualmente. El servicio construye seis paquetes portables de esquema v2 y las comprobaciones deterministas validan identidad, orden, conteos, relaciones, códigos, referencias cruzadas, huella completa y compatibilidad con el importador estricto.

## Fidelidad literal

Los textos se normalizan únicamente para eliminar saltos de línea y guiones introducidos por la maquetación al partir una palabra. No se corrige ni moderniza la redacción oficial.

Por ese motivo se conservan dos anomalías tipográficas que aparecen en el PDF autenticado:

- `LCL.2.C.8`: termina una expresión con `andaluza..`.
- `LCL.3.C.9`: contiene `literatura popular andaluzar`.

Corregirlas en el catálogo haría que CristalClass dejase de reproducir literalmente la fuente. En la interfaz podrán señalarse como erratas de origen, sin modificar el texto oficial.

## Límite de este bloque

La incorporación del catálogo no crea por sí sola evidencias ni notas. Las acciones observables de CristalClass y las reglas de seguimiento ordinario deben quedar vinculadas de manera explícita y revisable. Esto impide que una acción genérica afecte a todos los criterios relacionados con un saber por simple pertenencia al área.
