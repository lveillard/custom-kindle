import { Title } from "@solidjs/meta";
import { createAsync, useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import { NoHydration } from "solid-js/web";
import { getReaderBook, type ReaderBook } from "~/lib/reader";

export default function Home() {
  const [searchParams] = useSearchParams();
  const readerBook = createAsync(() => getReaderBook(String(searchParams.page || "1")));

  return (
    <NoHydration>
      <Show when={readerBook()} fallback={<main class="loading">Cargando...</main>}>
        {(book) => <Reader book={book()} />}
      </Show>
    </NoHydration>
  );
}

function Reader(props: { book: ReaderBook }) {
  return (
    <div class="reader-shell" data-initial-page={props.book.initialPage}>
      <Title>{props.book.title}</Title>
      <nav class="reader-topbar" aria-label="Navegacion">
        <a class="nav-link nav-home" id="home-link" href="/?page=1" aria-label="Primera pagina">
          Inicio
        </a>
        <div class="topbar-title">{props.book.title}</div>
        <div class="nav-controls">
          <a class="nav-link nav-arrow" id="prev-page" href="/?page=1" aria-label="Pagina anterior">
            &#8249;
          </a>
          <span class="page-count" id="page-count" aria-label="Pagina actual">
            {props.book.initialPage}/...
          </span>
          <a class="nav-link nav-arrow" id="next-page" href={`/?page=${props.book.initialPage + 1}`} aria-label="Pagina siguiente">
            &#8250;
          </a>
          <button class="nav-link notes-button" id="notes-toggle" type="button" aria-expanded="false">
            Notas
          </button>
        </div>
      </nav>

      <main class="reader-main" id="reader-main">
        <section class="reader-viewport" id="reader-viewport" aria-label="Texto">
          <article class="reader-flow" id="reader-flow">
            {props.book.blocks.map((block) => (
              <p>{block}</p>
            ))}
          </article>
        </section>
      </main>

      <div class="selection-popover" id="selection-popover" hidden>
        <div class="selection-title">Traductor</div>
        <div class="selection-text" id="selection-text" />
        <div class="selection-translation" id="selection-translation" />
      </div>

      <section class="note-panel" id="note-panel" hidden aria-label="Zona de escritura">
        <div class="note-toolbar">
          <span id="note-status">Lapiz listo</span>
          <button type="button" id="note-clear">Borrar</button>
          <button type="button" id="note-close">Cerrar</button>
        </div>
        <canvas id="note-canvas" />
      </section>

      <footer class="page-indicator" id="page-indicator" aria-label="Pagina actual">
        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" id="progress-fill" />
        </div>
        <div class="indicator-row">
          <span id="progress-label">Pagina {props.book.initialPage}</span>
          <span>{props.book.title}</span>
        </div>
      </footer>
      <script src="/reader.js" defer />
    </div>
  );
}
