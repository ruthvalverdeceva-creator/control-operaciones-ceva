/* ==========================================================================
   CONFIGURACIÓN DE SUPABASE Y CLIENTE
   ========================================================================== */
const SUPABASE_URL = 'https://bpwgyimcreewipewrynp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z7CXbNSDMPB705qUpUp_7A_w19foNfz';

// Las personas NO viven en el código: están en la tabla val_usuarios de Supabase y se
// administran desde el panel. Quien ingresa recibe un código de sesión (token) que se guarda
// en este navegador y se envía en cada petición; la base de datos decide qué puede ver cada rol.
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

// Quién tiene sesión (según el token guardado). null si no hay o ya venció.
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

/* ---------- Lógica de Login (usuario + contraseña; auxiliares solo DNI) ---------- */
document.addEventListener("submit", async e => {
  if (!e.target || e.target.id !== "form-login") return;
  e.preventDefault();
  const usuario = $("#login-usuario").value.trim().toLowerCase();
  const pass = $("#login-password").value;
  const err = $("#error-login"), btn = $("#form-login .btn-ingresar");
  err.style.display = "none"; btn.disabled = true; btn.textContent = "INGRESANDO…";
  try {
    const { data, error } = await supabaseClient.rpc("val_entrar", { p_usuario: usuario, p_password: pass || null });
    if (error) throw new Error("No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    if (!data || !data.ok) throw new Error((data && data.msg) || "Usuario o contraseña incorrectos.");
    if (data.rol === "auxiliar") {
      fijarToken(data.token);
      // La pantalla móvil de validación se está preparando (validar.html)
      throw new Error("Tu acceso es correcto, pero la pantalla de validación para auxiliares aún no está disponible. Avisa a la administradora.");
    }
    fijarToken(data.token);
    usuarioActual = { usuario: data.usuario, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
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
  else if (p[0] === "inventario") vistaInventario(main, p[1]);
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
    main.innerHTML = '<div class="tarjeta encabezado"><div class="migas"><a href="#inicio">Inicio</a> / <a href="#inventario">Inventario</a> / Validación Outbound</div>' +
      '<h2>Validación ciega de canales Outbound</h2><p>Módulo operativo para el registro y cruce de datos en piso.</p></div>' +
      '<div class="tarjeta bloque-admin"><h3><span>Panel de Validación Ciega</span></h3>' +
      '<p class="nota">Aquí los auxiliares realizarán el escaneo y conteo por paleta (HU, SKU, cantidad) conectado directamente al flujo de operaciones de despacho.</p>' +
      '</div>';
    return;
  }

  // Vista principal del módulo de Inventario (Herramientas operativas separadas de los reportes)
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

/* ================= PERSONAS CON ACCESO (admin, asistentes y auxiliares) ================= */
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
  h += '<p class="nota">Asistentes y administradoras entran con <b>usuario y contraseña</b>; los auxiliares de piso entran solo con su <b>DNI</b>. ' +
       "Si desactivas a alguien, pierde el acceso de inmediato.</p>" +
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
    if (!confirm("¿Quitar a " + x.nombre + " (" + x.usuario + ") de la lista?\nSus validaciones anteriores se conservan.")) return;
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
  $("#per-usuario").placeholder = aux ? "Solo números o letras, sin espacios" : "Ej: mperez";
  $("#per-pass").placeholder = perEditando ? "Déjala vacía para no cambiarla" : "Mínimo 8 caracteres";
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
  (x ? $("#per-nombre") : $("#per-usuario")).focus();
}
document.addEventListener("change", e => { if (e.target && e.target.id === "per-rol") ajustarCamposPersona(); });

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

// Pegar varias filas desde Excel: DNI  [tab o ; o ,]  NOMBRE
async function guardarLote() {
  const filas = [], malas = [], vistos = new Set();
  $("#lote-texto").value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
    const c = l.split(/[;,\t]+/).map(x => x.trim());
    const dni = (c[0] || "").replace(/\s/g, "").toLowerCase(), nombre = c.slice(1).join(" ").replace(/\s+/g, " ").trim().toUpperCase();
    if (DNI_OK.test(dni) && nombre && !vistos.has(dni)) { vistos.add(dni); filas.push({ dni, nombre }); } else malas.push(l);
  });
  if (!filas.length) return alert("No encontré filas válidas. Cada línea debe ser: DNI, un separador (tab, ; o ,) y el nombre.");
  const { data, error } = await supabaseClient.rpc("val_auxiliares_lote", { p_filas: filas });
  if (error) return alert("No se pudo guardar la lista: " + error.message);
  $("#modal-lote").classList.remove("abierto");
  toast((data ? data.guardados : filas.length) + " auxiliar(es) guardado(s) ✔");
  const extra = malas.concat(data && data.omitidos ? data.omitidos : []);
  if (extra.length) alert("Estas " + extra.length + " línea(s) no se guardaron:\n\n" + extra.slice(0, 8).join("\n") + (extra.length > 8 ? "\n…" : ""));
  cargarPersonas();
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

// Inicializar al cargar la página
(async function iniciar() {
  try { localStorage.removeItem("ceva_sesion_activa"); } catch (e) {}   // restos del login anterior
  usuarioActual = await cargarPerfil();
  verificarEstadoSesion();
})();
