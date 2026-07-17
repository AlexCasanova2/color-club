# App de Retos de Color con Amigos — Spec de Desarrollo

## 1. Concepto

App social donde grupos cerrados de amigos ("clubs") compiten en retos fotográficos temáticos por color. Cada reto asigna un color (aleatorio o compartido) y los participantes deben subir un collage de 6 fotos con ese color predominante. Al cerrar el plazo, los miembros votan los collages ajenos y se genera un ranking. Los clubs acumulan puntuación histórica organizada en "temporadas".

**Motor de viralidad:** la app no tiene valor en solitario — requiere invitar amigos para crear o unirse a un club. El resultado (collage + ranking) está diseñado para compartirse fuera de la app (stories, chats de grupo).

**Stack:** React Native (frontend) + Supabase (Auth, Postgres, Storage, Realtime, Edge Functions).

---

## 2. Game Design (cerrado, no reabrir sin discutirlo)

### 2.1 Clubs
- Un club es un grupo persistente de amigos, no un evento puntual.
- Tiene un admin (el creador, ampliable a multi-admin en el futuro, no en v1).
- Los retos se lanzan dentro de un club, y el club acumula un ranking histórico por temporadas.

### 2.2 Temporadas
- Un club vive en una "temporada" activa en todo momento.
- Reset automático mensual opcional (configurable por el admin al crear el club o desde ajustes).
- El ranking acumulado se calcula por temporada; hay un histórico de temporadas pasadas consultable ("salón de la fama" del club).

### 2.3 Retos
Configurados por el admin vía wizard antes de lanzarse. Parámetros:
- **Modo:**
  - **Individual random:** cada participante gira una "ruleta" y recibe un color distinto asignado por la app.
  - **Color compartido:** todos los participantes compiten con el mismo color.
- **Duración:** presets (24h / 48h / 1 semana), no texto libre.
- **Nº de fotos del collage:** fijo en 6 para v1 (no configurable, para simplificar el layout).
- **Fecha/hora de inicio:** inmediato o programado.
- **Apertura de votación:** automática al cerrar el plazo (v1). No hay opción manual en v1.

### 2.4 Reglas de validación de color
- **No hay validación automática de color en las fotos.** Si a alguien le toca azul y sube fotos con lila predominante, es su problema — simplemente no recibirá votos. Cero lógica de visión artificial en v1.

### 2.5 Subida de fotos
- Collage de 6 fotos, cámara o galería.
- El propio usuario marca su collage como "enviado/final" cuando ha terminado.
- Una vez marcado como enviado, no se puede editar (a definir si se permite editar antes del cierre del plazo — asumir que SÍ se puede re-subir hasta que el usuario lo marque como definitivo o hasta que cierre el plazo).

### 2.6 Descalificación
- Si un participante no sube y marca su collage completo antes de que cierre el plazo, queda **descalificado**.
- El descalificado **permanece visible** en la fase de votación y resultados con una etiqueta tipo "❌ no completó" (no desaparece del reto). No entra en el ranking de puntos de ese reto ni puede votar.

### 2.7 Votación
- Fase de votación se abre automáticamente al cerrar el plazo del reto (o cuando todos los no descalificados han enviado, lo que ocurra antes).
- Cada participante ve los collages de los demás (excepto el suyo propio) y vota.
- **No puedes votarte a ti mismo** (bloqueo a nivel de lógica de negocio, no solo de UI).
- El voto **no es anónimo**: cada usuario puede ver quién le ha votado a él.
- v1: un voto por usuario por reto (a un único collage ganador). No hay sistema de puntuación ponderada por posición.

### 2.8 Puntuación y ranking
- **Sistema de puntos v1:** 1 voto recibido = 1 punto. Ranking de temporada = suma de puntos de todos los retos de esa temporada.
- **Empates: opción 4 — empate literal.** Dos usuarios con los mismos puntos comparten posición en el ranking (ej. dos "segundos puestos", se salta el tercero). No hay desempate automático en v1.
- **v2 (no construir aún, dejar preparado el modelo de datos si es fácil):** cuando hay empate en el top del ranking de una temporada, se lanza una mini-votación de desempate entre los usuarios empatados, exclusiva para el club.

---

## 3. Modelo de datos (Supabase / Postgres)

Diseño conceptual — nombres de tabla y columnas son propuesta, ajustables en implementación:

### `users`
Gestionado por Supabase Auth + tabla de perfil extendida:
- `id` (uuid, FK a auth.users)
- `display_name`
- `avatar_url`
- `created_at`

### `clubs`
- `id`
- `name`
- `photo_url`
- `admin_id` (FK a users)
- `season_reset_mode` (enum: `manual`, `monthly_auto`)
- `created_at`

### `club_members`
- `id`
- `club_id` (FK)
- `user_id` (FK)
- `status` (enum: `active`, `left`)
- `joined_at`

### `seasons`
- `id`
- `club_id` (FK)
- `starts_at`
- `ends_at` (nullable si sigue activa)
- `is_active` (bool)

### `challenges` (retos)
- `id`
- `club_id` (FK)
- `season_id` (FK)
- `mode` (enum: `individual_random`, `shared_color`)
- `shared_color` (nullable, solo si mode = shared_color)
- `duration_preset` (enum: `24h`, `48h`, `1week`)
- `starts_at`
- `ends_at`
- `status` (enum: `configuring`, `active`, `voting`, `closed`)
- `created_by` (FK a users, el admin)
- `created_at`

### `challenge_participants`
- `id`
- `challenge_id` (FK)
- `user_id` (FK)
- `assigned_color` (nullable si mode = shared_color, se usa el de challenges)
- `status` (enum: `pending`, `submitted`, `disqualified`)
- `submitted_at`

### `photos`
- `id`
- `participant_id` (FK a challenge_participants)
- `photo_url` (Supabase Storage)
- `slot_order` (1–6)
- `created_at`

### `votes`
- `id`
- `challenge_id` (FK, redundante pero útil para queries e índices)
- `voter_id` (FK a users)
- `voted_participant_id` (FK a challenge_participants)
- `created_at`
- **Constraint:** único por (`challenge_id`, `voter_id`) → un voto por usuario por reto
- **Validación de negocio:** `voter_id` ≠ `user_id` del `voted_participant_id` referenciado (no auto-voto)

### Vistas calculadas (no tablas persistidas)
- **`season_ranking`**: suma de votos recibidos agrupados por `user_id` + `season_id`, uniendo `votes` → `challenge_participants` → `challenges`. Se calcula on-demand o vía vista materializada si el club crece.

---

## 4. Row Level Security (RLS) — crítico, diseñar desde el inicio

- Un usuario solo puede leer `challenges`, `challenge_participants`, `photos` de clubs donde es miembro activo (`club_members.status = active`).
- **Las fotos de un reto no deben ser visibles para otros participantes hasta que el reto entra en estado `voting`.** Esto debe aplicarse a nivel de política RLS en Supabase, no solo ocultarse en el cliente — de lo contrario cualquiera con la URL o acceso a la API puede leer las fotos antes de tiempo.
- Un usuario no puede insertar un voto donde `voter_id` = dueño del `voted_participant_id`.
- Solo el `admin_id` del club puede crear/lanzar nuevos `challenges` en ese club.
- Un usuario solo puede modificar sus propias `photos` y su propio `challenge_participants` (marcar como enviado).

---

## 5. Edge Functions (lógica de servidor, Supabase Functions)

- **Cierre automático de retos:** job programado que revisa `challenges` con `ends_at` pasado y `status = active`, marca como `disqualified` a los participantes sin `status = submitted`, y cambia el reto a `status = voting`.
- **Cierre de votación:** tras un periodo de votación (a definir duración, ej. igual a la duración del reto o un fijo de 24h), cambia `status` a `closed` y congela el ranking del reto.
- **Reset automático de temporada:** si `season_reset_mode = monthly_auto`, cierra la `season` activa y crea una nueva al pasar el mes.

---

## 6. Realtime (Supabase Realtime)

- Pantalla "esperando al resto" (durante un reto activo): suscripción a cambios en `challenge_participants` del reto actual para mostrar en vivo quién ha subido su collage.
- Opcional v1.5: notificar en vivo cuando entran nuevos votos en la fase de votación (sin revelar el ranking hasta el cierre, si se decide mantener el suspense).

---

## 7. Flujo de pantallas (React Native)

1. **Auth** — login/signup vía Supabase Auth (email o magic link).
2. **Home / Mis clubs** — lista de clubs del usuario + crear/unirse a club.
3. **Detalle de club** — ranking de temporada activa, reto en curso (si hay) con countdown, botón "nuevo reto" (solo visible para admin).
4. **Wizard de nuevo reto** (solo admin) — modo, duración, confirmar y lanzar.
5. **Pantalla de "tu reto"** — color asignado (animación de ruleta si es modo random), countdown, acceso a subir fotos.
6. **Subida de collage** — 6 slots de foto (cámara/galería), marcar como enviado.
7. **Esperando al resto** — estado en vivo (Realtime) de quién ha subido y quién no.
8. **Votación** — grid/swipe de collages ajenos (excluye el propio y los descalificados quedan marcados pero no votables), un voto por usuario.
9. **Resultados del reto** — collage(s) ganador(es), posiciones, quién votó a cada uno (no anónimo).
10. **Ranking de temporada** — acumulado del club actual + histórico de temporadas pasadas.

---

## 8. Fuera de alcance para v1 (explícitamente pospuesto)

- Validación automática de color dominante en fotos (IA/Vision).
- Multi-admin por club.
- Votación de desempate para el top del ranking (diseñar el modelo de datos pensando en ello, pero no implementar la feature).
- Edición de collage después de marcarlo como enviado.
- Notificaciones push de reactivación / marketing (aunque si hay tiempo, las push básicas de "te toca subir fotos" / "ya puedes votar" / "resultados listos" sí son v1).

---

## 9. Notas para la IA de programación

- Priorizar Supabase Auth + RLS desde el primer commit; no dejar la seguridad para el final.
- El sistema de puntos y ranking debe ser una vista/query calculada, nunca un campo que se actualiza manualmente y puede desincronizarse.
- El bloqueo de auto-voto y de voto duplicado debe reforzarse tanto en el cliente (UX) como en la base de datos (constraint/policy), nunca solo en el cliente.
- Empezar por el modo `shared_color`, ya que simplifica el modelo de `challenge_participants` (no hay que gestionar `assigned_color` por participante) y permite validar el loop completo del juego antes de añadir la ruleta de color individual.
