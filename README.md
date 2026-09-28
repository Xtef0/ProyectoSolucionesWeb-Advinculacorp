# SJL 3D: territorio y comunidad

Prototipo local del observatorio ciudadano para el corredor Fernando Wiesse y
Canto Grande, San Juan de Lurigancho, Lima. Mantiene los perfiles de Ciudadano,
Tecnico de Zona y Administrador Municipal, asociados a la gestion de incidencias.

## Abrir

En Windows, hacer doble clic en `abrir-sjl.cmd`. Reutiliza el servidor existente
o lo inicia en segundo plano y abre el navegador. Necesita Python 3 (tambien
reconoce el runtime local de Codex cuando esta disponible).

Desde esta carpeta, con Python 3 instalado:

```powershell
python -m http.server 8090 --bind 127.0.0.1
```

Abrir http://127.0.0.1:8090/ en Edge o Chrome con WebGL habilitado.
No se debe abrir index.html con file://: los datos geograficos se cargan con fetch.
Todas las dependencias y los datos de visualizacion estan incluidos localmente.
Cerrar el proceso del servidor impide nuevas cargas; no borra los reportes.

## Que cambio

- Reemplazo del escenario conceptual de una calle por una escena georreferenciada.
- Trazas reales OSM de Wiesse y Canto Grande; aproximadamente 10.4 km de extension
  norte-sur de las avenidas encontradas, con barrios adyacentes como contexto.
- 17 149 segmentos de vias, 5 044 huellas de edificios y 2 149 areas cartografiadas.
- 4 913 manzanas derivadas de la red vial y 73 588 volumenes **estimados**, separados
  en una capa que se puede desactivar. No son viviendas levantadas o verificadas.
- Relieve real remuestreado, fachadas, azoteas, tanques y vegetacion interpretada.
  Fachadas y alturas faltantes son sintesis.
- Metro Linea 1 sobre su traza OSM de `railway=subway`: 8.19 km de viaducto,
  incluyendo extensiones para el cambio de sentido en ambos extremos del tramo.
  Siete estaciones: Bayovar, Santa Rosa, San Martin, San Carlos, Los Postes,
  Los Jardines y Piramide del Sol, en ese orden.
- Estaciones elevadas con andenes, cubiertas curvas translucidas, pilares,
  escaleras, ascensores y senaletica verde. Cuatro trenes de seis coches en
  movimiento continuo, con cambios de sentido, velocidades variables y pausa.
- Buses urbanos con ruedas, ventanas, puertas, espejos y letrero Wiesse-SJL;
  autos, taxis y SUV. Peatones en andenes, veredas y paraderos, incluidas
  personas con silla de ruedas y baston.
- Busqueda por nombres OSM, estaciones, minimapa, orbita, zoom, norte, vista de todo
  el corredor, recorrido aereo, pantalla completa y exportacion de imagen.
- Reportes posicionados por clic sobre el terreno, con coordenadas, filtros,
  historial de estados y exportacion JSON.

## Uso del mapa

Arrastrar con el boton izquierdo orbita. Con el derecho se desplaza la vista.
La rueda acerca o aleja. En tactil: un dedo orbita; dos dedos desplazan/acercan.
El minimapa permite elegir una zona; tambien admite las flechas del teclado
cuando tiene el foco. El recorrido aereo se pausa al interactuar con el mapa.
Para reportar, pulsar el boton + y seleccionar un punto dentro de la cartografia.

El selector L1 centra cualquiera de las siete estaciones. La vista inicial es
San Carlos. "Seguir tren" acompana un convoy y el boton de siguiente cambia
entre los cuatro. La pausa afecta solo a los trenes. Manipular la camara o
iniciar un reporte cancela el seguimiento. La capa Metro L1 oculta viaducto,
estaciones, trenes y sus etiquetas; no elimina reportes.

## Persistencia y limites

Esta version **no tiene autenticacion real ni conexion a MySQL**. El selector de
perfil permite demostrar el flujo, pero no implementa permisos de servidor.
Los datos se guardan en localStorage, clave `sjl3d-geographic-reports-v2`, con todo
el historial. Cambiar de navegador, de puerto o de hostname crea otro origen y,
por tanto, otro almacenamiento. Limpiar datos del navegador elimina estos registros.
Los cinco reportes iniciales son ficticios y se identifican como tales.

Los reportes locales del prototipo anterior se conservan: su clave original
`sjl3d-reports` no se modifica y se migran al nuevo esquema al primer uso. Como
sus coordenadas pertenecian a una escena ficticia, se reubican aproximadamente
en la avenida nombrada y se identifican como ubicacion aproximada.

La interfaz usa HTML, CSS y Bootstrap; Three.js realiza la visualizacion.
La implementacion de Servlets, JSP, JavaBeans, sesiones y persistencia MySQL
pertenece a una fase posterior. Este prototipo por si solo no completa esa parte
de la rubrica academica. No es una plataforma municipal operativa ni un sistema
para recibir emergencias. No se ha validado realidad virtual con un visor.

No se garantiza 60 FPS: el rendimiento depende del equipo, su GPU, resolucion y
navegador. Hay geometria agrupada e instancias por sectores; las sombras se
calculan una sola vez y se regeneran al cambiar las capas de edificios o Metro.
Vehiculos y personas se instancian y se muestran solo cerca de la camara;
las estructuras del Metro comparten geometria y materiales.

## Fuentes, licencias y precision

1. Cartografia: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
   [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
   `data/sjl-geography.json`, `data/sjl-massing.json` y `data/sjl-metro.json` son bases derivadas OSM y se
   distribuyen bajo ODbL 1.0. La fecha del extracto figura en `source.timestamp`.
   Las respuestas originales se incluyen en `data/source/features-*.json` y
   `data/source/avenues.json` y `data/source/metro-subway.json`.
   No se supone cobertura completa del distrito.
2. Relieve: [Mapzen / AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/),
   formato Terrarium. Datos globales SRTM y GMTED2010 cortesia de USGS; ETOPO1 de
   NOAA, segun la composicion original. Ver las
   [atribuciones originales](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
   Los mosaicos originales estan en `data/source/terrarium-*.png`; se remuestrean
   a una malla de 221 x 301 puntos, sin exageracion vertical. Se resta 100 m al
   datum de renderizado para mantener coordenadas numericas locales.
3. Tres dimensiones: Three.js 0.166.1, OrbitControls y RoundedBoxGeometry, licencia MIT.
4. Iconos: Lucide 0.468.0, licencias ISC/MIT incluidas por su distribucion.
5. Interfaz: Bootstrap 5.3.3, licencia MIT. Licencias incluidas en `vendor/`.

Los edificios OSM usan `height` o `building:levels` cuando existen; en los demas
casos la altura se estima. Los volumenes de contexto se generan solo dentro de
manzanas cerradas de la red vial, excluyendo huellas conocidas, parques, canchas
y otras areas abiertas. No son datos catastrales. No se utilizan imagenes del
video de referencia, modelos de videojuegos, fotogrametria ni imagenes satelitales.

El orden y nombres del Metro se contrastan con la
[lista oficial de estaciones de Linea 1](https://www.lineauno.pe/horarios/).
El alcance solicitado termina en Piramide del Sol; no incluye todas las
estaciones de la linea ni afirma cubrir todas las del distrito. Las dimensiones
de viaducto y estaciones, sus detalles, paraderos y recorridos peatonales son
interpretaciones visuales, no planos de ingenieria ni un inventario verificado.
Trenes, personas y trafico son una simulacion local, no datos en tiempo real.
Los trenes aminoran al pasar por estaciones; no simulan un horario comercial,
embarque ni aperturas de puertas. Los autos no son una simulacion vial certificada.

## Archivos principales

- `index.html`: interfaz, controles, formularios y perfiles.
- `styles.css`: estilos responsivos.
- `app.js`: incidencias, migracion y guardado local, busqueda y acciones por perfil.
- `scene.js`: terreno, geometria, instancias, camaras, minimapa y coordenadas.
- `metro.js`: viaducto, estaciones, trenes y seguimiento de camara.
- `mobility.js`: buses, autos, personas y zonas peatonales de las estaciones.
- `data/`: instantaneas geograficas listas para usar.
- `tools/fetch_geography.py`: extraccion OSM por sectores y relieve.
- `tools/build_massing.py`: volumen estimado con Shapely 2.1.2.
- `tools/fetch_metro.py`: extraccion de la via principal con NetworkX 3.4.2.
- `tools/vendor.py`: descarga de dependencias fijadas y licencias.
- `tools/verify.cjs`: pruebas aisladas con Playwright; no altera el almacenamiento
  del navegador del usuario. `qa/` contiene capturas y resultados.
- `tools/verify-metro.cjs`: recorrido, estaciones, animacion, capas, movilidad,
  seguimiento y vistas moviles. `tools/image_checks.py` comprueba los pixeles.

## Regenerar datos (opcional)

Los datos ya estan generados. Para obtenerlos de nuevo se necesita internet,
Python, Pillow, Shapely y NetworkX. No eliminar caches sin necesidad: Overpass es un
servicio publico compartido. La extraccion reanuda por sectores.

```powershell
python tools/fetch_geography.py --stage all
python -m pip install --target tools/.deps --no-deps shapely==2.1.2
python tools/build_massing.py
python -m pip install --target tools/.deps --no-deps networkx==3.4.2
python tools/fetch_metro.py
python tools/vendor.py
```

Shapely tambien necesita NumPy. Las dependencias de construccion en tools/.deps
no son necesarias para abrir el visor ni forman parte de su carga de navegador.
