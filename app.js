(function ()
{
  const ROOT = "."; // ensure assets resolve from project root

  const boardEl = document.getElementById("board");
  const modeEl = document.getElementById("mode");
  const moveColorEl = document.getElementById("moveColor");
  const attackColorEl = document.getElementById("attackColor");
  const boardThemeEl = document.getElementById("boardTheme");
  const pieceThemeEl = document.getElementById("pieceTheme");
  const themeToggle = document.getElementById("themeToggle");
  const THEME_KEY = "theme";
  // --- Sidebar (collapsible) ---
  const optionsToggle = document.getElementById("optionsToggle");
  const sidebarEl = document.querySelector(".sidebar");
  const sideDimEl = document.getElementById("sideDim");
  const SIDEBAR_KEY = "sidebarOpen";
  const playerSideEl = document.getElementById("playerSide");
  const SIDE_KEY = "playerSide";
  const threatViewEl = document.getElementById("threatView");
  const THREAT_KEY = "threatView";

  function setSidebar(open)
  {
    if (!sidebarEl) return;

    sidebarEl.classList.toggle("is-open", !!open);
    optionsToggle && optionsToggle.setAttribute("aria-expanded", open ? "true" : "false");

    if (sideDimEl)
    {
      sideDimEl.classList.toggle("show", !!open);
    }

    try
    {
      localStorage.setItem(SIDEBAR_KEY, open ? "1" : "0");
    }
    catch (_)
    {}
  }

  // Restore last state (default closed)
  (function initSidebar()
  {
    let open = false;

    try
    {
      open = localStorage.getItem(SIDEBAR_KEY) === "1";
    }
    catch (_)
    {}

    setSidebar(open);

    optionsToggle && optionsToggle.addEventListener("click", () =>
    {
      const nowOpen = !sidebarEl.classList.contains("is-open");
      setSidebar(nowOpen);
    });

    sideDimEl && sideDimEl.addEventListener("click", () => setSidebar(false));

    // Escape to close
    document.addEventListener("keydown", (e) =>
    {
      if (e.key === "Escape") setSidebar(false);
    });
  })();

  (function initTheme()
  {
    let saved = null;

    try
    {
      saved = localStorage.getItem(THEME_KEY);
    }
    catch (_)
    {
      saved = null;
    }

    const root = document.documentElement;
    const setAria = () =>
    {
      if (!themeToggle)
      {
        return;
      }

      const isDark = root.classList.contains("theme-dark");
      themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
    };

    if (saved === "dark")
    {
      root.classList.add("theme-dark");
    }

    setAria();

    if (themeToggle)
    {
      themeToggle.addEventListener("click", () =>
      {
        root.classList.toggle("theme-dark");

        const isDark =
          root.classList.contains("theme-dark");

        try
        {
          localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
        }
        catch (_)
        {}

        setAria();
      });
    }
  })();


  const kindToLetter = { K:"k", Q:"q", R:"r", B:"b", N:"n", P:"p" };
  const PROMOTION_KINDS = [ "Q", "R", "B", "N" ];

  const W = "w";
  const B = "b";

  function setCSSVar(name, value)
  {
    document.documentElement.style.setProperty(name, value);
  }

  // ---- Theme helpers ----
  function applyBoardTheme(name)
  {
    setCSSVar("--board-bg", `url(${ROOT}/boards/${name})`);

    try
    {
      localStorage.setItem("boardTheme", name);
    }
    catch (_)
    {}
  }

  function applyPieceTheme(name)
  {
    const is3d = name.startsWith("3d_");

    setCSSVar("--piece-scale", is3d ? "0.92" : "0.85");
    setCSSVar("--piece-offset-y", is3d ? "-2px" : "0px");
    setCSSVar("--piece-drop-shadow", is3d ? "drop-shadow(0 1px 2px rgba(0,0,0,0.55))" : "drop-shadow(0 0 1px rgba(0,0,0,0.6))");

    if (name === "8_bit")
    {
      document.body.classList.add("pixelated");
    }
    else
    {
      document.body.classList.remove("pixelated");
    }

    // Update board piece images
    document.querySelectorAll(".piece-img").forEach((img) =>
    {
      const color = (img.getAttribute("data-color") || "").toLowerCase();
      const kind = img.getAttribute("data-kind") || "";
      const letter = kindToLetter[kind] || kind.toLowerCase();

      if (color && letter)
      {
        img.src = `${ROOT}/pieces/${name}/${color}${letter}.png`;
        img.alt = `${color}${letter}`;
      }
      else
      {
        img.removeAttribute("src");
      }
    });

    // Update popup choices if a promotion is pending
    refreshPromotionPopupImages();

    try
    {
      localStorage.setItem("pieceTheme", name);
    }
    catch (_)
    {}
  }

  // ---- Position + engine state (en passant + promotion UI) ----
  function startingPosition()
  {
    const g = Array.from({ length: 8 }, () => Array(8).fill(null));

    g[0] = ["R","N","B","Q","K","B","N","R"].map((k) => ({ color: B, kind: k }));
    g[1] = Array(8).fill({ color: B, kind: "P" }).map((p) => ({ ...p }));

    g[6] = Array(8).fill({ color: W, kind: "P" }).map((p) => ({ ...p }));
    g[7] = ["R","N","B","Q","K","B","N","R"].map((k) => ({ color: W, kind: k }));

    return g;
  }

  const boardState =
  {
    grid: startingPosition(),
    turn: W,
    selected: null,              // { r, c }
    legal:
    {
      moves: new Set(),
      attacks: new Set()
    },
    lastMove: null,              // { from:{r,c}, to:{r,c} }
    enPassant: null,             // { r, c, by:"w"|"b", capturedAt:{r,c} }
    promotion: null              // { r, c, color, popupEl, backdropEl }
  };

  function inBounds(r, c)
  {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function at(r, c)
  {
    return inBounds(r, c) ? boardState.grid[r][c] : null;
  }

  function setAt(r, c, piece)
  {
    if (inBounds(r, c))
    {
      boardState.grid[r][c] = piece;
    }
  }

  function sliding(r, c, color, directions)
  {
    const moves = [];
    const attacks = [];

    for (const [dr, dc] of directions)
    {
      let rr = r + dr;
      let cc = c + dc;

      while (inBounds(rr, cc))
      {
        const t = at(rr, cc);

        if (!t)
        {
          moves.push({ r: rr, c: cc });
        }
        else
        {
          if (t.color !== color)
          {
            attacks.push({ r: rr, c: cc });
          }
          break;
        }

        rr += dr;
        cc += dc;
      }
    }

    return { moves, attacks };
  }

  // mode: "both" | "moves" | "attacks" (UI-only; legality is always both)
  function highlights(r, c, mode)
  {
    const p = at(r, c);

    if (!p)
    {
      return { moves: [], attacks: [] };
    }

    const color = p.color;
    const both = mode === "both";
    const wantMoves = both || mode === "moves";
    const wantAttacks = both || mode === "attacks";

    let moves = [];
    let attacks = [];

    switch (p.kind)
    {
      case "N":
      {
        const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];

        for (const [dr, dc] of deltas)
        {
          const rr = r + dr;
          const cc = c + dc;

          if (!inBounds(rr, cc))
          {
            continue;
          }

          const t = at(rr, cc);

          if (!t && wantMoves)
          {
            moves.push({ r: rr, c: cc });
          }
          else if (t && t.color !== color && wantAttacks)
          {
            attacks.push({ r: rr, c: cc });
          }
        }

        break;
      }

      case "K":
      {
        const deltas = [-1, 0, 1];

        for (const dr of deltas)
        {
          for (const dc of deltas)
          {
            if (dr === 0 && dc === 0)
            {
              continue;
            }

            const rr = r + dr;
            const cc = c + dc;

            if (!inBounds(rr, cc))
            {
              continue;
            }

            const t = at(rr, cc);

            if (!t && wantMoves)
            {
              moves.push({ r: rr, c: cc });
            }
            else if (t && t.color !== color && wantAttacks)
            {
              attacks.push({ r: rr, c: cc });
            }
          }
        }

        break;
      }

      case "B":
      {
        const res = sliding(r, c, color, [[-1,-1],[-1,1],[1,-1],[1,1]]);
        if (wantMoves) { moves = res.moves; }
        if (wantAttacks) { attacks = res.attacks; }
        break;
      }

      case "R":
      {
        const res = sliding(r, c, color, [[-1,0],[1,0],[0,-1],[0,1]]);
        if (wantMoves) { moves = res.moves; }
        if (wantAttacks) { attacks = res.attacks; }
        break;
      }

      case "Q":
      {
        const res = sliding(r, c, color, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
        if (wantMoves) { moves = res.moves; }
        if (wantAttacks) { attacks = res.attacks; }
        break;
      }

      case "P":
      {
        const dir = (color === W) ? -1 : 1;
        const one = [r + dir, c];
        const two = [r + 2 * dir, c];

        // Forward pushes
        if (wantMoves)
        {
          if (inBounds(...one) && !at(...one))
          {
            moves.push({ r: one[0], c: one[1] });

            const startRow = (color === W) ? 6 : 1;

            if (r === startRow && inBounds(...two) && !at(...two))
            {
              moves.push({ r: two[0], c: two[1] });
            }
          }
        }

        // Captures (regular + en passant)
        if (wantAttacks)
        {
          for (const dc of [-1, 1])
          {
            const rr = r + dir;
            const cc = c + dc;

            if (!inBounds(rr, cc))
            {
              continue;
            }

            const t = at(rr, cc);

            // Normal diagonal capture
            if (t && t.color !== color)
            {
              attacks.push({ r: rr, c: cc });
              continue;
            }

            // En passant: empty target square matches stored EP square
            const ep = boardState.enPassant;

            if
            (
              !t &&
              ep &&
              ep.by === color &&
              rr === ep.r &&
              cc === ep.c
            )
            {
              attacks.push({ r: rr, c: cc });
            }
          }
        }

        break;
      }
    }

    return { moves, attacks };
  }

  // ---- Play logic ----
  function keyOf(r, c)
  {
    return `${r}-${c}`;
  }

  function isLegalTarget(r, c)
  {
    const k = keyOf(r, c);
    return boardState.legal.moves.has(k) || boardState.legal.attacks.has(k);
  }

  function selectSquare(r, c)
  {
    const p = at(r, c);

    if (!p || p.color !== boardState.turn)
    {
      boardState.selected = null;
      boardState.legal.moves.clear();
      boardState.legal.attacks.clear();
      clearHighlights();
      return;
    }

    boardState.selected = { r, c };

    const res = highlights(r, c, "both");

    boardState.legal.moves = new Set(res.moves.map((m) => keyOf(m.r, m.c)));
    boardState.legal.attacks = new Set(res.attacks.map((a) => keyOf(a.r, a.c)));

    drawSelectionAndTargets(r, c);
  }

  function makeMove(sr, sc, dr, dc)
  {
    // If a promotion dialog is open, ignore board clicks
    if (boardState.promotion)
    {
      return;
    }

    const moving = at(sr, sc);
    const target = at(dr, dc);

    // Detect en passant capture BEFORE altering the grid
    let usedEnPassant = false;

    if
    (
      moving &&
      moving.kind === "P" &&
      !target &&
      boardState.enPassant &&
      boardState.enPassant.by === boardState.turn &&
      dr === boardState.enPassant.r &&
      dc === boardState.enPassant.c
    )
    {
      const victim = boardState.enPassant.capturedAt;

      if (victim && at(victim.r, victim.c))
      {
        setAt(victim.r, victim.c, null);
        usedEnPassant = true;
      }
    }

    // Execute move (normal or EP)
    setAt(dr, dc, moving);
    setAt(sr, sc, null);

    // Record last move (safe to set now)
    boardState.lastMove = { from: { r: sr, c: sc }, to: { r: dr, c: dc } };

    // Update en passant state for next move
    if (moving && moving.kind === "P" && Math.abs(dr - sr) === 2 && !usedEnPassant)
    {
      const dir = (moving.color === W) ? -1 : 1;

      boardState.enPassant =
      {
        r: sr + dir,                 // the square the pawn "passed" over
        c: sc,
        by: (moving.color === W) ? B : W,
        capturedAt: { r: dr, c: dc } // where the double-step pawn currently sits
      };
    }
    else
    {
      boardState.enPassant = null;
    }

    // Promotion check (no auto-queen)
    if (moving && moving.kind === "P" && ((moving.color === W && dr === 0) || (moving.color === B && dr === 7)))
    {
      // Lock UI and show choices above the pawn on (dr, dc)
      beginPromotion(dr, dc, moving.color);

      // Clear selection while waiting
      boardState.selected = null;
      boardState.legal.moves.clear();
      boardState.legal.attacks.clear();

      // Re-render board so pawn is visually on the last rank under the popup
      renderBoard();

      // IMPORTANT: Do NOT swap turn yet; move is incomplete until a piece is chosen
      return;
    }

    // Otherwise, normal move completion
    boardState.turn = (boardState.turn === W) ? B : W;

    boardState.selected = null;
    boardState.legal.moves.clear();
    boardState.legal.attacks.clear();

    renderBoard();
  }

  // ---- Promotion UI ----
  function beginPromotion(r, c, color)
  {
    // Create backdrop to block clicks
    const backdrop = document.createElement("div");
    backdrop.className = "promotion-backdrop";

    // Create popup
    const popup = document.createElement("div");
    popup.className = "promotion-popup";

    // Title
    //const label = document.createElement("div");
    //label.className = "promotion-label";
    //label.textContent = "Promote to:";
    //popup.appendChild(label);

    // Choices row
    const row = document.createElement("div");
    row.className = "promotion-row";

    for (const k of PROMOTION_KINDS)
    {
      const img = document.createElement("img");
      img.className = "promotion-choice";

      // compute src from current theme
      const theme = pieceThemeEl.value;
      const letter = kindToLetter[k];
      img.src = `${ROOT}/pieces/${theme}/${color}${letter}.png`;
      img.alt = `${color}${letter}`;
      img.setAttribute("data-kind", k);

      img.addEventListener("click", () =>
      {
        finishPromotion(r, c, k);
      });

      row.appendChild(img);
    }

    popup.appendChild(row);

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);

    // Position the popup above the target square (clamped to viewport)
    positionPromotionPopup(popup, r, c);

    boardState.promotion =
    {
      r,
      c,
      color,
      popupEl: popup,
      backdropEl: backdrop
    };
  }

  function refreshPromotionPopupImages()
  {
    if (!boardState.promotion)
    {
      return;
    }

    const { color, popupEl } = boardState.promotion;

    if (!popupEl)
    {
      return;
    }

    const theme = pieceThemeEl.value;

    popupEl.querySelectorAll(".promotion-choice").forEach((img) =>
    {
      const k = img.getAttribute("data-kind");
      const letter = kindToLetter[k];
      img.src = `${ROOT}/pieces/${theme}/${color}${letter}.png`;
      img.alt = `${color}${letter}`;
    });
  }

  function positionPromotionPopup(popup, r, c)
  {
    const sq = querySquare(r, c);

    if (!sq)
    {
      // fallback to center
      popup.style.position = "absolute";
      popup.style.left = "50%";
      popup.style.top = "20px";
      popup.style.transform = "translateX(-50%)";
      popup.style.zIndex = "9999";
      // popup.style.zIndex = "9999"
      return;
    }

    const rect = sq.getBoundingClientRect();
    document.body.appendChild(popup); // ensure it has size

    // Measure popup
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;

    // Desired: centered horizontally, **above** square by 8px
    let left = rect.left + window.scrollX + (rect.width / 2) - (pw / 2);
    let top  = rect.top + window.scrollY - ph - 8;

    // Clamp to viewport padding
    const pad = 8;
    const minLeft = window.scrollX + pad;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - pw - pad;

    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    // If off the top, nudge below the square instead
    const minTop = window.scrollY + pad;

    if (top < minTop)
    {
      top = rect.bottom + window.scrollY + 8;
    }

    popup.style.position = "absolute";
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.zIndex = "10000";
  }

  function finishPromotion(r, c, toKind)
  {
    const piece = at(r, c);

    if (!piece || piece.kind !== "P")
    {
      cleanupPromotionUI();
      return;
    }

    piece.kind = toKind;

    // Clear promotion UI + state
    cleanupPromotionUI();

    // Completing the move: now swap turn
    boardState.turn = (boardState.turn === W) ? B : W;

    // Clear selection buffers
    boardState.selected = null;
    boardState.legal.moves.clear();
    boardState.legal.attacks.clear();

    // EP is irrelevant now
    boardState.enPassant = null;

    renderBoard();
  }

  function cleanupPromotionUI()
  {
    const p = boardState.promotion;

    if (!p) return;

    if (p.popupEl && p.popupEl.parentNode) p.popupEl.parentNode.removeChild(p.popupEl);
    if (p.backdropEl && p.backdropEl.parentNode) p.backdropEl.parentNode.removeChild(p.backdropEl);

    boardState.promotion = null;
  }

  // ---- Threat compute----
  function controlSquares(r, c)
  {
    const p = at(r, c);
    if (!p) return [];
    const out = [];
    const color = p.color;

    const rays =
    {
      "B": [[-1,-1],[-1,1],[1,-1],[1,1]],
      "R": [[-1,0],[1,0],[0,-1],[0,1]],
      "Q": [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]
    };

    switch (p.kind)
    {
      case "N":
      {
        const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr,dc] of deltas)
        {
          const rr = r + dr, cc = c + dc;
          if (inBounds(rr,cc)) out.push({ r: rr, c: cc });
        }
        break;
      }

      case "K":
      {
        for (let dr = -1; dr <= 1; dr++)
        {
          for (let dc = -1; dc <= 1; dc++)
          {
            if (dr === 0 && dc === 0) continue;
            const rr = r + dr, cc = c + dc;
            if (inBounds(rr,cc)) out.push({ r: rr, c: cc });
          }
        }
        break;
      }

      case "B":
      case "R":
      case "Q":
      {
        for (const [dr, dc] of rays[p.kind])
        {
          let rr = r + dr, cc = c + dc;
          while (inBounds(rr, cc))
          {
            out.push({ r: rr, c: cc });
            if (at(rr, cc)) break; // stop ray when any piece blocks
            rr += dr; cc += dc;
          }
        }
        break;
      }

      case "P":
      {
        const dir = (color === "w") ? -1 : 1;
        for (const dc of [-1, 1])
        {
          const rr = r + dir, cc = c + dc;
          if (inBounds(rr,cc)) out.push({ r: rr, c: cc }); // pawns *control* diagonals even if empty
        }
        break;
      }
    }
    return out;
  }

  // ---- Threat compute----
  function computeThreatMaps()
  {
    // Player bottom color (respects orientation control if present)
    const bottomColor = (playerSideEl && playerSideEl.value === "black") ? B : W;

    const mk = () => Array.from({ length: 8 }, () => Array(8).fill(0));
    const yours = mk();
    const enemy = mk();

    for (let r = 0; r < 8; r++)
      {
        for (let c = 0; c < 8; c++)
        {
          const p = at(r, c);
          if (!p) continue;

          const ctrl = controlSquares(r, c);
          for (const a of ctrl) {
            if (p.color === bottomColor) {
              yours[a.r][a.c] += 1;
            } else {
              enemy[a.r][a.c] += 1;
            }
          }
        }
      }    
      return { yours, enemy };
    }

  // ---- Threat visualization----
  function drawThreatOverlay(mode, maps) {
    const cells = boardEl.querySelectorAll(".threat-cell");

    cells.forEach((cell) => {
      // reset any class-based visuals
      cell.classList.remove("threat-you", "threat-enemy");

      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);

      let y = maps.yours[r][c];   // player contributions
      let e = maps.enemy[r][c];   // opponent contributions

      // Respect toggle
      if (mode === "yours") e = 0;
      if (mode === "enemy") y = 0;

      const total = y + e;

      // Nothing controls this square: clear any previous gradient
      if (!total) {
        cell.style.backgroundImage = "";
        return;
      }

      // Build N equal horizontal bands (N = total),
      // first y bands blue, remaining e bands red.
      const step = 100 / total;
      const segments = [];
      for (let i = 0; i < total; i++) {
        const start = (i * step).toFixed(4) + "%";
        const end   = ((i + 1) * step).toFixed(4) + "%";
        const color = i < y ? "var(--threat-you)" : "var(--threat-opp)";
        segments.push(`${color} ${start} ${end}`);
      }


      // Color bands + thin horizontal divider at each step
      const bands = `linear-gradient(to bottom, ${segments.join(",")})`;
      const lines = `repeating-linear-gradient(
        to bottom,
        rgba(205, 205, 205, 1),
        rgba(108, 108, 108, 1) 3px,
        transparent 1px,
        transparent ${step}%
      )`;

      cell.style.backgroundImage = `${bands}, ${lines}`;
      cell.style.backgroundBlendMode = "normal";
    });
  }


  // ---- UI rendering ----
  function renderBoard()
  {
    boardEl.innerHTML = "";

    // Build threat overlay layer (under squares)
    const layer = document.createElement("div");
    layer.className = "threat-layer";
    for (let rr = 0; rr < 8; rr++)
    {
      for (let cc = 0; cc < 8; cc++)
      {
        const cell = document.createElement("div");
        cell.className = "threat-cell";
        cell.dataset.row = rr;
        cell.dataset.col = cc;
        layer.appendChild(cell);
      }
    }
    boardEl.appendChild(layer);

    // Build the actual squares
    for (let r = 0; r < 8; r++)
    {
      for (let c = 0; c < 8; c++)
      {
        const sq = document.createElement("div");
        sq.className = "square";
        sq.dataset.row = r;
        sq.dataset.col = c;
        

        const p = at(r, c);

        if (p)
        {
          const img = document.createElement("img");
          img.className = "piece-img";
          img.setAttribute("data-color", p.color);
          img.setAttribute("data-kind", p.kind);
          sq.appendChild(img);
        }

        sq.addEventListener("click", onClickSquare);
        boardEl.appendChild(sq);
      }
    }

    applyPieceTheme(pieceThemeEl.value);

    if (boardState.lastMove)
    {
      const { from, to } = boardState.lastMove;
      const a = querySquare(from.r, from.c);
      const b = querySquare(to.r, to.c);

      a && a.classList.add("last-move");
      b && b.classList.add("last-move");
    }

    const turnEl = document.getElementById("turnIndicator");

    if (turnEl)
    {
      // If promotion UI is open, it’s still the current player’s move
      const t = (boardState.turn === W) ? "Turn: White" : "Turn: Black";
      turnEl.textContent = t;
    }

    // If something is selected, redraw targets (respects Mode dropdown)
    if (boardState.selected)
    {
      drawSelectionAndTargets(boardState.selected.r, boardState.selected.c);
    }

    // If promotion popup is open, re-position it (in case layout changed)
    if (boardState.promotion && boardState.promotion.popupEl)
    {
      positionPromotionPopup(boardState.promotion.popupEl, boardState.promotion.r, boardState.promotion.c);
    }

    // Threat overlay update (always recompute; inexpensive at small scale)
    const mode = (threatViewEl && threatViewEl.value) || "off";
    if (mode !== "off")
    {
      const maps = computeThreatMaps();
      drawThreatOverlay(mode, maps);
    }

  }

  function querySquare(r, c)
  {
    return boardEl.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
  }

  function clearHighlights()
  {
    document.querySelectorAll(".square").forEach((sq) =>
    {
      sq.classList.remove("highlight-move", "highlight-attack", "highlight-selected");
    });
  }

  function drawSelectionAndTargets(r, c)
  {
    clearHighlights();

    const origin = querySquare(r, c);
    origin && origin.classList.add("highlight-selected");

    const mode = (modeEl && modeEl.value) || "both";
    const showMoves = mode === "both" || mode === "moves";
    const showAttacks = mode === "both" || mode === "attacks";

    document.querySelectorAll(".square").forEach((s) =>
    {
      const rr = parseInt(s.dataset.row, 10);
      const cc = parseInt(s.dataset.col, 10);
      const key = keyOf(rr, cc);

      if (showMoves && boardState.legal.moves.has(key))
      {
        s.classList.add("highlight-move");
      }

      if (showAttacks && boardState.legal.attacks.has(key))
      {
        s.classList.add("highlight-attack");
      }
    });
  }

  function onClickSquare(ev)
  {
    // Ignore board clicks while promotion UI is open
    if (boardState.promotion)
    {
      return;
    }

    const sq = ev.currentTarget;
    const r = parseInt(sq.dataset.row, 10);
    const c = parseInt(sq.dataset.col, 10);

    if (boardState.selected && isLegalTarget(r, c))
    {
      makeMove(boardState.selected.r, boardState.selected.c, r, c);
      return;
    }

    const p = at(r, c);

    if (p && p.color === boardState.turn)
    {
      selectSquare(r, c);
      return;
    }

    // Clicked empty/illegal: clear selection
    boardState.selected = null;
    boardState.legal.moves.clear();
    boardState.legal.attacks.clear();
    clearHighlights();
  }
  // ---- Player side choice ----
    function applyPlayerSide(side)
  {
    const isBlack = (side === "black");
    setCSSVar("--board-rot", isBlack ? "180deg" : "0deg");
    setCSSVar("--piece-unrot", isBlack ? "180deg" : "0deg");

    try
    {
      localStorage.setItem(SIDE_KEY, isBlack ? "black" : "white");
    }
    catch (_)
    {}
  }


  // ---- Controls init ----
  (function initControls()
  {
    // Glow colors
    setCSSVar("--move-glow", moveColorEl.value);
    setCSSVar("--attack-glow", attackColorEl.value);

    moveColorEl.addEventListener("input", () => setCSSVar("--move-glow", moveColorEl.value));
    attackColorEl.addEventListener("input", () => setCSSVar("--attack-glow", attackColorEl.value));

    // Board theme
    const savedBoard = (() =>
    {
      try { return localStorage.getItem("boardTheme"); }
      catch (_) { return null; }
    })();

    if (savedBoard && Array.from(boardThemeEl.options).some((o) => o.value === savedBoard))
    {
      boardThemeEl.value = savedBoard;
    }

    applyBoardTheme(boardThemeEl.value);
    boardThemeEl.addEventListener("change", () => applyBoardTheme(boardThemeEl.value));

    // Piece theme
    const savedPieces = (() =>
    {
      try { return localStorage.getItem("pieceTheme"); }
      catch (_) { return null; }
    })();

    if (savedPieces && Array.from(pieceThemeEl.options).some((o) => o.value === savedPieces))
    {
      pieceThemeEl.value = savedPieces;
    }

    pieceThemeEl.addEventListener("change", () =>
    {
      applyPieceTheme(pieceThemeEl.value);
    });
    
    // Player side (bottom)
    const savedSide = (() =>
    {
      try { return localStorage.getItem(SIDE_KEY); }
      catch (_) { return null; }
    })();

    if (playerSideEl)
    {
      if (savedSide === "black" || savedSide === "white")
      {
        playerSideEl.value = savedSide;
      }
      // Ensure board orientation is applied on first paint
      (function ensureSideOnLoad()
      {
        let side = "white";
        try
        {
          const s = localStorage.getItem(SIDE_KEY);
          if (s === "black") side = "black";
        }
        catch (_)
        {}

        applyPlayerSide(side);
      })();

      applyPlayerSide(playerSideEl.value);

      playerSideEl.addEventListener("change", () =>
      {
        applyPlayerSide(playerSideEl.value);

        renderBoard();
      });
    }
    // Threat overlay toggle (persist)
    const savedThreat = (() =>
    {
      try { return localStorage.getItem(THREAT_KEY); }
      catch (_) { return null; }
    })();

    if (threatViewEl)
    {
      if (savedThreat && ["off","yours","enemy","both"].includes(savedThreat))
      {
        threatViewEl.value = savedThreat;
      }

      threatViewEl.addEventListener("change", () =>
      {
        try { localStorage.setItem(THREAT_KEY, threatViewEl.value); } catch (_){}
        renderBoard(); // redraw to apply new overlay mode
      });
    }

    // Mode change only affects drawing (legality is both)
    if (modeEl)
    {
      modeEl.addEventListener("change", () =>
      {
        if (boardState.selected)
        {
          drawSelectionAndTargets(boardState.selected.r, boardState.selected.c);
        }
      });
    }

    // Reset button (if present)
    const resetBtn = document.getElementById("resetBtn");

    if (resetBtn)
    {
      resetBtn.addEventListener("click", () =>
      {
        cleanupPromotionUI();
        boardState.grid = startingPosition();
        boardState.turn = W;
        boardState.selected = null;
        boardState.legal.moves.clear();
        boardState.legal.attacks.clear();
        boardState.lastMove = null;
        boardState.enPassant = null;
        renderBoard();
      });
    }
  })();

  // ---- Initial render ----
  renderBoard();

  const savedPieces = (() =>
  {
    try { return localStorage.getItem("pieceTheme"); }
    catch (_) { return null; }
  })();

  if (savedPieces && Array.from(pieceThemeEl.options).some((o) => o.value === savedPieces))
  {
    pieceThemeEl.value = savedPieces;
  }

  applyPieceTheme(pieceThemeEl.value);
})();
