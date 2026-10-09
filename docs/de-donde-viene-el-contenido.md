# ¿De dónde viene el contenido del sitio de prueba?

*Actualizado: 9 de octubre de 2026*

## Las noticias
- Vienen del **archivo de exportación de WordPress** que está en la carpeta de NotiCel
  (`noticel-laverdadcomoes-…WordPress.2026-10-03.xml`), una copia parcial de noticel.com guardada el 3 de octubre de 2026.
- Se copiaron **269 noticias reales** con su titular, texto, autor, fecha, secciones, vistas y texto de la notificación de la app.
  Están guardadas como archivos en `src/content/noticias/`.
- El archivo solo cubre **agosto y septiembre de 2026**: la noticia más reciente es del 30 de septiembre.
- **No se actualiza solo:** lo que se publica hoy en noticel.com no aparece todavía.
- **Fotos:** todavía se cargan del servidor de fotos actual de noticel.com (cdn.noticel.com, en AWS).

## El resto del sitio
| Parte | De dónde viene |
|---|---|
| Barra de mercados (Popular, FirstBank, petróleo…) | Precios reales de Yahoo Finance, cada vez que se construye el sitio |
| Videos | Videos reales del canal de YouTube de NotiCel (y del BSN) |
| En vivo | Transmisiones reales de YouTube: NotiCel primero, luego Senado, Cámara, Gobierno… |
| Marcadores deportivos y lotería | Ejemplos marcados **DEMO** (todavía no son reales) |
| Columnistas | Los columnistas reales de NotiCel, sacados del archivo de WordPress |

## Lo próximo
- **Copiar el archivo completo** (228,916 noticias) desde noticel.com y seguir buscando las nuevas,
  para que todo lo que se publique en WordPress aparezca en el sitio nuevo hasta el día del cambio.
- Después del cambio, la redacción publica directo desde el **panel de la redacción** del sitio nuevo.
