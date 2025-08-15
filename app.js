(function ()
{
  const ROOT = "."; // was ".."

  const boardEl = document.getElementById("board");
  const modeEl = document.getElementById("mode");
  const moveColorEl = document.getElementById("moveColor");
  const attackColorEl = document.getElementById("attackColor");
  const boardThemeEl = document.getElementById("boardTheme");
  const pieceThemeEl = document.getElementById("pieceTheme");

  const kindToLetter = { K:"k", Q:"q", R:"r", B:"b", N:"n", P:"p" };

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

    try
    {
      localStorage.setItem("pieceTheme", name);
    }
    catch (_)
    {}
  }

  // ---- Position + simple engine (no check/pins/castling/en passant) ----
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
    selected: null,          // { r, c }
    legal: {                  // caches for current selection
      moves: new Set(),
      attacks: new Set()
    },
    lastMove: null           // { from:{r,c}, to:{r,c} }
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

    const add = (m, a) =>
    {
      return {
        moves: [ ...moves, ...(wantMoves ? m : []) ],
        attacks: [ ...attacks, ...(wantAttacks ? a : []) ]
      };
    };

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
        moves = res.moves;
        attacks = res.attacks;
        break;
      }

      case "R":
      {
        const res = sliding(r, c, color, [[-1,0],[1,0],[0,-1],[0,1]]);
        moves = res.moves;
        attacks = res.attacks;
        break;
      }

      case "Q":
      {
        const res = sliding(r, c, color, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
        moves = res.moves;
        attacks = res.attacks;
        break;
      }

      case "P":
      {
        const dir = (color === W) ? -1 : 1;
        const one = [r + dir, c];
        const two = [r + 2 * dir, c];

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
            if (t && t.color !== color)
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
      // Not selectable
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
    const moving = at(sr, sc);
    const target = at(dr, dc);

    // Move / capture
    setAt(dr, dc, moving);
    setAt(sr, sc, null);

    // Pawn promotion (auto-queen)
    if (moving && moving.kind === "P")
    {
      if ((moving.color === W && dr === 0) || (moving.color === B && dr === 7))
      {
        moving.kind = "Q";
      }
    }

    // Record last move
    boardState.lastMove = { from: { r: sr, c: sc }, to: { r: dr, c: dc } };

    // Swap turn
    boardState.turn = (boardState.turn === W) ? B : W;

    // Clear selection
    boardState.selected = null;
    boardState.legal.moves.clear();
    boardState.legal.attacks.clear();

    // Re-render
    renderBoard();
  }

  // ---- UI rendering ----
  function renderBoard()
  {
    boardEl.innerHTML = "";

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

    // Apply current piece set to image srcs
    applyPieceTheme(pieceThemeEl.value);

    // Last-move highlight
    if (boardState.lastMove)
    {
      const { from, to } = boardState.lastMove;
      const a = querySquare(from.r, from.c);
      const b = querySquare(to.r, to.c);

      a && a.classList.add("last-move");
      b && b.classList.add("last-move");
    }

    // Update turn indicator
    const turnEl = document.getElementById("turnIndicator");
    if (turnEl)
    {
      turnEl.textContent = (boardState.turn === W) ? "Turn: White" : "Turn: Black";
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

    document.querySelectorAll(".square").forEach((s) =>
    {
      const key = keyOf(parseInt(s.dataset.row, 10), parseInt(s.dataset.col, 10));

      if (boardState.legal.moves.has(key))
      {
        s.classList.add("highlight-move");
      }

      if (boardState.legal.attacks.has(key))
      {
        s.classList.add("highlight-attack");
      }
    });
  }

  function onClickSquare(ev)
  {
    const sq = ev.currentTarget;
    const r = parseInt(sq.dataset.row, 10);
    const c = parseInt(sq.dataset.col, 10);

    // If we have a selection and the click is a legal target, perform the move.
    if (boardState.selected && isLegalTarget(r, c))
    {
      makeMove(boardState.selected.r, boardState.selected.c, r, c);
      return;
    }

    // Otherwise, (re)select if it is our turn's piece.
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

    pieceThemeEl.addEventListener("change", () => applyPieceTheme(pieceThemeEl.value));

    // Reset button
    const resetBtn = document.getElementById("resetBtn");
    if (resetBtn)
    {
      resetBtn.addEventListener("click", () =>
      {
        boardState.grid = startingPosition();
        boardState.turn = W;
        boardState.selected = null;
        boardState.legal.moves.clear();
        boardState.legal.attacks.clear();
        boardState.lastMove = null;
        renderBoard();
      });
    }
  })();

  // ---- Initial render ----
  renderBoard();

  // Re-apply persisted piece theme now that images exist
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
