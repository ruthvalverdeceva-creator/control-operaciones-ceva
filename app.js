/* ==========================================================================
   CONFIGURACIÓN DE SUPABASE Y CLIENTE
   ========================================================================== */
const SUPABASE_URL = 'https://bpwgyimcreewipewrynp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z7CXbNSDMPB705qUpUp_7A_w19foNfz';

const CLAVE_TOKEN = "ceva_token";
let tokenSesion = null;
try { tokenSesion = localStorage.getItem(CLAVE_TOKEN) || null; } catch (e) {}

function crearCliente(token) {
  const opciones = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  if (token) opciones.global = { headers: { "x-val-token": token } };
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, opciones);
}

let supabaseClient = crearCliente(tokenSesion);

function fijarToken(token) {
  tokenSesion = token || null;
  try { token ? localStorage.setItem(CLAVE_TOKEN, token) : localStorage.removeItem(CLAVE_TOKEN); } catch (e) {}
  supabaseClient = crearCliente(tokenSesion);
}

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
  { id: "reportes", nombre: "Reportes", icono: "📊", desc: "Dashboards de Power BI organizados por módulo.", ruta: "#reportes" },
  { id: "inventario", nombre: "Inventario", icono: "📦", desc: "Herramientas operativas: validación ciega de canales Outbound.", ruta: "#inventario" }
];

let CONFIG = JSON.parse(JSON.stringify(BASE));
let usuarioActual = null;
let edicion = null;
let AUX = null;
let auxEditando = "";
const ID_GOOGLE_SHEET_DESPACHOS = "1u2TIkV2ZxezVze-3ZeUF9LjqdZ1LLVAhQ0ag73cLXzI";

// Función para sincronizar y cargar los enlaces desde Supabase
async function cargarConfiguracionRemota() {
  try {
    const { data, error } = await supabaseClient.from('dashboards_config').select('*');
    if (!error && data && data.length > 0) {
      CONFIG.forEach(mod => {
        mod.dashboards.forEach(dash => {
          const encontrado = data.find(item => item.id === dash.id);
          if (encontrado) { dash.url = encontrado.url; }
        });
      });
    }
  } catch (err) {
    console.error("Error al conectar con Supabase:", err);
  }
  render();
}

async function cargarPerfil() {
  if (!tokenSesion) return null;
  try {
    const { data, error } = await supabaseClient.rpc("val_yo");
    if (error || !data) { fijarToken(null); return null; }
    return { usuario: data.usuario, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
  } catch (err) { console.error("Error al cargar el perfil:", err); return null; }
}

const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const esAdmin = () => usuarioActual && usuarioActual.rol === "admin";
const buscarModulo = id => CONFIG.find(m => m.id === id);

function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.style.display = "block";
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

/* ---------- Lógica de Login Segura ---------- */
document.addEventListener("submit", async e => {
  if (!e.target || e.target.id !== "form-login") return;
  e.preventDefault();
  const inputUsuario = $("#login-usuario");
  const inputPass = $("#login-password");
  const err = $("#error-login");
  const btn = $("#form-login .btn-ingresar");

  const usuario = inputUsuario ? inputUsuario.value.trim().toLowerCase() : "";
  const pass = inputPass ? inputPass.value : "";

  if (err) err.style.display = "none";
  if (btn) { btn.disabled = true; btn.textContent = "INGRESANDO…"; }

  try {
    const { data, error } = await supabaseClient.rpc("val_entrar", { p_usuario: usuario, p_password: pass || null });
    if (error) throw new Error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    if (!data || !data.ok) throw new Error((data && data.msg) || "Usuario o contraseña incorrectos.");
    
    if (data.rol === "auxiliar") {
      fijarToken(data.token);
      throw new Error("Tu acceso es correcto, pero la pantalla de validación para auxiliares aún no está disponible.");
    }
    
    fijarToken(data.token);
    usuarioActual = { usuario: data.usuario, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
    
    const formLogin = $("#form-login");
    if (formLogin) formLogin.reset();
    verificarEstadoSesion();
  } catch (ex) {
    if (err) {
      err.textContent = ex.message;
      err.style.display = "block";
    } else {
      alert(ex.message);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "INGRESAR"; }
  }
});

document.addEventListener("click", async e => {
  if (e.target && e.target.id === "btn-cerrar-sesion") {
    try { await supabaseClient.rpc("val_salir"); } catch (ex) {}
    fijarToken(null);
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
    cargarConfiguracionRemota();
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
  else if (p[0] === "inventario") {
      vistaInventario(main, p[1]);
  }
  else if (p[0] === "reportes") { if (p[1]) vistaModulo(main, p[1], p[2]); else vistaReportes(main); }
  else vistaInicio(main);
  window.scrollTo(0, 0);
}

function dibujarMenu(p) {
  let h = '<a href="#inicio" class="' + (p[0] === "inicio" || !p[0] ? "activo" : "") + '">🏠 Inicio</a>';
  SECCIONES.forEach(s => {
    const dentro = p[0] === s.id;
    h += '<a href="' + s.ruta + '" class="' + (dentro && !p[1] ? "activo" : "") + '">' + esc(s.icono) + " " + esc(s.nombre) + "</a>";
    if (dentro && s.id === "inventario") {
      h += '<a class="sub ' + (p[1] === "validacion" ? "activo" : "") + '" href="#inventario/validacion">✅ Validación Outbound</a>';
    }
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
    const meta = s.id === "reportes" ? CONFIG.length + " módulos" : s.id === "inventario" ? "1 herramienta" : "";
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

function vistaInventario(main, sub) {
  if (sub === "validacion") {
    renderVistaValidacionOutbound(main);
    return;
  }

  main.innerHTML = '<div class="tarjeta encabezado">' +
    '<div class="migas"><a href="#inicio">Inicio</a> / Inventario</div>' +
    '<h2>📦 INVENTARIO</h2>' +
    '<p>Herramientas operativas de piso y control logístico.</p></div>' +
    '<div class="grid">' +
    '<a class="tarjeta modulo" href="#inventario/validacion">' +
    '<div class="icono">✅</div>' +
    '<h3>VALIDACIÓN OUTBOUND</h3>' +
    '<p>Validación ciega de canales de despacho, cruce por viaje y por HU.</p>' +
    '<div class="meta">Herramienta activa</div>' +
    '<span class="abrir">Abrir herramienta →</span>' +
    '</a>' +
    '</div>';
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
  if (AUX === null) cargarPersonas();
}

const DNI_OK = /^[a-z0-9]{6,15}$/;
const ROLES = { admin: "Administradora", asistente: "Asistente", auxiliar: "Auxiliar (solo DNI)" };
let perEditando = "";

async function cargarPersonas() {
  const { data, error } = await supabaseClient.from("val_usuarios")
    .select("usuario,nombre,cargo,rol,activo").order("rol").order("nombre");
  AUX = error ? [] : data;
  if (error) alert("No se pudo cargar la lista de personas: " + error.message);
  if (ruta()[0] === "admin") render();
}

function bloqueAuxiliares() {
  let h = '<div class="tarjeta bloque-admin"><h3><span>👥 Personas con acceso</span><span>' +
          '<button class="btn gris" data-acc="aux-lote">Pegar lista de auxiliares</button> ' +
          '<button class="btn" data-acc="aux-nuevo">+ Agregar persona</button></span></h3>';
  if (AUX === null) return h + '<p class="nota">Cargando…</p></div>';
  h += '<p class="nota">Asistentes y administradoras entran con <b>usuario y contraseña</b>; los auxiliares de piso entran solo con su <b>DNI</b>.</p>' +
       "<table><tr><th>Usuario / DNI</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr>";
  AUX.forEach(a => {
    const u = esc(a.usuario);
    h += "<tr><td>" + u + "</td><td>" + esc(a.nombre) + (a.cargo ? '<br><span class="nota">' + esc(a.cargo) + "</span>" : "") + "</td><td>" + esc(ROLES[a.rol] || a.rol) + "</td><td>" +
         (a.activo ? '<span class="estado ok">Activo</span>' : '<span class="estado off">Desactivado</span>') + "</td>" +
         '<td class="acc"><button class="btn" data-acc="aux-editar" data-u="' + u + '">Editar</button>' +
         '<button class="btn gris" data-acc="aux-toggle" data-u="' + u + '">' + (a.activo ? "Desactivar" : "Activar") + "</button>" +
         '<button class="btn peligro" data-acc="aux-borrar" data-u="' + u + '">Quitar</button></td></tr>';
  });
  if (!AUX.length) h += '<tr><td colspan="5" style="color:#6b7585">Aún no hay personas registradas.</td></tr>';
  return h + "</table></div>";
}

async function accionAux(a, ds) {
  if (!esAdmin()) return;
  if (a === "aux-nuevo") return abrirModalPersona("");
  if (a === "aux-editar") return abrirModalPersona(ds.u);
  if (a === "aux-lote") { $("#lote-texto").value = ""; $("#modal-lote").classList.add("abierto"); return $("#lote-texto").focus(); }
  if (a === "aux-cerrar") { $("#modal-aux").classList.remove("abierto"); $("#modal-lote").classList.remove("abierto"); perEditando = ""; return; }
  if (a === "aux-guardar") return guardarPersona();
  if (a === "aux-guardar-lote") return guardarLote();
  const x = AUX && AUX.find(z => z.usuario === ds.u);
  if (!x) return;
  if (a === "aux-toggle") {
    const { error } = await supabaseClient.rpc("val_usuario_estado", { p_usuario: x.usuario, p_activo: !x.activo });
    if (error) return alert(error.message);
    toast(x.activo ? "Persona desactivada" : "Persona activada");
    return cargarPersonas();
  }
  if (a === "aux-borrar") {
    if (!confirm("¿Quitar a " + x.nombre + " (" + x.usuario + ") de la lista?")) return;
    const { error } = await supabaseClient.rpc("val_usuario_borrar", { p_usuario: x.usuario });
    if (error) return alert(error.message);
    toast("Persona quitada");
    return cargarPersonas();
  }
}

function ajustarCamposPersona() {
  const aux = $("#per-rol").value === "auxiliar";
  $("#per-grupo-pass").style.display = aux ? "none" : "block";
  $("#per-etq-usuario").textContent = aux ? "DNI (con esto ingresa)" : "Usuario (sin espacios)";
}

function abrirModalPersona(usuario) {
  const x = usuario ? AUX.find(z => z.usuario === usuario) : null;
  perEditando = x ? x.usuario : "";
  $("#modal-aux-titulo").textContent = x ? "Editar persona" : "Nueva persona";
  $("#per-usuario").value = x ? x.usuario : ""; $("#per-usuario").disabled = !!x;
  $("#per-nombre").value = x ? x.nombre : "";
  $("#per-cargo").value = x && x.cargo ? x.cargo : "";
  $("#per-rol").value = x ? x.rol : "auxiliar";
  $("#per-pass").value = "";
  ajustarCamposPersona();
  $("#modal-aux").classList.add("abierto");
}

async function guardarPersona() {
  const rol = $("#per-rol").value;
  const usuario = $("#per-usuario").value.replace(/\s/g, "").toLowerCase();
  let nombre = $("#per-nombre").value.trim().replace(/\s+/g, " ");
  const cargo = $("#per-cargo").value.trim();
  const pass = $("#per-pass").value;
  if (!usuario) return alert("Escribe el usuario (o el DNI).");
  if (!nombre) return alert("Escribe el nombre.");
  if (rol === "auxiliar") nombre = nombre.toUpperCase();
  const { error } = await supabaseClient.rpc("val_usuario_guardar", {
    p_usuario: usuario, p_nombre: nombre, p_cargo: cargo, p_rol: rol, p_password: rol === "auxiliar" ? null : (pass || null)
  });
  if (error) return alert(error.message);
  $("#modal-aux").classList.remove("abierto"); perEditando = "";
  toast("Guardado ✔");
  cargarPersonas();
}

async function guardarLote() {
  const filas = [], malas = [], vistos = new Set();
  $("#lote-texto").value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
    const c = l.split(/[;,\t]+/).map(x => x.trim());
    const dni = (c[0] || "").replace(/\s/g, "").toLowerCase(), nombre = c.slice(1).join(" ").replace(/\s+/g, " ").trim().toUpperCase();
    if (DNI_OK.test(dni) && nombre && !vistos.has(dni)) { vistos.add(dni); filas.push({ dni, nombre }); } else malas.push(l);
  });
  if (!filas.length) return alert("No encontré filas válidas.");
  const { data, error } = await supabaseClient.rpc("val_auxiliares_lote", { p_filas: filas });
  if (error) return alert("No se pudo guardar la lista: " + error.message);
  $("#modal-lote").classList.remove("abierto");
  toast((data ? data.guardados : filas.length) + " auxiliar(es) guardado(s) ✔");
  cargarPersonas();
}

function abrirModal(modId, dashId) {
  const m = buscarModulo(modId); if (!m) return;
  const d = dashId ? m.dashboards.find(x => x.id === dashId) : null;
  edicion = { m: modId, d: dashId || "" };
  $("#modal-titulo").textContent = d ? "Configurar: " + d.nombre : "Nuevo dashboard en " + m.nombre;
  $("#input-nombre").value = d ? d.nombre : "";
  $("#input-url").value = d ? d.url : "";
  $("#modal").classList.add("abierto");
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

async function guardarModal() {
  if (!edicion) return;
  const m = buscarModulo(edicion.m);
  const nombre = $("#input-nombre").value.trim();
  const url = limpiarUrl($("#input-url").value);
  
  if (!nombre) { alert("Escribe un nombre."); return; }
  let targetId = edicion.d;
  if (targetId) {
    const d = m.dashboards.find(x => x.id === targetId);
    d.nombre = nombre; d.url = url;
  } else {
    targetId = "d" + Date.now();
    m.dashboards.push({ id: targetId, nombre: nombre, url: url });
  }

  try {
    await supabaseClient.from('dashboards_config').upsert({ id: targetId, url: url, updated_at: new Date() });
  } catch (err) { console.error(err); }

  cerrarModal(); render(); toast("Guardado ✔");
}

window.addEventListener("hashchange", render);

(async function iniciar() {
  try { localStorage.removeItem("ceva_sesion_activa"); } catch (e) {}
  usuarioActual = await cargarPerfil();
  verificarEstadoSesion();
})();

// ==========================================================================
// MÓDULO DE VALIDACIÓN OUTBOUND - SUBIDA DE ARCHIVOS EXCEL Y SINCRONIZACIÓN
// ==========================================================================

async function renderVistaValidacionOutbound(main) {
    main.innerHTML = `
        <div class="tarjeta encabezado" style="background:#0f2150; color:#fff; border-radius:12px; padding:20px; margin-bottom:20px;">
            <div class="migas" style="color:#adb5bd;"><a href="#inicio" style="color:#adb5bd;">Inicio</a> / <a href="#inventario" style="color:#adb5bd;">Inventario</a> / Validación Outbound</div>
            <h2 style="color:#fff; margin:10px 0 5px 0;">CONTROL OPERATIVO OUTBOUND</h2>
            <p style="margin:0; font-size:13px; color:#e0e0e0;">Sincronizando viajes desde el Drive de Despachos y Supabase...</p>
        </div>
        <div class="tarjeta" style="text-align:center; padding:30px;">
            <p style="font-weight:700; color:#0f2150;">Cargando información en vivo...</p>
        </div>
    `;

    try {
        const { data: registros, error } = await supabaseClient
            .from('val_fases')
            .select('*');

        if (error) throw error;
        const listaRegistros = registros || [];

        main.innerHTML = `
            <div class="tarjeta encabezado" style="background:#0f2150; color:#fff; border-radius:12px; padding:20px; margin-bottom:20px;">
                <div class="migas" style="color:#adb5bd;"><a href="#inicio" style="color:#adb5bd;">Inicio</a> / <a href="#inventario" style="color:#adb5bd;">Inventario</a> / Validación Outbound</div>
                <h2 style="color:#fff; margin:10px 0 5px 0;">CONTROL OPERATIVO OUTBOUND</h2>
                <p style="margin:0; font-size:13px; color:#e0e0e0;">Panel de control y validación ciega de canales de despacho por FO y fases.</p>
            </div>

            <!-- Panel de Carga Directa de Archivos Excel / SAP -->
            <div class="tarjeta" style="background:#fff; border:1px solid #ddd; border-radius:10px; padding:20px; margin-bottom:20px; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
                <h3 style="color:#0f2150; margin-top:0; font-size:16px;">📂 Subir archivo Excel operativo (Picking / Stock / Status)</h3>
                
                <div style="margin-bottom: 12px;">
                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">Tipo de documento:</label>
                    <select id="tipoDocumentoArchivo" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
                        <option value="picking">PICKING (reemplaza solo las fases del archivo)</option>
                        <option value="stock">STOCK ENTREGAS (reemplaza toda la hoja)</option>
                        <option value="monitor">MONITOR / STATUS (reemplaza la hoja)</option>
                    </select>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">Seleccionar archivo Excel (.xlsx / .csv):</label>
                    <input type="file" id="inputArchivoExcel" accept=".xlsx, .xls, .csv" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px; background:#fafafa;">
                </div>

                <button class="btn" style="background:#0f2150; color:#fff; border:0; padding:12px; border-radius:8px; font-weight:700; width:100%; cursor:pointer;" onclick="procesarArchivoExcelSubido()">🚀 PROCESAR Y SUBIR ARCHIVO A SUPABASE</button>
            </div>

            <!-- Botonera superior de Sincronización Web -->
            <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                <button class="btn" style="background:#0f2150; color:#fff; border:0; padding:10px 16px; border-radius:8px; font-weight:700; cursor:pointer;" onclick="renderVistaValidacionOutbound(document.querySelector('main'))">🔄 ACTUALIZAR</button>
                <button class="btn" style="background:#198754; color:#fff; border:0; padding:10px 16px; border-radius:8px; font-weight:700; cursor:pointer;" onclick="sincronizarDriveDespachosWeb()">📥 SINCRONIZAR DRIVE DE DESPACHOS</button>
            </div>

            <!-- Filtro de Total Fases -->
            <div style="display: flex; gap: 8px; margin-bottom: 15px; flex-wrap: wrap;">
                <span style="background:#0f2150; color:#fff; padding:8px 14px; border-radius:20px; font-size:12px; font-weight:700;">TOTAL FASES (${listaRegistros.length})</span>
            </div>

            <!-- Contenedor de Tarjetas de Viajes (FOs) -->
            <div id="contenedorTarjetasFO" style="display: grid; gap: 15px;">
                ${generarTarjetasHTML(listaRegistros)}
            </div>
        `;

    } catch (err) {
        console.error("Error al conectar con Supabase:", err);
        main.innerHTML = `
            <div class="tarjeta encabezado">
                <h2>Validación ciega de canales Outbound</h2>
                <p style="color:red; font-weight:700;">Error al conectar con Supabase: ${err.message}</p>
            </div>
        `;
    }
}

// Generador de tarjetas operativas
function generarTarjetasHTML(registros) {
    if (registros.length === 0) {
        return `
            <div class="tarjeta" style="text-align:center; padding:25px; background:#fff; border-radius:10px; border:1px solid #ddd;">
                <h3 style="color:#0f2150; margin-bottom:8px;">No hay fases cargadas actualmente</h3>
                <p style="color:#666; font-size:13px; margin-bottom:15px;">Selecciona tu archivo Excel arriba o haz clic en <b>"Sincronizar Drive de Despachos"</b>.</p>
            </div>
        `;
    }

    let html = "";
    registros.forEach((v) => {
        let fo = v.fo || "FO-S/N";
        let fase = v.fase || "01";
        let cliente = v.cliente || "CLIENTE GENERAL";
        let validador = v.validador || "RUTHVAL";
        let estado = v.estadoApp || "EN PROCESO";
        let colorBarra = estado === "CERRADO" ? "#198754" : "#0d6efd";

        html += `
            <div style="background:#fff; border:1px solid #ddd; border-radius:10px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
                <div style="background:${colorBarra}; color:#fff; padding:10px 15px; display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size:16px;">FO: ${fo}</strong>
                </div>
                
                <div style="padding:15px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                        <div>
                            <div style="font-size:15px; font-weight:700; color:#0f2150;">FASE: ${fase} - ${cliente}</div>
                            <div style="font-size:13px; color:#555; margin-top:2px;"><b>VALIDADOR:</b> ${validador}</div>
                        </div>
                        <span style="background:#fff3cd; color:#856404; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700; border:1px solid #ffeeba;">${estado}</span>
                    </div>

                    <div style="display:flex; gap:8px; margin-top:12px; border-top:1px solid #eee; padding-top:10px; flex-wrap:wrap;">
                        <button class="btn sm" style="background:#0f2150; color:#fff; border:0; padding:6px 12px; border-radius:6px; font-weight:600; cursor:pointer;" onclick="ejecutarCruceHU('${fo}', '${fase}')">⚡ Cruce HU / Paletas</button>
                    </div>
                </div>
            </div>
        `;
    });
    return html;
}

// Procesar el archivo Excel subido por el usuario
async function procesarArchivoExcelSubido() {
    const inputArchivo = document.getElementById('inputArchivoExcel');
    if (!inputArchivo || !inputArchivo.files || inputArchivo.files.length === 0) {
        alert("Por favor, selecciona primero un archivo Excel (.xlsx o .csv).");
        return;
    }

    const archivo = inputArchivo.files[0];
    alert(`Leyendo y procesando el archivo: ${archivo.name}...`);

    const lector = new FileReader();
    lector.onload = async function(e) {
        try {
            const datosBinarios = new Uint8Array(e.target.result);
            const libro = XLSX.read(datosBinarios, { type: 'array' });
            const nombreHoja = libro.SheetNames[0];
            const hoja = libro.Sheets[nombreHoja];
            const filasJson = XLSX.utils.sheet_to_json(hoja, { header: 1 });

            let procesados = 0;
            const registrosUpsert = [];

            // Recorremos las filas del Excel omitiendo el encabezado (fila 0)
            for (let i = 1; i < filasJson.length; i++) {
                const fila = filasJson[i];
                if (!fila || fila.length === 0) continue;

                // Buscamos columnas comunes de FO y Fase en la fila
                let foVal = String(fila[4] || fila[0] || "").trim();
                let faseVal = String(fila[5] || fila[1] || "").trim();
                let clienteVal = String(fila[6] || fila[2] || "").trim() || "CLIENTE L400";

                if (foVal && foVal.length >= 6) {
                    registrosUpsert.push({
                        id: foVal,
                        fo: foVal,
                        fase: faseVal || "01",
                        cliente: clienteVal.toUpperCase(),
                        validador: "RUTHVAL",
                        estadoApp: "EN PROCESO"
                    });
                    procesados++;
                }
            }

            if (registrosUpsert.length === 0) {
                throw new Error("No se encontraron columnas válidas de FO/Fase en el archivo seleccionado.");
            }

            const { error: errorSinc } = await supabaseClient
                .from('val_fases')
                .upsert(registrosUpsert, { onConflict: 'id' });

            if (errorSinc) throw errorSinc;

            alert(`¡Archivo procesado con éxito! Se cargaron ${procesados} registros a Supabase.`);
            renderVistaValidacionOutbound(document.querySelector('main'));

        } catch (err) {
            console.error("Error al procesar el archivo Excel:", err);
            alert("Error al procesar el archivo: " + err.message);
        }
    };
    lector.readAsArrayBuffer(archivo);
}

// Sincronización Web Directa desde Google Sheets
async function sincronizarDriveDespachosWeb() {
    alert("Sincronizando datos desde el Drive de Despachos en línea...");
    
    try {
        const urlExport = `https://docs.google.com/spreadsheets/d/${ID_GOOGLE_SHEET_DESPACHOS}/export?format=csv`;
        const res = await fetch(urlExport);
        
        if (!res.ok) throw new Error("No se pudo conectar con el Google Sheet.");

        const csvText = await res.text();
        const lineas = csvText.split("\n");
        const registrosUpsert = [];

        for (let i = 1; i < lineas.length; i++) {
            const columnas = lineas[i].split(",");
            if (!columnas || columnas.length < 6) continue;

            let foVal = (columnas[4] || "").replace(/"/g, '').trim();
            let faseVal = (columnas[5] || "").replace(/"/g, '').trim();
            let clienteVal = (columnas[6] || "").replace(/"/g, '').trim() || "CLIENTE L400";

            if (foVal && foVal.length >= 6) {
                registrosUpsert.push({
                    id: foVal,
                    fo: foVal,
                    fase: faseVal || "01",
                    cliente: clienteVal.toUpperCase(),
                    validador: "RUTHVAL",
                    estadoApp: "EN PROCESO"
                });
            }
        }

        const { error: errorSinc } = await supabaseClient
            .from('val_fases')
            .upsert(registrosUpsert, { onConflict: 'id' });

        if (errorSinc) throw errorSinc;

        alert("¡Sincronización web completada con éxito!");
        renderVistaValidacionOutbound(document.querySelector('main'));

    } catch (err) {
        console.error("Error en sincronización web:", err);
        alert("Error: " + err.message);
    }
}

// Lógica de cruce por HU y Paletas
async function ejecutarCruceHU(fo, fase) {
    alert(`Ejecutando cruce automático por HU y paletas para la FO: ${fo} (Fase ${fase})...`);
    
    try {
        const { data: datosPicking, error } = await supabaseClient
            .from('val_picking')
            .select('*')
            .eq('fo', fo);

        if (error) throw error;
        alert(`¡Cruce verificado con éxito para la FO ${fo}!`);

    } catch (err) {
        console.error("Error en el cruce:", err);
        alert(`Error en la validación: ${err.message}`);
    }
}
