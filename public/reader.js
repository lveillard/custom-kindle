(function () {
  if (window.__kindleReaderLoaded || window.__kindleReaderBootQueued) {
    return;
  }

  window.__kindleReaderBootQueued = true;

  function bootReader() {
    if (window.__kindleReaderLoaded) {
      return;
    }

    window.__kindleReaderLoaded = true;

  var shell = document.querySelector(".reader-shell");
  var main = document.getElementById("reader-main");
  var viewport = document.getElementById("reader-viewport");
  var flow = document.getElementById("reader-flow");
  var prevLink = document.getElementById("prev-page");
  var nextLink = document.getElementById("next-page");
  var pageCount = document.getElementById("page-count");
  var progressFill = document.getElementById("progress-fill");
  var progressLabel = document.getElementById("progress-label");
  var popover = document.getElementById("selection-popover");
  var selectionText = document.getElementById("selection-text");
  var selectionTranslation = document.getElementById("selection-translation");
  var selectionClose = document.getElementById("selection-close");
  var notesToggle = document.getElementById("notes-toggle");
  var notePanel = document.getElementById("note-panel");
  var noteCanvases = Array.prototype.slice.call(document.querySelectorAll("[data-note-canvas]"));
  var noteClear = document.getElementById("note-clear");
  var noteClose = document.getElementById("note-close");
  var noteStatus = document.getElementById("note-status");
  var wordHighlightLayer = null;

  if (!shell || !main || !viewport || !flow) {
    return;
  }

  var LONG_PRESS_MS = 430;
  var LONG_PRESS_MOVE_PX = 16;
  var SELECTION_CLICK_SUPPRESS_MS = 850;

  var state = {
    page: getInitialPage(),
    total: 1,
    step: 1,
    gap: 44,
    layoutTimer: 0,
    selectionTimer: 0,
    longPressTimer: 0,
    pressPoint: null,
    suppressClickUntil: 0,
    wordHighlight: null,
    selectionStartRange: null,
    selectionEndRange: null,
    selectionDrag: "",
    selectionHistoryGuard: false,
    notesOpen: false
  };

  var NOTE_CONFIGS = {
    fast: {
      minWidth: 1.45,
      maxWidth: 3.8,
      pressureScale: 3.65,
      minDistance: 0.75,
      interpolationStep: 5,
      maxInterpolationSteps: 8,
      maxDpr: 1,
      desynchronized: true
    },
    fine: {
      minWidth: 1.15,
      maxWidth: 3.1,
      pressureScale: 3.05,
      minDistance: 0.65,
      interpolationStep: 4,
      maxInterpolationSteps: 10,
      maxDpr: 1.5,
      desynchronized: true
    },
    sharp: {
      minWidth: 1,
      maxWidth: 2.8,
      pressureScale: 2.8,
      minDistance: 0.55,
      interpolationStep: 3.5,
      maxInterpolationSteps: 12,
      maxDpr: 2,
      desynchronized: false
    },
    soft: {
      minWidth: 1.3,
      maxWidth: 3.4,
      pressureScale: 3.25,
      minDistance: 0.9,
      interpolationStep: 6,
      maxInterpolationSteps: 7,
      maxDpr: 1,
      desynchronized: true
    }
  };

  var noteSurfaces = createNoteSurfaces();

  function getInitialPage() {
    var fromUrl = getPageFromUrl();
    var fromDom = parseInt(shell.getAttribute("data-initial-page") || "1", 10);

    if (fromUrl > 0) {
      return fromUrl;
    }

    return fromDom > 0 ? fromDom : 1;
  }

  function getPageFromUrl() {
    var match = window.location.search.match(/[?&]page=([0-9]+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function scheduleLayout() {
    window.clearTimeout(state.layoutTimer);
    state.layoutTimer = window.setTimeout(layoutPages, 80);
  }

  function layoutPages() {
    var width = viewport.clientWidth;
    var height = viewport.clientHeight;

    if (width < 10 || height < 10) {
      return;
    }

    state.gap = clamp(Math.round(width * 0.06), 30, 58);
    state.step = width + state.gap;

    flow.style.width = width + "px";
    flow.style.height = height + "px";
    flow.style.columnWidth = width + "px";
    flow.style.webkitColumnWidth = width + "px";
    flow.style.columnGap = state.gap + "px";
    flow.style.webkitColumnGap = state.gap + "px";

    state.total = Math.max(1, Math.ceil((flow.scrollWidth + state.gap) / state.step));
    setPage(state.page, false);

    if (state.notesOpen) {
      resizeNoteCanvases();
    }
  }

  function setPage(page, syncUrl) {
    state.page = clamp(page, 1, state.total);
    flow.style.transform = "translate3d(-" + ((state.page - 1) * state.step) + "px, 0, 0)";
    updateControls();
    clearSelectionState();

    if (state.notesOpen) {
      loadAllStrokes();
    }

    if (syncUrl && window.history && window.history.replaceState) {
      window.history.replaceState({ page: state.page }, "", window.location.pathname + "?page=" + state.page);
    }
  }

  function updateControls() {
    var progress = state.total > 0 ? Math.round((state.page / state.total) * 100) : 0;
    var label = "Pagina " + state.page + " de " + state.total + " - " + progress + "%";

    if (pageCount) {
      pageCount.textContent = state.page + "/" + state.total;
      pageCount.setAttribute("aria-label", label);
    }

    if (progressLabel) {
      progressLabel.textContent = label;
    }

    if (progressFill) {
      progressFill.style.width = progress + "%";
    }

    updateLink(prevLink, state.page - 1, state.page <= 1);
    updateLink(nextLink, state.page + 1, state.page >= state.total);
  }

  function updateLink(link, page, disabled) {
    if (!link) {
      return;
    }

    link.href = "/?page=" + clamp(page, 1, state.total);
    link.setAttribute("aria-disabled", disabled ? "true" : "false");

    if (link.classList) {
      if (disabled) {
        link.classList.add("is-disabled");
      } else {
        link.classList.remove("is-disabled");
      }
    }
  }

  function isInteractive(target) {
    while (target && target !== document) {
      if (target === popover || target === notePanel) {
        return true;
      }

      if (target.tagName) {
        var tag = target.tagName.toUpperCase();

        if (tag === "A" || tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "CANVAS") {
          return true;
        }
      }

      target = target.parentNode;
    }

    return false;
  }

  function hasSelection() {
    var selection = window.getSelection ? window.getSelection() : null;
    return !!(selection && String(selection).replace(/\s+/g, " ").trim());
  }

  function navigateFromPoint(x) {
    if (x > window.innerWidth * 0.52) {
      setPage(state.page + 1, true);
      return;
    }

    if (x < window.innerWidth * 0.36) {
      setPage(state.page - 1, true);
    }
  }

  function handleReaderClick(event) {
    if (!main.contains(event.target) || state.notesOpen || isInteractive(event.target)) {
      return;
    }

    if (Date.now() < state.suppressClickUntil) {
      return;
    }

    if (hasSelection() || state.wordHighlight) {
      clearSelectionState();
      return;
    }

    navigateFromPoint(event.clientX);
  }

  function handleControlClick(event, delta) {
    event.preventDefault();
    setPage(state.page + delta, true);
  }

  function selectionIsInsideReader(selection) {
    if (!selection || selection.rangeCount < 1) {
      return false;
    }

    var node = selection.anchorNode;

    if (node && node.nodeType === 3) {
      node = node.parentNode;
    }

    return !!(node && flow.contains(node));
  }

  function scheduleSelectionPopover() {
    window.clearTimeout(state.selectionTimer);
    state.selectionTimer = window.setTimeout(updateSelectionPopover, 80);
  }

  function updateSelectionPopover() {
    var selection = window.getSelection ? window.getSelection() : null;

    if (!selectionIsInsideReader(selection)) {
      clearWordUnderline();
      state.wordHighlight = null;
      hideSelectionPopover();
      return;
    }

    var text = String(selection).replace(/\s+/g, " ").trim();

    if (!text) {
      clearWordUnderline();
      state.wordHighlight = null;
      hideSelectionPopover();
      return;
    }

    var range = selection.getRangeAt(0);
    var rect = range.getBoundingClientRect();

    if (!rect || (!rect.width && !rect.height)) {
      clearWordUnderline();
      state.wordHighlight = null;
      hideSelectionPopover();
      return;
    }

    showPopoverForRange(range, text);
  }

  function showPopoverForRange(range, text) {
    var rect = range.getBoundingClientRect();

    if (!rect || (!rect.width && !rect.height) || !popover) {
      hideSelectionPopover();
      return;
    }

    if (selectionText) {
      selectionText.textContent = text.length > 120 ? text.slice(0, 117) + "..." : text;
    }

    if (selectionTranslation) {
      selectionTranslation.textContent = fakeTranslate(text);
    }

    renderWordUnderline(range);

    var selectionMiddle = rect.top + rect.height / 2;
    var dockBottom = selectionMiddle < window.innerHeight / 2;

    if (popover.classList) {
      popover.classList.toggle("is-docked-bottom", dockBottom);
      popover.classList.toggle("is-docked-top", !dockBottom);
    }

    popover.hidden = false;
  }

  function hideSelectionPopover() {
    if (popover) {
      popover.hidden = true;
    }
  }

  function clearSelectionState() {
    var selection = window.getSelection ? window.getSelection() : null;

    hideSelectionPopover();
    clearWordUnderline();
    state.wordHighlight = null;
    state.selectionStartRange = null;
    state.selectionEndRange = null;
    state.selectionDrag = "";
    releaseSelectionHistoryGuard();

    if (selection && selection.removeAllRanges) {
      selection.removeAllRanges();
    }
  }

  function ensureSelectionHistoryGuard() {
    if (state.selectionHistoryGuard || !window.history || !window.history.pushState) {
      return;
    }

    try {
      window.history.pushState({ kindleSelectionGuard: true }, "", window.location.href);
      state.selectionHistoryGuard = true;
    } catch (error) {
      state.selectionHistoryGuard = false;
    }
  }

  function releaseSelectionHistoryGuard() {
    if (!state.selectionHistoryGuard || !window.history || !window.history.replaceState) {
      state.selectionHistoryGuard = false;
      return;
    }

    try {
      window.history.replaceState({ kindleReader: true, page: state.page }, "", window.location.href);
    } catch (error) {
      // Browser history can be locked down; selection still works without the guard.
    }

    state.selectionHistoryGuard = false;
  }

  function restoreSelectionHistoryGuard() {
    if (!window.history || !window.history.pushState) {
      return;
    }

    try {
      window.history.pushState({ kindleSelectionGuard: true }, "", window.location.href);
      state.selectionHistoryGuard = true;
    } catch (error) {
      state.selectionHistoryGuard = false;
    }
  }

  function getHighlightLayer() {
    if (wordHighlightLayer) {
      return wordHighlightLayer;
    }

    wordHighlightLayer = document.createElement("div");
    wordHighlightLayer.className = "word-highlight-layer";
    document.body.appendChild(wordHighlightLayer);

    return wordHighlightLayer;
  }

  function clearWordUnderline() {
    if (wordHighlightLayer) {
      wordHighlightLayer.innerHTML = "";
    }
  }

  function renderWordUnderline(range) {
    var layer = getHighlightLayer();
    var rects = range.getClientRects();
    var i;
    var firstRect = null;
    var lastRect = null;

    layer.innerHTML = "";

    for (i = 0; i < rects.length; i += 1) {
      if (rects[i].width < 1 || rects[i].height < 1) {
        continue;
      }

      if (!firstRect) {
        firstRect = rects[i];
      }

      lastRect = rects[i];

      var line = document.createElement("span");
      line.className = "word-highlight-line";
      line.style.left = rects[i].left + "px";
      line.style.top = Math.max(0, rects[i].bottom - 3) + "px";
      line.style.width = rects[i].width + "px";
      layer.appendChild(line);
    }

    if (firstRect && lastRect) {
      layer.appendChild(createSelectionHandle("start", firstRect.left, firstRect.bottom));
      layer.appendChild(createSelectionHandle("end", lastRect.right, lastRect.bottom));
    }
  }

  function createSelectionHandle(type, x, y) {
    var handle = document.createElement("span");

    handle.className = "selection-handle selection-handle-" + type;
    handle.setAttribute("data-handle", type);
    handle.style.left = x + "px";
    handle.style.top = y + "px";

    return handle;
  }

  function getRangeFromPoint(x, y) {
    var position;
    var range;

    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }

    if (document.caretPositionFromPoint) {
      position = document.caretPositionFromPoint(x, y);

      if (!position) {
        return null;
      }

      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);

      return range;
    }

    return null;
  }

  function isWordChar(character) {
    return /[A-Za-z0-9]/.test(character);
  }

  function expandRangeToWord(range) {
    var node = range && range.startContainer;
    var text;
    var offset;
    var start;
    var end;

    if (!node || node.nodeType !== 3 || !flow.contains(node.parentNode)) {
      return null;
    }

    text = node.nodeValue || "";
    offset = clamp(range.startOffset, 0, text.length);

    if (offset >= text.length && offset > 0) {
      offset -= 1;
    }

    if (!isWordChar(text.charAt(offset)) && offset > 0 && isWordChar(text.charAt(offset - 1))) {
      offset -= 1;
    }

    if (!isWordChar(text.charAt(offset))) {
      return null;
    }

    start = offset;
    end = offset + 1;

    while (start > 0 && isWordChar(text.charAt(start - 1))) {
      start -= 1;
    }

    while (end < text.length && isWordChar(text.charAt(end))) {
      end += 1;
    }

    range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);

    return range;
  }

  function compareRangeStarts(first, second) {
    try {
      return first.compareBoundaryPoints(Range.START_TO_START, second);
    } catch (error) {
      return 0;
    }
  }

  function buildSelectionRange() {
    var range;

    if (!state.selectionStartRange || !state.selectionEndRange) {
      return null;
    }

    range = document.createRange();

    if (compareRangeStarts(state.selectionStartRange, state.selectionEndRange) <= 0) {
      range.setStart(state.selectionStartRange.startContainer, state.selectionStartRange.startOffset);
      range.setEnd(state.selectionEndRange.endContainer, state.selectionEndRange.endOffset);
    } else {
      range.setStart(state.selectionEndRange.startContainer, state.selectionEndRange.startOffset);
      range.setEnd(state.selectionStartRange.endContainer, state.selectionStartRange.endOffset);
    }

    return range;
  }

  function applySelectionRange(range) {
    var selection = window.getSelection ? window.getSelection() : null;
    var text;

    if (!selection || !range) {
      return false;
    }

    text = range.toString().replace(/\s+/g, " ").trim();

    if (!text) {
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(range);
    state.wordHighlight = range.cloneRange();
    ensureSelectionHistoryGuard();
    showPopoverForRange(range, text);

    return true;
  }

  function selectWordAt(x, y) {
    var range = expandRangeToWord(getRangeFromPoint(x, y));

    if (!range) {
      return false;
    }

    state.selectionStartRange = range.cloneRange();
    state.selectionEndRange = range.cloneRange();

    return applySelectionRange(buildSelectionRange());
  }

  function updateSelectionEndpoint(type, x, y) {
    var wordRange = expandRangeToWord(getRangeFromPoint(x, y));

    if (!wordRange) {
      return false;
    }

    if (type === "start") {
      state.selectionStartRange = wordRange.cloneRange();
    } else {
      state.selectionEndRange = wordRange.cloneRange();
    }

    return applySelectionRange(buildSelectionRange());
  }

  function getEventPoint(event) {
    var source = event.touches && event.touches[0] ? event.touches[0] : event;

    return {
      x: source.clientX,
      y: source.clientY
    };
  }

  function cancelLongPress() {
    window.clearTimeout(state.longPressTimer);
    state.longPressTimer = 0;
    state.pressPoint = null;
    state.selectionDrag = "";
  }

  function startLongPress(event) {
    var point;

    if (state.notesOpen || !main.contains(event.target) || isInteractive(event.target)) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    point = getEventPoint(event);
    state.pressPoint = point;
    window.clearTimeout(state.longPressTimer);
    state.longPressTimer = window.setTimeout(function () {
      state.longPressTimer = 0;
      state.suppressClickUntil = Date.now() + SELECTION_CLICK_SUPPRESS_MS;

      if (selectWordAt(point.x, point.y)) {
        state.selectionDrag = "end";
      } else {
        state.suppressClickUntil = 0;
      }
    }, LONG_PRESS_MS);
  }

  function moveLongPress(event) {
    var point;
    var dx;
    var dy;

    if (state.selectionDrag) {
      point = getEventPoint(event);
      updateSelectionEndpoint(state.selectionDrag, point.x, point.y);
      return;
    }

    if (!state.pressPoint) {
      return;
    }

    point = getEventPoint(event);
    dx = point.x - state.pressPoint.x;
    dy = point.y - state.pressPoint.y;

    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_PX) {
      cancelLongPress();
    }
  }

  function startSelectionDrag(event) {
    var target = event.target;
    var handleType = target && target.getAttribute ? target.getAttribute("data-handle") : "";

    if (!handleType) {
      return false;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    state.selectionDrag = handleType;
    state.suppressClickUntil = Date.now() + SELECTION_CLICK_SUPPRESS_MS;
    ensureSelectionHistoryGuard();

    return true;
  }

  function moveSelectionDrag(event) {
    var point;

    if (!state.selectionDrag) {
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    point = getEventPoint(event);
    updateSelectionEndpoint(state.selectionDrag, point.x, point.y);
  }

  function stopSelectionDrag() {
    state.selectionDrag = "";
  }

  function preventSelectionNativeGesture(event) {
    if ((state.selectionDrag || state.wordHighlight) && event.cancelable) {
      event.preventDefault();
    }
  }

  function fakeTranslate(text) {
    var dictionary = {
      ciudad: "city",
      silencio: "silence",
      papel: "paper",
      pagina: "page",
      paginas: "pages",
      luz: "light",
      lector: "reader",
      lectura: "reading",
      cuaderno: "notebook",
      puerta: "door",
      noche: "night",
      manana: "morning",
      linea: "line",
      texto: "text",
      tinta: "ink",
      margen: "margin"
    };
    var words = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/);
    var i;

    for (i = 0; i < words.length; i += 1) {
      if (dictionary[words[i]]) {
        return "EN - " + words[i] + " = " + dictionary[words[i]];
      }
    }

    return "EN - traduccion de prueba";
  }

  function createNoteSurfaces() {
    var surfaces = [];
    var i;
    var canvas;
    var id;

    for (i = 0; i < noteCanvases.length; i += 1) {
      canvas = noteCanvases[i];
      id = canvas.getAttribute("data-note-canvas") || "surface-" + i;

      surfaces.push({
        id: id,
        canvas: canvas,
        config: NOTE_CONFIGS[id] || NOTE_CONFIGS.fast,
        drawing: false,
        strokes: [],
        currentStroke: null,
        context: null,
        activePointerId: null,
        rawPointerSeen: false,
        renderedCurveIndex: 0,
        renderedPointCount: 0,
        dpr: 1,
        width: 0,
        height: 0
      });
    }

    return surfaces;
  }

  function forEachNoteSurface(callback) {
    var i;

    for (i = 0; i < noteSurfaces.length; i += 1) {
      callback(noteSurfaces[i]);
    }
  }

  function openNotes() {
    if (!notePanel || noteSurfaces.length < 1) {
      return;
    }

    state.notesOpen = true;
    notePanel.hidden = false;

    if (notesToggle) {
      notesToggle.setAttribute("aria-expanded", "true");
      if (notesToggle.classList) {
        notesToggle.classList.add("is-active");
      }
    }

    resizeNoteCanvases();
    loadAllStrokes();
  }

  function closeNotes() {
    endAllStrokes();
    state.notesOpen = false;

    if (notePanel) {
      notePanel.hidden = true;
    }

    if (notesToggle) {
      notesToggle.setAttribute("aria-expanded", "false");
      if (notesToggle.classList) {
        notesToggle.classList.remove("is-active");
      }
    }
  }

  function storageKey(surface) {
    return "kindle-reader-note-v2-" + surface.id + "-page-" + state.page;
  }

  function getSurfaceDpr(surface) {
    var deviceDpr = window.devicePixelRatio || 1;
    var maxDpr = surface.config.maxDpr || 1;

    if (maxDpr <= 1) {
      return 1;
    }

    return Math.min(maxDpr, Math.max(1, deviceDpr));
  }

  function getNoteContext(surface) {
    var context = null;

    try {
      context = surface.canvas.getContext("2d", { alpha: false, desynchronized: !!surface.config.desynchronized });
    } catch (error) {
      context = null;
    }

    return context || surface.canvas.getContext("2d");
  }

  function resizeNoteCanvases() {
    forEachNoteSurface(resizeNoteCanvas);
  }

  function resizeNoteCanvas(surface) {
    var rect = surface.canvas.getBoundingClientRect();

    if (rect.width < 1 || rect.height < 1) {
      return;
    }

    surface.dpr = getSurfaceDpr(surface);
    surface.width = rect.width;
    surface.height = rect.height;
    surface.canvas.width = Math.round(rect.width * surface.dpr);
    surface.canvas.height = Math.round(rect.height * surface.dpr);
    surface.context = getNoteContext(surface);
    surface.context.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0);
    surface.context.imageSmoothingEnabled = false;
    redrawStrokes(surface);
  }

  function fillNoteBackground(surface) {
    var context = surface.context;

    if (!context) {
      return;
    }

    context.save();
    context.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, surface.width, surface.height);
    context.restore();
  }

  function loadAllStrokes() {
    forEachNoteSurface(loadStrokes);
  }

  function loadStrokes(surface) {
    if (!window.localStorage) {
      surface.strokes = [];
      redrawStrokes(surface);
      return;
    }

    try {
      surface.strokes = JSON.parse(window.localStorage.getItem(storageKey(surface)) || "[]");
    } catch (error) {
      surface.strokes = [];
    }

    redrawStrokes(surface);
  }

  function saveStrokes(surface) {
    if (!window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey(surface), JSON.stringify(surface.strokes));
    } catch (error) {
      return;
    }
  }

  function redrawStrokes(surface) {
    var i;

    if (!surface.context) {
      return;
    }

    fillNoteBackground(surface);

    for (i = 0; i < surface.strokes.length; i += 1) {
      drawStroke(surface, surface.strokes[i]);
    }
  }

  function resetActiveStrokeRendering(surface) {
    surface.renderedCurveIndex = 0;
    surface.renderedPointCount = 0;
  }

  function drawActiveStrokeIncrementally(surface) {
    var stroke = surface.currentStroke;
    var length = stroke ? stroke.length : 0;
    var start;
    var i;

    if (!surface.context || !stroke || length < 1) {
      return;
    }

    if (surface.renderedPointCount < 1) {
      drawDot(surface, stroke[0]);
      surface.renderedPointCount = 1;
    }

    if (length === 2 && surface.renderedPointCount < 2) {
      drawSegment(surface, stroke[0], stroke[1]);
      surface.renderedPointCount = 2;
      return;
    }

    if (length < 3) {
      return;
    }

    start = Math.max(1, surface.renderedCurveIndex + 1);

    for (i = start; i <= length - 2; i += 1) {
      drawCurveSegment(surface, midpointBetween(stroke[i - 1], stroke[i]), stroke[i], midpointBetween(stroke[i], stroke[i + 1]));
      surface.renderedCurveIndex = i;
    }

    surface.renderedPointCount = length;
  }

  function finishActiveStroke(surface) {
    var stroke = surface.currentStroke;
    var length = stroke ? stroke.length : 0;

    if (!stroke || length < 2) {
      return;
    }

    if (length === 2 && surface.renderedPointCount < 2) {
      drawSegment(surface, stroke[0], stroke[1]);
      return;
    }

    if (length > 2) {
      drawSegment(surface, midpointBetween(stroke[length - 2], stroke[length - 1]), stroke[length - 1]);
    }
  }

  function drawStroke(surface, stroke) {
    var i;
    var current;
    var next;
    var midpoint;
    var previousMidpoint;

    if (!stroke || stroke.length < 1) {
      return;
    }

    if (stroke.length === 1) {
      drawDot(surface, stroke[0]);
      return;
    }

    if (stroke.length === 2) {
      drawSegment(surface, stroke[0], stroke[1]);
      return;
    }

    previousMidpoint = midpointBetween(stroke[0], stroke[1]);

    for (i = 1; i < stroke.length - 1; i += 1) {
      current = stroke[i];
      next = stroke[i + 1];
      midpoint = midpointBetween(current, next);
      drawCurveSegment(surface, previousMidpoint, current, midpoint);
      previousMidpoint = midpoint;
    }

    drawSegment(surface, previousMidpoint, stroke[stroke.length - 1]);
  }

  function midpointBetween(from, to) {
    return {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      p: (from.p + to.p) / 2
    };
  }

  function strokeWidth(surface, point) {
    var config = surface.config;

    return Math.max(config.minWidth, Math.min(config.maxWidth, (point.p || 0.5) * config.pressureScale));
  }

  function drawDot(surface, point) {
    var context = surface.context;

    if (!context) {
      return;
    }

    context.fillStyle = "#111";
    context.beginPath();
    context.arc(point.x, point.y, strokeWidth(surface, point) / 2, 0, Math.PI * 2);
    context.fill();
  }

  function drawCurveSegment(surface, from, control, to) {
    var context = surface.context;

    if (!context) {
      return;
    }

    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111";
    context.lineWidth = strokeWidth(surface, control);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.quadraticCurveTo(control.x, control.y, to.x, to.y);
    context.stroke();
  }

  function drawSegment(surface, from, to) {
    var context = surface.context;

    if (!context) {
      return;
    }

    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111";
    context.lineWidth = strokeWidth(surface, to);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  function distanceBetween(from, to) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;

    return Math.sqrt(dx * dx + dy * dy);
  }

  function appendStrokePoint(surface, point) {
    var stroke = surface.currentStroke;
    var config = surface.config;
    var last;
    var distance;
    var steps;
    var i;

    if (!stroke) {
      return;
    }

    if (stroke.length < 1) {
      stroke.push(point);
      return;
    }

    last = stroke[stroke.length - 1];
    distance = distanceBetween(last, point);

    if (distance < config.minDistance) {
      return;
    }

    if (distance > config.interpolationStep) {
      steps = Math.min(config.maxInterpolationSteps, Math.max(2, Math.floor(distance / config.interpolationStep)));

      for (i = 1; i < steps; i += 1) {
        stroke.push({
          x: last.x + ((point.x - last.x) * i) / steps,
          y: last.y + ((point.y - last.y) * i) / steps,
          p: last.p + ((point.p - last.p) * i) / steps
        });
      }
    }

    stroke.push(point);
  }

  function canvasPoint(surface, event, inputType) {
    var rect = surface.canvas.getBoundingClientRect();
    var pressure = event.pressure && event.pressure > 0 ? event.pressure : 0.55;

    if (inputType === "touch") {
      pressure = 0.55;
    }

    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
      p: pressure
    };
  }

  function getInputEvents(event) {
    var events;

    if (event.getCoalescedEvents) {
      events = event.getCoalescedEvents();

      if (events && events.length > 0) {
        return events;
      }
    }

    return [event];
  }

  function addInputPoints(surface, event, inputType) {
    var events = getInputEvents(event);
    var i;

    for (i = 0; i < events.length; i += 1) {
      appendStrokePoint(surface, canvasPoint(surface, events[i], inputType));
    }

    drawActiveStrokeIncrementally(surface);
  }

  function getSurfaceLabel(surface) {
    var label = surface.canvas.parentNode && surface.canvas.parentNode.querySelector ? surface.canvas.parentNode.querySelector(".note-surface-label") : null;

    return label ? label.textContent : surface.id;
  }

  function setInputStatus(surface, inputType) {
    var prefix;

    if (!noteStatus) {
      return;
    }

    prefix = getSurfaceLabel(surface);

    if (inputType === "pen") {
      noteStatus.textContent = prefix + " - Lapiz";
      return;
    }

    if (inputType === "touch") {
      noteStatus.textContent = prefix + " - tactil";
      return;
    }

    noteStatus.textContent = prefix + " - " + inputType;
  }

  function startStroke(surface, event, inputType) {
    surface.drawing = true;
    surface.currentStroke = [];
    resetActiveStrokeRendering(surface);
    surface.strokes.push(surface.currentStroke);
    setInputStatus(surface, inputType);
    appendStrokePoint(surface, canvasPoint(surface, event, inputType));
    drawActiveStrokeIncrementally(surface);
  }

  function moveStroke(surface, event, inputType) {
    if (!surface.drawing || !surface.currentStroke) {
      return;
    }

    addInputPoints(surface, event, inputType);
  }

  function endStroke(surface) {
    if (!surface.drawing) {
      return;
    }

    surface.drawing = false;
    finishActiveStroke(surface);
    surface.currentStroke = null;
    saveStrokes(surface);
  }

  function endAllStrokes() {
    forEachNoteSurface(endStroke);
  }

  function addPointerCanvasEvents() {
    forEachNoteSurface(addCanvasEvents);
  }

  function addCanvasEvents(surface) {
    var canvas = surface.canvas;

    if (window.PointerEvent) {
      canvas.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        surface.activePointerId = event.pointerId;
        surface.rawPointerSeen = false;

        if (canvas.setPointerCapture) {
          canvas.setPointerCapture(event.pointerId);
        }

        startStroke(surface, event, event.pointerType || "pointer");
      });

      canvas.addEventListener("pointerrawupdate", function (event) {
        if (surface.activePointerId !== event.pointerId || !surface.drawing) {
          return;
        }

        surface.rawPointerSeen = true;
        event.preventDefault();
        moveStroke(surface, event, event.pointerType || "pointer");
      });

      canvas.addEventListener("pointermove", function (event) {
        if (surface.activePointerId !== event.pointerId || !surface.drawing) {
          return;
        }

        if (surface.rawPointerSeen) {
          return;
        }

        event.preventDefault();
        moveStroke(surface, event, event.pointerType || "pointer");
      });

      canvas.addEventListener("pointerup", function (event) {
        if (surface.activePointerId !== event.pointerId) {
          return;
        }

        event.preventDefault();
        surface.activePointerId = null;
        surface.rawPointerSeen = false;

        if (canvas.releasePointerCapture) {
          try {
            canvas.releasePointerCapture(event.pointerId);
          } catch (error) {
            // Some browsers release capture implicitly before pointerup.
          }
        }

        endStroke(surface);
      });

      canvas.addEventListener("pointercancel", function () {
        surface.activePointerId = null;
        surface.rawPointerSeen = false;
        endStroke(surface);
      });
      return;
    }

    canvas.addEventListener("mousedown", function (event) {
      event.preventDefault();
      startStroke(surface, event, "mouse");
    });

    canvas.addEventListener("mousemove", function (event) {
      event.preventDefault();
      moveStroke(surface, event, "mouse");
    });

    document.addEventListener("mouseup", function () {
      endStroke(surface);
    });

    canvas.addEventListener("touchstart", function (event) {
      var touch = event.touches && event.touches[0];

      if (!touch) {
        return;
      }

      event.preventDefault();
      startStroke(surface, touch, "touch");
    });

    canvas.addEventListener("touchmove", function (event) {
      var touch = event.touches && event.touches[0];

      if (!touch) {
        return;
      }

      event.preventDefault();
      moveStroke(surface, touch, "touch");
    });

    canvas.addEventListener("touchend", function () {
      endStroke(surface);
    });
    canvas.addEventListener("touchcancel", function () {
      endStroke(surface);
    });
  }

  if (prevLink) {
    prevLink.addEventListener("click", function (event) {
      handleControlClick(event, -1);
    });
  }

  if (nextLink) {
    nextLink.addEventListener("click", function (event) {
      handleControlClick(event, 1);
    });
  }

  if (notesToggle) {
    notesToggle.addEventListener("click", function () {
      if (state.notesOpen) {
        closeNotes();
      } else {
        openNotes();
      }
    });
  }

  if (selectionClose) {
    selectionClose.addEventListener("click", function () {
      clearSelectionState();
    });
  }

  if (noteClose) {
    noteClose.addEventListener("click", closeNotes);
  }

  if (noteClear) {
    noteClear.addEventListener("click", function () {
      forEachNoteSurface(function (surface) {
        surface.drawing = false;
        surface.currentStroke = null;
        surface.strokes = [];
        saveStrokes(surface);
        redrawStrokes(surface);
      });
    });
  }

  document.addEventListener("click", handleReaderClick);
  document.addEventListener("selectionchange", scheduleSelectionPopover);
  document.addEventListener("touchmove", preventSelectionNativeGesture, { passive: false });
  if (window.PointerEvent) {
    document.addEventListener("pointerdown", startSelectionDrag);
    document.addEventListener("pointermove", moveSelectionDrag);
    document.addEventListener("pointerup", function () {
      stopSelectionDrag();
      scheduleSelectionPopover();
    });
    document.addEventListener("pointercancel", stopSelectionDrag);
    main.addEventListener("pointerdown", startLongPress);
    main.addEventListener("pointermove", moveLongPress);
    main.addEventListener("pointerup", cancelLongPress);
    main.addEventListener("pointercancel", cancelLongPress);
  } else {
    document.addEventListener("touchstart", startSelectionDrag);
    document.addEventListener("touchmove", moveSelectionDrag);
    document.addEventListener("touchend", stopSelectionDrag);
    document.addEventListener("touchcancel", stopSelectionDrag);
    document.addEventListener("mousedown", startSelectionDrag);
    document.addEventListener("mousemove", moveSelectionDrag);
    document.addEventListener("mouseup", stopSelectionDrag);
    main.addEventListener("touchstart", startLongPress);
    main.addEventListener("touchmove", moveLongPress);
    main.addEventListener("touchend", cancelLongPress);
    main.addEventListener("touchcancel", cancelLongPress);
    main.addEventListener("mousedown", startLongPress);
    main.addEventListener("mousemove", moveLongPress);
    main.addEventListener("mouseup", cancelLongPress);
  }
  document.addEventListener("keyup", function (event) {
    if (state.notesOpen) {
      return;
    }

    if (event.key === "ArrowRight" || event.keyCode === 39 || event.keyCode === 32) {
      setPage(state.page + 1, true);
    }

    if (event.key === "ArrowLeft" || event.keyCode === 37) {
      setPage(state.page - 1, true);
    }
  });
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("popstate", function () {
    if (state.selectionDrag || state.wordHighlight || state.notesOpen) {
      restoreSelectionHistoryGuard();
      return;
    }

    state.selectionHistoryGuard = false;
    setPage(getPageFromUrl(), false);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(layoutPages);
  }

  addPointerCanvasEvents();
  layoutPages();
  window.setTimeout(layoutPages, 250);
  window.setTimeout(layoutPages, 900);
  }

  if (document.readyState === "complete") {
    window.setTimeout(bootReader, 0);
  } else {
    window.addEventListener("load", bootReader, { once: true });
  }
})();
