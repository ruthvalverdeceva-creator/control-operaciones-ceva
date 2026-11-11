/* ==========================================================================
   MÓDULO VALIDACIÓN OUTBOUND
   - VAL.aux   : pantalla del auxiliar (celular): fases, conteo por paleta, finalizar
   - VAL.staff : pantalla de asistentes / administradora: fases, carga de Excel, cruce y descarga
   Usa el cliente global `supabaseClient` (definido en app.js) y las funciones de la base de datos.
   ========================================================================== */
const VAL = (function () {
  "use strict";
  const sb = () => supabaseClient;
  const q = s => document.querySelector(s);
  const E = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TZ = "America/Lima";
  const COLORES = ["#0b87c9", "#e30a17", "#d98a00", "#7b3fe4", "#00a862", "#0f2150", "#c2185b", "#00838f"];
  const CONOS = { AZUL: "#1e63d6", AMARILLO: "#f2c200", ROJO: "#e30a17", VERDE: "#16a34a", NARANJA: "#f97316", NEGRO: "#222", BLANCO: "#fff", MORADO: "#7b3fe4", CELESTE: "#38bdf8", ROSADO: "#f472b6", GRIS: "#9ca3af" };

  function toast(m) {
    let t = q("#toast-vx"); if (!t) { t = document.createElement("div"); t.id = "toast-vx"; document.body.appendChild(t); }
    t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", 3200);
  }
  const p2 = x => ("0" + x).slice(-2);
  function partes(ts) {
    const d = new Date(ts); if (isNaN(d)) return null;
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d), o = {};
    f.forEach(x => o[x.type] = x.value); return o;
  }
  const fmtTs = ts => { const o = ts && partes(ts); return o ? o.day + "/" + o.month + "/" + o.year + " " + o.hour + ":" + o.minute + ":" + o.second : ""; };
  const diaDe = ts => { const o = ts && partes(ts); return o ? o.year + "-" + o.month + "-" + o.day : ""; };
  const hoyStr = () => diaDe(new Date());
  const ayerStr = () => diaDe(new Date(Date.now() - 864e5));
  const conoHTML = c => c ? '<span class="cn"><i style="background:' + (CONOS[String(c).toUpperCase()] || "#ddd") + '"></i>' + E(c) + "</span>" : "";
  async function leerTodo(mk) {
    let out = [], from = 0;
    for (;;) { const { data, error } = await mk(from, from + 999); if (error) throw error; out = out.concat(data || []); if (!data || data.length < 1000) break; from += 1000; }
    return out;
  }

  /* ---------- lista de fases (la usan el auxiliar y el staff) ---------- */
  const claseEstado = e => e === "CERRADO" ? "CERRADO" : e === "EN PROCESO" ? "PROCESO" : "PENDIENTE";
  function filtrarFases(fases, S) {
    const est = { N: "PENDIENTE", P: "EN PROCESO", C: "CERRADO" }[S.fil];
    return fases.filter(f => {
      if (f.estado !== est) return false;
      if (!S.dia) return true;
      const d = f.estado === "PENDIENTE" ? f.alta : f.estado === "EN PROCESO" ? diaDe(f.inicio) : diaDe(f.fin);
      return d === S.dia;
    });
  }
  function barraFiltros(fases, S) {
    const n = e => fases.filter(f => f.estado === e).length;
    return '<div class="tabs"><button data-fil="N" class="' + (S.fil === "N" ? "on" : "") + '">Pendientes (' + n("PENDIENTE") + ')</button>' +
      '<button data-fil="P" class="' + (S.fil === "P" ? "on" : "") + '">En proceso (' + n("EN PROCESO") + ')</button>' +
      '<button data-fil="C" class="' + (S.fil === "C" ? "on" : "") + '">Cerradas (' + n("CERRADO") + ')</button></div>' +
      '<div class="dia"><span>📅 Día:</span><input type="date" data-dia-in value="' + E(S.dia) + '">' +
      '<button data-dia="' + hoyStr() + '" class="' + (S.dia === hoyStr() ? "on" : "") + '">HOY</button>' +
      '<button data-dia="' + ayerStr() + '" class="' + (S.dia === ayerStr() ? "on" : "") + '">AYER</button>' +
      '<button data-dia="" class="' + (S.dia === "" ? "on" : "") + '">TODAS</button></div>';
  }
  function accionesHTML(f, admin) {
    const it = [];
    if (admin && f.paletas > 0) it.push('<button data-borrarreg="' + E(f.fase) + '">🧹 Borrar registros contados</button>');
    if (admin && f.pk !== "SIN PICKING") it.push('<button data-borrarpk="' + E(f.fase) + '">🧹 Borrar picking</button>');
    if (admin) it.push('<button class="pelig" data-eliminar="' + E(f.fase) + '">🗑 Eliminar fase</button>');
    const reab = f.estado === "CERRADO" ? '<button class="reab" data-reabrir="' + E(f.fase) + '">↩ Reabrir fase</button> ' : "";
    return reab + (it.length ? '<details class="acc" onclick="event.stopPropagation()"><summary>⚙ Acciones</summary><div class="acc-menu">' + it.join("") + "</div></details>" : "");
  }
  function pkHTML(f) {
    if (f.pk === "CONFIRMADA") return '<div class="pk ok">✅ PICKING CONFIRMADO (se cruza por HU y paletas)</div>';
    if (f.pk === "EN CURSO") return '<div class="pk ab">⏳ PICKING EN CURSO · ' + f.tareas_abiertas + " tareas abiertas</div>";
    return '<div class="pk no">📄 SIN PICKING (se cruza solo por códigos)</div>';
  }
  /** opt.staff: muestra botones de cruce/reabrir. opt.yo: usuario actual (para marcar lo que empezó) */
  function listaHTML(todas, S, opt) {
    const orden = Array.from(new Set(todas.map(f => f.fo || "SIN VIAJE"))), vis = filtrarFases(todas, S), porFo = {};
    vis.forEach(f => (porFo[f.fo || "SIN VIAJE"] = porFo[f.fo || "SIN VIAJE"] || []).push(f));
    let h = "";
    Object.keys(porFo).forEach(fo => {
      const delFo = todas.filter(f => (f.fo || "SIN VIAJE") === fo), k = delFo.filter(f => f.pk === "CONFIRMADA").length, color = COLORES[orden.indexOf(fo) % COLORES.length];
      h += '<div class="fog" style="border-left-color:' + color + '"><div class="foh" style="background:' + color + '"><b>FO: ' + E(fo) + "</b>" +
        (opt.staff ? (delFo.some(f => f.lineas_stock > 0) ? '<button class="mn" data-cruce="' + E(fo) + '">📥 Cruce</button>' : '<button class="mn" data-sinstock="1" style="background:#fff3dc;color:#7a5200">⚠ Sube el STOCK ENTREGA</button>') : "") +
        "<span>" + delFo.length + " fase" + (delFo.length === 1 ? "" : "s") + " · " + k + "/" + delFo.length + " con picking confirmado</span></div>";
      porFo[fo].forEach(f => {
        const mia = f.validador_ref && opt.yo && f.validador_ref === "u:" + opt.yo;
        h += '<div class="card' + (f.estado === "CERRADO" ? " cerr" : "") + '" data-fase="' + E(f.fase) + '" data-est="' + E(f.estado) + '">' +
          '<div class="t"><span>FASE: ' + E(f.fase) + '</span><span class="st ' + claseEstado(f.estado) + '">' + E(f.estado) + "</span></div>" +
          (f.cliente ? '<div class="sm" style="font-weight:700;color:#333">' + E(f.cliente) + "</div>" : "") + '<div class="g">SIST: ' + E(f.canal_sistema || "-") + " | " + E(f.canal_fisico || "-") + " " + conoHTML(f.cono) + "</div>" +
          (f.validador ? '<div class="v">VALIDADOR: <span>' + E(f.validador) + (mia ? " (tú)" : "") + "</span></div>" : "") +
          (f.inicio ? '<div class="sm">Inicio: ' + E(fmtTs(f.inicio)) + "</div>" : "") +
          (f.fin ? '<div class="sm">Fin: ' + E(fmtTs(f.fin)) + "</div>" : "") +
          (f.paletas ? '<div class="sm" style="font-weight:700;color:#111">📦 ' + f.paletas + " paletas · " + f.bultos + " bultos registrados</div>" : "") +
          (opt.staff ? (f.lineas_stock > 0 ? '<div class="pk ok">📦 STOCK ENTREGA CARGADO · ' + f.lineas_stock + " líneas</div>" : '<div class="pk ab">📦 SIN STOCK ENTREGA · falta subirlo en «Cargar datos»</div>') : "") +
          pkHTML(f) +
          (opt.staff ? accionesHTML(f, opt.admin) : "") +
          "</div>";
      });
      h += "</div>";
    });
    if (!h) h = '<p style="text-align:center;color:#777;margin:30px 0">No hay fases en esta pestaña' + (S.dia ? " para ese día" : "") + ".</p>";
    return h;
  }
  function enlazarFiltros(root, S, repintar) {
    root.querySelectorAll("[data-fil]").forEach(b => b.onclick = () => { S.fil = b.dataset.fil; repintar(); });
    root.querySelectorAll("[data-dia]").forEach(b => b.onclick = () => { S.dia = b.dataset.dia; repintar(); });
    const di = root.querySelector("[data-dia-in]"); if (di) di.onchange = () => { S.dia = di.value; repintar(); };
  }

  /* ======================================================================
     AUXILIAR
     ====================================================================== */
  const AX = { S: { fil: "N", dia: "" }, fases: [], V: null, yo: null };
  const aroot = () => q("#vista-aux");
  const marco = inner => '<div class="vx"><div class="vx-wrap">' + inner + "</div></div>";
  const logoHTML = '<div class="logo">ceva<b>▲</b><small>LOGISTICS</small></div>';

  function auxIniciar(yo) { AX.yo = yo; AX.V = null; auxModulos("inv0"); }

  /* Menú de módulos del auxiliar: Inventario → Validación Outbound */
  function auxModulos(nivel) {
    const r = aroot(), nom = '<h1>Hola, <b>' + E(AX.yo.nombre) + "</b></h1>";
    if (nivel === "inv0") {
      r.innerHTML = marco(logoHTML + nom + '<p class="hint" style="text-align:center">Elige un módulo</p><div class="card" id="m-inv" style="text-align:center"><div style="font-size:34px">📦</div><div class="v">Inventario</div></div><button class="btn k" id="x-salir">Salir</button>');
      q("#m-inv").onclick = () => auxModulos("inv1"); q("#x-salir").onclick = () => cerrarSesion();
    } else {
      r.innerHTML = marco(logoHTML + '<h1>Inventario</h1><div class="card" id="m-val" style="text-align:center"><div style="font-size:34px">✅</div><div class="v">Validación Outbound</div><div class="sm">Conteo ciego por fase</div></div><button class="btn w" id="m-atras">← Volver a módulos</button>');
      q("#m-val").onclick = () => auxLista(true); q("#m-atras").onclick = () => auxModulos("inv0");
    }
  }

  async function auxLista(fuerza) {
    const r = aroot();
    if (!AX.fases.length || fuerza) r.innerHTML = marco(logoHTML + '<h1>FASES <small>· ' + E(AX.yo.nombre) + "</small></h1><p style='text-align:center;color:#777'>Cargando…</p>");
    const { data, error } = await sb().rpc("val_fases_lista");
    if (error) { r.innerHTML = marco(logoHTML + '<div class="msg bad">No se pudo cargar: ' + E(error.message) + '</div><button class="btn" id="x-rec">Reintentar</button>'); q("#x-rec").onclick = () => auxLista(true); return; }
    AX.fases = data || [];
    auxPintarLista();
  }
  function auxPintarLista() {
    const r = aroot();
    r.innerHTML = marco(logoHTML + '<h1>FASES <small>· ' + E(AX.yo.nombre) + "</small></h1>" +
      '<div class="fila2"><button class="btn" id="x-act">Actualizar</button><button class="btn w" id="x-mod">Módulos</button><button class="btn k" id="x-salir">Salir</button></div>' +
      barraFiltros(AX.fases, AX.S) + '<div id="x-lista">' + listaHTML(AX.fases, AX.S, { yo: AX.yo.usuario }) + "</div>");
    enlazarFiltros(r, AX.S, auxPintarLista);
    q("#x-act").onclick = () => { toast("Actualizando…"); auxLista(true); };
    q("#x-salir").onclick = () => cerrarSesion();
    q("#x-mod").onclick = () => auxModulos("inv1");
    r.querySelectorAll(".card[data-fase]").forEach(c => c.onclick = () => {
      auxOpciones(c.dataset.fase, c.dataset.est);
    });
  }

  function auxOpciones(fase, est) {
    const f = AX.fases.find(x => x.fase === fase) || {}, mia = f.validador_ref && AX.yo && f.validador_ref === "u:" + AX.yo.usuario;
    const otro = est === "EN PROCESO" && !mia;
    const m = document.createElement("div"); m.className = "modal-vx on";
    m.innerHTML = '<div><h3 style="margin:0 0 4px;text-align:center">FASE ' + E(fase) + '</h3><p class="hint" style="text-align:center">' + E(f.canal_sistema || "") + " | " + E(f.canal_fisico || "") + "</p>" +
      (est === "CERRADO" ? '<p style="text-align:center">Esta fase ya está <b>cerrada</b>.</p><button class="btn b" data-o="ver">📋 Ver registros y reporte</button>'
        : otro ? '<p style="text-align:center">La está validando <b>' + E(f.validador || "otra persona") + '</b>.</p><button class="btn b" data-o="ver">📋 Ver registros</button>'
        : '<p style="text-align:center">¿Qué deseas hacer?</p><button class="btn" data-o="val">▶ ' + (est === "PENDIENTE" ? "Iniciar validación" : "Continuar validación") + '</button><button class="btn b" data-o="ver">📋 Ver registros</button>') +
      '<button class="btn w" data-o="x">Cancelar</button></div>';
    aroot().querySelector(".vx").appendChild(m);
    m.onclick = ev => { if (ev.target === m) m.remove(); };
    m.querySelectorAll("[data-o]").forEach(b => b.onclick = () => { const o = b.dataset.o; m.remove(); if (o === "val") auxAbrirFase(fase); else if (o === "ver") auxAbrirFase(fase, true); });
  }
  async function auxAbrirFase(fase, soloVer) {
    const f = AX.fases.find(x => x.fase === fase);
    if (soloVer) {
      AX.V = { fase, info: f || { fase }, sig: 1, paletas: [], items: [], editando: null, hu: "", sn: false, mara: null, soloVer: true };
      await auxCargarPaletas(); return auxRegistros("FASE");
    }
    const { data, error } = await sb().rpc("val_iniciar_fase", { p_fase: fase });
    if (error) { toast(error.message); return auxLista(true); }
    AX.V = { fase, info: f || { fase }, sig: data || 1, paletas: [], items: [], editando: null, hu: "", sn: false, mara: null };
    await auxCargarPaletas();
    auxPintarValidar();
  }
  async function auxCargarPaletas() {
    const V = AX.V, { data } = await sb().from("val_registros").select("paleta,hu,codigo,descripcion,cantidad").eq("fase", V.fase).order("paleta").order("id");
    const m = {}; (data || []).forEach(x => { (m[x.paleta] = m[x.paleta] || { paleta: x.paleta, hu: x.hu, items: [] }).items.push({ codigo: x.codigo, desc: x.descripcion || "", cant: x.cantidad }); });
    V.paletas = Object.values(m).sort((a, b) => a.paleta - b.paleta);
    V.sig = V.paletas.length ? Math.max.apply(null, V.paletas.map(p => p.paleta)) + 1 : 1;
  }
  function auxPintarValidar() {
    const V = AX.V, i = V.info, r = aroot(), pal = V.editando || V.sig;
    r.innerHTML = marco(
      '<div class="top"><span class="tag">' + E(i.canal_sistema || "") + " | " + E(i.canal_fisico || "") + " " + conoHTML(i.cono) + '</span><button class="btn r" id="x-fin">Finalizar auditoría</button></div>' +
      '<div class="fofase">FO: ' + E(i.fo || "-") + " · FASE: " + E(V.fase) + "</div>" +
      '<div class="barra"><span class="pn">Paleta ' + pal + '</span><button class="btn w" id="x-borrar">Borrar</button><button class="btn o" id="x-menu">Ver registros</button></div>' +
      '<div class="paso"><label>1° HU DE LA PALETA (escanee la etiqueta)</label>' +
      '<div class="hurow"><input id="x-hu" placeholder="ESCANEE EL HU" autocomplete="off" autocapitalize="characters" value="' + E(V.sn ? "SN" : V.hu) + '"' + (V.sn ? " readonly" : "") + '><button class="btn o" id="x-sn">SN</button></div>' +
      '<div class="hint">Sin etiqueta o ilegible: pulse SN. El sistema le asigna el HU real por los códigos y cantidades.</div></div>' +
      '<div class="paso"><div class="row2"><div><label>SKU / EAN</label><input id="x-sku" placeholder="Escanee SKU o EAN" autocomplete="off" autocapitalize="characters" value="' + E(V.mara ? V.mara.codigo : "") + '"></div>' +
      '<div><label>UMA</label><input id="x-uma" readonly value="' + E(V.mara ? V.mara.uma || "" : "") + '"></div></div>' +
      '<label>DESCRIPCIÓN:</label><input id="x-desc" readonly value="' + E(V.mara ? V.mara.descripcion : "") + '">' +
      '<div class="msg" id="x-msg"></div></div>' +
      '<div class="paso"><label>CANTIDAD (bultos)</label><div class="row3"><input id="x-cant" class="big" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Cantidad"><button class="btn" id="x-add">Agregar código</button></div></div>' +
      '<table><tr><th>Código</th><th>Desc.</th><th>Cant</th><th>Acción</th></tr>' +
      (V.items.length ? V.items.map((it, k) => "<tr><td>" + E(it.codigo) + '</td><td class="d">' + E(it.desc) + "</td><td><b>" + it.cant + '</b></td><td><button class="ic" data-del="' + k + '">🗑️</button></td></tr>').join("") :
        '<tr><td colspan="4" style="color:#888">Aún no agregas productos a esta paleta.</td></tr>') + "</table>" +
      '<button class="btn" id="x-fpal">Finalizar paleta</button>' +
      '<div class="back"><a id="x-volver">🏠 Volver al menú</a></div>' +
      '<div class="modal-vx" id="x-modal"><div id="x-modal-in"></div></div>');
    const hu = q("#x-hu"), sku = q("#x-sku"), cant = q("#x-cant");
    // Escáner: al terminar de leer el HU salta solo al SKU/EAN; al terminar el SKU/EAN busca y salta a la cantidad.
    let tHu = null, tSku = null;
    hu.oninput = () => { V.hu = hu.value.toUpperCase().replace(/\s/g, ""); clearTimeout(tHu); if (V.hu.length >= 10) tHu = setTimeout(() => { if (q("#x-hu") === hu && V.hu) sku.focus(); }, 350); };
    hu.onkeydown = e => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); clearTimeout(tHu); sku.focus(); } };
    hu.onchange = () => { if (V.hu) sku.focus(); };
    cant.oninput = () => { const d = cant.value.replace(/\D/g, ""); if (d !== cant.value) cant.value = d; };
    q("#x-sn").onclick = () => { V.sn = !V.sn; if (V.sn) { V.hu = ""; } auxPintarValidar(); if (V.sn) sku.focus(); };
    sku.oninput = () => { clearTimeout(tSku); if (sku.value.trim().length >= 7) tSku = setTimeout(() => { if (q("#x-sku") === sku) auxBuscar(); }, 350); };
    sku.onkeydown = e => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); clearTimeout(tSku); auxBuscar(); } };
    sku.onchange = () => { clearTimeout(tSku); if (!V.mara || V.mara.codigo !== sku.value.trim()) auxBuscar(); };
    cant.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); auxAgregar(); } };
    q("#x-add").onclick = auxAgregar;
    r.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { V.items.splice(Number(b.dataset.del), 1); auxPintarValidar(); });
    q("#x-fpal").onclick = auxFinalizarPaleta;
    q("#x-borrar").onclick = auxBorrar;
    q("#x-menu").onclick = auxMenu;
    q("#x-fin").onclick = auxFinalizarFase;
    q("#x-volver").onclick = () => { if (V.items.length && !confirm("Tienes productos sin guardar en esta paleta. ¿Salir de todos modos?")) return; AX.V = null; auxLista(true); };
    (V.sn || V.hu ? sku : hu).focus();
  }
  function auxMsg(t, cls) { const m = q("#x-msg"); if (!m) return; m.className = "msg " + (cls || ""); m.textContent = t || ""; }
  async function auxBuscar() {
    const V = AX.V; if (!V || !q("#x-sku")) return;
    const c = (q("#x-sku").value || "").trim().toUpperCase().replace(/^S/, "").replace(/[^A-Z0-9]/g, "");
    if (!c) { V.mara = null; q("#x-uma").value = ""; q("#x-desc").value = ""; return; }
    if (V.mara && V.mara.codigo === c && q("#x-desc").value) { q("#x-cant").focus(); return; }
    const { data, error } = await sb().rpc("val_buscar_producto", { p_txt: c });
    if (!q("#x-sku")) return; // la pantalla cambió mientras buscaba
    if (error) return auxMsg("No se pudo buscar el código: " + error.message, "bad");
    if (!data || !data.length) { V.mara = null; q("#x-uma").value = ""; q("#x-desc").value = ""; return auxMsg("Código no encontrado en el catálogo (MARA). Revisa el SKU/EAN o avisa a la administradora.", "bad"); }
    V.mara = data[0]; q("#x-sku").value = V.mara.codigo; q("#x-uma").value = V.mara.uma || ""; q("#x-desc").value = V.mara.descripcion; auxMsg("");
    q("#x-cant").focus();
  }
  async function auxAgregar() {
    const V = AX.V; if (!V.mara) await auxBuscar(); if (!V.mara) return;
    const n = Number(q("#x-cant").value);
    if (!q("#x-cant").value || !Number.isInteger(n) || n < 1) return auxMsg("Escribe una cantidad entera mayor a 0.", "bad");
    V.items.push({ codigo: V.mara.codigo, desc: V.mara.descripcion, cant: n }); V.mara = null;
    auxPintarValidar(); q("#x-sku").focus();
  }
  async function auxFinalizarPaleta() {
    const V = AX.V, huv = V.sn ? "SN" : (V.hu || "").trim();
    if (!huv) return auxMsg("Escanee el HU de la paleta o pulse SN si no tiene etiqueta.", "bad");
    if (!V.items.length) return auxMsg("Agrega al menos un producto a la paleta.", "bad");
    const n = V.editando || V.sig, b = q("#x-fpal"); b.disabled = true;
    const { error } = await sb().rpc("val_guardar_paleta", { p_fase: V.fase, p_paleta: n, p_hu: huv, p_items: V.items.map(i => ({ codigo: i.codigo, desc: i.desc, cant: i.cant })), p_motivo: V.editando ? "Corrección del validador" : null });
    b.disabled = false;
    if (error) return auxMsg(error.message, "bad");
    toast("Paleta " + n + " guardada ✔");
    V.items = []; V.hu = ""; V.sn = false; V.mara = null; V.editando = null; V.ed = null;
    await auxCargarPaletas(); auxPintarValidar();
  }
  async function auxBorrar() {
    const V = AX.V;
    if (V.editando) {
      if (!confirm("¿Borrar la paleta " + V.editando + " completa?")) return;
      const { error } = await sb().rpc("val_borrar_paleta", { p_fase: V.fase, p_paleta: V.editando });
      if (error) return auxMsg(error.message, "bad");
      toast("Paleta " + V.editando + " borrada"); V.editando = null; V.items = []; V.hu = ""; V.sn = false;
      await auxCargarPaletas(); return auxPintarValidar();
    }
    if (V.items.length || V.hu || V.sn) { if (!confirm("¿Borrar lo que llevas en esta paleta?")) return; }
    V.items = []; V.hu = ""; V.sn = false; V.mara = null; auxPintarValidar();
  }
  /* ---- Pantalla REGISTROS: estado por código (solo palabras), total del viaje y edición de paletas ---- */
  function auxMenu() { AX.V.tabReg = AX.V.tabReg || "FASE"; auxRegistros(AX.V.tabReg); }
  const ESTADO_COLOR = { CUADRADO: "#00a862", FALTANTE: "#e30a17", SOBRANTE: "#d98a00", PENDIENTE: "#666", "NO PERTENECE": "#7b3fe4", "EN OTRA FASE": "#0b6fc2", "DE OTRA FASE": "#0b6fc2", AJUSTE: "#0a8f8f" };
  async function auxRegistros(tab) {
    const V = AX.V, i = V.info, r = aroot(); V.tabReg = tab;
    const pk = i.pk === "EN CURSO" ? '<div class="pk ab">⏳ Picking en curso: ' + i.tareas_abiertas + " tareas abiertas (* = se compara con lo previsto)</div>" : i.pk === "CONFIRMADA" ? '<div class="pk ok">✅ Picking confirmado</div>' : '<div class="pk no">📄 Sin picking: se compara solo por códigos</div>';
    r.innerHTML = marco('<h1 style="font-weight:700;margin:6px 0">REGISTROS</h1><div class="fofase" style="text-align:center;color:#111">FO: ' + E(i.fo || "-") + " · FASE: " + E(V.fase) + '</div><div style="text-align:center;color:#666;font-size:14px">SIST: ' + E(i.canal_sistema || "-") + " | " + E(i.canal_fisico || "-") + "</div>" +
      '<div class="tabs"><button data-rt="FASE" class="' + (tab === "FASE" ? "on" : "") + '">Esta fase</button><button data-rt="FO" class="' + (tab === "FO" ? "on" : "") + '">Total FO</button><button data-rt="PAL" class="' + (tab === "PAL" ? "on" : "") + '">Paletas</button>' + (i.estado === "CERRADO" ? '<button data-rt="REP" class="' + (tab === "REP" ? "on" : "") + '">Reporte</button>' : "") + "</div>" +
      pk + '<div id="rg-cuerpo"><p style="text-align:center;color:#777">Cargando…</p></div>' +
      '<div class="fixbar">' + (V.soloVer || i.estado === "CERRADO" ? "" : '<a id="rg-seguir" class="seg">↩ Seguir validando</a>') + '<a id="rg-volver">🏠 Volver al menú</a></div><div style="height:50px"></div>');
    r.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => auxRegistros(b.dataset.rt));
    const sg = q("#rg-seguir"); if (sg) sg.onclick = () => { V.tabReg = "FASE"; V.ed = null; auxPintarValidar(); };
    q("#rg-volver").onclick = () => { if (V.items && V.items.length && !confirm("Tienes productos sin guardar en la paleta que estabas armando. ¿Salir de todos modos?")) return; AX.V = null; auxLista(true); };
    if (tab === "PAL") return auxPaletasEditor();
    if (tab === "REP") return auxReporte();
    const { data, error } = await sb().rpc("val_estado_codigos", { p_fase: V.fase, p_vista: tab });
    if (V.tabReg !== tab) return;
    const cu = q("#rg-cuerpo"); if (!cu) return;
    if (error) { cu.innerHTML = '<div class="msg bad">' + E(error.message) + "</div>"; return; }
    const filas = data || [], ok = filas.filter(x => x.status === "CUADRADO").length, solo = V.soloDif === true;
    const pintar = () => {
      cu.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><span class="chip ok">' + ok + "/" + filas.length + ' códigos cuadrados</span><span class="chip mal">' + (filas.length - ok) + ' con diferencia</span></div>' +
        '<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin:6px 0"><input type="checkbox" id="rg-solo" style="width:auto;margin:0"' + (V.soloDif ? " checked" : "") + "> Mostrar solo diferencias</label>" +
        "<table><tr><th>Código</th><th>Bultos</th><th>Status</th></tr>" +
        (filas.filter(x => !V.soloDif || x.status !== "CUADRADO").map(x => "<tr><td><b>" + E(x.codigo) + '</b><div class="d">' + E(x.descripcion || "") + "</div></td><td><b>" + x.reg + "</b>" + (x.comparado ? ' <span style="color:#d98a00;font-weight:800">*</span>' : "") + '</td><td style="font-weight:800;color:' + (ESTADO_COLOR[x.status] || "#333") + '">' + E(x.status) + "</td></tr>").join("") || '<tr><td colspan="3" style="color:#888">Sin códigos para mostrar.</td></tr>') + "</table>";
      q("#rg-solo").onchange = e => { V.soloDif = e.target.checked; pintar(); };
    };
    pintar();
  }
  async function auxReporte() {
    const V = AX.V, cu = q("#rg-cuerpo");
    const { data, error } = await sb().rpc("val_vista_stock", { p_fase: V.fase, p_vista: "FASE" });
    if (V.tabReg !== "REP" || !cu) return;
    if (error) { cu.innerHTML = '<div class="msg bad">' + E(error.message) + "</div>"; return; }
    cu.innerHTML = '<p class="hint">Reporte de la fase cerrada: lo solicitado vs. lo que validaste, con los comentarios de la asistente.</p>' + tablaStockHTML(data || [], false);
  }
  function tablaStockHTML(filas, ancho) {
    return '<div style="overflow-x:auto"><table class="tbl-stock"><tr><th>Código</th><th>UN</th><th>Solic.</th><th>Conteo</th><th>Dif.</th><th>Status</th><th>Comentario</th></tr>' +
      (filas.map(x => "<tr><td><b>" + E(x.codigo) + '</b><div class="d">' + E(x.descripcion || "") + "</div></td><td>" + E(x.un || "") + "</td><td>" + x.solicitado + "</td><td><b>" + x.contado + "</b></td><td style='font-weight:800;color:" + (x.diferencia < 0 ? "#e30a17" : x.diferencia > 0 ? "#d98a00" : "#00a862") + "'>" + (x.diferencia > 0 ? "+" : "") + x.diferencia + '</td><td style="font-weight:800;color:' + (ESTADO_COLOR[x.status] || "#333") + '">' + E(x.status) + '</td><td class="d" style="min-width:140px">' + E(x.comentario || "") + "</td></tr>").join("") || '<tr><td colspan="7" style="color:#888">Sin filas.</td></tr>') + "</table></div>";
  }
  function auxPaletasEditor() {
    const V = AX.V;
    editorPaletas(q("#rg-cuerpo"), { fase: V.fase, paletas: V.paletas, st: V, editable: !(V.soloVer || V.info.estado === "CERRADO"), recargar: async () => { await auxCargarPaletas(); auxRegistros("PAL"); } });
  }
  /* Editor de paletas (lo usan el validador antes de cerrar y el personal en cualquier momento) */
  function editorPaletas(cu, ctx) {
    const V = ctx.st;
    if (!V.ed) V.ed = ctx.paletas.map(p => ({ paleta: p.paleta, hu: p.hu, items: p.items.map(x => ({ codigo: x.codigo, desc: x.desc, cant: x.cant })), nc: "", nq: "", msg: "" }));
    const tot = p => p.items.reduce((t, x) => t + (Number(x.cant) || 0), 0);
    if (!ctx.editable) {
      cu.innerHTML = (ctx.paletas.length ? ctx.paletas.map(p => '<div class="palc"><div class="ph"><b>PALETA ' + p.paleta + "</b><b>" + tot(p) + ' bultos</b></div><div style="font-weight:800;margin-bottom:4px">HU ' + E(p.hu) + "</div>" +
        p.items.map(x => '<div class="it" style="grid-template-columns:1fr auto"><div><b>' + E(x.codigo) + "</b><small>" + E(x.desc) + "</small></div><b style='font-size:18px'>" + x.cant + "</b></div>").join("") + "</div>").join("") : '<p style="text-align:center;color:#777">Todavía no hay paletas guardadas.</p>');
      return;
    }
    const pintar = () => {
      cu.innerHTML = (V.ed.length ? V.ed.map((p, pi) => '<div class="palc"><div class="ph"><b>PALETA ' + p.paleta + "</b><b>" + tot(p) + ' bultos</b></div>' +
        '<div class="hurow2"><label>HU</label><input data-hu="' + pi + '" value="' + E(p.hu) + '" autocapitalize="characters"></div>' +
        p.items.map((x, k) => '<div class="it"><div><b>' + E(x.codigo) + '</b><small>' + E(x.desc) + '</small></div><input type="text" inputmode="numeric" pattern="[0-9]*" data-q="' + pi + "|" + k + '" value="' + x.cant + '"><button class="ic" data-x="' + pi + "|" + k + '">🗑️</button></div>').join("") +
        '<div class="addrow"><input data-nc="' + pi + '" placeholder="+ Código o EAN" value="' + E(p.nc) + '" autocapitalize="characters"><input data-nq="' + pi + '" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Cant." value="' + E(p.nq) + '"><button class="btn w" data-add="' + pi + '">Agregar</button></div>' +
        (p.msg ? '<div class="msg bad">' + E(p.msg) + "</div>" : "") + '<button class="btn" data-save="' + pi + '">Guardar paleta ' + p.paleta + "</button></div>").join("") : '<p style="text-align:center;color:#777">Todavía no hay paletas guardadas.</p>');
      cu.querySelectorAll("[data-hu]").forEach(e => e.oninput = () => { V.ed[+e.dataset.hu].hu = e.value.toUpperCase().replace(/\s/g, ""); });
      cu.querySelectorAll("[data-q]").forEach(e => e.onchange = () => { const [a, b] = e.dataset.q.split("|"); V.ed[+a].items[+b].cant = e.value; pintar(); });
      cu.querySelectorAll("[data-nc]").forEach(e => e.oninput = () => { V.ed[+e.dataset.nc].nc = e.value; });
      cu.querySelectorAll("[data-nq]").forEach(e => e.oninput = () => { V.ed[+e.dataset.nq].nq = e.value; });
      cu.querySelectorAll("[data-x]").forEach(e => e.onclick = () => { const [a, b] = e.dataset.x.split("|"); V.ed[+a].items.splice(+b, 1); pintar(); });
      cu.querySelectorAll("[data-add]").forEach(e => e.onclick = async () => {
        const p = V.ed[+e.dataset.add], c = (p.nc || "").trim().toUpperCase().replace(/^S/, "").replace(/[^A-Z0-9]/g, ""), n = Number(p.nq); p.msg = "";
        if (!c) { p.msg = "Escribe el código o EAN."; return pintar(); }
        if (!p.nq || !Number.isInteger(n) || n < 1) { p.msg = "Escribe una cantidad entera mayor a 0."; return pintar(); }
        const { data, error } = await sb().rpc("val_buscar_producto", { p_txt: c });
        if (error || !data || !data.length) { p.msg = "Código no encontrado en el catálogo (MARA)."; return pintar(); }
        const ya = p.items.find(x => x.codigo === data[0].codigo); if (ya) ya.cant = (Number(ya.cant) || 0) + n; else p.items.push({ codigo: data[0].codigo, desc: data[0].descripcion, cant: n });
        p.nc = ""; p.nq = ""; pintar();
      });
      cu.querySelectorAll("[data-save]").forEach(e => e.onclick = async () => {
        const p = V.ed[+e.dataset.save]; p.msg = "";
        const malos = p.items.some(x => !Number.isInteger(Number(x.cant)) || Number(x.cant) < 1);
        if (!p.hu) { p.msg = "La paleta necesita un HU (o escribe SN)."; return pintar(); }
        if (!p.items.length) {
          if (!confirm("La paleta " + p.paleta + " quedó sin productos. ¿Borrarla completa?")) return;
          const { error } = await sb().rpc("val_borrar_paleta", { p_fase: ctx.fase, p_paleta: p.paleta });
          if (error) { p.msg = error.message; return pintar(); }
          toast("Paleta " + p.paleta + " borrada"); V.ed = null; return ctx.recargar();
        }
        if (malos) { p.msg = "Todas las cantidades deben ser enteros mayores a 0."; return pintar(); }
        e.disabled = true;
        const { error } = await sb().rpc("val_guardar_paleta", { p_fase: ctx.fase, p_paleta: p.paleta, p_hu: p.hu, p_items: p.items.map(x => ({ codigo: x.codigo, desc: x.desc, cant: Number(x.cant) })), p_motivo: ctx.motivo || "Corrección del validador" });
        if (error) { p.msg = error.message; return pintar(); }
        toast("Paleta " + p.paleta + " guardada ✔"); V.ed = null; ctx.recargar();
      });
    };
    pintar();
  }
  async function auxFinalizarFase() {
    const V = AX.V;
    if (V.items.length) return auxMsg("Tienes productos sin guardar: pulsa «Finalizar paleta» primero.", "bad");
    if (!V.paletas.length) return auxMsg("No has registrado ninguna paleta.", "bad");
    if (!confirm("¿Finalizar la auditoría de la fase " + V.fase + "?\n\nPaletas registradas: " + V.paletas.length + ".\nYa no podrás agregar ni corregir paletas.")) return;
    const coment = prompt("Comentario de la fase (opcional)", "Sin novedad");
    if (coment === null) return;
    try { if (coment.trim()) await sb().rpc("val_fase_comentario", { p_fase: V.fase, p_texto: coment }); } catch (e) { /* el comentario no frena el cierre */ }
    const { error } = await sb().rpc("val_finalizar_fase", { p_fase: V.fase });
    if (error) return auxMsg(error.message, "bad");
    toast("Fase finalizada ✔"); AX.V = null; auxLista(true);
  }

  /* ======================================================================
     STAFF (asistentes y administradora)
     ====================================================================== */
  const ST = { tab: "fases", S: { fil: "N", dia: "" }, fases: [], esAdmin: false, yo: "", fos: [], ultimo: null };
  const CARGAS = [
    { id: "DRIVE", t: "Viajes y fases (carga manual)", d: "Normalmente NO hace falta: el Drive de Despacho se conecta solo (ver pestaña Fases). Úsalo solo si necesitas cargar a mano la hoja DRIVE o L400.", hojas: ["DRIVE", "DINAMICA DRIVE"] },
    { id: "MARA", t: "Catálogo MARA (mensual)", d: "Se queda guardado y la app trabaja con él hasta que subas el del mes siguiente, que reemplaza al anterior.", hojas: ["MARA"] },
    { id: "STOCK", t: "STOCK ENTREGAS", d: "Export de SAP con las entregas (lo solicitado). Reemplaza lo anterior.", hojas: ["STOCK ENTREGAS", "STOCK"] },
    { id: "MONITOR", t: "MONITOR (entrega → viaje)", d: "Columnas Entrega y Orden de flete (FO). Sirve para ubicar cada entrega en su viaje.", hojas: ["MONITOR"] },
    { id: "PICKING", t: "PICKING", d: "Export de tareas de almacén. Reemplaza solo las fases que vengan en el archivo.", hojas: ["PICKING"] },
    { id: "USUARIOS", t: "Colaboradores (picadores)", d: "Usuario SAP (E_xxx) y nombre, para saber quién se equivocó.", hojas: ["USUARIOS", "USUARIOS EWM", "COLABORADOR"] }
  ];

  async function staffRender(main, yo, esAdmin) {
    ST.esAdmin = esAdmin; ST.yo = yo;
    main.innerHTML = '<div class="vs"><div class="tarjeta encabezado"><div class="migas"><a href="#inicio">Inicio</a> / <a href="#inventario">Inventario</a> / Validación Outbound</div>' +
      "<h2>Validación ciega de canales Outbound</h2><p>Sigue las validaciones, carga tus Excel y descarga el cruce de cada viaje.</p></div>" +
      '<div class="tabs-vs"><button data-t="fases" class="' + (ST.tab === "fases" ? "on" : "") + '">📋 Fases</button>' +
      (esAdmin ? '<button data-t="cargar" class="' + (ST.tab === "cargar" ? "on" : "") + '">⬆️ Cargar datos</button>' : "") +
      '<button data-t="cruce" class="' + (ST.tab === "cruce" ? "on" : "") + '">📥 Cruce y descarga</button></div><div id="vs-cuerpo"></div></div>';
    main.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { ST.tab = b.dataset.t; staffRender(main, yo, esAdmin); });
    const c = q("#vs-cuerpo");
    if (ST.tab === "cargar" && esAdmin) return staffCargar(c);
    if (ST.tab === "cruce") return staffCruce(c);
    return staffFases(c);
  }

  /* ---- Fases ---- */
  async function staffFases(c) {
    c.innerHTML = '<p class="rel">Cargando…</p>';
    const { data, error } = await sb().rpc("val_fases_lista");
    if (error) { c.innerHTML = '<div class="avisos">No se pudo cargar: ' + E(error.message) + "</div>"; return; }
    ST.fases = data || [];
    let banner = "";
    try {
      const { data: cf } = await sb().from("val_config").select("clave,valor").in("clave", ["drive_ultima_sync", "drive_resumen"]), m = {}; (cf || []).forEach(x => m[x.clave] = x.valor);
      if (m.drive_ultima_sync) {
        const min = Math.round((Date.now() - new Date(m.drive_ultima_sync).getTime()) / 60000), viejo = min > 30;
        banner = '<div class="avisos" style="' + (viejo ? "" : "background:#e8f6ee;border-color:#b9e3c9;color:#0a6b3f") + '">' + (viejo ? "⚠ " : "🔄 ") + "Drive de Despacho: última sincronización hace " + (min < 1 ? "menos de 1 minuto" : min < 90 ? min + " min" : Math.round(min / 60) + " h") + (m.drive_resumen ? " · " + E(m.drive_resumen) : "") + (viejo ? ". Revisa que el activador del Apps Script siga activo." : "") + "</div>";
      } else banner = '<div class="avisos">El Drive de Despacho aún no está conectado. Sigue los pasos de «sincronizar_drive.gs», o sube la hoja DRIVE en «Cargar datos».</div>';
    } catch (e) { /* sin banner */ }
    const pintar = () => {
      c.innerHTML = banner + '<div class="vx" style="max-width:640px">' + barraFiltros(ST.fases, ST.S) + listaHTML(ST.fases, ST.S, { staff: true, yo: ST.yo, admin: ST.esAdmin }) + "</div>";
      enlazarFiltros(c, ST.S, pintar);
      c.querySelectorAll(".card[data-fase]").forEach(card => card.onclick = ev => { if (ev.target.closest("details,button,a,input")) return; staffFaseDetalle(c, card.dataset.fase); });
      c.querySelectorAll("[data-cruce]").forEach(b => b.onclick = ev => { ev.stopPropagation(); ST.tab = "cruce"; ST.fo = b.dataset.cruce; staffRender(q("#principal"), ST.yo, ST.esAdmin); });
      c.querySelectorAll("[data-sinstock]").forEach(b => b.onclick = ev => { ev.stopPropagation(); alert("Este viaje todavía no tiene STOCK ENTREGA cargado, así que no se puede cruzar. " + (ST.esAdmin ? "Ve a «Cargar datos» y sube el STOCK ENTREGA." : "Pídele a la administradora que lo suba.")); if (!ST.esAdmin) return; ST.tab = "cargar"; staffRender(q("#principal"), ST.yo, ST.esAdmin); });
      const accion = (sel, texto, rpc, ok) => c.querySelectorAll(sel).forEach(b => b.onclick = async ev => {
        ev.stopPropagation();
        const fa = b.dataset[sel.replace(/^\[data-|\]$/g, "")];
        if (!confirm(texto(fa))) return;
        const { error: e3 } = await sb().rpc(rpc, { p_fase: fa });
        if (e3) return alert(e3.message); toast(ok); staffFases(c);
      });
      accion("[data-eliminar]", fa => "¿Estás segura de eliminar la fase " + fa + "?\n\nSe borrarán también su stock, su picking, lo contado por los auxiliares y sus comentarios. No se puede deshacer.", "val_fase_eliminar", "Fase eliminada");
      accion("[data-borrarreg]", fa => "¿Borrar TODO lo contado en la fase " + fa + "?\n\nSe borrarán las paletas registradas por el validador y la fase vuelve a PENDIENTE. No se puede deshacer.", "val_fase_borrar_registros", "Registros borrados");
      accion("[data-borrarpk]", fa => "¿Borrar el picking cargado de la fase " + fa + "?\n\nLa fase se cruzará solo por códigos hasta que vuelvas a subir el picking.", "val_fase_borrar_picking", "Picking borrado");
      c.querySelectorAll("[data-reabrir]").forEach(b => b.onclick = async ev => {
        ev.stopPropagation();
        if (!confirm("¿Reabrir la fase " + b.dataset.reabrir + "? Volverá a estar EN PROCESO.")) return;
        const { error: e2 } = await sb().rpc("val_reabrir_fase", { p_fase: b.dataset.reabrir });
        if (e2) return alert(e2.message); toast("Fase reabierta"); staffFases(c);
      });
    };
    if (!ST.fases.length) { c.innerHTML = '<div class="caja"><h4>Aún no hay fases</h4><p>Entra a «Cargar datos» y sube tu hoja DRIVE para crear los viajes y fases.</p></div>'; return; }
    pintar();
  }

  /* ---- Cargar datos ---- */
  function leerArchivo(file, hojas) {
    return file.arrayBuffer().then(buf => {
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const nombres = wb.SheetNames, norm = x => String(x).trim().toUpperCase();
      let hoja = null; for (const h of hojas) { const f = nombres.find(n => norm(n) === h); if (f) { hoja = f; break; } }
      if (!hoja) hoja = nombres[0];
      return { hoja, aoa: XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: "" }) };
    });
  }
  async function porLotes(filas, n, fn, progreso) {
    for (let i = 0; i < filas.length; i += n) { await fn(filas.slice(i, i + n)); if (progreso) progreso(Math.min(i + n, filas.length), filas.length); }
  }
  const ok = (r, t) => { r.className = "res ok"; r.textContent = t; };
  const mal = (r, t) => { r.className = "res bad"; r.textContent = t; };

  function staffCargar(c) {
    c.innerHTML = '<p class="rel">Sube tus archivos de Excel (.xlsx, .xls o .csv). Si el libro trae varias hojas, el sistema usa la que se llama igual que el tipo de dato. Orden recomendado: DRIVE → MARA → MONITOR → STOCK → PICKING → Colaboradores.</p><div class="cajas">' +
      CARGAS.map(x => '<div class="caja"><h4>' + E(x.t) + "</h4><p>" + E(x.d) + '</p><input type="file" accept=".xlsx,.xls,.csv" data-f="' + x.id + '">' +
        (x.id === "PICKING" ? '<label style="font-size:12px"><input type="checkbox" id="chk-reemp"> También reemplazar fases ya confirmadas</label><br>' : "") +
        '<button class="btn-v" data-go="' + x.id + '" disabled>Cargar</button><div class="res" id="res-' + x.id + '"></div></div>').join("") + "</div>";
    estadoCargas(c);
    const archivos = {};
    c.querySelectorAll("[data-f]").forEach(inp => inp.onchange = async () => {
      const id = inp.dataset.f, def = CARGAS.find(x => x.id === id), res = q("#res-" + id), btn = c.querySelector('[data-go="' + id + '"]'); btn.disabled = true; archivos[id] = null;
      if (!inp.files[0]) return;
      try {
        const { hoja, aoa } = await leerArchivo(inp.files[0], def.hojas);
        const P = { DRIVE: CARGAS_PARSE.parseDrive, MARA: CARGAS_PARSE.parseMara, STOCK: CARGAS_PARSE.parseStock, MONITOR: CARGAS_PARSE.parseMonitor, PICKING: CARGAS_PARSE.parsePicking, USUARIOS: CARGAS_PARSE.parseUsuarios }[id];
        const filas = P(aoa); archivos[id] = filas; btn.disabled = false;
        ok(res, "Hoja «" + hoja + "»: " + filas.length + " filas listas para cargar." + (id === "PICKING" ? "\nFases en el archivo: " + new Set(filas.map(f => f.fase)).size : ""));
      } catch (e) { mal(res, e.message || String(e)); }
    });
    c.querySelectorAll("[data-go]").forEach(b => b.onclick = async () => {
      const id = b.dataset.go, res = q("#res-" + id); if (!archivos[id]) return;
      b.disabled = true; res.className = "res"; res.textContent = "Cargando…";
      try { const msg = await CARGADORES[id](archivos[id], t => { res.textContent = t; }); ok(res, msg); }
      catch (e) { mal(res, "No se pudo cargar: " + (e.message || e)); } finally { b.disabled = false; }
    });
  }
  const CARGAS_PARSE = window.CARGAS;
  // "Actualmente en la app: N registros" en cada tarjeta de carga
  async function estadoCargas(c) {
    const tablas = { DRIVE: "val_fases", MARA: "val_mara", STOCK: "val_esperado", MONITOR: "val_monitor", PICKING: "val_picking", USUARIOS: "val_picadores" }, ETQ = { DRIVE: "fases", MARA: "productos", STOCK: "líneas", MONITOR: "entregas", PICKING: "tareas", USUARIOS: "usuarios" };
    let fMara = "";
    try { const { data } = await sb().from("val_config").select("valor").eq("clave", "mara_ultima_carga").limit(1); if (data && data[0]) fMara = fmtTs(data[0].valor).slice(0, 10); } catch (e) {}
    const { data: CNT } = await sb().rpc("val_conteos");
    for (const id of Object.keys(tablas)) {
      try {
        let count = CNT ? CNT[tablas[id]] : undefined;
        if (count === undefined) { const r0 = await sb().from(tablas[id]).select("*", { count: "exact", head: true }); if (r0.error) throw r0.error; count = r0.count; }
        const b = c.querySelector('[data-go="' + id + '"]'); if (!b) continue;
        const d = document.createElement("div"); d.className = "rel"; d.style.cssText = "margin:4px 0 0;font-size:12px;font-weight:700";
        d.textContent = "En la app ahora: " + count + " " + ETQ[id] + (id === "MARA" && fMara ? " · cargado el " + fMara : ""); b.parentNode.insertBefore(d, b.nextSibling);
      } catch (e) { /* sin dato */ }
    }
  }
  const CARGADORES = {
    async MARA(filas, prog) {
      await porLotes(filas, 500, async lote => { const { error } = await sb().from("val_mara").upsert(lote, { onConflict: "codigo" }); if (error) throw error; }, (a, b) => prog("MARA: " + a + " de " + b + "…"));
      // el catálogo nuevo reemplaza al anterior: se quitan los códigos que ya no vienen
      const nuevos = new Set(filas.map(f => f.codigo)), viejos = await leerTodo((a, b) => sb().from("val_mara").select("codigo").order("codigo").range(a, b)), sobran = viejos.map(v => v.codigo).filter(c => !nuevos.has(c));
      await porLotes(sobran, 150, async lote => { const { error } = await sb().from("val_mara").delete().in("codigo", lote); if (error) throw error; });
      await sb().from("val_config").upsert({ clave: "mara_ultima_carga", valor: new Date().toISOString(), actualizado: new Date().toISOString() }, { onConflict: "clave" });
      return "MARA: " + filas.length + " productos vigentes" + (sobran.length ? " (se quitaron " + sobran.length + " códigos del catálogo anterior)" : "") + ". La app trabajará con este catálogo hasta que subas el próximo.";
    },
    async DRIVE(filas) {
      const ex = await leerTodo((a, b) => sb().from("val_fases").select("fase,estado,fo,canal_sistema,canal_fisico,cono").order("fase").range(a, b)), M = {}; ex.forEach(f => M[f.fase] = f);
      const nuevas = [], upd = [];
      filas.forEach(f => { const o = M[f.fase];
        if (!o) nuevas.push({ fase: f.fase, fo: f.fo || null, canal_sistema: f.canal_sistema || null, canal_fisico: f.canal_fisico || null, cono: f.cono || null, origen: "drive" });
        else { const c = {}; ["fo", "canal_sistema", "canal_fisico", "cono"].forEach(k => { if (f[k] && f[k] !== (o[k] || "")) c[k] = f[k]; }); if (Object.keys(c).length && (o.estado !== "CERRADO" || ["fo", "canal_sistema", "canal_fisico", "cono"].some(k => !o[k] && c[k]))) upd.push([f.fase, o.estado === "CERRADO" ? Object.fromEntries(Object.entries(c).filter(([k]) => !o[k])) : c]); } });
      await porLotes(nuevas, 300, async lote => { const { error } = await sb().from("val_fases").insert(lote); if (error) throw error; });
      for (const [fase, c] of upd) { if (!Object.keys(c).length) continue; const { error } = await sb().from("val_fases").update(c).eq("fase", fase); if (error) throw error; }
      return "DRIVE: " + nuevas.length + " fases nuevas, " + upd.length + " actualizadas, " + (filas.length - nuevas.length - upd.length) + " sin cambios.";
    },
    async MONITOR(filas, prog) {
      await porLotes(filas, 500, async lote => { const { error } = await sb().from("val_monitor").upsert(lote, { onConflict: "entrega" }); if (error) throw error; }, (a, b) => prog("MONITOR: " + a + " de " + b + "…"));
      const porFo = {}; filas.forEach(f => (porFo[f.fo] = porFo[f.fo] || []).push(f.entrega));
      for (const fo of Object.keys(porFo)) { const { error } = await sb().from("val_esperado").update({ fo }).in("entrega", porFo[fo]); if (error) throw error; }
      return "MONITOR: " + filas.length + " entregas asignadas a " + Object.keys(porFo).length + " viajes.";
    },
    async STOCK(filas, prog) {
      const mon = await leerTodo((a, b) => sb().from("val_monitor").select("entrega,fo").order("entrega").range(a, b)), MM = {}; mon.forEach(m => MM[m.entrega] = m.fo);
      const rows = filas.map(f => ({ fo: f.fo && !isNaN(Number(f.fo)) ? f.fo : (MM[f.entrega] || null), fase: f.fase && !isNaN(Number(f.fase)) ? f.fase : null, entrega: f.entrega, documento_compra: f.documento_compra,
        material: f.material, descripcion: f.descripcion, un: f.un, cantidad: f.cantidad, peso: f.peso }));
      const sinFo = rows.filter(r => !r.fo).length;
      const { error: e0 } = await sb().from("val_esperado").delete().gte("id", 0); if (e0) throw e0;
      await porLotes(rows, 500, async lote => { const { error } = await sb().from("val_esperado").insert(lote); if (error) throw error; }, (a, b) => prog("STOCK: " + a + " de " + b + "…"));
      // viajes con entregas pero sin ninguna fase conocida -> fase provisional SF<viaje>
      const ex = await leerTodo((a, b) => sb().from("val_fases").select("fase,fo").order("fase").range(a, b)), conFase = new Set(ex.map(f => f.fo).filter(Boolean)), nuevas = [];
      rows.forEach(r => { if (r.fase && !ex.some(f => f.fase === r.fase) && !nuevas.some(n => n.fase === r.fase) && r.fo) nuevas.push({ fase: r.fase, fo: r.fo, origen: "stock" }); });
      new Set(rows.filter(r => r.fo && !r.fase).map(r => r.fo)).forEach(fo => { if (!conFase.has(fo) && !nuevas.some(n => n.fo === fo)) nuevas.push({ fase: "SF" + fo, fo, origen: "stock" }); });
      if (nuevas.length) { const { error } = await sb().from("val_fases").insert(nuevas); if (error) throw error; }
      return "STOCK ENTREGAS: " + rows.length + " líneas de " + new Set(rows.map(r => r.entrega)).size + " entregas." + (sinFo ? "\n⚠ " + sinFo + " líneas no tienen viaje: carga también la hoja MONITOR y vuelve a cargar el stock." : "") + (nuevas.length ? "\nSe crearon " + nuevas.length + " fases nuevas." : "");
    },
    async PICKING(filas, prog) {
      const reemp = !!(q("#chk-reemp") && q("#chk-reemp").checked), fasesArch = Array.from(new Set(filas.map(f => f.fase)));
      const viejo = await leerTodo((a, b) => sb().from("val_picking").select("id,fase,status,fo").order("id").range(a, b)), conf = {}, foV = {};
      viejo.forEach(r => { if (!(r.fase in conf)) conf[r.fase] = true; const s = String(r.status || "").toUpperCase(); if (s !== "C" && s !== "A") conf[r.fase] = false; if (r.fo) foV[r.fase] = r.fo; });
      const omitidas = fasesArch.filter(fa => conf[fa] === true && !reemp), tomar = new Set(fasesArch.filter(fa => !omitidas.includes(fa)));
      const ff = await leerTodo((a, b) => sb().from("val_fases").select("fase,fo").order("fase").range(a, b)), foF = {}; ff.forEach(f => { if (f.fo) foF[f.fase] = f.fo; });
      const nuevas = filas.filter(f => tomar.has(f.fase)).map(f => Object.assign({}, f, { fo: f.fo || foF[f.fase] || foV[f.fase] || null }));
      const sinFo = Array.from(new Set(nuevas.filter(f => !f.fo).map(f => f.fase)));
      const lista = Array.from(tomar);
      for (let i = 0; i < lista.length; i += 40) { const { error } = await sb().from("val_picking").delete().in("fase", lista.slice(i, i + 40)); if (error) throw error; }
      await porLotes(nuevas, 500, async lote => { const { error } = await sb().from("val_picking").insert(lote); if (error) throw error; }, (a, b) => prog("PICKING: " + a + " de " + b + "…"));
      const crear = lista.filter(fa => !(fa in foF) && !ff.some(f => f.fase === fa)).map(fa => ({ fase: fa, fo: (nuevas.find(n => n.fase === fa) || {}).fo || null, origen: "picking" }));
      if (crear.length) { const { error } = await sb().from("val_fases").insert(crear); if (error) throw error; }
      return "PICKING: " + nuevas.length + " tareas cargadas en " + lista.length + " fases." + (omitidas.length ? "\nNo se tocaron por estar CONFIRMADAS (marca la casilla para reemplazarlas): " + omitidas.join(", ") : "") + (sinFo.length ? "\n⚠ Sin viaje (FO): " + sinFo.join(", ") + ". Carga el DRIVE y vuelve a cargar el picking." : "");
    },
    async USUARIOS(filas, prog) {
      await porLotes(filas, 500, async lote => { const { error } = await sb().from("val_picadores").upsert(lote, { onConflict: "usuario" }); if (error) throw error; }, (a, b) => prog("Colaboradores: " + a + " de " + b + "…"));
      return "Colaboradores: " + filas.length + " usuarios SAP cargados.";
    }
  };

  /* ---- Cruce y descarga ---- */
  async function staffCruce(c) {
    c.innerHTML = '<p class="rel">Cargando viajes…</p>';
    let fases; try { fases = await leerTodo((a, b) => sb().from("val_fases").select("fase,fo,estado").order("fase").range(a, b)); } catch (e) { c.innerHTML = '<div class="avisos">' + E(e.message) + "</div>"; return; }
    const fos = Array.from(new Set(fases.map(f => f.fo).filter(Boolean))).sort().reverse(); ST.fos = fos;
    c.innerHTML = '<div class="caja" style="max-width:640px"><h4>Cruce por viaje (FO)</h4><p>Lo solicitado vs. lo contado por los auxiliares, acumulado por código. El Excel trae 3 hojas: <b>CRUCE</b> (por código), <b>ERRORES DE PICKING</b> (con el nombre del picador) y <b>PROBLEMAS DE HU</b>.</p>' +
      '<select id="cr-fo"><option value="">Elige el viaje…</option>' + fos.map(f => '<option value="' + E(f) + '"' + (ST.fo === f ? " selected" : "") + ">" + E(f) + "</option>").join("") + '</select> ' +
      '<button class="btn-v" id="cr-go">Calcular</button><div id="cr-out"></div></div>';
    q("#cr-go").onclick = () => staffCalcular();
    q("#cr-fo").onchange = () => { ST.fo = q("#cr-fo").value; };
    if (ST.fo && fos.includes(ST.fo)) staffCalcular();
  }
  async function datosFO(fo) {
    const por = (t, cols, col, ord) => leerTodo((a, b) => sb().from(t).select(cols).eq(col, fo).order(ord || "id").range(a, b));
    const [fases, stock0, regs0, com] = await Promise.all([
      por("val_fases", "fase,fo,canal_sistema,canal_fisico,cono,estado,inicio,fin,validador,cliente,transportista,placa,asistente_despacho,rampa,destino,llegada_ut", "fo", "fase"), por("val_esperado", "id,fase,material,descripcion,un,cantidad", "fo"),
      por("val_registros", "id,fase,paleta,hu,codigo,descripcion,cantidad,creado", "fo"), por("val_comentarios", "fase,codigo,comentario,usuario,actualizado", "fo", "fase")]);
    const fasesIds = fases.map(f => f.fase);
    let pick = await por("val_picking", "id,fase,status,hu,producto,descripcion,ctd_prev,ctd_real,confirmado_por,fecha_conf,hora_conf", "fo");
    let stock = stock0, regs = regs0;
    // También lo que esté cargado a nombre de las fases del viaje, aunque su FO venga vacío o distinto
    const porFases = async (t, cols, base) => { const vistos = new Set(base.map(x => x.id)), extra = [];
      for (let i = 0; i < fasesIds.length; i += 40) (await leerTodo((a, b) => sb().from(t).select(cols).in("fase", fasesIds.slice(i, i + 40)).order("id").range(a, b))).forEach(x => { if (!vistos.has(x.id)) { vistos.add(x.id); extra.push(x); } });
      return base.concat(extra); };
    if (fasesIds.length) {
      pick = await porFases("val_picking", "id,fase,status,hu,producto,descripcion,ctd_prev,ctd_real,confirmado_por,fecha_conf,hora_conf", pick);
      stock = await porFases("val_esperado", "id,fase,material,descripcion,un,cantidad", stock);
      regs = await porFases("val_registros", "id,fase,paleta,hu,codigo,descripcion,cantidad,creado", regs);
    }
    const pic = await leerTodo((a, b) => sb().from("val_picadores").select("usuario,nombre,supervisor,grupo").order("usuario").range(a, b)), U = {};
    pic.forEach(p => { U[String(p.usuario).toUpperCase()] = [{ nombre: p.nombre, sup: p.supervisor, grupo: p.grupo || "" }]; });
    const codigos = Array.from(new Set(stock.map(s => s.material).concat(regs.map(r => r.codigo), pick.map(p => p.producto)))), mara = {};
    for (let i = 0; i < codigos.length; i += 150) { const { data } = await sb().from("val_mara").select("codigo,uma").in("codigo", codigos.slice(i, i + 150)); (data || []).forEach(m => mara[m.codigo] = m); }
    const stockUn = {}; stock.forEach(s => { if (s.un) stockUn[s.material] = s.un; });
    return { fo, stock, pick, regs, fases, com, U, mara, stockUn };
  }
  async function staffCalcular() {
    const fo = q("#cr-fo").value, out = q("#cr-out"); if (!fo) return;
    ST.fo = fo; ST.soloFase = null; ST.soloFaseId = null; ST.refrescar = null; if (ST.fp) ST.fp.fase = ""; out.innerHTML = '<p class="rel">Calculando…</p>';
    try {
      const dat = await datosFO(fo);
      if (!dat.stock.length) { out.innerHTML = '<div class="avisos">⚠ Este viaje no tiene STOCK ENTREGA cargado, así que no se puede cruzar. ' + (ST.esAdmin ? "Súbelo en «Cargar datos»." : "Pídele a la administradora que lo suba.") + "</div>"; return; }
      const res = window.CRUCE.cruceFO(dat); ST.ultimo = res; const r = res.resumen;
      out.innerHTML = '<div class="kpis"><div class="kpi"><b>' + r.codigos + '</b><span>códigos del viaje</span></div><div class="kpi g"><b>' + r.cuadrados + '</b><span>cuadrados</span></div>' +
        '<div class="kpi r"><b>' + r.faltantes + '</b><span>faltantes</span></div><div class="kpi o"><b>' + r.sobrantes + '</b><span>sobrantes</span></div>' +
        '<div class="kpi"><b>' + r.noPertenece + '</b><span>no pertenecen</span></div><div class="kpi"><b>' + r.pendientes + '</b><span>sin registrar</span></div>' +
        '<div class="kpi r"><b>' + r.erroresPicking + '</b><span>errores de picking</span></div><div class="kpi o"><b>' + r.problemasHU + '</b><span>paletas con problema de HU</span></div></div>' +
        res.avisos.map(a => '<div class="avisos">⚠ ' + E(a) + "</div>").join("") +
        '<button class="btn-v" id="cr-xls">📥 Descargar Excel del viaje</button>' +
        '<div class="tabs-vs" style="margin-top:18px"><button data-vt="stock" class="' + (ST.vista !== "pick" ? "on" : "") + '">📦 Según STOCK ENTREGAS</button><button data-vt="pick" class="' + (ST.vista === "pick" ? "on" : "") + '">🧾 Según PICKING (detalle)</button></div><div id="cr-vista"></div>';
      q("#cr-xls").onclick = () => descargarExcel(res);
      ST.dat = dat;
      out.querySelectorAll("[data-vt]").forEach(b => b.onclick = () => { ST.vista = b.dataset.vt; out.querySelectorAll("[data-vt]").forEach(x => x.classList.toggle("on", x === b)); staffVista(res, dat); });
      staffVista(res, dat);
    } catch (e) { out.innerHTML = '<div class="avisos">No se pudo calcular: ' + E(e.message || e) + "</div>"; }
  }


  /* ---- Detalle de una fase para la administradora / asistente (como la pantalla del auxiliar) ---- */
  async function staffFaseDetalle(c, fase) {
    const f = (ST.fases || []).find(x => x.fase === fase) || { fase };
    c.innerHTML = '<div class="vx" style="max-width:900px"><div class="top"><span class="tag">' + E(f.canal_sistema || "") + " | " + E(f.canal_fisico || "") + '</span><span><button class="btn w sm" id="fd-refresh" style="margin-right:6px">🔄 Actualizar</button><button class="btn w sm" id="fd-volver">← Volver a fases</button></span></div>' +
      '<div class="fofase">FO: ' + E(f.fo || "-") + " · FASE: " + E(fase) + " · " + E(f.estado || "") + (f.validador ? " · Validador: " + E(f.validador) : "") + "</div>" +
      '<div class="tabs" style="max-width:860px"><button data-fd="reg">📋 Registros</button><button data-fd="pal">✏️ Paletas</button><button data-fd="stock">📦 Stock entregas</button><button data-fd="pick">🧾 Picking</button></div>' +
      (f.estado === "CERRADO" ? '<p class="rel"><button class="reab" data-reabrir="' + E(fase) + '">↩ Reabrir fase</button></p>' : "") + '<div id="cr-vista" style="margin-top:8px"></div></div>';
    q("#fd-volver").onclick = () => { ST.soloFase = null; ST.soloFaseId = null; ST.refrescar = null; staffFases(c); };
    const rb = c.querySelector("[data-reabrir]"); if (rb) rb.onclick = async () => { if (!confirm("¿Reabrir la fase " + fase + "?\n\nVolverá a EN PROCESO y el validador podrá seguir contando.")) return; const { error } = await sb().rpc("val_reabrir_fase", { p_fase: fase }); if (error) return alert(error.message); toast("Fase reabierta"); staffFases(c); };
    let cache = null; ST.refrescar = () => { cache = null; abrir("stock"); };
    const cargar = async () => { if (cache) return cache; if (!f.fo) throw new Error("Esta fase todavía no tiene viaje (FO) asignado, por eso no hay cruce. Carga el MONITOR o espera la sincronización del Drive."); const dat = await datosFO(f.fo); if (!dat.stock.length) throw new Error("Este viaje no tiene STOCK ENTREGA cargado."); cache = { dat, res: window.CRUCE.cruceFO(dat) }; return cache; };
    const abrir = async t => {
      c.querySelectorAll("[data-fd]").forEach(b => b.classList.toggle("on", b.dataset.fd === t));
      const cu = q("#cr-vista"); cu.innerHTML = '<p class="rel">Cargando…</p>';
      try {
        if (t === "reg") {
          const regs = await leerTodo((a, b) => sb().from("val_registros").select("paleta,hu,codigo,descripcion,cantidad,creado").eq("fase", fase).order("paleta").order("id").range(a, b));
          const P = {}; regs.forEach(r => { (P[r.paleta] = P[r.paleta] || { paleta: r.paleta, hu: r.hu, items: [], t: r.creado }).items.push(r); });
          const pal = Object.values(P).sort((a, b) => a.paleta - b.paleta), tot = regs.reduce((t0, r) => t0 + r.cantidad, 0);
          let est = []; try { const r2 = await sb().rpc("val_vista_stock", { p_fase: fase, p_vista: "FASE" }); est = r2.data || []; } catch (e) {}
          cu.innerHTML = '<div class="kpis"><div class="kpi"><b>' + pal.length + '</b><span>paletas registradas</span></div><div class="kpi"><b>' + tot + '</b><span>bultos contados</span></div><div class="kpi"><b>' + new Set(regs.map(r => r.codigo)).size + '</b><span>códigos distintos</span></div></div>' +
            '<h4 style="margin:18px 0 6px">Cantidad total que debe tener la fase, por código</h4>' +
            '<div class="filtros-vs"><input type="text" id="fd-q" placeholder="🔎 Buscar por código o descripción" style="min-width:260px"><button class="btn-v g" id="fd-act" style="margin:0">🔄 Actualizar</button><label style="display:inline-flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" id="fd-dif"> Solo diferencias</label><span class="rel" id="fd-n"></span></div><div id="fd-est"></div>';
          const pintarEst = () => {
            const t = (q("#fd-q").value || "").toUpperCase().trim(), dif = q("#fd-dif").checked;
            const fl = est.filter(x => (!t || (String(x.codigo) + " " + (x.descripcion || "")).toUpperCase().includes(t)) && (!dif || x.status !== "CUADRADO"));
            q("#fd-n").textContent = fl.length + " de " + est.length + " códigos";
            q("#fd-est").innerHTML = '<div style="overflow-x:auto"><table class="tbl-vs"><tr><th>Código</th><th>Descripción</th><th>UN</th><th>Debe ser (total fase)</th><th>Contado</th><th>Dif.</th><th>Status</th><th>Comentario</th></tr>' +
              (fl.map(x => "<tr><td><b>" + E(x.codigo) + "</b></td><td>" + E(x.descripcion || "") + "</td><td>" + E(x.un || "") + "</td><td style='font-size:15px'><b>" + x.solicitado + "</b></td><td><b>" + x.contado + "</b></td><td style='font-weight:800;color:" + (x.diferencia < 0 ? "#e30a17" : x.diferencia > 0 ? "#d98a00" : "#00a862") + "'>" + (x.diferencia > 0 ? "+" : "") + x.diferencia + "</td><td style='font-weight:800;color:" + (ESTADO_COLOR[x.status] || "#333") + "'>" + E(x.status) + "</td><td class='d'>" + E(x.comentario || "") + "</td></tr>").join("") || '<tr><td colspan="8" style="color:#888">Sin códigos para mostrar.</td></tr>') + "</table></div>";
          };
          q("#fd-q").oninput = pintarEst; q("#fd-dif").onchange = pintarEst; q("#fd-act").onclick = () => { toast("Actualizando…"); abrir("reg"); };
          pintarEst();
        } else if (t === "pal") {
          const regs = await leerTodo((a, b) => sb().from("val_registros").select("paleta,hu,codigo,descripcion,cantidad,creado").eq("fase", fase).order("paleta").order("id").range(a, b));
          const P = {}; regs.forEach(r => { (P[r.paleta] = P[r.paleta] || { paleta: r.paleta, hu: r.hu, items: [] }).items.push(r); });
          const pal = Object.values(P).sort((a, b) => a.paleta - b.paleta), tot = regs.reduce((t0, r) => t0 + r.cantidad, 0);
          cu.innerHTML = '<div class="kpis"><div class="kpi"><b>' + pal.length + '</b><span>paletas registradas</span></div><div class="kpi"><b>' + tot + '</b><span>bultos contados</span></div><div class="kpi"><b>' + new Set(regs.map(r => r.codigo)).size + '</b><span>códigos distintos</span></div></div>' +
            (pal.length ? '<p class="rel">Puedes <b>corregir cualquier paleta</b> (HU, cantidades, agregar o quitar códigos) aunque la validación ya esté cerrada. Cada cambio queda registrado.</p><div id="fd-pal" class="vx cajas"></div>' : '<div class="avisos">El validador todavía no ha registrado paletas en esta fase.</div>');
          if (pal.length) editorPaletas(q("#fd-pal"), { fase, paletas: pal.map(p => ({ paleta: p.paleta, hu: p.hu, items: p.items.map(x => ({ codigo: x.codigo, desc: x.descripcion || "", cant: x.cantidad })) })), st: {}, editable: true, motivo: "Corrección de la asistente/administradora", recargar: () => abrir("pal") });
        } else if (t === "stock") { const { dat, res } = await cargar(); ST.vista = "stock"; ST.soloFaseId = fase; ST.soloFase = new Set(dat.stock.filter(x => !x.fase || window.CRUCE.clean(x.fase) === window.CRUCE.clean(fase)).map(x => window.CRUCE.clean(x.material))); staffVistaStock(res, dat); }
        else { const { dat, res } = await cargar(); ST.vista = "pick"; ST.fp = ST.fp || {}; ST.fp.fase = window.CRUCE.clean(fase); staffVistaPicking(res, dat); }
      } catch (e) { cu.innerHTML = '<div class="avisos">' + E(e.message || e) + "</div>"; }
    };
    let actual = "reg";
    c.querySelectorAll("[data-fd]").forEach(b => b.onclick = () => { actual = b.dataset.fd; abrir(actual); });
    q("#fd-refresh").onclick = () => { cache = null; toast("Actualizando…"); abrir(actual); };
    abrir("reg");
  }

  /* ---- Vistas del cruce en pantalla: formato STOCK ENTREGAS (con comentarios) y detalle de PICKING ---- */
  const fechaDT = (f, h) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(f || "").trim()); if (!m) return null; const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(h || "").trim()); return new Date(+m[3], +m[2] - 1, +m[1], t ? +t[1] : 0, t ? +t[2] : 0, t ? +(t[3] || 0) : 0); };

  /* Encabezado de las descargas: datos de despacho, preparación (picking) y validación por fase */
  const fmtDT = d => d ? String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0") : "";
  function encabezadoFases(dat, soloFase) {
    const fs = dat.fases.filter(f => !soloFase || window.CRUCE.clean(f.fase) === window.CRUCE.clean(soloFase));
    const cab = ["FASE", "CLIENTE", "DESTINO", "TRANSPORTE", "PLACA", "LLEGADA TRANSPORTE", "CANAL SISTEMA", "CANAL FÍSICO", "CONO", "ASISTENTE DESPACHO", "VALIDADOR", "INICIO PREPARACIÓN", "FIN PREPARACIÓN", "INICIO VALIDACIÓN", "FIN VALIDACIÓN"];
    const filas = fs.map(f => {
      const ts = dat.pick.filter(r => window.CRUCE.clean(r.fase) === window.CRUCE.clean(f.fase) && String(r.status || "").toUpperCase() === "C").map(r => fechaDT(r.fecha_conf, r.hora_conf)).filter(Boolean).sort((a, b) => a - b);
      return [String(f.fase), f.cliente || "", f.destino || "", f.transportista || "", f.placa || "", f.llegada_ut || "", f.canal_sistema || "", f.canal_fisico || "", f.cono || "", f.asistente_despacho || "", f.validador || "", fmtDT(ts[0]), fmtDT(ts[ts.length - 1]), f.inicio ? fmtDT(new Date(f.inicio)) : "", f.fin ? fmtDT(new Date(f.fin)) : ""];
    });
    return { cab, filas };
  }
  const CONO_RGB = { AMARILLO: "FFD84D", VERDE: "3DBE6B", AZUL: "2F6FDE", ROJO: "E30A17", NARANJA: "FF8A00", MORADO: "8E5BE8", CELESTE: "6EC6F0", FUCSIA: "E83E8C", ROSADO: "F7A8C8", ROSA: "F7A8C8", NEGRO: "222222", BLANCO: "FFFFFF", GRIS: "9AA3B2", MARRON: "8B5E3C", PLOMO: "9AA3B2", CAFE: "8B5E3C" };
  async function xlsConEncabezado(nombre, hoja, titulo, dat, soloFase, cabTabla, filas, anchos) {
    const e = encabezadoFases(dat, soloFase);
    if (!window.ExcelJS) { const ar = [[titulo], [], e.cab].concat(e.filas, [[]], [cabTabla], filas), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ar), hoja); XLSX.writeFile(wb, nombre); return toast("Excel descargado ✔"); }
    const NAVY = "FF0F2150", BLUE = "FF004AAD", RED = "FFE30A17", PALE = "FFEAF1FB", ZEBRA = "FFF6F8FC", ncol = Math.max(e.cab.length, cabTabla.length);
    const fino = { style: "thin", color: { argb: "FFC3CBD9" } }, borde = { top: fino, left: fino, bottom: fino, right: fino };
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(hoja.slice(0, 31), { views: [{ showGridLines: false }] });
    const fill = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
    // 1) Título CEVA
    ws.mergeCells(1, 1, 1, ncol); const t = ws.getCell(1, 1); t.value = "CEVA LOGISTICS · LATAM 400 · " + titulo; t.font = { name: "Arial", bold: true, size: 16, color: { argb: "FFFFFFFF" } }; t.fill = fill(NAVY); t.alignment = { vertical: "middle", horizontal: "left", indent: 1 }; ws.getRow(1).height = 32;
    ws.mergeCells(2, 1, 2, ncol); ws.getCell(2, 1).fill = fill(RED); ws.getRow(2).height = 5;
    ws.mergeCells(3, 1, 3, ncol); const g = ws.getCell(3, 1); g.value = "Generado el " + fmtDT(new Date()) + " · Control de Operaciones · Validación Outbound"; g.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF6B7585" } }; ws.getRow(3).height = 16;
    // 2) Datos de la fase (despacho, preparación y validación)
    let r = 4; const hr = ws.getRow(r); e.cab.forEach((c, i) => { const x = hr.getCell(i + 1); x.value = c; x.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } }; x.fill = fill(BLUE); x.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; x.border = borde; }); hr.height = 30;
    e.filas.forEach(fr => { r++; const row = ws.getRow(r); fr.forEach((v, i) => { const x = row.getCell(i + 1); x.value = v; x.font = { name: "Arial", size: 10, bold: i === 0 || i === 10 }; x.fill = fill(PALE); x.border = borde; x.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      if (e.cab[i] === "CONO" && v) { const rgb = CONO_RGB[String(v).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()]; if (rgb) { x.fill = fill("FF" + rgb); const claro = ["FFD84D", "FFFFFF", "F7A8C8", "6EC6F0", "9AA3B2"].includes(rgb); x.font = { name: "Arial", size: 10, bold: true, color: { argb: claro ? "FF222222" : "FFFFFFFF" } }; } } }); row.height = 22; });
    r += 2;
    // 3) Tabla de datos
    const th = ws.getRow(r); cabTabla.forEach((c, i) => { const x = th.getCell(i + 1); x.value = c; x.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } }; x.fill = fill(NAVY); x.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; x.border = { top: fino, left: fino, right: fino, bottom: { style: "medium", color: { argb: RED } } }; }); th.height = 28;
    const hdrRow = r;
    filas.forEach((fr, k) => { r++; const row = ws.getRow(r); fr.forEach((v, i) => { const x = row.getCell(i + 1); x.value = v; x.font = { name: "Arial", size: 10 }; x.border = borde; if (k % 2) x.fill = fill(ZEBRA); x.alignment = { vertical: "middle", wrapText: typeof v === "string" && v.length > 40 };
      const cb = String(cabTabla[i] || "").toUpperCase();
      if (cb === "DIFERENCIA" && typeof v === "number") x.font = { name: "Arial", size: 10, bold: true, color: { argb: v < 0 ? "FFE30A17" : v > 0 ? "FFD98A00" : "FF00A862" } };
      if (cb === "STATUS" || cb === "ESTADO") { const col = { CUADRADO: "FF00A862", FALTANTE: "FFE30A17", SOBRANTE: "FFD98A00", PENDIENTE: "FF666666", "NO PERTENECE": "FF7B3FE4", AJUSTE: "FF0A8F8F", CONFIRMADA: "FF00A862", ABIERTA: "FFD98A00" }[String(v).toUpperCase()]; if (col) x.font = { name: "Arial", size: 10, bold: true, color: { argb: col } }; }
      if (cb.indexOf("HU EN CONTEO") === 0) x.font = { name: "Arial", size: 10, bold: true, color: { argb: v === "Sí" ? "FF00A862" : v === "No" ? "FFE30A17" : "FF999999" } }; }); });
    ws.autoFilter = { from: { row: hdrRow, column: 1 }, to: { row: hdrRow, column: cabTabla.length } };
    ws.views = [{ state: "frozen", ySplit: hdrRow, showGridLines: false }];
    for (let i = 0; i < ncol; i++) ws.getColumn(i + 1).width = Math.min(48, Math.max(anchos[i] || 10, i < e.cab.length ? 16 : 10));
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    const buf = await wb.xlsx.writeBuffer(), blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast("Excel descargado ✔");
  }
  function staffVista(res, dat) { if (ST.vista === "pick") staffVistaPicking(res, dat); else staffVistaStock(res, dat); }
  function xlsSimple(nombre, hoja, aoa, anchos) { const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = anchos.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, hoja); XLSX.writeFile(wb, nombre); toast("Excel descargado ✔"); }

  function staffVistaStock(res, dat) {
    const cu = q("#cr-vista"), mia = (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.nombre) || ST.yo;
    const faseDe = {}; dat.stock.forEach(x => { const c = window.CRUCE.clean(x.material); if (x.fase && !faseDe[c]) faseDe[c] = window.CRUCE.clean(x.fase); });
    const fb = (dat.fases[0] || {}).fase || "";
    const COM = {}; dat.com.forEach(c => { (COM[window.CRUCE.clean(c.codigo)] = COM[window.CRUCE.clean(c.codigo)] || []).push(c); });
    let solo = ST.soloDif === true;
    const pintar = () => {
      const filas = res.filas.filter(f => (!solo || f.status !== "CUADRADO") && (!ST.soloFase || !ST.soloFase.size || ST.soloFase.has(window.CRUCE.clean(f.codigo))));
      cu.innerHTML = (ST.soloFase && ST.soloFase.size ? '<div class="rel">Mostrando los códigos de esta fase; el conteo es el acumulado del viaje (' + E(res.fo) + ').</div>' : "") + '<p class="rel">Es el formato de <b>STOCK ENTREGAS</b>: lo solicitado vs. lo que validaron los auxiliares. Escribe un comentario en la fila (por ejemplo un ajuste por capacidad o peso del transporte): <b>se guarda en línea</b> y el auxiliar lo verá en su reporte cuando cierre la validación.</p>' +
        '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="vs-solo"' + (solo ? " checked" : "") + '> Mostrar solo diferencias</label> <button class="btn-v g" id="vs-xls">📥 Descargar esta vista</button>' +
        '<div style="overflow-x:auto"><table class="tbl-vs"><tr><th>Código</th><th>Descripción</th><th>UN</th><th>Solicitado</th><th>Conteo</th><th>Dif.</th><th>Status</th><th>Comentario de la asistente</th></tr>' +
        filas.map((f, i) => { const c = window.CRUCE.clean(f.codigo), fa = faseDe[c] || fb, ex = (COM[c] || []).find(x => window.CRUCE.clean(x.fase) === fa) || (COM[c] || [])[0];
          const falta = f.status === "FALTANTE" || f.status === "PENDIENTE" || f.status === "AJUSTE";
          return "<tr><td><b>" + E(f.codigo) + "</b></td><td>" + E(f.desc || "") + "</td><td>" + E(f.un || "") + "</td><td>" + f.esp + "</td><td><b>" + f.reg + "</b></td><td style='font-weight:800;color:" + (f.dif < 0 ? "#e30a17" : f.dif > 0 ? "#d98a00" : "#00a862") + "'>" + (f.dif > 0 ? "+" : "") + f.dif + "</td><td style='font-weight:800;color:" + (ESTADO_COLOR[f.status] || "#333") + "'>" + E(f.status) + "</td>" +
            '<td class="com"><div class="comrow' + (falta ? "" : " sin-n") + '">' + (falta ? '<input type="number" min="1" placeholder="No cargado" data-n="' + i + '" title="Cajas que NO se cargaron en el camión">' : "") +
            '<input type="text" data-t="' + i + '" value="' + E(ex ? ex.comentario : "") + '" placeholder="Comentario (ej. ajuste por capacidad del transporte)"><button class="btn-v" data-g="' + i + '" title="Guardar comentario">💾</button></div>' +
            (ex && ex.usuario ? '<div class="quien">Por ' + E(ex.usuario) + (ex.actualizado ? " · " + fmtTs(ex.actualizado) : "") + "</div>" : "") + "</td></tr>"; }).join("") + "</table></div>";
      q("#vs-solo").onchange = e => { ST.soloDif = e.target.checked; solo = ST.soloDif; pintar(); };
      q("#vs-xls").onclick = () => xlsConEncabezado("STOCK_ENTREGAS_FO_" + res.fo + ".xlsx", "STOCK ENTREGAS", "STOCK ENTREGAS · FO " + res.fo, dat, ST.soloFaseId || null, ["VIAJE", "CODIGO", "DESCRIPCION", "UN", "SOLICITADO", "CONTEO", "DIFERENCIA", "STATUS", "COMENTARIO"], filas.map(f => { const c = window.CRUCE.clean(f.codigo), l = (COM[c] || []).map(x => x.comentario).join(" | "); return [String(res.fo), String(f.codigo), f.desc, f.un, f.esp, f.reg, f.dif, f.status, l]; }), [14, 14, 44, 6, 11, 9, 11, 14, 60]);
      cu.querySelectorAll("[data-g]").forEach(b => b.onclick = async () => {
        const i = +b.dataset.g, f = filas[i], c = window.CRUCE.clean(f.codigo), fa = faseDe[c] || fb;
        if (!fa) return alert("No encuentro la fase de este código.");
        const n = Number((cu.querySelector('[data-n="' + i + '"]') || {}).value || 0), t = cu.querySelector('[data-t="' + i + '"]').value.trim();
        const texto = (n > 0 && !/No se cargó \d+ cajas/.test(t) ? "No se cargó " + n + " cajas. " : "") + t;
        b.disabled = true;
        let er;
        if (!texto) er = (await sb().from("val_comentarios").delete().eq("fase", fa).eq("codigo", c)).error;
        else er = (await sb().from("val_comentarios").upsert({ fase: fa, codigo: c, fo: res.fo, descripcion: f.desc || null, comentario: texto, usuario: mia || null, actualizado: new Date().toISOString() }, { onConflict: "fase,codigo" })).error;
        if (er) { b.disabled = false; return alert(er.message); }
        toast("Comentario guardado ✔"); if (ST.refrescar) ST.refrescar(); else staffCalcular();
      });
    };
    pintar();
  }

  function staffVistaPicking(res, dat) {
    const cu = q("#cr-vista"), F = ST.fp = ST.fp || {};
    const fasesViaje = dat.fases.map(f => f.fase), FI = {}; dat.fases.forEach(f => FI[window.CRUCE.clean(f.fase)] = f);
    const huReg = {}; dat.regs.forEach(r => { huReg[window.CRUCE.clean(r.fase) + "|" + window.CRUCE.huKey(r.hu)] = 1; });
    const todo = dat.pick.filter(r => String(r.status || "").toUpperCase() !== "A").map(r => {
      const u = String(r.confirmado_por || "").trim(), nom = u && dat.U[u.toUpperCase()] ? dat.U[u.toUpperCase()][0].nombre : "", fa = window.CRUCE.clean(r.fase), conf = String(r.status || "").toUpperCase() === "C";
      return { fase: fa, codigo: window.CRUCE.clean(r.producto), desc: r.descripcion || "", hu: r.hu || "", prev: r.ctd_prev, real: r.ctd_real, conf, usuario: u, nombre: nom, fecha: r.fecha_conf || "", hora: r.hora_conf || "", dt: conf ? fechaDT(r.fecha_conf, r.hora_conf) : null, enConteo: r.hu ? (huReg[fa + "|" + window.CRUCE.huKey(r.hu)] ? "Sí" : "No") : "—" };
    });
    if (!todo.length) { cu.innerHTML = '<div class="avisos">Este viaje no tiene PICKING cargado. Súbelo en «Cargar datos».</div>'; return; }
    const pintar = () => {
      const d1 = F.d1 ? new Date(F.d1 + "T00:00:00") : null, d2 = F.d2 ? new Date(F.d2 + "T23:59:59") : null, t = (F.q || "").toUpperCase().trim();
      const filas = todo.filter(r => (!F.fase || r.fase === F.fase) &&
        (!d1 || (r.dt && r.dt >= d1)) && (!d2 || (r.dt && r.dt <= d2)) &&
        (!F.despues || (r.dt && (() => { const f = FI[r.fase], ref = f ? (f.estado === "CERRADO" && f.fin ? new Date(f.fin) : f.inicio ? new Date(f.inicio) : null) : null; return ref && r.dt > ref; })())) &&
        (!t || (r.codigo + " " + r.hu + " " + r.usuario + " " + r.nombre).toUpperCase().includes(t)));
      cu.innerHTML = '<p class="rel">Detalle de las tareas de <b>PICKING</b>: código, HU (UMp destino), quién confirmó y a qué hora. Filtra por fecha o marca «solo después de validar» para ver lo que se confirmó cuando el validador ya había revisado esa mercadería.</p>' +
        '<div class="filtros-vs"><select id="vp-fase"><option value="">Todas las fases</option>' + fasesViaje.map(f => '<option' + (F.fase === window.CRUCE.clean(f) ? " selected" : "") + ">" + E(f) + "</option>").join("") + "</select> " +
        'Desde <input type="date" id="vp-d1" value="' + E(F.d1 || "") + '"> Hasta <input type="date" id="vp-d2" value="' + E(F.d2 || "") + '"> <input type="text" id="vp-q" placeholder="Buscar código, HU o picador" value="' + E(F.q || "") + '" style="min-width:200px"> ' +
        '<label style="display:inline-flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" id="vp-des"' + (F.despues ? " checked" : "") + '> Solo confirmadas después de validar</label> <button class="btn-v g" id="vp-xls">📥 Descargar esta vista</button></div>' +
        '<div class="rel">' + filas.length + " de " + todo.length + " tareas</div>" +
        '<div style="overflow-x:auto"><table class="tbl-vs"><tr><th>Fase</th><th>Código</th><th>Descripción</th><th>HU (UMp destino)</th><th>Cant.</th><th>Estado</th><th>Confirmado por</th><th>Fecha</th><th>Hora</th><th>HU en conteo</th></tr>' +
        filas.slice(0, 1500).map(r => "<tr><td>" + E(r.fase) + "</td><td><b>" + E(r.codigo) + "</b></td><td>" + E(r.desc) + "</td><td>" + E(r.hu) + "</td><td>" + (r.conf ? r.real : r.prev) + "</td><td style='font-weight:700;color:" + (r.conf ? "#00a862" : "#d98a00") + "'>" + (r.conf ? "Confirmada" : "Abierta") + "</td><td>" + E(r.usuario) + (r.nombre ? '<div class="d" style="font-size:11px;color:#666">' + E(r.nombre) + "</div>" : "") + "</td><td>" + E(r.fecha) + "</td><td>" + E(r.hora) + "</td><td style='font-weight:700;color:" + (r.enConteo === "Sí" ? "#00a862" : r.enConteo === "No" ? "#e30a17" : "#999") + "'>" + r.enConteo + "</td></tr>").join("") + "</table></div>" + (filas.length > 1500 ? '<div class="rel">Se muestran las primeras 1500; usa los filtros o descarga el Excel para ver todas.</div>' : "");
      const en = (id, k, ev) => { const el = q(id); el[ev || "onchange"] = () => { F[k] = el.type === "checkbox" ? el.checked : el.value; pintar(); }; };
      q("#vp-fase").onchange = e => { F.fase = e.target.value ? window.CRUCE.clean(e.target.value) : ""; pintar(); };
      en("#vp-d1", "d1"); en("#vp-d2", "d2"); en("#vp-des", "despues");
      const qi = q("#vp-q"); qi.onchange = () => { F.q = qi.value; pintar(); };
      q("#vp-xls").onclick = () => xlsConEncabezado("PICKING_FO_" + res.fo + ".xlsx", "PICKING", "PICKING · FO " + res.fo, dat, F.fase || null, ["FASE", "CODIGO", "DESCRIPCION", "HU (UMP DESTINO)", "CANTIDAD", "ESTADO", "CONFIRMADO POR", "NOMBRE", "FECHA CONFIRMACION", "HORA CONFIRMACION", "HU EN CONTEO DEL VALIDADOR"], filas.map(r => [r.fase, r.codigo, r.desc, r.hu, r.conf ? r.real : r.prev, r.conf ? "Confirmada" : "Abierta", r.usuario, r.nombre, r.fecha, r.hora, r.enConteo]), [12, 12, 44, 24, 10, 12, 16, 30, 14, 14, 14]);
    };
    pintar();
  }
  function libro(res) {
    const wb = XLSX.utils.book_new(), add = (nombre, aoa, anchos) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = anchos.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, nombre); };
    add("CRUCE", [["VIAJE", "CODIGO / SKU", "DESCRIPCION", "UN", "CANTIDAD SOLICITADA", "CONTEO", "DIFERENCIA", "STATUS", "OBS"]].concat(
      res.filas.map(f => [String(f.viaje), String(f.codigo), f.desc, f.un, f.esp, f.reg, f.dif, f.status, f.obs])), [14, 14, 44, 6, 12, 10, 11, 14, 60]);
    const sinPk = res.cruceHU.sinPicking;
    add("ERRORES DE PICKING", [["FECHA", "VIAJE", "FASE", "CANAL", "HU", "CODIGO", "DESCRIPCION", "STATUS", "TIPO", "DIFERENCIA", "USUARIO PICKING", "RESPONSABLE", "GRUPO"]].concat(
      sinPk ? [["Este viaje no tiene PICKING cargado."]] : res.eri.map(e => [e.fecha, String(e.fo), String(e.fase), e.sistema, e.hu, String(e.codigo), e.desc, e.status, e.tipo, e.dif, e.usuarioPicking, e.resp, e.grupo])),
      [12, 12, 12, 20, 22, 12, 40, 12, 18, 10, 16, 36, 14]);
    add("PROBLEMAS DE HU", [["FECHA", "VIAJE", "FASE", "HU REAL", "HU ESCANEADO", "PALETA DE LA FASE", "PALETA DEL HU", "OBSERVACION", "RESPONSABLE", "GRUPO"]].concat(
      sinPk ? [["Este viaje no tiene PICKING cargado."]] : res.hu.map(h => [h.fecha, String(h.fo), String(h.fase), h.hu, h.huEscaneado, h.paletaRegistrada, h.pal, h.obs, h.resp, h.grupo])),
      [12, 12, 12, 24, 20, 12, 12, 44, 40, 14]);
    if (res.avisos.length) add("AVISOS", [["AVISOS"]].concat(res.avisos.map(a => [a])), [120]);
    return wb;
  }
  function descargarExcel(res) { XLSX.writeFile(libro(res), "CRUCE_FO_" + res.fo + ".xlsx"); toast("Excel descargado ✔"); }

  return { aux: { iniciar: auxIniciar }, staff: { render: staffRender }, _libro: libro };
})();
