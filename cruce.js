/* ==========================================================================
   CRUCE DE VALIDACIÓN OUTBOUND
   Funciones puras (no tocan la pantalla ni la base de datos): reciben los datos de
   una FO y devuelven lo esperado, el cruce por código, el cruce por HU y la auditoría
   de errores de picking. Es la lógica de tu Apps Script, reescrita.
   ========================================================================== */
(function (root) {
  "use strict";
  const clean = v => String(v == null ? "" : v).trim().replace(/\.0+$/, "");
  const txt = v => String(v == null ? "" : v).trim();
  const huN = v => { v = String(v == null ? "" : v).trim().toUpperCase(); return v && /^S\s*[\/.\-]?\s*N$/.test(v) ? "SN" : v; };
  const huKey = v => huN(v).replace(/[^A-Z0-9]/g, "").replace(/^HUD/, "");
  const mult1000 = a => { const p = a.filter(x => x > 0); return p.length >= 3 && p.every(x => x % 1000 === 0); };
  const facSap = a => (mult1000(a) ? 1000 : 1);
  const TURNO_DIA = [6, 18];
  const AJ_CAP = t => { let n = 0; String(t || "").replace(/No se cargó (\d+) cajas/g, (m, x) => { n += Number(x); return m; }); return n; };
  const faseOk = v => { const t = clean(v); return (t === "" || t.charAt(0) === "#" || isNaN(Number(t))) ? "" : t; };
  const esAbierta = r => txt(r.status).toUpperCase() !== "C";
  const esAnulada = r => txt(r.status).toUpperCase() === "A";

  /* ---------- LO ESPERADO POR FASE ----------
     stock: [{fase, material, descripcion, cantidad}]  pick: [{fase,status,producto,descripcion,ctd_prev,ctd_real}]
     fasesConocidas: [fase,...]  -> { F:{fase:{codigo:{codigo,desc,esp}}}, esc:[fases ÷1000], AB:{fase:{codigo:n}}, PK:{fase:{conf,ab}} } */
  function esperado(fo, stock, pick, fasesConocidas) {
    const F = {}, esc = [], AB = {}, PK = {}, enPk = {};
    const add = (fa, k, desc, e) => { const f = F[fa] = F[fa] || {}; const o = f[k] = f[k] || { codigo: k, desc: String(desc || ""), esp: 0 }; o.esp += e; };
    const sRows = stock.filter(r => clean(r.material) !== "" && !isNaN(Number(clean(r.material))));
    const pRows0 = pick.filter(r => txt(r.fase) !== "");
    const fases = {};
    sRows.forEach(r => { const fa = faseOk(r.fase); if (fa) fases[fa] = true; });
    pRows0.forEach(r => { fases[clean(r.fase)] = true; });
    (fasesConocidas || []).forEach(fa => { if (fa) fases[clean(fa)] = true; });
    const unica = Object.keys(fases).length === 1 ? Object.keys(fases)[0] : "";
    const faseDe = r => faseOk(r.fase) || unica || ("SF" + fo);
    const pRows = pRows0.filter(r => !esAnulada(r));
    const pv = {}, sv = {};
    pRows.forEach(r => { const fa = clean(r.fase); (pv[fa] = pv[fa] || []).push(Number(r.ctd_prev) || 0); });
    sRows.forEach(r => { const fa = faseDe(r); (sv[fa] = sv[fa] || []).push(Number(r.cantidad) || 0); });
    pRows.forEach(r => {
      const fa = clean(r.fase), f = facSap(pv[fa]); enPk[fa] = true; if (f > 1 && esc.indexOf(fa) < 0) esc.push(fa);
      const pkf = PK[fa] = PK[fa] || { conf: true, ab: 0 };
      const prod = clean(r.producto);
      if (esAbierta(r)) { pkf.conf = false; pkf.ab++; const ab = AB[fa] = AB[fa] || {}; ab[prod] = (ab[prod] || 0) + Math.round((Number(r.ctd_prev) || 0) / f); }
      add(fa, prod, r.descripcion, Math.round((esAbierta(r) ? Number(r.ctd_prev) || 0 : Number(r.ctd_real) || 0) / f));
    });
    sRows.forEach(r => {
      const fa = faseDe(r); if (enPk[fa]) return;
      const f = facSap(sv[fa]); if (f > 1 && esc.indexOf(fa) < 0) esc.push(fa);
      add(fa, clean(r.material), r.descripcion, Math.round((Number(r.cantidad) || 0) / f));
    });
    return { F, esc, AB, PK };
  }

  /* ---------- ACUMULADO: vista TOTAL FO (vo) y vista por fase (vf) ---------- */
  function acumulado(fase, E, regs, com) {
    const F = E.F, nombres = Object.keys(F), AB = E.AB || {};
    const COM = {}; (com || []).forEach(c => { if (txt(c.comentario)) COM[clean(c.fase) + "|" + clean(c.codigo)] = txt(c.comentario); });
    const lines = regs.map(r => ({ fase: clean(r.fase), pal: Number(r.paleta), codigo: clean(r.codigo), desc: r.descripcion, cant: Number(r.cantidad) || 0, hu: huN(r.hu) || "SN", hora: r.creado || "" }));
    const reg = {}, desc = {};
    lines.forEach(l => { const m = reg[l.codigo] = reg[l.codigo] || {}; m[l.fase] = (m[l.fase] || 0) + l.cant; desc[l.codigo] = String(l.desc || ""); });
    const espF = (f, k) => (F[f] && F[f][k]) ? F[f][k].esp : 0;
    const regF = (f, k) => (reg[k] && reg[k][f]) || 0;
    const enFO = k => nombres.some(x => F[x][k]);
    const orden = (x, y) => ((x.en ? (x.otra ? 1 : 2) : 0) - (y.en ? (y.otra ? 1 : 2) : 0));
    const mo = {};
    nombres.forEach(x => Object.values(F[x]).forEach(o => { mo[o.codigo] = mo[o.codigo] || { codigo: o.codigo, desc: o.desc, esp: 0, reg: 0, en: true }; mo[o.codigo].esp += o.esp; }));
    lines.forEach(l => { mo[l.codigo] = mo[l.codigo] || { codigo: l.codigo, desc: String(l.desc || ""), esp: 0, reg: 0, en: false }; mo[l.codigo].reg += l.cant; });
    const vo = Object.values(mo).map(a => {
      const d = a.reg - a.esp, c = [];
      nombres.forEach(x => { const t = COM[x + "|" + a.codigo]; if (t) c.push(t); });
      let st = !a.en ? "NO PERTENECE" : (a.reg === 0 && a.esp > 0) ? "PENDIENTE" : d === 0 ? "CUADRADO" : d > 0 ? "SOBRANTE" : "FALTANTE";
      const aj = AJ_CAP(c.join(" | "));
      if ((st === "FALTANTE" || st === "PENDIENTE") && aj > 0 && a.reg + aj >= a.esp) st = "AJUSTE";
      return Object.assign({}, a, { com: c.join(" | "), aj, status: st });
    }).sort(orden);
    const out = { lines, vo, esc: (E.esc || []).indexOf(fase) >= 0, escFo: (E.esc || []).length > 0 };
    if (fase) {
      const codigos = {};
      Object.keys(F[fase] || {}).forEach(k => codigos[k] = F[fase][k].desc);
      Object.keys(reg).forEach(k => { if (regF(fase, k) > 0 && !codigos[k]) codigos[k] = desc[k]; });
      const sfDe = {}; vo.forEach(a => sfDe[a.codigo] = a.status);
      out.vf = Object.keys(codigos).map(k => {
        const esp = espF(fase, k), r = regF(fase, k), d = r - esp, en = enFO(k), otros = nombres.filter(x => x !== fase);
        const sobra = otros.filter(x => regF(x, k) > espF(x, k)), falta = otros.filter(x => espF(x, k) > regF(x, k));
        const sobraN = sobra.reduce((t, x) => t + regF(x, k) - espF(x, k), 0), faltaN = falta.reduce((t, x) => t + espF(x, k) - regF(x, k), 0);
        let status, ofase = "";
        if (!en) status = "NO PERTENECE";
        else if (d === 0) status = (r === 0 && esp > 0) ? "PENDIENTE" : "CUADRADO";
        else if (d < 0) { if (sobraN >= -d) { status = "EN OTRA FASE"; ofase = sobra[0]; } else status = r === 0 ? "PENDIENTE" : "FALTANTE"; }
        else { if (faltaN >= d) { status = "DE OTRA FASE"; ofase = falta[0]; } else status = "SOBRANTE"; }
        const cm = COM[fase + "|" + k] || "", aj = AJ_CAP(cm);
        if ((status === "FALTANTE" || status === "PENDIENTE") && aj > 0 && r + aj >= esp) status = "AJUSTE";
        return { codigo: k, desc: codigos[k], esp, reg: r, en, otra: /OTRA FASE$/.test(status), ofase, status, ab: (AB[fase] || {})[k] || 0, sf: sfDe[k] || "", com: cm, aj };
      }).sort(orden);
    }
    return out;
  }

  /* ---------- CRUCE POR HU Y PALETAS ----------
     pick: filas de PICKING de la FO con {fase,status,hu,producto,descripcion,ctd_prev,ctd_real,confirmado_por,fecha_conf,hora_conf} */
  function cruceHU(pick, regs, com) {
    const P = pick.filter(r => !esAnulada(r));
    const pm = {};
    regs.forEach(r => {
      const fa = clean(r.fase), n = Number(r.paleta) || 0, p = pm[fa + "|" + n] = pm[fa + "|" + n] || { fase: fa, pal: n, huReg: huN(r.hu) || "SN", items: {}, desc: {} };
      const c = clean(r.codigo); p.items[c] = (p.items[c] || 0) + (Number(r.cantidad) || 0); p.desc[c] = String(r.descripcion || "");
    });
    const paletas = Object.values(pm).sort((a, b) => a.fase.localeCompare(b.fase) || a.pal - b.pal);
    if (!P.length) return { sinPicking: true, paletas: paletas.length };
    const COM = {}; (com || []).forEach(c => { if (txt(c.comentario)) COM[clean(c.fase) + "|" + clean(c.codigo)] = txt(c.comentario); });
    const pv = {};
    P.forEach(r => (pv[clean(r.fase)] = pv[clean(r.fase)] || []).push(Number(r.ctd_prev) || 0));
    const H = {}, porFase = {};
    P.forEach(r => {
      const hu = txt(r.hu); if (!hu) return;
      const fa = clean(r.fase), f = facSap(pv[fa]), conf = !esAbierta(r), k = fa + "|" + huKey(hu);
      if (!H[k]) { H[k] = { hu, fase: fa, items: {}, users: {}, abiertas: 0, paletas: [] }; (porFase[fa] = porFase[fa] || []).push(H[k]); }
      const o = H[k], c = clean(r.producto), it = o.items[c] = o.items[c] || { desc: String(r.descripcion || ""), esp: 0, reg: 0, rem: 0, por: "", fecha: "", hora: "" };
      const q = Math.round((conf ? Number(r.ctd_real) || 0 : Number(r.ctd_prev) || 0) / f); it.esp += q; it.rem += q;
      if (conf) { if (!it.por) { it.por = txt(r.confirmado_por); it.fecha = txt(r.fecha_conf); it.hora = txt(r.hora_conf); } } else o.abiertas++;
      const u = txt(r.confirmado_por); if (u) o.users[u] = 1;
    });
    const asignar = (p, o, take) => { Object.keys(take).forEach(c => { o.items[c].reg += take[c]; o.items[c].rem -= take[c]; }); if (o.paletas.indexOf(p) < 0) o.paletas.push(p); if (p.hus.indexOf(o) < 0) p.hus.push(o); };
    // 1) por etiqueta
    paletas.forEach(p => {
      p.hus = []; p.tipo = p.huReg === "SN" ? "SN" : "";
      if (p.tipo) return;
      const k = huKey(p.huReg); let o = H[p.fase + "|" + k], otra = false;
      if (!o) { const alt = Object.keys(H).find(x => x.split("|")[1] === k); if (alt) { o = H[alt]; otra = true; } }
      if (!o) { p.tipo = "FANTASMA"; return; }
      if (!Object.keys(p.items).every(c => o.items[c])) { p.tipo = "ETIQ_NO_CUADRA"; return; }
      p.tipo = otra ? "OTRA_FASE" : "ETIQ"; asignar(p, o, p.items);
    });
    // 2) por contenido
    const tot = p => Object.keys(p.items).reduce((t, c) => t + p.items[c], 0), remT = o => Object.keys(o.items).reduce((t, c) => t + o.items[c].rem, 0);
    paletas.filter(p => !p.hus.length).sort((a, b) => tot(b) - tot(a)).forEach(p => {
      const cand = porFase[p.fase] || [], cods = Object.keys(p.items);
      const cubre = o => cods.every(c => o.items[c] && o.items[c].rem >= p.items[c]);
      let o = cand.find(x => cubre(x) && Object.keys(x.items).filter(c => x.items[c].rem > 0).length === cods.length && cods.every(c => x.items[c].rem === p.items[c]));
      if (!o) o = cand.filter(cubre).sort((a, b) => remT(a) - remT(b))[0];
      if (o) return asignar(p, o, p.items);
      const tomas = {}; let ok = cods.length > 0;
      cods.forEach(c => { let falta = p.items[c];
        cand.forEach(x => { if (falta <= 0 || !x.items[c] || x.items[c].rem <= 0) return; const t = Math.min(falta, x.items[c].rem), k = x.fase + "|" + huKey(x.hu); (tomas[k] = tomas[k] || {})[c] = t; falta -= t; });
        if (falta > 0) ok = false; });
      if (ok) { Object.keys(tomas).forEach(k => asignar(p, H[k], tomas[k])); p.varios = Object.keys(tomas).length > 1; return; }
      o = cand.filter(x => cods.every(c => x.items[c])).sort((a, b) => remT(b) - remT(a))[0];
      if (o) { p.excede = true; return asignar(p, o, p.items); }
      p.sinReal = true;
    });
    const pOut = paletas.map(p => {
      const o = p.hus[0], nPal = o ? o.paletas.length : 0, idx = o ? o.paletas.indexOf(p) + 1 : 0, c = [], ob = [];
      if (p.tipo === "SN") { c.push("SIN HU"); ob.push("Paleta sin etiqueta" + (o ? "; HU real identificado por contenido" : "")); }
      if (p.tipo === "FANTASMA") { c.push("HU FANTASMA"); ob.push("El HU " + p.huReg + " no existe en el PICKING de la FO"); }
      if (p.tipo === "ETIQ_NO_CUADRA") { c.push("HU NO CUADRA"); ob.push("El HU existe pero sus códigos no corresponden a lo registrado"); }
      if (p.tipo === "OTRA_FASE") { c.push("HU DE OTRA FASE"); ob.push("El HU pertenece a la fase " + (o ? o.fase : "")); }
      if (p.varios) { c.push("VARIOS HU"); ob.push("La paleta mezcla " + p.hus.length + " HU"); }
      if (p.excede) { c.push("CANTIDAD MAYOR AL HU"); ob.push("Se registró más de lo que tiene el HU"); }
      if (p.sinReal) { c.push("SIN HU REAL"); ob.push("No se pudo identificar a qué HU del picking corresponde"); }
      if (nPal > 1) { c.push("NO CORTARON TARIMA"); ob.push("El HU se armó en " + nPal + " paletas (esta es la " + idx + " de " + nPal + ")"); }
      return { pal: p.pal, fase: p.fase, huReg: p.huReg, hus: p.hus.map(x => x.hu), huReal: p.hus.map(x => x.hu).join(" + "), tipo: p.tipo, idx, nPal,
        users: o ? Object.keys(o.users).join(", ") : "", caso: c.join(" / "), obs: ob.join(" · "), sinReal: !!p.sinReal, varios: !!p.varios, excede: !!p.excede,
        items: Object.keys(p.items).map(k => ({ codigo: k, desc: p.desc[k], cant: p.items[k] })) };
    });
    const hus = Object.values(H).map(o => {
      const dif = Object.keys(o.items).map(c => { const i = o.items[c]; return { codigo: c, desc: i.desc, esp: i.esp, reg: i.reg, dif: i.reg - i.esp, por: i.por, fecha: i.fecha, hora: i.hora, com: COM[o.fase + "|" + c] || "" }; });
      const n = o.paletas.length, mal = dif.some(d => d.dif !== 0), faltan = dif.some(d => d.dif < 0), ob = [];
      if (!n) ob.push("No se registró ninguna paleta con este HU: si no aparece en el viaje, revise si quedó en su ubicación de picking");
      else if (faltan) ob.push("Hay faltante: revise si el resto sigue en su ubicación de picking");
      if (o.abiertas) ob.push("Picking sin confirmar (" + o.abiertas + " tareas abiertas): se compara con lo previsto");
      return { hu: o.hu, fase: o.fase, n, users: Object.keys(o.users).join(", "), paletas: o.paletas.map(p => p.pal), abiertas: o.abiertas,
        status: !n ? "SIN REGISTRAR" : mal ? "CON DIFERENCIAS" : "CUADRADO", caso: n > 1 ? "NO CORTARON TARIMA" : "", obs: ob.join(" · "), dif };
    }).sort((a, b) => a.fase.localeCompare(b.fase) || ((a.paletas[0] || 1e9) - (b.paletas[0] || 1e9)) || a.hu.localeCompare(b.hu));
    const cnt = f => pOut.filter(f).length;
    return { sinPicking: false, paletas: pOut, hus,
      resumen: { hus: hus.length, cuadrados: hus.filter(h => h.status === "CUADRADO").length, conDif: hus.filter(h => h.status === "CON DIFERENCIAS").length,
        sinReg: hus.filter(h => h.status === "SIN REGISTRAR").length, multi: hus.filter(h => h.n > 1).length, sn: cnt(p => p.tipo === "SN"),
        fantasma: cnt(p => p.tipo === "FANTASMA"), varios: cnt(p => p.varios), noId: cnt(p => p.sinReal) } };
  }

  /* ---------- QUIÉN FUE EL PICADOR ---------- */
  const turnoDe = hora => { const m = String(hora || "").match(/^(\d{1,2}):/); if (!m) return ""; const h = +m[1]; return (h >= TURNO_DIA[0] && h < TURNO_DIA[1]) ? "DIA" : "NOCHE"; };
  /** usuarios de picking ("E_ABC, E_XYZ") -> {nombre, grupo}. U = { 'E_ABC': [{nombre, sup, grupo}] } */
  function resp(users, hora, U) {
    const us = String(users || "").split(",").map(x => x.trim()).filter(Boolean), out = [], g = {}, turno = turnoDe(hora);
    us.forEach(u => {
      const L = U[u.toUpperCase()];
      if (!L) { out.push(u); if (turno) g[turno] = 1; return; }
      if (L.length === 1) { out.push(L[0].nombre); g[L[0].grupo || turno] = 1; return; }
      const m = L.filter(x => x.grupo && turno && x.grupo.indexOf(turno) >= 0);
      if (m.length === 1) { out.push(m[0].nombre); g[m[0].grupo] = 1; } else { out.push(L.map(x => x.nombre).join(" / ")); if (turno) g[turno] = 1; }
    });
    return { nombre: out.join(", "), grupo: Object.keys(g).filter(Boolean).map(x => /GRUPO/.test(x) ? x : "GRUPO " + x).join(" / ") };
  }
  function lev(a, b) {
    const m = a.length, n = b.length, d = [];
    for (let i = 0; i <= m; i++) d[i] = [i];
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  /* ---------- STATUS HU: una fila por paleta con problema de HU ---------- */
  function auditHU(fo, cr, U) {
    const L = [];
    cr.paletas.forEach(p => {
      const noCorto = p.nPal > 1, malo = p.tipo !== "ETIQ" || p.sinReal || p.varios || p.excede;
      if (!noCorto && !malo) return;
      const hu0 = p.hus && p.hus.length === 1 ? p.hus[0] : "";
      const H = hu0 ? cr.hus.find(x => huKey(x.hu) === huKey(hu0)) : null, fc = H ? (H.dif.find(d => d.fecha) || {}) : {};
      let dig = false;
      if (p.tipo === "FANTASMA" && hu0) { const a = huKey(p.huReg).slice(-8), b = huKey(hu0).slice(-8); dig = a !== b && a.length >= 3 && lev(a, b) <= 2; }
      const nc = noCorto ? " / NO CORTARON TAREA" : "";
      let obs;
      if (p.sinReal) obs = "SIN HU REAL (no se pudo identificar)";
      else if (p.tipo === "SN") obs = "SIN HU" + nc;
      else if (p.tipo === "FANTASMA") obs = dig ? "ERROR DIGITACION HU" : "HU VACIO" + nc;
      else if (p.tipo === "OTRA_FASE") obs = "HU DE OTRA FASE" + nc;
      else if (p.tipo === "ETIQ_NO_CUADRA") obs = "HU NO CUADRA" + nc;
      else obs = "CON HU" + nc;
      if (p.varios) obs += " / VARIOS HU";
      if (p.excede) obs += " / CANTIDAD MAYOR AL HU";
      const R = resp(H ? H.users : p.users, fc.hora, U), real = p.huReal || p.huReg;
      L.push({ k: fo + "|" + (p.huReal ? real : real + "#" + p.fase + "#" + p.pal), hu: real, huEscaneado: p.huReg, fecha: fc.fecha || "",
        pal: (dig || !p.hus.length || p.varios) ? "--" : "P" + p.idx, paletaRegistrada: p.pal, obs, resp: R.nombre, grupo: R.grupo, fo, fase: p.fase, ord: p.idx || 0 });
    });
    return L.sort((a, b) => a.k.localeCompare(b.k) || a.ord - b.ord);
  }

  /* ---------- STATUS ERI_ERU: faltantes/sobrantes atribuidos al HU y al picador que los causó ---------- */
  function auditERI(fo, fases, d0, cr, canal, U, cerrada, avisos) {
    const hus = cr.hus, fecha0 = (hus.map(h => (h.dif.find(d => d.fecha) || {}).fecha).find(Boolean)) || "", rows = [], out = [];
    if (!cerrada) avisos.push("FO " + fo + ": la validación aún no está cerrada; los códigos sin registrar no se cuentan como faltante.");
    d0.vo.forEach(a => {
      let st = a.status; if (st === "PENDIENTE" && cerrada) st = "FALTANTE";
      if (st !== "FALTANTE" && st !== "SOBRANTE" && st !== "NO PERTENECE") return;
      const falta = st === "FALTANTE", total = Math.abs(a.reg - a.esp); if (!total) return;
      const cand = [];
      hus.forEach(h => h.dif.forEach(d => { if (d.codigo === a.codigo && (falta ? d.dif < 0 : d.dif > 0)) cand.push({ h, d, q: Math.abs(d.dif) }); }));
      let rest = total;
      cand.sort((x, y) => y.q - x.q).forEach(c => { if (rest <= 0) return; const q = Math.min(c.q, rest); rest -= q;
        rows.push({ fo, fase: c.h.fase, hu: c.h.hu, codigo: a.codigo, desc: a.desc, status: falta ? "FALTANTE" : "SOBRANTE", dif: falta ? -q : q, por: c.d.por, fecha: c.d.fecha, hora: c.d.hora }); });
      if (rest > 0) {
        const h1 = hus.find(h => h.dif.some(d => d.codigo === a.codigo)), fl = d0.lines.find(l => l.codigo === a.codigo);
        rows.push({ fo, fase: (cand[0] && cand[0].h.fase) || (h1 && h1.fase) || (fl && fl.fase) || fases[0], hu: falta ? "—" : "NO ENCONTRADO", codigo: a.codigo, desc: a.desc,
          status: falta ? "FALTANTE" : "SOBRANTE", dif: falta ? -rest : rest, por: "", fecha: fecha0, hora: "" });
      }
    });
    rows.filter(r => r.status === "FALTANTE").forEach(x => {
      const y = rows.find(z => z.status === "SOBRANTE" && !z.par && z.fase === x.fase && Math.abs(z.dif) === Math.abs(x.dif) && z.codigo !== x.codigo);
      if (y) { x.par = true; y.par = true; }
    });
    rows.sort((a, b) => String(a.fase).localeCompare(String(b.fase)) || String(a.hu).localeCompare(String(b.hu)) || String(a.codigo).localeCompare(String(b.codigo))).forEach(r => {
      const R = r.por ? resp(r.por, r.hora, U) : { nombre: "", grupo: "" }, cn = canal[String(r.fase)] || {};
      out.push({ fecha: r.fecha, fase: r.fase, hu: r.hu, codigo: r.codigo, desc: r.desc, status: r.status, tipo: r.par ? "CODIGO X OTRO" : "ERROR DE PICKING",
        sistema: cn.fis || cn.sis || "", usuarioPicking: r.por, resp: R.nombre, grupo: R.grupo, dif: r.dif, fo });
    });
    return out;
  }

  /* ---------- TODO JUNTO PARA UNA FO ----------
     d = { fo, stock, pick, regs, fases:[{fase,canal_sistema,canal_fisico,cono,estado}], com, U, mara:{codigo:{uma,descripcion}} } */
  function cruceFO(d) {
    const fo = String(d.fo), fasesIds = Array.from(new Set((d.fases || []).map(f => clean(f.fase)).concat(d.regs.map(r => clean(r.fase))).filter(Boolean)));
    const E = esperado(fo, d.stock, d.pick, fasesIds);
    const todas = Object.keys(E.F);
    const fases = Array.from(new Set(fasesIds.concat(todas))).sort();
    const ac = acumulado(fases[0] || "", E, d.regs, d.com);
    const canal = {}; (d.fases || []).forEach(f => { canal[clean(f.fase)] = { sis: f.canal_sistema || "", fis: f.canal_fisico || "", cono: f.cono || "" }; });
    const cr = cruceHU(d.pick, d.regs, d.com);
    const avisos = [];
    if (E.esc.length) avisos.push("Las cantidades de SAP de la(s) fase(s) " + E.esc.join(", ") + " venían multiplicadas por 1000 y se dividieron automáticamente.");
    let hu = [], eri = [];
    if (cr.sinPicking) avisos.push("La FO " + fo + " no tiene PICKING cargado: solo se muestra el cruce por código (no se puede identificar al picador ni los problemas de HU).");
    else {
      const cerrada = (d.fases || []).length > 0 && (d.fases || []).every(f => f.estado === "CERRADO");
      hu = auditHU(fo, cr, d.U || {});
      eri = auditERI(fo, fases, ac, cr, canal, d.U || {}, cerrada, avisos);
    }
    const un = c => (d.mara && d.mara[c] && d.mara[c].uma) || (d.stockUn && d.stockUn[c]) || "";
    const filas = ac.vo.map(a => {
      const ob = [];
      if (a.com) ob.push(a.com);
      if (a.status === "PENDIENTE") ob.push("Aún sin registrar");
      if (a.status === "AJUSTE") ob.push("Ajuste de capacidad: no se cargó " + a.aj + " cajas");
      if (a.status === "NO PERTENECE") ob.push("Código que no corresponde a esta FO");
      const abiertas = Object.keys(E.AB || {}).reduce((t, fa) => t + ((E.AB[fa] || {})[a.codigo] || 0), 0);
      if (abiertas) ob.push("Picking sin confirmar: " + abiertas + " siguen en su ubicación de picking");
      return { viaje: fo, codigo: a.codigo, desc: a.desc, un: un(a.codigo), esp: a.esp, reg: a.reg, dif: a.reg - a.esp, status: a.status, obs: ob.join(" · ") };
    }).sort((x, y) => { const o = { FALTANTE: 0, SOBRANTE: 1, "NO PERTENECE": 2, PENDIENTE: 3, AJUSTE: 4, CUADRADO: 5 }; return (o[x.status] - o[y.status]) || String(x.codigo).localeCompare(String(y.codigo)); });
    const cuenta = s => filas.filter(f => f.status === s).length;
    return { fo, filas, hu, eri, avisos, fases, cruceHU: cr,
      resumen: { codigos: filas.length, cuadrados: cuenta("CUADRADO"), faltantes: cuenta("FALTANTE"), sobrantes: cuenta("SOBRANTE"), noPertenece: cuenta("NO PERTENECE"), pendientes: cuenta("PENDIENTE"), ajustes: cuenta("AJUSTE"),
        erroresPicking: eri.length, problemasHU: hu.length } };
  }

  const api = { esperado, acumulado, cruceHU, auditHU, auditERI, cruceFO, resp, huN, huKey, clean };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CRUCE = api;
})(typeof window !== "undefined" ? window : globalThis);
