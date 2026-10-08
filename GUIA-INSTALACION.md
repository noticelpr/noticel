# NotiCel 2026 — Guía de instalación para el equipo técnico

Este es un tema nuevo de WordPress para noticel.com. **Solo cambia el diseño.** No cambia artículos, categorías, usuarios, URLs ni la base de datos.

**Importante:** instálenlo primero en un sitio de **staging**, nunca directo en producción.

---

## 1. Antes de activar: revisar el tema actual

El tema actual (`noticel`) puede tener funciones que **no son de diseño**. Si se cambia de tema sin moverlas, dejarían de funcionar. Revisen el `functions.php` y los archivos incluidos del tema actual para buscar:

| Revisar si el tema actual… | Campo / indicio | Qué hacer |
|---|---|---|
| Envía **notificaciones push** a la app | `_send_notification`, `_notification_title`, `_notification_body`, `_send_notification_image` | Mover ese código a un plugin (mu-plugin) antes del cambio |
| Registra **campos ACF** (top stories, galería, PDF, preview) | `field_68b066fddd569`, carpeta `acf-json`, `acf_add_local_field_group` | Exportar los grupos de campos a ACF (JSON) o a un plugin |
| Registra **rutas REST** o modifica la API que usa la **app Flutter** | `register_rest_route`, `rest_prepare_post`, `register_rest_field` | Mover a un plugin. **La app depende de esto** |
| Genera **audio (TTS)** de los artículos | `_tts_audio_error` | Mover a un plugin |
| Cuenta las vistas | `post_views_count` | Si un plugin ya las cuenta, desactiven el contador de este tema (ver punto 4) |
| Registra **tipos de contenido o taxonomías** propios | `register_post_type`, `register_taxonomy` (ej. `following_users`, `ef_editorial_meta`) | Mover a un plugin |
| Inserta **anuncios** o códigos (Ad Manager, AdSense, Funding Choices) | `googletag`, `adsbygoogle`, `fundingchoices` | Colocarlos en los widgets del tema nuevo o en Advanced Ads |

Regla general: **todo lo que no sea diseño debe vivir en un plugin**, para que cualquier tema funcione.

## 2. Qué lee este tema (ya existe en el sitio)

- `is_post_top_stories` = 1: noticias destacadas en la portada (la más reciente va arriba)
- `post_views_count`: "Lo más leído" (últimos 7 días)
- `preview_content`: sumario debajo del titular
- `_cdn_thumb_url`: imagen si el artículo no tiene imagen destacada
- `pdf_url`, `pdf_title`: botón de documento PDF
- `article_gallery`: galería (si ACF está activo)
- Categorías por *slug*: `ultima-hora`, `opiniones`, `gobierno`, `deportes`, `mundo`, `policiacas`, `el-tiempo`, `entretenimiento`

## 3. Compatibilidad con plugins

El tema usa los ganchos estándar (`wp_head`, `wp_footer`, `wp_body_open`, `title-tag`, `get_search_form`), así que siguen funcionando:

- **All in One SEO**: títulos, descripciones, Open Graph
- **MonsterInsights / Google Tag Manager**
- **Advanced Ads**: colocar anuncios en los 4 widgets del tema
- **TranslatePress**: selector de idioma en la barra superior y en el pie (shortcode `[language-switcher]`)
- **ElasticPress**: búsqueda estándar de WordPress (`?s=`)
- **LiteSpeed Cache**: compatible. El contador de vistas usa AJAX para funcionar con caché

## 4. Instalación (en staging)

1. **Apariencia → Temas → Añadir nuevo → Subir tema** y subir `noticel-2026.zip`.
2. Activar el tema.
3. **Apariencia → Menús**: crear el menú y asignarlo a **Menú principal**: Noticias, Economía, Opiniones, Deportes, Entretenimiento, Vida y Bienestar, El Tiempo. Si no hay menú asignado, el tema muestra esas secciones automáticamente. Opcional: **Menú del pie** y **Barra superior**.
4. **Apariencia → Widgets**: colocar los anuncios en:
   - Barra lateral (artículos y secciones)
   - Portada: anuncio junto a "Lo último"
   - Portada: anuncio entre secciones
   - Artículo: después del texto
5. Si otro código ya cuenta `post_views_count`, añadir en un plugin:
   `add_filter( 'nc_count_views', '__return_false' );`
6. Purgar la caché de LiteSpeed y la del CDN.

## 5. Lista de pruebas en staging

- [ ] Portada: destacadas, Lo último, Lo más leído, Última Hora, Opiniones, secciones
- [ ] Un artículo con imagen, uno con PDF y uno con galería
- [ ] Categorías, etiquetas y paginación
- [ ] Búsqueda (ElasticPress)
- [ ] Versión en inglés (TranslatePress)
- [ ] Anuncios visibles y mensaje de consentimiento (Funding Choices)
- [ ] Google Analytics recibe visitas
- [ ] **App Flutter**: abre artículos y recibe notificaciones push enviadas desde staging
- [ ] Vista en celular
- [ ] Sin errores en el registro de PHP (`WP_DEBUG_LOG`)

## 6. Salida a producción

1. Respaldo completo (archivos y base de datos).
2. Instalar y activar en un horario de poco tráfico.
3. Purgar las cachés.
4. **Plan de reversa:** si algo falla, volver a activar el tema `noticel` en Apariencia → Temas. Es inmediato y no se pierde nada.

---

### Archivos del tema

`style.css` (diseño), `functions.php` (configuración y ayudantes), `header.php`, `footer.php`, `front-page.php` (portada), `single.php` (artículo), `index.php` (categorías y archivos), `search.php`, `page.php`, `404.php`, `searchform.php`, `template-parts/` (tarjetas y barra lateral), `assets/` (logo y JavaScript).

Versión 1.0.0. Requiere WordPress 6.0+ y PHP 7.4+.
