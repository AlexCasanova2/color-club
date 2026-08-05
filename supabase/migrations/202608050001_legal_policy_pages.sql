alter table public.site_page_content
drop constraint if exists site_page_content_route_check;

alter table public.site_page_content
add constraint site_page_content_route_check
check (
  route in (
    '/',
    '/como-funciona',
    '/soporte',
    '/privacidad',
    '/terminos',
    '/aviso-legal',
    '/cookies',
    '/normas-comunidad',
    '/contenido-y-fotos',
    '/eliminar-cuenta'
  )
);

insert into public.site_page_content (
  route,
  seo_title,
  seo_description,
  hero_kicker,
  hero_title,
  hero_body,
  published
)
values
  (
    '/aviso-legal',
    'Aviso legal',
    'Información legal e identificación del titular de la web y la app Color Club.',
    'Información legal',
    'Quién está detrás de Color Club.',
    'Identificación del titular, condiciones de acceso y reglas aplicables a este sitio web.',
    true
  ),
  (
    '/cookies',
    'Política de cookies',
    'Información sobre cookies técnicas, almacenamiento de sesión y futuras tecnologías opcionales de Color Club.',
    'Cookies',
    'Solo lo necesario para funcionar.',
    'La web pública no utiliza analítica no esencial por defecto. Aquí explicamos el almacenamiento técnico actual.',
    true
  ),
  (
    '/normas-comunidad',
    'Normas de la comunidad',
    'Reglas de convivencia, seguridad, contenido permitido y moderación dentro de Color Club.',
    'Comunidad',
    'Jugar juntos también tiene reglas.',
    'Respeto, privacidad y seguridad para que los retos sigan siendo divertidos para todo el grupo.',
    true
  ),
  (
    '/contenido-y-fotos',
    'Política de contenido y fotos',
    'Derechos, permisos, visibilidad y almacenamiento de fotografías y contenido en Color Club.',
    'Contenido y fotos',
    'Tus fotos siguen siendo tuyas.',
    'Qué permisos necesitas, cómo se muestran los collages y qué licencia requiere Color Club para operar.',
    true
  ),
  (
    '/eliminar-cuenta',
    'Cómo eliminar tu cuenta',
    'Pasos para eliminar una cuenta de Color Club y explicación de sus efectos sobre datos y contenido.',
    'Control de cuenta',
    'Cómo eliminar tu cuenta.',
    'Pasos, consecuencias y canal alternativo si ya no puedes acceder a la app.',
    true
  )
on conflict (route) do nothing;
