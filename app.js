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

const BASE = [
  { id: "inventario", nombre: "Inventario", icono: "📦", desc: "Paletas, virtuales, inmovilizados y más.", dashboards: [
      { id: "paletas", nombre: "Paletas", url: "" },
      { id: "virtuales", nombre: "Virtuales", url: "" },
      { id: "inmovilizados", nombre: "Inmovilizados", url: "" }
  ] },
  { id: "operacion", nombre: "Operación", icono: "🚚", desc: "Indicadores de la operación diaria.", dashboards: [
      { id: "despachos", nombre: "Despachos", url: "" },
      { id: "recepcion", nombre: "Recepción", url: "" },
      { id: "productividad", nombre: "Productividad", url: "" }
  ] },
  { id: "rh", nombre: "RH", icono: "👥", desc: "Indicadores de recursos humanos.", dashboards: [ { id: "rh", nombre: "RH", url: "" } ] },
  { id: "seguridad", nombre: "Seguridad", icono: "🦺", desc: "Indicadores de seguridad y salud.", dashboards: [ { id: "seguridad", nombre: "Seguridad", url: "" } ] },
  { id: "facturacion", nombre: "Facturación", icono: "🧾", desc: "Reporte de facturación.", dashboards: [ { id: "facturacion", nombre: "Facturación", url: "" } ] }
];

const SECCIONES = [
  { id: "reportes", nombre: "Reportes", icono: "📊", desc: "Dashboards de Power BI.", ruta: "#reportes" },
  { id: "inventario", nombre: "Inventario", icono: "📦", desc: "Validación ciega Outbound.", ruta: "#inventario" }
];

let CONFIG = JSON.parse(JSON.stringify(BASE));
let usuarioActual = null;
let edicion = null;
let AUX = null;
const ID_GOOGLE_SHEET_DESPACHOS = "1u2TIkV2ZxezVze-3ZeUF9LjqdZ1LLVAhQ0ag73cLXzI";

async function cargarConfiguracionRemota() {
  try {
    const { data } = await supabaseClient.from('dashboards_config').select('*');
    if (data && data.length > 0) {
      CONFIG.forEach(mod => {
        mod.dashboards.forEach(dash => {
          const encontrado = data.find(item => item.id === dash.id);
          if (encontrado) dash.url = encontrado.url;
        });
      });
    }
  } catch (err) {}
  render();
}

async function cargarPerfil() {
  if (!tokenSesion) return null;
  try {
    const { data, error } = await supabaseClient.rpc("val_yo");
    if (error || !data) { fijarToken(null); return null; }
    return { usuario: data.usuario, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
  } catch (err) { return null; }
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

document.addEventListener("submit", async e => {
  if (!e.target || e.target.id !== "form-login") return;
  e.preventDefault();
  const usuario = $("#login-usuario").value.trim().toLowerCase();
  const pass = $("#login-password").value;
  const err = $("#error-login"), btn = $("#form-login .btn-ingresar");
  if (err) err.style.display = "none";
  if (btn) { btn.disabled = true; btn.textContent = "INGRESANDO…"; }

  try {
    const { data, error } = await supabaseClient.rpc("val_entrar", { p_usuario: usuario, p_password: pass || null });
    if (error) throw new Error("No se pudo conectar. Revisa tu internet.");
    if (!data || !data.ok) throw new Error((data && data.msg) || "Usuario o contraseña incorrectos.");
    
    fijarToken(data.token);
    usuarioActual = { usuario: data.usuario, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
    const formLogin = $("#form-login");
    if (formLogin) formLogin.reset();
    verificarEstadoSesion();
  } catch (ex) {
    if (err) { err.textContent = ex.message; err.style.display = "block"; }
    else alert(ex.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "INGRESAR"; }
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
  });
  if (esAdmin()) {
    h += '<div class="titulo-seccion">ADMINISTRACIÓN</div>';
    h += '<a href="#admin" class="' + (p[0] === "admin" ? "activo" : "") + '">⚙️ Panel de administración</a>';
  }
  const menuElem = $("#menu");
  if (menuElem) menuElem.innerHTML = h;
}

function vistaInicio(main) {
  main.innerHTML = '<div class="tarjeta encabezado"><h2>Panel Principal</h2><p>Elige una sección para continuar.</p></div>';
}

function vistaInventario(main, sub) {
  if (sub === "validacion") {
    renderVistaValidacionOutbound(main);
    return;
  }
  main.innerHTML = '<div class="tarjeta encabezado"><h2>📦 INVENTARIO</h2><p>Herramientas operativas.</p></div>' +
    '<div class="grid"><a class="tarjeta modulo" href="#inventario/validacion"><div class="icono">✅</div><h3>VALIDACIÓN OUTBOUND</h3><p>Validación ciega de canales.</p></a></div>';
}

function vistaReportes(main) { main.innerHTML = '<h2>Reportes</h2>'; }
function vistaModulo(main, m, d) {}
function vistaAdmin(main) { main.innerHTML = '<h2>Panel de administración</h2>'; }

window.addEventListener("hashchange", render);

(async function iniciar() {
  try { localStorage.removeItem("ceva_sesion_activa"); } catch (e) {}
  usuarioActual = await cargarPerfil();
  verificarEstadoSesion();
})();

/* ==========================================================================
   MÓDULO DE VALIDACIÓN OUTBOUND Y PROCESAMIENTO EXCEL
   ========================================================================== */

async function renderVistaValidacionOutbound(main) {
    main.innerHTML = `
        <div class="tarjeta encabezado" style="background:#0f2150; color:#fff; border-radius:12px; padding:20px; margin-bottom:20px;">
            <div class="migas" style="color:#adb5bd;"><a href="#inicio" style="color:#adb5bd;">Inicio</a> / <a href="#inventario" style="color:#adb5bd;">Inventario</a> / Validación Outbound</div>
            <h2 style="color:#fff; margin:10px 0 5px 0;">CONTROL OPERATIVO OUTBOUND</h2>
            <p style="margin:0; font-size:13px; color:#e0e0e0;">Sincronizando viajes y validación ciega por FO y fases.</p>
        </div>

        <div class="tarjeta" style="background:#fff; border:1px solid #ddd; border-radius:10px; padding:20px; margin-bottom:20px; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
            <h3 style="color:#0f2150; margin-top:0; font-size:16px;">📂 Subir archivo Excel operativo (Picking / Status)</h3>
            <div style="margin-bottom: 12px;">
                <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">Tipo de documento:</label>
                <select id="tipoDocumentoArchivo" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
                    <option value="picking">PICKING (actualiza estatus y agrega nuevos)</option>
                    <option value="stock">STOCK ENTREGAS</option>
                    <option value="monitor">MONITOR / STATUS</option>
                </select>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="font-weight:700; font-size:12px; display:block; margin-bottom:4px;">Seleccionar archivo Excel (.xlsx / .csv):</label>
                <input type="file" id="inputArchivoExcel" accept=".xlsx, .xls, .csv" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px; background:#fafafa;">
            </div>
            <button class="btn" style="background:#0f2150; color:#fff; border:0; padding:12px; border-radius:8px; font-weight:700; width:100%; cursor:pointer;" onclick="procesarArchivoExcelSubido()">🚀 PROCESAR Y SUBIR ARCHIVO A SUPABASE</button>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
            <button class="btn" style="background:#0f2150; color:#fff; border:0; padding:10px 16px; border-radius:8px; font-weight:700; cursor:pointer;" onclick="renderVistaValidacionOutbound(document.querySelector('main'))">🔄 ACTUALIZAR</button>
            <button class="btn" style="background:#198754; color:#fff; border:0; padding:10px 16px; border-radius:8px; font-weight:700; cursor:pointer;" onclick="sincronizarDriveDespachosWeb()">📥 SINCRONIZAR DRIVE DE DESPACHOS</button>
        </div>
    `;

    try {
        const { data: registros, error } = await supabaseClient.from('val_fases').select('*');
        if (error) throw error;
        
        const lista = registros || [];
        let htmlTarjetas = `
            <div style="display: flex; gap: 8px; margin-bottom: 15px; flex-wrap: wrap;">
                <span style="background:#0f2150; color:#fff; padding:8px 14px; border-radius:20px; font-size:12px; font-weight:700;">TOTAL FASES (${lista.length})</span>
            </div>
            <div style="display: grid; gap: 15px;">
        `;

        if (lista.length === 0) {
            htmlTarjetas += `
                <div class="tarjeta" style="text-align:center; padding:25px; background:#fff; border-radius:10px; border:1px solid #ddd;">
                    <h3 style="color:#0f2150; margin-bottom:8px;">No hay fases cargadas actualmente</h3>
                    <p style="color:#666; font-size:13px;">Sube tu archivo Excel o haz clic en "Sincronizar Drive de Despachos".</p>
                </div>
            `;
        } else {
            lista.forEach(v => {
                let colorBarra = v.estadoApp === "CERRADO" ? "#198754" : "#0d6efd";
                htmlTarjetas += `
                    <div style="background:#fff; border:1px solid #ddd; border-radius:10px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
                        <div style="background:${colorBarra}; color:#fff; padding:10px 15px;">
                            <strong style="font-size:16px;">FO: ${v.fo || 'S/N'}</strong>
                        </div>
                        <div style="padding:15px;">
                            <div style="font-size:15px; font-weight:700; color:#0f2150;">FASE: ${v.fase || '01'} - ${v.cliente || 'CLIENTE GENERAL'}</div>
                            <div style="font-size:13px; color:#555; margin-top:2px;"><b>VALIDADOR:</b> ${v.validador || 'RUTHVAL'} | Estado: <span style="color:${colorBarra}; font-weight:700;">${v.estadoApp || 'EN PROCESO'}</span></div>
                        </div>
                    </div>
                `;
            });
        }
        htmlTarjetas += `</div>`;
        main.innerHTML += htmlTarjetas;

    } catch (err) {
        console.error("Error al cargar registros:", err);
    }
}

async function procesarArchivoExcelSubido() {
    const inputArchivo = document.getElementById('inputArchivoExcel');
    const tipoDoc = document.getElementById('tipoDocumentoArchivo').value;

    if (!inputArchivo || !inputArchivo.files || inputArchivo.files.length === 0) {
        alert("Por favor, selecciona primero un archivo Excel (.xlsx o .csv).");
        return;
    }

    const archivo = inputArchivo.files[0];
    alert(`Leyendo y procesando el archivo de [${tipoDoc.toUpperCase()}]...`);

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

            for (let i = 1; i < filasJson.length; i++) {
                const fila = filasJson[i];
                if (!fila || fila.length === 0) continue;

                let foVal = String(fila[4] || fila[0] || "").trim();
                let faseVal = String(fila[5] || fila[1] || "").trim();
                let clienteVal = String(fila[6] || fila[2] || "").trim() || "CLIENTE L400";
                
                let estadoVal = String(fila[10] || "").trim().toUpperCase();
                let estatusActualizado = (estadoVal.includes("CONFIRM") || estadoVal.includes("CERRAD")) ? "CERRADO" : "EN PROCESO";

                if (foVal && foVal.length >= 6) {
                    registrosUpsert.push({
                        id: foVal,
                        fo: foVal,
                        fase: faseVal || "01",
                        cliente: clienteVal.toUpperCase(),
                        estadoApp: estatusActualizado,
                        validador: "RUTHVAL"
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

            alert(`¡Sincronización exitosa! Se actualizaron estatus y se agregaron registros nuevos (${procesados} en total).`);
            renderVistaValidacionOutbound(document.querySelector('main'));

        } catch (err) {
            console.error("Error al procesar el archivo Excel:", err);
            alert("Error al procesar el archivo: " + err.message);
        }
    };
    lector.readAsArrayBuffer(archivo);
}

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

    } canvas {
        // ...
    } catch (err) {
        console.error("Error en sincronización web:", err);
        alert("Error: " + err.message);
    }
}
