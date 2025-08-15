(function()
{
  const ROOT = "..";

  const boardEl = document.getElementById("board");
  const modeEl = document.getElementById("mode");
  const moveColorEl = document.getElementById("moveColor");
  const attackColorEl = document.getElementById("attackColor");
  const boardThemeEl = document.getElementById("boardTheme");
  const pieceThemeEl = document.getElementById("pieceTheme");

  const kindToLetter = { K:"k", Q:"q", R:"r", B:"b", N:"n", P:"p" };

  function setCSSVar(name, value)
  {
    document.documentElement.style.setProperty(name, value);
  }

  // ---- Theme helpers ----
  function applyBoardTheme(name)
  {
    setCSSVar("--board-bg", `url(${ROOT}/boards/${name})`);
    try { localStorage.setItem("boardTheme", name); } catch(_) {}
  }

  function applyPieceTheme(name)
  {
    // Adjust piece sizing/offset for 3d_* sets (they keep messing up the padding/baseline | will figure out later... hopefully)
    const is3d = name.startsWith("3d_");
    setCSSVar("--piece-scale", is3d ? "0.92" : "0.85");
    setCSSVar("--piece-offset-y", is3d ? "-2px" : "0px");
    setCSSVar("--piece-drop-shadow", is3d ? "0 1px 2px rgba(0,0,0,0.55)" : "0 0 1px rgba(0,0,0,0.6)");

    // Pixel art set can look best with crisp rendering
    if (name === "8_bit")
    {
      document.body.classList.add("pixelated");
    }
    else
    {
      document.body.classList.remove("pixelated");
    }

    // Update all images
    document.querySelectorAll(".piece-img").forEach(img => {
      const color = (img.getAttribute("data-color") || "").toLowerCase(); // "w"|"b"
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
    catch(_)
      {}
  }

  // Persisted values
  (function initControls()
  {
    // Glow colors
    setCSSVar("--move-glow", moveColorEl.value);
    setCSSVar("--attack-glow", attackColorEl.value);
    moveColorEl.addEventListener("input", () => setCSSVar("--move-glow", moveColorEl.value));
    attackColorEl.addEventListener("input", () => setCSSVar("--attack-glow", attackColorEl.value));

    // Board theme
    const savedBoard = (() => { try { return localStorage.getItem("boardTheme"); } catch(_) { return null; } })();
    if (savedBoard && Array.from(boardThemeEl.options).some(o => o.value === savedBoard)) {
      boardThemeEl.value = savedBoard;
    }
    applyBoardTheme(boardThemeEl.value);
    boardThemeEl.addEventListener("change", () => applyBoardTheme(boardThemeEl.value));

    // Piece theme
    const savedPieces = (() =>
      {
        try
        {
          return localStorage.getItem("pieceTheme");
        }
        catch(_)
        {
          return null;
        }
      })();
    if (savedPieces && Array.from(pieceThemeEl.options).some(o => o.value === savedPieces))
    {
      pieceThemeEl.value = savedPieces;
    }
    pieceThemeEl.addEventListener("change", () => applyPieceTheme(pieceThemeEl.value));
  })();

  // ---- Simple engine (no check/pins/castling/en passant yet) ----
  const W = "w", B = "b";

  function startingPosition()
  {
    // 8x8 array; each piece {color:"w"/"b", kind:"KQRBNP"} or null
    const g = Array.from({length:8}, () => Array(8).fill(null));
    // black
    g[0] = ["R","N","B","Q","K","B","N","R"].map(k => ({color:B, kind:k}));
    g[1] = Array(8).fill({color:B, kind:"P"}).map(p => ({...p}));
    // white
    g[6] = Array(8).fill({color:W, kind:"P"}).map(p => ({...p}));
    g[7] = ["R","N","B","Q","K","B","N","R"].map(k => ({color:W, kind:k}));
    return g;
  }

  const boardState =
  {
    grid: startingPosition()
  };

  function inBounds(r,c)
  {
    return r>=0 && r<8 && c>=0 && c<8;
  }
  function at(r,c)
  {
    return inBounds(r,c) ? boardState.grid[r][c] : null;
  }

  function sliding(r, c, color, directions)
  {
    const moves = [], attacks = [];
    for (const [dr,dc] of directions)
      {
      let rr=r+dr, cc=c+dc;
      while(inBounds(rr,cc))
        {
        const t = at(rr,cc);
        if (!t)
          {
            moves.push({r:rr,c:cc});
          }
        else
          {
            if (t.color !== color) attacks.push({r:rr,c:cc});
            break;
          }
        rr+=dr; cc+=dc;
      }
    }
    return {moves, attacks};
  }

  function highlights(r,c, mode)
  {
    const p = at(r,c);
    if (!p) return {moves:[], attacks:[]};
    const color = p.color;
    const both = mode==="both";
    const wantMoves = both || mode==="moves";
    const wantAttacks = both || mode==="attacks";

    let moves=[], attacks=[];
    const add = (m,a)=>({moves:[...moves,...(wantMoves?m:[])], attacks:[...attacks,...(wantAttacks?a:[])]});

    switch (p.kind)
    {
      case "N":
        {
        const deltas=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr,dc] of deltas)
          {
          const rr=r+dr, cc=c+dc, t=at(rr,cc);
          if (!inBounds(rr,cc))
            continue;
          if (!t && wantMoves)
            moves.push({r:rr,c:cc});
          else if (t && t.color!==color && wantAttacks)
            attacks.push({r:rr,c:cc});
        }
        break;
      }
      case "K":
      {
        const deltas=[-1,0,1];
        for (const dr of deltas) for (const dc of deltas)
        {
          if (dr===0 && dc===0)
            continue;
          const rr=r+dr, cc=c+dc, t=at(rr,cc);
          if (!inBounds(rr,cc))
            continue;
          if (!t && wantMoves)
            moves.push({r:rr,c:cc});
          else if (t && t.color!==color && wantAttacks)
            attacks.push({r:rr,c:cc});
        }
        break;
      }
      case "B": { const res = sliding(r,c,color,[[-1,-1],[-1,1],[1,-1],[1,1]]); moves=res.moves; attacks=res.attacks; break; }
      case "R": { const res = sliding(r,c,color,[[-1,0],[1,0],[0,-1],[0,1]]); moves=res.moves; attacks=res.attacks; break; }
      case "Q": { const res = sliding(r,c,color,[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]); moves=res.moves; attacks=res.attacks; break; }
      case "P": {
        const dir = (color===W) ? -1 : 1;
        const one=[r+dir,c], two=[r+2*dir,c];
        if (wantMoves)
        {
          if (inBounds(...one) && !at(...one))
          {
            moves.push({r:one[0], c:one[1]});
            const startRow = (color===W)?6:1;
            if (r===startRow && inBounds(...two) && !at(...two)) moves.push({r:two[0], c:two[1]});
          }
        }
        if(wantAttacks)
        {
          for (const dc of [-1,1])
          {
            const rr=r+dir, cc=c+dc;
            if (!inBounds(rr,cc)) continue;
            const t=at(rr,cc);
            if (t && t.color!==color) attacks.push({r:rr,c:cc});
          }
        }
        break;
      }
    }
    return {moves, attacks};
  }

  // ---- Build UI ----
  function renderBoard()
  {
    boardEl.innerHTML = "";

    for (let r=0; r<8; r++)
    {
      for (let c=0; c<8; c++)
      {
        const sq = document.createElement("div");
        sq.className = "square";
        sq.dataset.row = r; sq.dataset.col = c;

        const p = at(r,c);
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
    // After creating .piece-img nodes, apply the current piece theme to set srcs
    applyPieceTheme(pieceThemeEl.value);
  }

  function clearHighlights()
  {
    document.querySelectorAll(".square").forEach(sq =>
    {
      sq.classList.remove("highlight-move", "highlight-attack", "highlight-selected");
    });
  }

  function onClickSquare(ev)
  {
    const sq = ev.currentTarget;
    const r = parseInt(sq.dataset.row,10);
    const c = parseInt(sq.dataset.col,10);
    const mode = modeEl.value;

    const res = highlights(r,c, mode);
    clearHighlights();
    sq.classList.add("highlight-selected");

    const moveKeys = new Set(res.moves.map(m => `${m.r}-${m.c}`));
    const attackKeys = new Set(res.attacks.map(a => `${a.r}-${a.c}`));

    document.querySelectorAll(".square").forEach(s =>
    {
      const key = `${s.dataset.row}-${s.dataset.col}`;
      if (moveKeys.has(key))
        s.classList.add("highlight-move");
      if (attackKeys.has(key))
        s.classList.add("highlight-attack");
    });
  }

  // Initial render + apply saved themes
  renderBoard();
  // Apply persisted piece theme now that images exist
  const savedPieces = (() => { try { return localStorage.getItem("pieceTheme"); } catch(_) { return null; } })();
  if (savedPieces && Array.from(pieceThemeEl.options).some(o => o.value === savedPieces))
  {
    pieceThemeEl.value = savedPieces;
  }
  applyPieceTheme(pieceThemeEl.value);
})();
