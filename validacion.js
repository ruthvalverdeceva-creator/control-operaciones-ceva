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
    if (f.estado === "CERRADO") it.push('<button data-reabrir="' + E(f.fase) + '">↩ Reabrir fase</button>');
    if (admin && f.paletas > 0) it.push('<button data-borrarreg="' + E(f.fase) + '">🧹 Borrar registros contados</button>');
    if (admin && f.pk !== "SIN PICKING") it.push('<button data-borrarpk="' + E(f.fase) + '">🧹 Borrar picking</button>');
    if (admin) it.push('<button class="pelig" data-eliminar="' + E(f.fase) + '">🗑 Eliminar fase</button>');
    return it.length ? '<details class="acc" onclick="event.stopPropagation()"><summary>⚙ Acciones</summary><div class="acc-menu">' + it.join("") + "</div></details>" : "";
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
      if (c.dataset.est === "CERRADO") return toast("Esta fase ya está cerrada.");
      const nuevo = c.dataset.est === "PENDIENTE";
      if (!confirm(nuevo ? "¿Quieres iniciar la validación de la fase " + c.dataset.fase + "?" : "¿Continuar la validación de la fase " + c.dataset.fase + "?")) return;
      auxAbrirFase(c.dataset.fase);
    });
  }

  async function auxAbrirFase(fase) {
    const f = AX.fases.find(x => x.fase === fase);
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
      '<div class="barra"><span class="pn">Paleta ' + pal + '</span><button class="btn w" id="x-borrar">Borrar</button><button class="btn o" id="x-menu">Menú</button></div>' +
      '<label>1° HU DE LA PALETA (escanee la etiqueta)</label>' +
      '<div class="hurow"><input id="x-hu" placeholder="ESCANEE EL HU" autocomplete="off" autocapitalize="characters" value="' + E(V.sn ? "SN" : V.hu) + '"' + (V.sn ? " readonly" : "") + '><button class="btn o" id="x-sn">SN</button></div>' +
      '<div class="hint">Sin etiqueta o ilegible: pulse SN. El sistema le asigna el HU real por los códigos y cantidades.</div>' +
      '<div class="row2"><div><label>SKU / EAN</label><input id="x-sku" placeholder="Escanee SKU o EAN" autocomplete="off" autocapitalize="characters" value="' + E(V.mara ? V.mara.codigo : "") + '"></div>' +
      '<div><label>UMA</label><input id="x-uma" readonly value="' + E(V.mara ? V.mara.uma || "" : "") + '"></div></div>' +
      '<label>DESCRIPCIÓN:</label><input id="x-desc" readonly value="' + E(V.mara ? V.mara.descripcion : "") + '">' +
      '<div class="msg" id="x-msg"></div>' +
      '<label>CANTIDAD (bultos)</label><div class="row3"><input id="x-cant" class="big" type="number" inputmode="numeric" min="1" placeholder="Cantidad"><button class="btn" id="x-add">Agregar código</button></div>' +
      '<table><tr><th>Código</th><th>Desc.</th><th>Cant</th><th>Acción</th></tr>' +
      (V.items.length ? V.items.map((it, k) => "<tr><td>" + E(it.codigo) + '</td><td class="d">' + E(it.desc) + "</td><td><b>" + it.cant + '</b></td><td><button class="ic" data-del="' + k + '">🗑️</button></td></tr>').join("") :
        '<tr><td colspan="4" style="color:#888">Aún no agregas productos a esta paleta.</td></tr>') + "</table>" +
      '<button class="btn" id="x-fpal">Finalizar paleta</button>' +
      '<div class="back"><a id="x-volver">🏠 Volver al menú</a></div>' +
      '<div class="modal-vx" id="x-modal"><div id="x-modal-in"></div></div>');
    const hu = q("#x-hu"), sku = q("#x-sku"), cant = q("#x-cant");
    hu.oninput = () => { V.hu = hu.value.toUpperCase().replace(/\s/g, ""); };
    hu.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); sku.focus(); } };
    q("#x-sn").onclick = () => { V.sn = !V.sn; if (V.sn) { V.hu = ""; } auxPintarValidar(); if (V.sn) sku.focus(); };
    sku.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); auxBuscar(); } };
    sku.onchange = () => auxBuscar();
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
    const { data, error } = await sb().from("val_mara").select("codigo,descripcion,uma,ean").or("codigo.eq." + c + ",ean.eq." + c).limit(1);
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
      '<div class="tabs"><button data-rt="FASE" class="' + (tab === "FASE" ? "on" : "") + '">Esta fase</button><button data-rt="FO" class="' + (tab === "FO" ? "on" : "") + '">Total FO</button><button data-rt="PAL" class="' + (tab === "PAL" ? "on" : "") + '">Paletas</button></div>' +
      pk + '<div id="rg-cuerpo"><p style="text-align:center;color:#777">Cargando…</p></div>' +
      '<div class="fixbar"><a id="rg-volver">🏠 Volver al menú</a></div><div style="height:50px"></div>');
    r.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => auxRegistros(b.dataset.rt));
    q("#rg-volver").onclick = () => { V.tabReg = "FASE"; auxPintarValidar(); };
    if (tab === "PAL") return auxPaletasEditor();
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
  function auxPaletasEditor() {
    const V = AX.V, cu = q("#rg-cuerpo");
    if (!V.ed) V.ed = V.paletas.map(p => ({ paleta: p.paleta, hu: p.hu, items: p.items.map(x => ({ codigo: x.codigo, desc: x.desc, cant: x.cant })), nc: "", nq: "", msg: "" }));
    const tot = p => p.items.reduce((t, x) => t + (Number(x.cant) || 0), 0);
    const pintar = () => {
      cu.innerHTML = (V.ed.length ? V.ed.map((p, pi) => '<div class="palc"><div class="ph"><b>PALETA ' + p.paleta + "</b><b>" + tot(p) + ' bultos</b></div>' +
        '<div class="hurow2"><label>HU</label><input data-hu="' + pi + '" value="' + E(p.hu) + '" autocapitalize="characters"></div>' +
        p.items.map((x, k) => '<div class="it"><div><b>' + E(x.codigo) + '</b><small>' + E(x.desc) + '</small></div><input type="number" inputmode="numeric" min="1" data-q="' + pi + "|" + k + '" value="' + x.cant + '"><button class="ic" data-x="' + pi + "|" + k + '">🗑️</button></div>').join("") +
        '<div class="addrow"><input data-nc="' + pi + '" placeholder="+ Código o EAN" value="' + E(p.nc) + '" autocapitalize="characters"><input data-nq="' + pi + '" type="number" inputmode="numeric" placeholder="Cant." value="' + E(p.nq) + '"><button class="btn w" data-add="' + pi + '">Agregar</button></div>' +
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
        const { data, error } = await sb().from("val_mara").select("codigo,descripcion").or("codigo.eq." + c + ",ean.eq." + c).limit(1);
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
          const { error } = await sb().rpc("val_borrar_paleta", { p_fase: V.fase, p_paleta: p.paleta });
          if (error) { p.msg = error.message; return pintar(); }
          toast("Paleta " + p.paleta + " borrada"); V.ed = null; await auxCargarPaletas(); return auxRegistros("PAL");
        }
        if (malos) { p.msg = "Todas las cantidades deben ser enteros mayores a 0."; return pintar(); }
        e.disabled = true;
        const { error } = await sb().rpc("val_guardar_paleta", { p_fase: V.fase, p_paleta: p.paleta, p_hu: p.hu, p_items: p.items.map(x => ({ codigo: x.codigo, desc: x.desc, cant: Number(x.cant) })), p_motivo: "Corrección del validador" });
        if (error) { p.msg = error.message; return pintar(); }
        toast("Paleta " + p.paleta + " guardada ✔"); V.ed = null; await auxCargarPaletas(); auxRegistros("PAL");
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
    for (const id of Object.keys(tablas)) {
      try {
        const { count, error } = await sb().from(tablas[id]).select("*", { count: "exact", head: true }); if (error) throw error;
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
    const [fases, stock, regs, com] = await Promise.all([
      por("val_fases", "fase,fo,canal_sistema,canal_fisico,cono,estado", "fo", "fase"), por("val_esperado", "fase,material,descripcion,un,cantidad", "fo"),
      por("val_registros", "fase,paleta,hu,codigo,descripcion,cantidad,creado", "fo"), por("val_comentarios", "fase,codigo,comentario", "fo", "fase")]);
    const fasesIds = fases.map(f => f.fase);
    let pick = await por("val_picking", "fase,status,hu,producto,descripcion,ctd_prev,ctd_real,confirmado_por,fecha_conf,hora_conf", "fo");
    if (fasesIds.length) { // picking de las fases del viaje aunque no tenga FO
      const extra = []; for (let i = 0; i < fasesIds.length; i += 40) extra.push(...await leerTodo((a, b) => sb().from("val_picking").select("id,fase,status,hu,producto,descripcion,ctd_prev,ctd_real,confirmado_por,fecha_conf,hora_conf").in("fase", fasesIds.slice(i, i + 40)).is("fo", null).order("id").range(a, b)));
      pick = pick.concat(extra);
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
    ST.fo = fo; out.innerHTML = '<p class="rel">Calculando…</p>';
    try {
      const dat = await datosFO(fo);
      if (!dat.stock.length) { out.innerHTML = '<div class="avisos">⚠ Este viaje no tiene STOCK ENTREGA cargado, así que no se puede cruzar. ' + (ST.esAdmin ? "Súbelo en «Cargar datos»." : "Pídele a la administradora que lo suba.") + "</div>"; return; }
      const res = window.CRUCE.cruceFO(dat); ST.ultimo = res; const r = res.resumen;
      out.innerHTML = '<div class="kpis"><div class="kpi"><b>' + r.codigos + '</b><span>códigos del viaje</span></div><div class="kpi g"><b>' + r.cuadrados + '</b><span>cuadrados</span></div>' +
        '<div class="kpi r"><b>' + r.faltantes + '</b><span>faltantes</span></div><div class="kpi o"><b>' + r.sobrantes + '</b><span>sobrantes</span></div>' +
        '<div class="kpi"><b>' + r.noPertenece + '</b><span>no pertenecen</span></div><div class="kpi"><b>' + r.pendientes + '</b><span>sin registrar</span></div>' +
        '<div class="kpi r"><b>' + r.erroresPicking + '</b><span>errores de picking</span></div><div class="kpi o"><b>' + r.problemasHU + '</b><span>paletas con problema de HU</span></div></div>' +
        res.avisos.map(a => '<div class="avisos">⚠ ' + E(a) + "</div>").join("") +
        '<button class="btn-v" id="cr-xls">📥 Descargar Excel del viaje</button>';
      q("#cr-xls").onclick = () => descargarExcel(res);
    } catch (e) { out.innerHTML = '<div class="avisos">No se pudo calcular: ' + E(e.message || e) + "</div>"; }
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
