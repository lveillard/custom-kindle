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
  var notesToggle = document.getElementById("notes-toggle");
  var notePanel = document.getElementById("note-panel");
  var noteCanvas = document.getElementById("note-canvas");
  var noteClear = document.getElementById("note-clear");
  var noteClose = document.getElementById("note-close");
  var noteStatus = document.getElementById("note-status");
  var wordHighlightLayer = null;

  if (!shell || !main || !viewport || !flow) {
    return;
  }

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
    notesOpen: false
  };

  var notes = {
    drawing: false,
    strokes: [],
    currentStroke: null,
    context: null,
    activePointerId: null,
    redrawFrame: 0,
    dpr: 1,
    width: 0,
    height: 0
  };

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
      resizeNoteCanvas();
    }
  }

  function setPage(page, syncUrl) {
    state.page = clamp(page, 1, state.total);
    flow.style.transform = "translate3d(-" + ((state.page - 1) * state.step) + "px, 0, 0)";
    updateControls();
    clearSelectionState();

    if (state.notesOpen) {
      loadStrokes();
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
      selectionText.textContent = text.length > 76 ? text.slice(0, 73) + "..." : text;
    }

    if (selectionTranslation) {
      selectionTranslation.textContent = fakeTranslate(text);
    }

    renderWordUnderline(range);
    popover.hidden = false;

    var popWidth = popover.offsetWidth || 260;
    var popHeight = popover.offsetHeight || 80;
    var left = clamp(rect.left + rect.width / 2 - popWidth / 2, 12, window.innerWidth - popWidth - 12);
    var top = rect.top - popHeight - 10;

    if (top < 58) {
      top = rect.bottom + 10;
    }

    popover.style.left = left + "px";
    popover.style.top = top + "px";
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

    if (selection && selection.removeAllRanges) {
      selection.removeAllRanges();
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

    layer.innerHTML = "";

    for (i = 0; i < rects.length; i += 1) {
      if (rects[i].width < 1 || rects[i].height < 1) {
        continue;
      }

      var line = document.createElement("span");
      line.className = "word-highlight-line";
      line.style.left = rects[i].left + "px";
      line.style.top = Math.max(0, rects[i].bottom - 3) + "px";
      line.style.width = rects[i].width + "px";
      layer.appendChild(line);
    }
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

  function selectWordAt(x, y) {
    var range = expandRangeToWord(getRangeFromPoint(x, y));
    var selection;
    var text;

    if (!range) {
      return false;
    }

    selection = window.getSelection ? window.getSelection() : null;
    text = range.toString().replace(/\s+/g, " ").trim();

    if (!selection || !text) {
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(range);
    state.wordHighlight = range.cloneRange();
    showPopoverForRange(range, text);

    return true;
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
      state.suppressClickUntil = Date.now() + 750;

      if (!selectWordAt(point.x, point.y)) {
        state.suppressClickUntil = 0;
      }
    }, 560);
  }

  function moveLongPress(event) {
    var point;
    var dx;
    var dy;

    if (!state.pressPoint) {
      return;
    }

    point = getEventPoint(event);
    dx = point.x - state.pressPoint.x;
    dy = point.y - state.pressPoint.y;

    if (Math.sqrt(dx * dx + dy * dy) > 9) {
      cancelLongPress();
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

  function openNotes() {
    if (!notePanel || !noteCanvas) {
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

    resizeNoteCanvas();
    loadStrokes();
  }

  function closeNotes() {
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

  function storageKey() {
    return "kindle-reader-note-v1-page-" + state.page;
  }

  function resizeNoteCanvas() {
    if (!noteCanvas) {
      return;
    }

    var rect = noteCanvas.getBoundingClientRect();

    if (rect.width < 1 || rect.height < 1) {
      return;
    }

    notes.dpr = Math.min(2, window.devicePixelRatio || 1);
    notes.width = rect.width;
    notes.height = rect.height;
    noteCanvas.width = Math.round(rect.width * notes.dpr);
    noteCanvas.height = Math.round(rect.height * notes.dpr);
    notes.context = noteCanvas.getContext("2d");
    notes.context.setTransform(notes.dpr, 0, 0, notes.dpr, 0, 0);
    redrawStrokes();
  }

  function loadStrokes() {
    if (!window.localStorage) {
      notes.strokes = [];
      redrawStrokes();
      return;
    }

    try {
      notes.strokes = JSON.parse(window.localStorage.getItem(storageKey()) || "[]");
    } catch (error) {
      notes.strokes = [];
    }

    redrawStrokes();
  }

  function saveStrokes() {
    if (!window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(notes.strokes));
    } catch (error) {
      return;
    }
  }

  function redrawStrokes() {
    var context = notes.context;
    var i;

    notes.redrawFrame = 0;

    if (!context) {
      return;
    }

    context.clearRect(0, 0, notes.width, notes.height);

    for (i = 0; i < notes.strokes.length; i += 1) {
      drawStroke(notes.strokes[i]);
    }
  }

  function requestNotesRedraw() {
    if (notes.redrawFrame) {
      return;
    }

    if (window.requestAnimationFrame) {
      notes.redrawFrame = window.requestAnimationFrame(redrawStrokes);
    } else {
      notes.redrawFrame = window.setTimeout(redrawStrokes, 16);
    }
  }

  function drawStroke(stroke) {
    var i;
    var current;
    var next;
    var midpoint;
    var previousMidpoint;

    if (!stroke || stroke.length < 1) {
      return;
    }

    if (stroke.length === 1) {
      drawDot(stroke[0]);
      return;
    }

    if (stroke.length === 2) {
      drawSegment(stroke[0], stroke[1]);
      return;
    }

    previousMidpoint = midpointBetween(stroke[0], stroke[1]);

    for (i = 1; i < stroke.length - 1; i += 1) {
      current = stroke[i];
      next = stroke[i + 1];
      midpoint = midpointBetween(current, next);
      drawCurveSegment(previousMidpoint, current, midpoint);
      previousMidpoint = midpoint;
    }

    drawSegment(previousMidpoint, stroke[stroke.length - 1]);
  }

  function midpointBetween(from, to) {
    return {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      p: (from.p + to.p) / 2
    };
  }

  function strokeWidth(point) {
    return Math.max(1.6, Math.min(4.2, (point.p || 0.5) * 4.2));
  }

  function drawDot(point) {
    var context = notes.context;

    if (!context) {
      return;
    }

    context.fillStyle = "#111";
    context.beginPath();
    context.arc(point.x, point.y, strokeWidth(point) / 2, 0, Math.PI * 2);
    context.fill();
  }

  function drawCurveSegment(from, control, to) {
    var context = notes.context;

    if (!context) {
      return;
    }

    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111";
    context.lineWidth = strokeWidth(control);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.quadraticCurveTo(control.x, control.y, to.x, to.y);
    context.stroke();
  }

  function drawSegment(from, to) {
    var context = notes.context;

    if (!context) {
      return;
    }

    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111";
    context.lineWidth = strokeWidth(to);
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

  function appendStrokePoint(point) {
    var stroke = notes.currentStroke;
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

    if (distance < 0.75) {
      return;
    }

    if (distance > 7) {
      steps = Math.min(8, Math.floor(distance / 5));

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

  function canvasPoint(event, inputType) {
    var rect = noteCanvas.getBoundingClientRect();
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

  function addInputPoints(event, inputType) {
    var events = getInputEvents(event);
    var i;

    for (i = 0; i < events.length; i += 1) {
      appendStrokePoint(canvasPoint(events[i], inputType));
    }

    requestNotesRedraw();
  }

  function setInputStatus(inputType) {
    if (!noteStatus) {
      return;
    }

    if (inputType === "pen") {
      noteStatus.textContent = "Lapiz detectado";
      return;
    }

    if (inputType === "touch") {
      noteStatus.textContent = "Entrada tactil";
      return;
    }

    noteStatus.textContent = "Entrada " + inputType;
  }

  function startStroke(event, inputType) {
    if (!noteCanvas) {
      return;
    }

    notes.drawing = true;
    notes.currentStroke = [];
    notes.strokes.push(notes.currentStroke);
    setInputStatus(inputType);
    appendStrokePoint(canvasPoint(event, inputType));
    requestNotesRedraw();
  }

  function moveStroke(event, inputType) {
    if (!notes.drawing || !notes.currentStroke) {
      return;
    }

    addInputPoints(event, inputType);
  }

  function endStroke() {
    if (!notes.drawing) {
      return;
    }

    notes.drawing = false;
    notes.currentStroke = null;
    requestNotesRedraw();
    saveStrokes();
  }

  function addPointerCanvasEvents() {
    if (!noteCanvas) {
      return;
    }

    if (window.PointerEvent) {
      noteCanvas.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        notes.activePointerId = event.pointerId;

        if (noteCanvas.setPointerCapture) {
          noteCanvas.setPointerCapture(event.pointerId);
        }

        startStroke(event, event.pointerType || "pointer");
      });

      noteCanvas.addEventListener("pointermove", function (event) {
        if (notes.activePointerId !== event.pointerId || !notes.drawing) {
          return;
        }

        event.preventDefault();
        moveStroke(event, event.pointerType || "pointer");
      });

      noteCanvas.addEventListener("pointerup", function (event) {
        if (notes.activePointerId !== event.pointerId) {
          return;
        }

        event.preventDefault();
        notes.activePointerId = null;

        if (noteCanvas.releasePointerCapture) {
          try {
            noteCanvas.releasePointerCapture(event.pointerId);
          } catch (error) {
            // Some browsers release capture implicitly before pointerup.
          }
        }

        endStroke();
      });

      noteCanvas.addEventListener("pointercancel", function () {
        notes.activePointerId = null;
        endStroke();
      });
      return;
    }

    noteCanvas.addEventListener("mousedown", function (event) {
      event.preventDefault();
      startStroke(event, "mouse");
    });

    noteCanvas.addEventListener("mousemove", function (event) {
      event.preventDefault();
      moveStroke(event, "mouse");
    });

    document.addEventListener("mouseup", endStroke);

    noteCanvas.addEventListener("touchstart", function (event) {
      var touch = event.touches && event.touches[0];

      if (!touch) {
        return;
      }

      event.preventDefault();
      startStroke(touch, "touch");
    });

    noteCanvas.addEventListener("touchmove", function (event) {
      var touch = event.touches && event.touches[0];

      if (!touch) {
        return;
      }

      event.preventDefault();
      moveStroke(touch, "touch");
    });

    noteCanvas.addEventListener("touchend", endStroke);
    noteCanvas.addEventListener("touchcancel", endStroke);
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

  if (noteClose) {
    noteClose.addEventListener("click", closeNotes);
  }

  if (noteClear) {
    noteClear.addEventListener("click", function () {
      notes.strokes = [];
      saveStrokes();
      redrawStrokes();
    });
  }

  document.addEventListener("click", handleReaderClick);
  document.addEventListener("selectionchange", scheduleSelectionPopover);
  if (window.PointerEvent) {
    main.addEventListener("pointerdown", startLongPress);
    main.addEventListener("pointermove", moveLongPress);
    main.addEventListener("pointerup", cancelLongPress);
    main.addEventListener("pointercancel", cancelLongPress);
  } else {
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
  document.addEventListener("pointerup", scheduleSelectionPopover);
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("popstate", function () {
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
