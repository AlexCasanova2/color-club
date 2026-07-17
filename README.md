# Color Club

MVP móvil de retos fotográficos para clubs de amigos. Está construido con Expo, React Native y Supabase.

## Incluido

- Registro e inicio de sesión con email y contraseña.
- Creación de clubs, código de invitación y temporadas manuales o mensuales.
- Amigos mediante `@username` o código público, con solicitudes privadas.
- Reto de color compartido con presets de 24 h, 48 h y una semana.
- Collage editable de seis fotos hasta el envío definitivo.
- Espera en tiempo real, descalificación al vencer el plazo y votación única.
- Resultados no anónimos y ranking de temporada calculado con empates literales.
- Esquema PostgreSQL, Storage privado, funciones transaccionales y políticas RLS.

## Puesta en marcha

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Ejecuta en orden los archivos de `supabase/migrations/` desde el SQL Editor o enlaza el proyecto con la CLI y usa `supabase db push`.
3. Activa Realtime para las tablas `challenges` y `challenge_participants` si la publicación no se creó durante la migración.
4. Activa `pg_cron` y programa las dos consultas indicadas al final de la migración para transiciones automáticas.
5. Crea `.env` a partir de `.env.example` con la URL y la clave anon del proyecto.
6. Ejecuta `npm install` y `npm start`.

```env
EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_ANON
```

Para abrir iOS o Android usa `npm run ios` o `npm run android`. La cámara requiere un dispositivo físico; la galería funciona también en simulador.

## Automatizaciones

Las funciones `advance_challenges()` y `reset_monthly_seasons()` están revocadas para clientes. Deben ejecutarse como jobs internos mediante Supabase Cron. La primera:

- Activa retos programados.
- Descalifica collages incompletos cuando vence el plazo.
- Abre una votación de 24 horas.
- Cierra votaciones vencidas.

## Seguridad

El bucket `collages` es privado. La política de Storage delega en la política RLS de `photos`, por lo que cada participante solo puede acceder a sus propias fotos durante el reto. El club obtiene acceso al entrar en fase de votación. Los votos se validan también mediante trigger para impedir auto-votos, votos de descalificados y objetivos inválidos.
