# Color Club

Color Club es una app móvil social de retos fotográficos por color. Está construida con Expo, React Native y Supabase.

## Funcionalidades

- Autenticación con email y contraseña, registro y recuperación de contraseña.
- Clubs privados con código de invitación, amigos por `@username` o código público y solicitudes privadas.
- Invitaciones a club con aceptación explícita desde Actividad antes de añadir miembros.
- Retos de color con color fijo, color aleatorio compartido o color aleatorio individual por participante.
- Selector de duración y número de fotos por reto.
- Duraciones de 30 minutos, 2 horas, 6 horas, 24 horas, 48 horas o 1 semana, con collages de 2, 4, 6, 8, 10 o 12 fotos.
- CTA de lanzamiento con mantener pulsado, haptics y animación de progreso.
- Collage editable, envío definitivo, votación única y ranking por temporada.
- Reglas de participación para evitar entradas tardías a retos ya creados.
- Chat privado por club con Realtime, avatares y composer adaptado al teclado.
- Perfil editable con foto, bio, color favorito, estado, color de avatar y nombre de ranking.
- Perfil público seguro con acciones de amistad contextuales.
- Preview de búsqueda de usuarios discoverable antes de enviar solicitudes de amistad.
- Estadísticas públicas de usuario para participaciones, collages, victorias, rankings, temporadas y votos.
- Base preparada para logros desbloqueables a partir de estadísticas derivadas.
- Notificaciones in-app para retos, solicitudes de amistad, invitaciones a club, resumen semanal y reactivación.
- Eventos de actividad de retos: inicio, collage enviado por otro miembro, votación abierta, resultado disponible y recordatorio de plazo.
- Notificaciones push mediante Expo Push Notifications y Supabase Edge Functions.
- Navegación con dock flotante, header tipo Dynamic Island y transiciones entre rutas.
- Toasts reutilizables con barra de progreso que completa el ancho real del contenedor.
- Esquema PostgreSQL con RLS, Storage privado, funciones transaccionales y Realtime.
- Onboarding persistido, caché de lectura, reintentos, avisos offline y borradores locales de fotografía.
- Desbloqueo opcional con Face ID en iOS y borrado de la cuenta desde la app.
- Gestión de club con roles, permisos de creación de retos, invitaciones, chat, regeneración del código y transferencia o borrado del club.

## Arquitectura Actual

- `App.tsx`: sesión, navegación manual y composición de las pantallas. No hay router ni URLs web.
- `src/screens/`: 13 pantallas de producto.
- `src/lib/api.ts`: mayoría de operaciones de dominio; sesión, perfil, Storage y algunas suscripciones Realtime también acceden a Supabase directamente.
- `src/types/domain.ts`: contratos de dominio compartidos por el cliente.
- `src/components/`: primitivas visuales, dock, toast y componentes reutilizables.
- `supabase/migrations/`: esquema, RLS, RPC, triggers, Realtime y Storage.
- `supabase/functions/send-push-notification/`: única Edge Function; el avance de retos y temporadas se ejecuta con funciones PostgreSQL programables por Cron.

La navegación interna contempla Home, Actividad, Amigos, Cuenta, edición de perfil, club, chat, gestión, creación y detalle de reto, y perfil público. Al no existir un router, `npm run web` no proporcionaría todavía URLs, deep links ni restauración de ruta.

## Modelo Y Reglas Vigentes

Las entidades principales son `profiles`, `clubs`, `club_members`, `seasons`, `challenges`, `challenge_participants`, `photos`, `votes`, `friendships`, `club_invites`, `club_messages`, `notifications`, `push_tokens` y `user_activity`; `season_ranking` es una vista calculada.

- Cada club admite un máximo de 12 miembros activos.
- Los miembros pueden ser `member`, `moderator` o `admin`. `clubs.admin_id` identifica al propietario principal; el rol `admin` también puede asignarse a otros miembros.
- La creación de retos se controla con `challenge_creation_policy`: administradores, administradores y moderadores, o todos los miembros.
- Los retos comienzan inmediatamente desde el cliente actual. El backend acepta `begins_at`, pero aún no existe un selector de inicio programado en la interfaz.
- El envío del collage es definitivo. No se admite entrada tardía al reto.
- Cada participante elegible dispone de un voto, sin auto-voto. Si hay dos o menos collages enviados, el reto se cierra sin abrir una fase de votación.
- El histórico de temporadas existe en el modelo, pero el cliente actual solo muestra la temporada activa.

## Puesta En Marcha

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Ejecuta en orden todos los archivos de `supabase/migrations/` desde el SQL Editor o enlaza el proyecto con la CLI y usa `supabase db push`.
3. Crea `.env` a partir de `.env.example` con la URL y la clave anon del proyecto.
4. Ejecuta `npm install`.
5. Ejecuta `npm start`.

Para abrir iOS o Android usa `npm run ios` o `npm run android`. La cámara requiere un dispositivo físico; la galería funciona también en simulador.

Usa Node.js 22 para reproducir el entorno de CI.

### Variables De Entorno

Cliente Expo local y builds EAS:

```env
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_ANON
```

Configura las variables públicas también en el entorno correspondiente de EAS; el workflow de GitHub no las inyecta. Nunca uses `SUPABASE_SERVICE_ROLE_KEY` en el cliente.

Secrets de la Edge Function, configurados con `supabase secrets set` y no en el `.env` de Expo:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PUSH_WEBHOOK_SECRET
```

Secret de GitHub Actions:

```text
EXPO_TOKEN
```

## Supabase

Las migraciones configuran tablas, RLS, Storage, funciones RPC y Realtime para clubs, invitaciones, amistades, retos, fotos, votaciones, chat y notificaciones.

### Invitaciones A Club

`invite_user_to_club` crea una solicitud pendiente en `club_invites` y una notificación `club_invite`; no inserta directamente en `club_members`. El usuario invitado acepta o rechaza con `respond_club_invite` desde Actividad. Solo al aceptar se activa la membresía.

Las invitaciones respetan `clubs.invites_enabled` tanto al enviar como al aceptar.

### Perfiles Públicos

La pantalla de perfil público usa `getPublicProfile` y solo selecciona campos visibles: nombre, `@username`, avatar, bio, estado, color favorito y preferencia de nombre en ranking. No expone email, `friend_code` ni preferencias privadas.

Desde el perfil público se puede enviar solicitud de amistad, aceptar una solicitud entrante, ver una solicitud pendiente o quitar a alguien de amigos.

La búsqueda de amigos usa `search_public_profiles` para mostrar coincidencias limitadas sin devolver `friend_code` ni datos privados.

Las estadísticas públicas se leen con `get_user_stats`. Son derivadas de retos, votos, temporadas y rankings; no se guardan como contadores editables en cliente. Esto evita desincronización y deja una base estable para logros futuros.

### Push Notifications

La app registra tokens Expo en `push_tokens`. Para enviar push reales cuando se cree una notificación interna:

1. Aplica las migraciones con `supabase db push`.
2. Define un secret para el webhook: `supabase secrets set PUSH_WEBHOOK_SECRET=valor-largo-aleatorio`.
3. Despliega la función: `supabase functions deploy send-push-notification`.
4. En Supabase Dashboard crea un Database Webhook para `public.notifications` en evento `INSERT` apuntando a `https://TU-PROYECTO.supabase.co/functions/v1/send-push-notification`.
5. Añade el header `x-push-webhook-secret` con el mismo valor de `PUSH_WEBHOOK_SECRET`.

La función rechaza todas las peticiones si falta `PUSH_WEBHOOK_SECRET`; no despliegues el webhook sin configurar antes ese secret.

En iOS y Android las push requieren builds nativas de EAS; no funcionan como push reales dentro de Expo Go.

Los eventos de reto se insertan como notificaciones `challenge` con `dedupe_key` para evitar duplicados. `submit_collage`, `advance_challenge` y `advance_challenges` generan eventos automáticamente.

Activa o revisa Realtime para estas tablas si tu proyecto no lo habilita automáticamente desde las migraciones:

- `challenges`
- `challenge_participants`
- `club_messages`
- `notifications`

## Automatizaciones

La migración `202607280002_schedule_automation_jobs.sql` habilita `pg_cron` y configura los jobs necesarios. Los horarios se interpretan en UTC. La migración elimina primero cualquier job con el mismo nombre para que la configuración sea reproducible.

- `advance_challenges()` activa retos programados, descalifica collages incompletos, abre votaciones y cierra votaciones vencidas.
- `reset_monthly_seasons()` reinicia temporadas mensuales si se usa esa configuración.
- `create_weekly_summary_notifications()` genera notificaciones de resumen semanal para usuarios que tengan esa preferencia activa.
- `create_challenge_deadline_notifications()` genera recordatorios cuando quedan 2 horas para enviar el collage o para votar, solo si la acción sigue pendiente.
- `create_reengagement_notifications()` genera como máximo una reactivación cada 7 días para usuarios con push activadas que lleven varios días sin entrar y tengan contenido relevante; se ejecuta a las 18:00 UTC.

Después de aplicar las migraciones, comprueba los jobs con:

```sql
select jobname, schedule, active
from cron.job
order by jobname;
```

## Seguridad

El bucket `collages` es privado. Cada participante solo puede acceder a sus propias fotos durante el reto; los miembros activos del club obtienen acceso compartido al entrar en fase de votación.

El bucket `avatars` es público. No almacenes en él imágenes que requieran control de acceso.

Los votos se validan mediante trigger para impedir auto-votos, votos de descalificados y objetivos inválidos. Las tablas de chat, amistades, invitaciones, miembros y notificaciones también usan RLS para limitar lectura y escritura al usuario o club correspondiente.

Las estadísticas de perfil se exponen mediante RPC con comprobación de visibilidad (`can_view_public_profile`) antes de agregarlas.

## Scripts

- `npm start`: inicia Expo.
- `npm run ios`: abre Expo en iOS.
- `npm run android`: abre Expo en Android.
- `npm run web`: script reservado para Expo Web. El proyecto aún no declara `react-dom`, `react-native-web` ni `@expo/metro-runtime`, por lo que la web no está preparada para una instalación limpia.
- `npm test`: ejecuta los tests automatizados una vez con Vitest.
- `npm run typecheck`: ejecuta TypeScript sin emitir archivos.

## Validación Recomendada

Antes de subir cambios ejecuta:

```sh
npm test
npm run typecheck
npx expo-doctor
git diff --check
```
