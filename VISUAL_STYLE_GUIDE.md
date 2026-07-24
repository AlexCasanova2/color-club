# Color Club: guía de estilo visual para web

Esta guía define la identidad visual de Color Club para trasladarla de la app móvil a una experiencia web coherente. La web debe sentirse como el mismo producto, no como un dashboard genérico con los mismos colores.

## 1. Personalidad de marca

Color Club combina tres ideas:

- **Editorial:** títulos grandes, jerarquías claras y composiciones con intención.
- **Lúdica:** color, formas geométricas, iconos y pequeñas sorpresas visuales.
- **Cercana:** lenguaje directo, superficies suaves y acciones fáciles de entender.

La interfaz debe ser expresiva sin resultar infantil. El color identifica estados, clubs y momentos importantes; no se usa como decoración indiscriminada.

### Principios

1. **Negro cálido como estructura.** Navegación y acciones principales usan `ink`.
2. **Fondos cálidos, no blanco clínico.** La página parte de `paper`.
3. **Color en bloques grandes.** Las tarjetas protagonistas usan superficies pastel completas.
4. **Geometría blanda.** Radios amplios, cuadrados redondeados y círculos gruesos.
5. **Contraste editorial.** Títulos pesados junto a textos secundarios contenidos.
6. **Movimiento corto y físico.** Pequeños desplazamientos, muelles y barras de progreso.

## 2. Paleta

### Colores base

| Token | Hex | Uso principal |
| --- | --- | --- |
| `ink` | `#111217` | Texto, navegación, botones principales |
| `paper` | `#F8F8F5` | Fondo general |
| `surface` | `#FFFFFF` | Cards, inputs y superficies elevadas |
| `line` | `#E7E6E1` | Bordes y separadores |
| `muted` | `#777771` | Texto secundario |
| `white` | `#FFFFFF` | Texto sobre `ink` |
| `danger` | `#B84038` | Borrado, error y acciones destructivas |

### Acentos de interfaz

| Token | Hex | Carácter |
| --- | --- | --- |
| `cobalt` | `#6F8FF7` | Progreso y acción |
| `yellow` | `#FFC455` | Atención positiva y CTAs secundarios |
| `green` | `#62C79B` | Éxito y completado |
| `lavender` | `#AC98FF` | Marca y superficies protagonistas |
| `blue` | `#9FC5FF` | Información y estados suaves |
| `pink` | `#F08CE8` | Expresión y variedad |
| `orange` | `#FFB94F` | Energía y creación |

### Colores seleccionables para clubs

Los clubs solo pueden usar estos seis colores de identidad:

- Naranja: `#FFB94F`
- Azul: `#9FC5FF`
- Rosa: `#F08CE8`
- Verde: `#62C79B`
- Violeta: `#AC98FF`
- Amarillo: `#FFC455`

Estos colores están elegidos para permitir texto `ink` encima. No deben sustituirse por colores oscuros sin recalcular contraste.

### Colores de los retos

Los colores asignables a un reto son más intensos y representan el objeto del juego, no la interfaz:

`#E84A3C`, `#3157D5`, `#F4C542`, `#3A8D67`, `#E75A9D`, `#F27C38`, `#7450A8`, `#E9E6DF`.

No mezclar esta paleta con la identidad pastel de los clubs.

## 3. Tokens CSS recomendados

```css
:root {
  --color-ink: #111217;
  --color-paper: #f8f8f5;
  --color-surface: #ffffff;
  --color-line: #e7e6e1;
  --color-muted: #777771;
  --color-danger: #b84038;

  --color-cobalt: #6f8ff7;
  --color-yellow: #ffc455;
  --color-green: #62c79b;
  --color-lavender: #ac98ff;
  --color-blue: #9fc5ff;
  --color-pink: #f08ce8;
  --color-orange: #ffb94f;

  --radius-sm: 14px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --radius-xl: 30px;
  --radius-modal: 34px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;

  --shadow-soft: 0 8px 18px rgb(17 18 23 / 12%);
  --shadow-float: 0 14px 30px rgb(17 18 23 / 16%);
  --shadow-modal: 0 24px 70px rgb(17 18 23 / 24%);

  --duration-fast: 140ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
}
```

## 4. Tipografía

La app usa una sans del sistema con pesos altos. Para web se recomienda:

```css
font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;
```

Inter mantiene proporciones cercanas y ofrece pesos consistentes. Si no se carga una fuente externa, usar el stack de sistema completo.

### Escala web

| Estilo | Desktop | Móvil | Peso | Tracking |
| --- | --- | --- | --- | --- |
| Display | 64/64 | 40/43 | 800-900 | `-0.035em` |
| H1 | 48/50 | 40/43 | 800-900 | `-0.03em` |
| H2 | 32/36 | 27/31 | 800-900 | `-0.025em` |
| H3 | 22/27 | 19/24 | 800-900 | `-0.015em` |
| Body | 16/24 | 16/24 | 400-500 | normal |
| Label | 13/18 | 13/18 | 600-800 | normal |
| Kicker | 11/15 | 10/14 | 900 | `0.1em` |

Los títulos pueden ocupar dos líneas y deben tener presencia. Evitar fuentes finas o titulares centrados por defecto.

## 5. Geometría y composición

### Radios

- Cards estándar: `24px`.
- Tarjetas protagonistas: `28-30px`.
- Modales y sheets: `34px`.
- Inputs y botones: `18-23px`.
- Iconos contenidos: `13-21px`.
- Pills: radio igual a la mitad de su altura.

No usar radios pequeños de `4-8px` en componentes principales.

### Bordes

- Grosor normal: `1px` con `line`.
- Selección fuerte: `3-4px` con `ink`.
- Marcos de color o fotografía: `2-8px`, según protagonismo.

### Formas decorativas

La marca utiliza:

- Cuadrados redondeados rotados entre `12deg` y `24deg`.
- Anillos gruesos parcialmente cortados por el contenedor.
- Círculos y burbujas que salen de la tarjeta.
- Formas superpuestas con `overflow: hidden`.

Estas formas deben reforzar una card protagonista. No añadirlas a todas las cards.

## 6. Layout web

### Contenedor

```css
.page-shell {
  width: min(100% - 40px, 1200px);
  margin-inline: auto;
}
```

- Móvil: margen horizontal de `18px`.
- Tablet: `24-32px`.
- Desktop: ancho máximo entre `1120px` y `1200px`.
- Contenido de lectura: limitar a `680-760px`.

### Grid

- Cards de clubs: grid de 12 columnas.
- Club destacado: 6-8 columnas.
- Clubs secundarios: 4-6 columnas.
- En móvil: una o dos columnas según el tamaño de la tarjeta.
- Mantener huecos de `10-18px`, no grids excesivamente aireados.

La composición debe poder ser asimétrica: una card ancha seguida de dos cards compactas es más fiel a la app que una cuadrícula uniforme.

## 7. Navegación

### Desktop

Usar una isla oscura flotante, no una barra convencional de ancho completo:

- Fondo `ink`.
- Radio `30px`.
- Altura aproximada `64-72px`.
- Padding interno `6px`.
- Opción activa sobre una cápsula blanca.
- Icono más label corto.
- Sombra suave.

Puede colocarse centrada arriba o como sidebar compacta flotante. Debe conservar el concepto de “isla”.

### Móvil web

Replicar el menú inferior de la app:

- Separación lateral `14px`.
- Altura `72px`.
- Cuatro destinos principales.
- Ocultarlo en flujos inmersivos: crear reto, editar collage, chat o administración.

## 8. Componentes

### Header tipo isla

- Altura mínima `54px`.
- Fondo `ink`.
- Radio `28px`.
- Título centrado, `14px`, peso `700`.
- Acción de volver dentro de un círculo `#292A31` de `38px`.
- Punto verde para indicar estado activo.
- Puede ser sticky, dejando respirar el contenido debajo.

### Cards

**Card neutra**

- Fondo blanco.
- Borde `line` de `1px`.
- Radio `24px`.
- Padding `20px`.

**Card protagonista**

- Fondo de acento o color del club.
- Radio `28-30px`.
- Padding `22-28px`.
- Sin borde visible.
- Puede incorporar formas geométricas.

**Card de club**

- Fondo igual a `club.theme_color`.
- Icono elegido dentro de una cápsula blanca translúcida.
- Nombre grande, peso `800-900`.
- Código o metadata en el pie.
- Botón circular de avance.

### Botones

**Primario**

- Fondo `ink`, texto blanco.
- Altura `54-64px`.
- Radio `18-23px`.
- Para acciones protagonistas, incluir un círculo de color con flecha a la derecha.

**Secundario expresivo**

- Fondo `lavender`, `yellow` u otro acento contextual.
- Texto `ink`.
- Puede incluir un icono en un bloque blanco translúcido.

**Neutro**

- Fondo blanco.
- Borde `line`.
- Reservado para cancelar o acciones de menor prioridad.

**Destructivo**

- Texto `danger`.
- Fondo `#F6D9D6` o blanco con borde `danger`.

**Press to confirm**

- Para acciones irreversibles importantes.
- Barra de progreso horizontal dentro del botón.
- Duración orientativa: `900-1200ms`.
- No sustituir confirmaciones comunes por modales genéricos.

### Inputs

- Altura mínima `54px`.
- Fondo blanco.
- Borde `line`.
- Radio `18px`.
- Padding horizontal `16px`.
- Label superior en `muted`, `13px`, peso `600`.
- Focus: borde `ink` de `2px`; no usar glow azul del navegador.

### Modales y sheets

- Overlay `rgb(17 18 23 / 65-75%)`.
- Fondo `paper`.
- Radio `34px`.
- Ancho máximo web: `430-560px` según contenido.
- Padding `22-28px`.
- Header visual con color, icono y forma decorativa.
- Acción principal grande al final.

Los mensajes de éxito usan icono verde, kicker, título grande y CTA oscuro con flecha amarilla.

### Pills y badges

- Altura `28-42px`.
- Radio completo.
- Texto entre `10px` y `12px`, peso `800-900`.
- Usar fondos blancos translúcidos sobre cards de color.

### Estados de carga

- Skeletons con `#E3E1DA`.
- Radio `22px`.
- Pulso entre `45%` y `85%` de opacidad en ciclos de `760ms`.
- Evitar spinners como única estructura de una página completa.

## 9. Iconografía

La app usa Ionicons. La web debe usar la misma librería o una alternativa de línea redondeada consistente.

- Tamaño estándar: `18-22px`.
- Tamaño protagonista: `26-32px`.
- Grosor visual medio.
- Versión `outline` por defecto.
- Versión rellena únicamente para selección activa.

### Iconos disponibles para clubs

- `color-palette-outline`
- `camera-outline`
- `sparkles-outline`
- `people-outline`
- `heart-outline`
- `planet-outline`
- `sunny-outline`
- `flower-outline`

El color y el icono forman una unidad de identidad. Deben aparecer juntos en Home, cabecera del club, selectores y contextos donde varios clubs compitan por atención.

## 10. Fotografía y collages

- Las fotos deben ocupar el marco completo con `object-fit: cover`.
- Los collages usan proporción vertical `9 / 16`.
- Dos fotos: una columna y dos filas.
- Cuatro fotos: dos columnas y dos filas.
- Seis fotos: dos columnas y tres filas.
- Sin gaps entre imágenes.
- Marco exterior con radio `18-22px` cuando esté dentro de una card.
- Visor completo sobre fondo `ink`.

Los placeholders de fotos son blancos o neutros con borde `line`; no usar azul por defecto.

## 11. Movimiento e interacción

### Curvas

```css
--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
```

### Patrones

- Press: `translateY(1px)` y opacidad `0.72-0.78`.
- Hover web: elevar `2-4px`, aumentar sombra y mantener color.
- Transiciones de panel: `180-320ms`.
- Selector activo: escala máxima `1.06-1.08`.
- Navegación activa: desplazamiento con sensación de muelle.
- Evitar animaciones largas o rebotes exagerados.

```css
.interactive-card {
  transition:
    transform var(--duration-base) var(--ease-standard),
    box-shadow var(--duration-base) var(--ease-standard),
    opacity var(--duration-fast) ease;
}

.interactive-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-float);
}

.interactive-card:active {
  transform: translateY(1px);
  opacity: 0.76;
}
```

## 12. Estados y feedback

- Éxito: `green` con check y mensaje explícito.
- Atención: `yellow`.
- Información: `blue`.
- Error: texto `danger`; evitar llenar toda la card de rojo.
- Offline: banner amarillo con icono de nube.
- Conexión recuperada: banner verde.
- Completado: check dentro de bloque verde.

El feedback debe indicar qué ocurrió y qué puede hacer el usuario después.

## 13. Accesibilidad

- Contraste mínimo AA para textos y acciones.
- Texto `ink` sobre todos los colores pastel de club.
- Texto blanco solo sobre `ink` o colores oscuros verificados.
- Focus visible de `2-3px` con `ink` y offset de `2px`.
- Área interactiva mínima: `44x44px`.
- No comunicar estados únicamente mediante color.
- Respetar `prefers-reduced-motion`.
- Labels accesibles para iconos sin texto.

```css
:focus-visible {
  outline: 3px solid var(--color-ink);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
  }
}
```

## 14. Responsive

### Hasta 639px

- Navegación inferior flotante.
- Márgenes de `18px`.
- Titulares de `40px` como máximo.
- Sheets desde abajo.
- Grid de clubs mixto de una y dos columnas.

### 640px a 1023px

- Márgenes de `24-32px`.
- Modales centrados.
- Grid de dos columnas.
- Navegación flotante superior o lateral compacta.

### Desde 1024px

- Contenedor máximo de `1200px`.
- Grid de 12 columnas.
- Cards protagonistas entre 6 y 8 columnas.
- Paneles secundarios de 4 columnas.
- Navegación en isla; evitar sidebar genérica ocupando toda la altura salvo que el producto lo necesite.

## 15. Qué evitar

- Gradientes genéricos morado-azul.
- Cards idénticas organizadas siempre en una cuadrícula uniforme.
- Radios pequeños.
- Sombras negras muy duras.
- Exceso de glassmorphism.
- Botones primarios azules convencionales.
- Texto gris claro con poco contraste.
- Decoración geométrica en cada componente.
- Iconos de estilos mezclados.
- Uso de los colores intensos del reto como fondos habituales de interfaz.

## 16. Checklist para nuevas pantallas

- ¿El fondo principal usa `paper`?
- ¿Existe una jerarquía editorial clara?
- ¿La acción principal usa `ink` o un acento contextual fuerte?
- ¿Los radios siguen la escala definida?
- ¿El color tiene significado y no es decoración arbitraria?
- ¿Los clubs muestran juntos su color e icono?
- ¿Hover, press, loading, error y disabled están diseñados?
- ¿La pantalla funciona a 320px y a 1440px?
- ¿El foco de teclado es visible?
- ¿La composición se siente propia de Color Club y no de una plantilla SaaS?

## 17. Ejemplo de card de club

```html
<article class="club-card" style="--club-color: #ac98ff">
  <div class="club-card__badge">
    <span aria-hidden="true">◉</span>
    <span>Club</span>
  </div>
  <h3>Viernes de color</h3>
  <footer>
    <span>AB12CD34</span>
    <a href="/clubs/club-id" aria-label="Abrir Viernes de color">→</a>
  </footer>
</article>
```

```css
.club-card {
  min-height: 190px;
  padding: 20px;
  border-radius: var(--radius-xl);
  background: var(--club-color);
  color: var(--color-ink);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.club-card__badge {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 44%);
  font-size: 11px;
  font-weight: 700;
}

.club-card h3 {
  max-width: 12ch;
  margin: 28px 0;
  font-size: 26px;
  line-height: 1.05;
  letter-spacing: -0.025em;
}

.club-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 700;
}

.club-card footer a {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgb(255 255 255 / 54%);
  color: var(--color-ink);
  text-decoration: none;
}
```

Esta guía debe considerarse la fuente de referencia visual para la web. Los tokens pueden centralizarse en CSS, Tailwind o el sistema de diseño elegido, pero los principios de composición, contraste y personalidad deben mantenerse.
