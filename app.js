/* ==========================================================================
   CONFIGURACIÓN DE SUPABASE Y CLIENTE
   ========================================================================== */
const SUPABASE_URL = 'https://bpwgyimcreewipewrynp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z7CXbNSDMPB705qUpUp_7A_w19foNfz';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Los usuarios ya NO viven en el código: ingresan con su cuenta de Supabase (correo + contraseña).
// El rol (admin / asistente) sale de la tabla val_perfiles.

// Estructura base por defecto de tus módulos
const BASE = [
  { id: "inventario", nombre: "Inventario", icono: "📦",
    desc: "Paletas, virtuales, inmovilizados y más.",
    dashboards: [
      { id: "paletas",       nombre: "Paletas",       url: "" },
      { id: "virtuales",     nombre: "Virtuales",     url: "" },
      { id: "inmovilizados", nombre: "Inmovilizados", url: "" }
    ] },
  { id: "operacion", nombre: "Operación", icono: "🚚",
    desc: "Indicadores de la operación diaria.",
    dashboards: [
      { id: "despachos",     nombre: "Despachos",     url: "" },
      { id: "recepcion",     nombre: "Recepción",     url: "" },
      { id: "productividad", nombre: "Productividad", url: "" }
    ] },
  { id: "rh", nombre: "RH", icono: "👥",
    desc: "Indicadores de recursos humanos.",
    dashboards: [ { id: "rh", nombre: "RH", url: "" } ] },
  { id: "seguridad", nombre: "Seguridad", icono: "🦺",
    desc: "Indicadores de seguridad y salud.",
    dashboards: [ { id: "seguridad", nombre: "Seguridad", url: "" } ] },
  { id: "facturacion", nombre: "Facturación", icono: "🧾",
    desc: "Reporte de facturación.",
    dashboards: [ { id: "facturacion", nombre: "Facturación", url: "" } ] }
];

const SECCIONES = [
  { id: "reportes", nombre: "Reportes", icono: "📊", desc: "Dashboards de Power BI organizados por módulo.", ruta: "#reportes" }
];

let CONFIG = JSON.parse(JSON.stringify(BASE));
let usuarioActual = null;
let edicion = null;
let AUX = null;          // lista de auxiliares (DNI) que se carga en el panel de administración
let auxEditando = "";

// Función para sincronizar y cargar los enlaces desde Supabase
async function cargarConfiguracionRemota() {
  try {
    const { data, error } = await supabaseClient.from('dashboards_config').select('*');
    if (!error && data && data.length > 0) {
      // Mapeamos los links guardados en la nube a nuestra estructura CONFIG
      CONFIG.forEach(mod => {
        mod.dashboards.forEach(dash => {
          const encontrado = data.find(item => item.id === dash.id);
          if (encontrado) {
            dash.url = encontrado.url;
          }
        });
      });
    }
  } catch (err) {
    console.error("Error al conectar con Supabase:", err);
  }
  render();
}

// Devuelve el perfil de quien tiene sesión en Supabase, o null (y cierra la sesión si no tiene acceso)
async function cargarPerfil() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabaseClient.from('val_perfiles')
      .select('nombre, cargo, rol, activo').eq('id', session.user.id).maybeSingle();
    if (error || !data || !data.activo) { await supabaseClient.auth.signOut(); return null; }
    return { id: session.user.id, correo: session.user.email, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
  } catch (err) { console.error("Error al cargar el perfil:", err); return null; }
}

const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const esAdmin = () => usuarioActual && usuarioActual.rol === "admin";
const buscarModulo = id => CONFIG.find(m => m.id === id);

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", 3000);
}

/* ---------- Botón para ver/ocultar contraseña ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const btnToggle = $("#btn-toggle-password");
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      const inputPass = $("#login-password");
      if (inputPass.type === "password") {
        inputPass.type = "text";
        btnToggle.textContent = "🔒";
      } else {
        inputPass.type = "password";
        btnToggle.textContent = "👁️";
      }
    });
  }
});

/* ---------- Lógica de Login (Supabase Auth) ---------- */
document.addEventListener("submit", async e => {
  if (!e.target || e.target.id !== "form-login") return;
  e.preventDefault();
  const correo = $("#login-correo").value.trim().toLowerCase();
  const pass = $("#login-password").value;
  const err = $("#error-login"), btn = $("#form-login .btn-ingresar");
  err.style.display = "none"; btn.disabled = true; btn.textContent = "INGRESANDO…";
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email: correo, password: pass });
    if (error) throw new Error("Correo o contraseña incorrectos.");
    const perfil = await cargarPerfil();
    if (!perfil) throw new Error("Tu cuenta no tiene acceso a esta plataforma. Consulta con la administradora.");
    usuarioActual = perfil;
    $("#form-login").reset();
    verificarEstadoSesion();
  } catch (ex) {
    err.textContent = ex.message; err.style.display = "block";
  } finally {
    btn.disabled = false; btn.textContent = "INGRESAR";
  }
});

document.addEventListener("click", async e => {
  if (e.target && e.target.id === "btn-cerrar-sesion") {
    await supabaseClient.auth.signOut();
    usuarioActual = null; AUX = null;
    verificarEstadoSesion();
    return;
  }

  const b = e.target.closest("[data-acc]"); if (!b) return;
  const a = b.dataset.acc, m = b.dataset.m, d = b.dataset.d;
  if (a === "editar") abrirModal(m, d);
  else if (a === "nuevo") abrirModal(m, "");
  else if (a === "cerrar-modal") cerrarModal();
  else if (a === "guardar-modal") await guardarModal();
  else if (a.startsWith("aux-")) await accionAux(a, b.dataset);
  else if (a === "borrar") {
    if (confirm("¿Quitar este dashboard de la lista?")) {
      const mod = buscarModulo(m); 
      mod.dashboards = mod.dashboards.filter(x => x.id !== d);
      // Opcional: borrar de supabase si deseas
      render(); 
      toast("Dashboard quitado");
    }
  }
  else if (a === "pantalla") {
    const f = $("#marco");
    if (f && f.requestFullscreen) f.requestFullscreen(); else alert("Primero conecta un dashboard.");
  }
  else if (a === "exportar") {
    const texto = "const BASE = " + JSON.stringify(CONFIG, null, 2) + ";";
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(() => toast("Configuración copiada ✔"), () => prompt("Copia este texto:", texto));
    else prompt("Copia este texto:", texto);
  }
  else if (a === "reset") {
    if (confirm("¿Seguro que deseas restablecer los datos?")) {
      CONFIG = JSON.parse(JSON.stringify(BASE)); 
      render(); 
      toast("Restablecido localmente");
    }
  }
});

function verificarEstadoSesion() {
  if (usuarioActual) {
    $("#vista-login").style.display = "none";
    $("#contenedor-principal").style.display = "flex";
    $("#nombre-usuario-display").textContent = usuarioActual.nombre;
    $("#cargo-usuario-display").textContent = usuarioActual.cargo;
    cargarConfiguracionRemota(); // Carga de la nube al iniciar sesión
  } else {
    $("#vista-login").style.display = "flex";
    $("#contenedor-principal").style.display = "none";
  }
}

/* ---------- Rutas y Vistas de la App ---------- */
function ruta() { return (location.hash.replace("#", "") || "inicio").split("/"); }

function render() {
  if (!usuarioActual) return;
  const p = ruta();
  const etiquetaRol = $("#etiqueta-rol");
  if (etiquetaRol) etiquetaRol.textContent = esAdmin() ? "ADMINISTRADORA" : "ASISTENTE";
  
  dibujarMenu(p);
  const main = $("#principal");
  if (!main) return;

  if (p[0] === "admin" && esAdmin()) vistaAdmin(main);
  else if (p[0] === "reportes") { if (p[1]) vistaModulo(main, p[1], p[2]); else vistaReportes(main); }
  else vistaInicio(main);
  window.scrollTo(0, 0);
}

function dibujarMenu(p) {
  let h = '<a href="#inicio" class="' + (p[0] === "inicio" || !p[0] ? "activo" : "") + '">🏠 Inicio</a>';
  SECCIONES.forEach(s => {
    const dentro = p[0] === s.id;
    h += '<a href="' + s.ruta + '" class="' + (dentro && !p[1] ? "activo" : "") + '">' + esc(s.icono) + " " + esc(s.nombre) + "</a>";
    if (dentro && s.id === "reportes") {
      CONFIG.forEach(m => {
        h += '<a class="sub ' + (p[1] === m.id ? "activo" : "") + '" href="#reportes/' + esc(m.id) + '">' + esc(m.icono) + " " + esc(m.nombre) + "</a>";
      });
    }
  });
  if (esAdmin()) {
    h += '<div class="titulo-seccion">ADMINISTRACIÓN</div>';
    h += '<a href="#admin" class="' + (p[0] === "admin" ? "activo" : "") + '">⚙️ Panel de administración</a>';
  }
  const menuElem = $("#menu");
  if (menuElem) menuElem.innerHTML = h;
}

function vistaInicio(main) {
  let h = '<div class="tarjeta encabezado"><h2>Panel Principal</h2>' +
          '<p>Elige una sección para continuar.</p></div><div class="grid">';
  SECCIONES.forEach(s => {
    const meta = s.id === "reportes" ? CONFIG.length + " módulos" : "";
    h += '<a class="tarjeta modulo" href="' + s.ruta + '">' +
           '<div class="icono">' + esc(s.icono) + '</div>' +
           '<h3>' + esc(s.nombre.toUpperCase()) + '</h3>' +
           '<p>' + esc(s.desc) + '</p>' +
           '<div class="meta">' + meta + '</div>' +
           '<span class="abrir">Abrir →</span>' +
         '</a>';
  });
  h += "</div>";
  main.innerHTML = h;
}

function vistaReportes(main) {
  let h = '<div class="tarjeta encabezado">' +
          '<div class="migas"><a href="#inicio">Inicio</a> / Reportes</div>' +
          '<h2>Reportes</h2>' +
          '<p>Elige un módulo para ver sus dashboards.</p></div>';
  h += '<div class="grid">';
  CONFIG.forEach(m => {
    const total = m.dashboards.length;
    const conectados = m.dashboards.filter(d => d.url).length;
    const meta = total + (total === 1 ? " dashboard" : " dashboards") +
                 (esAdmin() ? " · " + conectados + " conectado" + (conectados === 1 ? "" : "s") : "");
    h += '<a class="tarjeta modulo" href="#reportes/' + esc(m.id) + '">' +
           '<div class="icono">' + esc(m.icono) + '</div>' +
           '<h3>' + esc(m.nombre.toUpperCase()) + '</h3>' +
           '<p>' + esc(m.desc || "") + '</p>' +
           '<div class="meta">' + meta + '</div>' +
           '<span class="abrir">Abrir módulo →</span>' +
         '</a>';
  });
  h += "</div>";
  main.innerHTML = h;
}

function vistaModulo(main, modId, dashId) {
  const m = buscarModulo(modId);
  if (!m) { location.hash = "#reportes"; return; }
  const d = m.dashboards.find(x => x.id === dashId) || m.dashboards[0];

  let h = '<div class="tarjeta encabezado">' +
            '<div class="migas"><a href="#inicio">Inicio</a> / <a href="#reportes">Reportes</a> / ' + esc(m.nombre) + (d ? " / " + esc(d.nombre) : "") + "</div>" +
            "<h2>" + esc(m.icono) + " " + esc(m.nombre.toUpperCase()) + "</h2>" +
            "<p>" + esc(m.desc || "") + "</p></div>";

  if (!d) {
    h += '<div class="tarjeta visor"><div class="vacio"><div class="icono">📭</div><h4>Este módulo aún no tiene dashboards</h4>' +
         (esAdmin() ? '<button class="btn grande" data-acc="nuevo" data-m="' + esc(m.id) + '">+ Agregar dashboard</button>' : "<p>Pronto estará disponible.</p>") +
         "</div></div>";
    main.innerHTML = h; return;
  }

  if (m.dashboards.length > 1) {
    h += '<div class="pestanas">';
    m.dashboards.forEach(x => {
      h += '<a class="pestana ' + (x.id === d.id ? "activa" : "") + '" href="#reportes/' + esc(m.id) + "/" + esc(x.id) + '">' + esc(x.nombre) + "</a>";
    });
    h += "</div>";
  }

  h += '<div class="tarjeta visor"><div class="visor-barra"><h3>' + esc(d.nombre) + "</h3><div>" +
       '<button class="btn gris" data-acc="pantalla">⛶ Pantalla completa</button> ' +
       (esAdmin() ? '<button class="btn" data-acc="editar" data-m="' + esc(m.id) + '" data-d="' + esc(d.id) + '">⚙ Configurar enlace</button>' : "") +
       "</div></div>";

  if (d.url) {
    h += '<iframe class="marco" id="marco" src="' + esc(d.url) + '" allowfullscreen title="' + esc(d.nombre) + '"></iframe>';
  } else if (esAdmin()) {
    h += '<div class="vacio"><div class="icono">📊</div><h4>Aún no hay un Power BI conectado</h4>' +
         "<p>Pega el enlace del reporte para verlo aquí.</p>" +
         '<button class="btn grande" data-acc="editar" data-m="' + esc(m.id) + '" data-d="' + esc(d.id) + '">Conectar Power BI</button></div>';
  } else {
    h += '<div class="vacio"><div class="icono">🛠️</div><h4>Dashboard no disponible por ahora</h4>' +
         "<p>Este reporte se está preparando. Vuelve pronto.</p></div>";
  }
  h += "</div>";
  main.innerHTML = h;
}

function vistaAdmin(main) {
  let h = '<div class="tarjeta encabezado"><h2>Panel de administración</h2>' +
          "<p>Aquí administras quién puede entrar a validar y conectas los Power BI.</p></div>";
  h += bloqueAuxiliares();

  h += '<div class="aviso">💡 Los cambios que guardes aquí se sincronizan automáticamente <strong>en la nube</strong> para todos los dispositivos.</div>';

  h += '<div class="barra-admin">' +
       '<button class="btn" data-acc="exportar">📋 Copiar configuración</button>' +
       '<button class="btn gris" data-acc="reset">↺ Restablecer</button></div>';

  CONFIG.forEach(m => {
    h += '<div class="tarjeta bloque-admin"><h3><span>' + esc(m.icono) + " " + esc(m.nombre) + "</span>" +
         '<button class="btn" data-acc="nuevo" data-m="' + esc(m.id) + '">+ Agregar dashboard</button></h3>' +
         "<table><tr><th>Dashboard</th><th>Estado</th><th></th></tr>";
    m.dashboards.forEach(d => {
      h += "<tr><td>" + esc(d.nombre) + "</td><td>" +
           (d.url ? '<span class="estado ok">Conectado</span>' : '<span class="estado pend">Pendiente</span>') + "</td>" +
           '<td class="acc"><a class="btn gris" style="text-decoration:none;display:inline-block" href="#reportes/' + esc(m.id) + "/" + esc(d.id) + '">Ver</a>' +
           '<button class="btn" data-acc="editar" data-m="' + esc(m.id) + '" data-d="' + esc(d.id) + '">Editar</button>' +
           '<button class="btn peligro" data-acc="borrar" data-m="' + esc(m.id) + '" data-d="' + esc(d.id) + '">Quitar</button></td></tr>';
    });
    if (!m.dashboards.length) h += '<tr><td colspan="3" style="color:#6b7585">Sin dashboards todavía.</td></tr>';
    h += "</table></div>";
  });
  main.innerHTML = h;
  if (AUX === null) cargarAuxiliares();
}

/* ================= AUXILIARES DE VALIDACIÓN (ingresan solo con DNI) ================= */
const DNI_OK = /^[A-Za-z0-9]{6,15}$/;

async function cargarAuxiliares() {
  const { data, error } = await supabaseClient.from("val_auxiliares").select("*").order("nombre");
  AUX = error ? [] : data;
  if (error) alert("No se pudo cargar la lista de auxiliares: " + error.message);
  if (ruta()[0] === "admin") render();
}

function bloqueAuxiliares() {
  let h = '<div class="tarjeta bloque-admin"><h3><span>👷 Auxiliares de validación (ingresan con su DNI)</span><span>' +
          '<button class="btn gris" data-acc="aux-lote">Pegar lista</button> ' +
          '<button class="btn" data-acc="aux-nuevo">+ Agregar auxiliar</button></span></h3>';
  if (AUX === null) return h + '<p class="nota">Cargando…</p></div>';
  h += '<p class="nota">Solo las personas de esta lista pueden entrar a validar. Si desactivas un DNI, pierde el acceso de inmediato.</p>' +
       "<table><tr><th>DNI</th><th>Nombre</th><th>Estado</th><th></th></tr>";
  AUX.forEach(a => {
    const d = esc(a.dni);
    h += "<tr><td>" + d + "</td><td>" + esc(a.nombre) + "</td><td>" +
         (a.activo ? '<span class="estado ok">Activo</span>' : '<span class="estado off">Desactivado</span>') + "</td>" +
         '<td class="acc"><button class="btn" data-acc="aux-editar" data-dni="' + d + '">Editar</button>' +
         '<button class="btn gris" data-acc="aux-toggle" data-dni="' + d + '">' + (a.activo ? "Desactivar" : "Activar") + "</button>" +
         '<button class="btn peligro" data-acc="aux-borrar" data-dni="' + d + '">Quitar</button></td></tr>';
  });
  if (!AUX.length) h += '<tr><td colspan="4" style="color:#6b7585">Aún no hay auxiliares registrados.</td></tr>';
  return h + "</table></div>";
}

async function accionAux(a, ds) {
  if (!esAdmin()) return;
  if (a === "aux-nuevo") return abrirModalAux("");
  if (a === "aux-editar") return abrirModalAux(ds.dni);
  if (a === "aux-lote") { $("#lote-texto").value = ""; $("#modal-lote").classList.add("abierto"); return $("#lote-texto").focus(); }
  if (a === "aux-cerrar") { $("#modal-aux").classList.remove("abierto"); $("#modal-lote").classList.remove("abierto"); auxEditando = ""; return; }
  if (a === "aux-guardar") return guardarAux();
  if (a === "aux-guardar-lote") return guardarLote();
  const x = AUX && AUX.find(z => z.dni === ds.dni);
  if (!x) return;
  if (a === "aux-toggle") {
    const { error } = await supabaseClient.from("val_auxiliares").update({ activo: !x.activo }).eq("dni", x.dni);
    if (error) return alert("No se pudo cambiar el estado: " + error.message);
    toast(x.activo ? "Auxiliar desactivado" : "Auxiliar activado");
    return cargarAuxiliares();
  }
  if (a === "aux-borrar") {
    if (!confirm("¿Quitar a " + x.nombre + " (" + x.dni + ") de la lista?\nSus validaciones anteriores se conservan.")) return;
    const { error } = await supabaseClient.from("val_auxiliares").delete().eq("dni", x.dni);
    if (error) return alert("No se pudo quitar: " + error.message);
    toast("Auxiliar quitado");
    return cargarAuxiliares();
  }
}

function abrirModalAux(dni) {
  const x = dni ? AUX.find(z => z.dni === dni) : null;
  auxEditando = x ? x.dni : "";
  $("#modal-aux-titulo").textContent = x ? "Editar auxiliar" : "Nuevo auxiliar";
  $("#aux-dni").value = x ? x.dni : ""; $("#aux-dni").disabled = !!x;
  $("#aux-nombre").value = x ? x.nombre : "";
  $("#modal-aux").classList.add("abierto");
  (x ? $("#aux-nombre") : $("#aux-dni")).focus();
}

async function guardarAux() {
  const dni = $("#aux-dni").value.replace(/\s/g, "").toUpperCase();
  const nombre = $("#aux-nombre").value.trim().replace(/\s+/g, " ").toUpperCase();
  if (!DNI_OK.test(dni)) return alert("El DNI debe tener entre 6 y 15 letras o números, sin espacios.");
  if (!nombre) return alert("Escribe el nombre del auxiliar.");
  const q = auxEditando
    ? supabaseClient.from("val_auxiliares").update({ nombre }).eq("dni", auxEditando)
    : supabaseClient.from("val_auxiliares").insert({ dni, nombre });
  const { error } = await q;
  if (error) return alert(error.code === "23505" ? "Ese DNI ya está registrado." : "No se pudo guardar: " + error.message);
  $("#modal-aux").classList.remove("abierto"); auxEditando = "";
  toast("Auxiliar guardado ✔");
  cargarAuxiliares();
}

// Pegar varias filas desde Excel: DNI  [tab o ; o ,]  NOMBRE
async function guardarLote() {
  const filas = [], malas = [], vistos = new Set();
  $("#lote-texto").value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
    const c = l.split(/[;,\t]+/).map(x => x.trim());
    const dni = (c[0] || "").replace(/\s/g, "").toUpperCase(), nombre = c.slice(1).join(" ").replace(/\s+/g, " ").trim().toUpperCase();
    if (DNI_OK.test(dni) && nombre && !vistos.has(dni)) { vistos.add(dni); filas.push({ dni, nombre }); } else malas.push(l);
  });
  if (!filas.length) return alert("No encontré filas válidas. Cada línea debe ser: DNI, un separador (tab, ; o ,) y el nombre.");
  const { error } = await supabaseClient.from("val_auxiliares").upsert(filas, { onConflict: "dni" });
  if (error) return alert("No se pudo guardar la lista: " + error.message);
  $("#modal-lote").classList.remove("abierto");
  toast(filas.length + " auxiliar(es) guardado(s) ✔");
  if (malas.length) alert("Estas " + malas.length + " línea(s) no se guardaron por tener datos incompletos:\n\n" + malas.slice(0, 8).join("\n") + (malas.length > 8 ? "\n…" : ""));
  cargarAuxiliares();
}

function abrirModal(modId, dashId) {
  const m = buscarModulo(modId); if (!m) return;
  const d = dashId ? m.dashboards.find(x => x.id === dashId) : null;
  edicion = { m: modId, d: dashId || "" };
  const modalTitulo = $("#modal-titulo");
  if (modalTitulo) modalTitulo.textContent = d ? "Configurar: " + d.nombre : "Nuevo dashboard en " + m.nombre;
  $("#input-nombre").value = d ? d.nombre : "";
  $("#input-url").value = d ? d.url : "";
  $("#modal").classList.add("abierto");
  $("#input-nombre").focus();
}

function cerrarModal() { 
  const modal = $("#modal");
  if (modal) modal.classList.remove("abierto"); 
  edicion = null; 
}

function limpiarUrl(texto) {
  let u = texto.trim();
  const m = u.match(/src=["']([^"']+)["']/i);
  if (m) u = m[1];
  return u;
}

// Función actualizada para guardar directamente en Supabase
async function guardarModal() {
  if (!edicion) return;
  const m = buscarModulo(edicion.m);
  const nombre = $("#input-nombre").value.trim();
  const url = limpiarUrl($("#input-url").value);
  
  if (!nombre) { alert("Escribe un nombre para el dashboard."); return; }
  if (url && !/^https:\/\//i.test(url)) { alert("El enlace debe empezar con https://"); return; }

  let targetId = edicion.d;
  if (targetId) {
    const d = m.dashboards.find(x => x.id === targetId);
    d.nombre = nombre; 
    d.url = url;
  } else {
    targetId = "d" + Date.now();
    m.dashboards.push({ id: targetId, nombre: nombre, url: url });
  }

  // Guardar en la base de datos de Supabase
  try {
    const { error } = await supabaseClient
      .from('dashboards_config')
      .upsert({ id: targetId, url: url, updated_at: new Date() });

    if (error) {
      console.error("Error al guardar en Supabase:", error.message);
      alert("Hubo un error al guardar en la nube.");
      return;
    }
  } catch (err) {
    console.error("Excepción al guardar:", err);
  }

  cerrarModal(); 
  render(); 
  toast("Guardado y sincronizado en la nube ✔");
}

window.addEventListener("hashchange", render);

// Si la sesión se cierra (vence o se cierra en otra pestaña), volver al login
supabaseClient.auth.onAuthStateChange(evento => {
  if (evento === "SIGNED_OUT" && usuarioActual) { usuarioActual = null; AUX = null; verificarEstadoSesion(); }
});

// Inicializar al cargar la página
(async function iniciar() {
  try { localStorage.removeItem("ceva_sesion_activa"); } catch (e) {}   // restos del login anterior
  usuarioActual = await cargarPerfil();
  verificarEstadoSesion();
})();
