# Kindle SolidStart Reader

Mini lector SolidStart SSR pensado para el navegador de Kindle Scribe y Vercel.

## Como funciona

- SolidStart v2 renderiza la pagina en servidor con TSX y la hidrata en cliente de forma normal.
- Una server function pagina `content/book.txt` y devuelve solo la pagina actual.
- La interaccion de toque izquierda/derecha usa JavaScript sencillo y URLs normales.
- Si el JavaScript falla, los enlaces invisibles de izquierda/derecha siguen funcionando.
- Tocar la mitad derecha avanza pagina; tocar la mitad izquierda retrocede.

## Stack

- SolidStart v2
- TypeScript/TSX
- Bun para instalar, desarrollar y compilar
- Vercel Node Functions generadas por Nitro
- `@solidjs/vite-plugin-nitro-2@0.2.0`

## Nota Vercel

SolidStart v2 todavia esta en alpha. En Vercel, el adaptador Nitro pasa URLs relativas (`/`) al handler de SolidStart; `src/entry-server.tsx` normaliza esas URLs a absolutas antes de llamar a `app.fetch`.

## Desarrollo local

```sh
bun install
bun run dev
```

Abre `http://localhost:3000`.

## Contenido

Edita `content/book.txt`. Si la primera linea empieza por `# `, se usa como titulo.

## Ajuste de paginacion

Por defecto usa unas 1750 letras por pagina. Puedes ajustarlo con:

```sh
PAGE_CHARS=1600 bun run dev
```

En Vercel, define `PAGE_CHARS` como variable de entorno si quieres otro tamano. Tambien puedes probar desde la URL:

```text
/?page=1&chars=1600
```

## Deploy en Vercel

```sh
vercel
```

Vercel ejecuta `bun install --frozen-lockfile` y `bun run build`. SolidStart usa Vite y Nitro para generar el output de despliegue.
