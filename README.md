# Color Club

Color Club es una app móvil social de retos fotográficos por color. Está construida con Expo, React Native y Supabase.

## Funcionalidades

- Autenticación con email y contraseña, registro y recuperación de contraseña.
- Clubs privados con código de invitación, amigos por `@username` o código público y solicitudes privadas.
- Retos de color con color fijo, color aleatorio compartido o color aleatorio individual por participante.
- Selector de duración y número de fotos por reto.
- CTA de lanzamiento con mantener pulsado, haptics y animación de progreso.
- Collage editable, envío definitivo, votación única y ranking por temporada.
- Reglas de participación para evitar entradas tardías a retos ya creados.
- Chat privado por club con Realtime, avatares y composer adaptado al teclado.
- Perfil editable con foto, bio, color favorito, estado, color de avatar y nombre de ranking.
- Notificaciones in-app para retos, solicitudes de amistad y resumen semanal.
- Notificaciones push mediante Expo Push Notifications y Supabase Edge Functions.
- Navegación con dock flotante, header tipo Dynamic Island y transiciones entre rutas.
- Toasts reutilizables con barra de progreso que completa el ancho real del contenedor.
- Esquema PostgreSQL con RLS, Storage privado, funciones transaccionales y Realtime.

## Puesta En Marcha

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Ejecuta en orden todos los archivos de `supabase/migrations/` desde el SQL Editor o enlaza el proyecto con la CLI y usa `supabase db push`.
3. Crea `.env` a partir de `.env.example` con la URL y la clave anon del proyecto.
4. Ejecuta `npm install`.
5. Ejecuta `npm start`.

```env
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_ANON
```

Para abrir iOS o Android usa `npm run ios` o `npm run android`. La cámara requiere un dispositivo físico; la galería funciona también en simulador.

## Supabase

Las migraciones configuran tablas, RLS, Storage, funciones RPC y Realtime para clubs, amistades, retos, fotos, votaciones, chat y notificaciones.

### Push Notifications

La app registra tokens Expo en `push_tokens`. Para enviar push reales cuando se cree una notificación interna:

1. Aplica las migraciones con `supabase db push`.
2. Define un secret para el webhook: `supabase secrets set PUSH_WEBHOOK_SECRET=valor-largo-aleatorio`.
3. Despliega la función: `supabase functions deploy send-push-notification`.
4. En Supabase Dashboard crea un Database Webhook para `public.notifications` en evento `INSERT` apuntando a `https://TU-PROYECTO.supabase.co/functions/v1/send-push-notification`.
5. Añade el header `x-push-webhook-secret` con el mismo valor de `PUSH_WEBHOOK_SECRET`.

En iOS y Android las push requieren builds nativas de EAS; no funcionan como push reales dentro de Expo Go.

Activa o revisa Realtime para estas tablas si tu proyecto no lo habilita automáticamente desde las migraciones:

- `challenges`
- `challenge_participants`
- `club_messages`
- `notifications`

## Automatizaciones

Las funciones internas no están disponibles para clientes y deben ejecutarse como jobs de Supabase Scheduler/Cron cuando quieras automatización completa.

- `advance_challenges()` activa retos programados, descalifica collages incompletos, abre votaciones y cierra votaciones vencidas.
- `reset_monthly_seasons()` reinicia temporadas mensuales si se usa esa configuración.
- `create_weekly_summary_notifications()` genera notificaciones de resumen semanal para usuarios que tengan esa preferencia activa.

## Seguridad

El bucket `collages` es privado. La política de Storage delega en la política RLS de `photos`, por lo que cada participante solo puede acceder a sus propias fotos durante el reto. El club obtiene acceso al entrar en fase de votación.

Los votos se validan mediante trigger para impedir auto-votos, votos de descalificados y objetivos inválidos. Las tablas de chat, amistades, miembros y notificaciones también usan RLS para limitar lectura y escritura al usuario o club correspondiente.

## Scripts

- `npm start`: inicia Expo.
- `npm run ios`: abre Expo en iOS.
- `npm run android`: abre Expo en Android.
- `npm run web`: abre Expo en web.
- `npm run typecheck`: ejecuta TypeScript sin emitir archivos.

## Validación Recomendada

Antes de subir cambios ejecuta:

```sh
npm run typecheck
npx expo-doctor
git diff --check
```
